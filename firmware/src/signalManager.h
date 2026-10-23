#pragma once

#include <algorithm>
#include <atomic>
#include <cstring>
#include <string>

#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "mqtt_client.h"

#include "constants.h"
#include "servoManager.h"
#include "batteryManager.h"
#include "button.h"


constexpr int WifiBackoffMinMs{1000};
constexpr int WifiBackoffMaxMs{60000};

// Event driven: wifi and mqtt run on their own driver tasks and call in here,
// nothing polls. Between beacons the radio and cpu sleep; the AP buffers any
// incoming command until the next beacon we listen to.
struct SignalManager {
	ServoManager* servoManager;
	BatteryManager* battery;
	esp_mqtt_client_handle_t mqtt{};
	esp_timer_handle_t reconnectTimer{};
	int backoffMs{WifiBackoffMinMs};
	bool mqttStarted{false};
	std::atomic<bool> connected{false};

	SignalManager(ServoManager* sm, Button* btn, BatteryManager* bat): servoManager(sm), battery(bat) {
		esp_timer_create_args_t timerArgs{};
		timerArgs.callback = [](void* arg){ esp_wifi_connect(); };
		timerArgs.name = "wifi-retry";
		ESP_ERROR_CHECK(esp_timer_create(&timerArgs, &reconnectTimer));

		initMqtt();
		initWifi();

		servoManager->stateChangeTrigger = [this](State s){
			this->publishState(s);
		};

		btn->trigger = [sm](){
			sm->toggle();
		};

		battery->notifier = [this](int percent, int currentMa){
			this->publishBattery(percent, currentMa);
		};
	}

	void initWifi(){
		ESP_ERROR_CHECK(esp_netif_init());
		ESP_ERROR_CHECK(esp_event_loop_create_default());
		esp_netif_create_default_wifi_sta();

		wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
		ESP_ERROR_CHECK(esp_wifi_init(&init));
		ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, onWifiEvent, this));
		ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, onWifiEvent, this));

		wifi_config_t wc{};
		strncpy((char*)wc.sta.ssid, config::NetworkSSID, sizeof(wc.sta.ssid));
		strncpy((char*)wc.sta.password, config::NetworkPassword, sizeof(wc.sta.password));
		// only honoured with WIFI_PS_MAX_MODEM
		wc.sta.listen_interval = config::WifiListenInterval;

		ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
		ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
		ESP_ERROR_CHECK(esp_wifi_start());
		ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_MAX_MODEM));
	}

	void initMqtt(){
		esp_mqtt_client_config_t mc{};
		mc.broker.address.hostname = config::MqttBroker;
		mc.broker.address.port = config::MqttPort;
		mc.broker.address.transport = MQTT_TRANSPORT_OVER_TCP;
		mc.credentials.client_id = config::MqttClientId;
		if (!config::MqttAnon){
			mc.credentials.username = config::MqttUsername;
			mc.credentials.authentication.password = config::MqttPassword;
		}
		mc.session.keepalive = config::MqttKeepaliveSec;
		mc.session.last_will.topic = config::MqttTopicOnline;
		mc.session.last_will.msg = "offline";
		mc.session.last_will.qos = 1;
		mc.session.last_will.retain = 1;

		mqtt = esp_mqtt_client_init(&mc);
		ESP_ERROR_CHECK(esp_mqtt_client_register_event(mqtt, MQTT_EVENT_ANY, onMqttEvent, this));
	}

	static void onWifiEvent(void* arg, esp_event_base_t base, int32_t id, void* data){
		auto self = static_cast<SignalManager*>(arg);
		if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START){
			esp_wifi_connect();
		} else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED){
			// back off instead of hammering a missing AP at full radio power
			ESP_LOGW("signal", "wifi disconnected, retry in %dms", self->backoffMs);
			esp_timer_stop(self->reconnectTimer);
			esp_timer_start_once(self->reconnectTimer, (uint64_t)self->backoffMs * 1000);
			self->backoffMs = std::min(self->backoffMs * 2, WifiBackoffMaxMs);
		} else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP){
			ESP_LOGI("signal", "wifi connected");
			self->backoffMs = WifiBackoffMinMs;
			if (!self->mqttStarted){
				self->mqttStarted = true;
				esp_mqtt_client_start(self->mqtt);
			} else {
				// skip esp-mqtt's reconnect wait; fails harmlessly if already connecting
				esp_mqtt_client_reconnect(self->mqtt);
			}
		}
	}

	static void onMqttEvent(void* arg, esp_event_base_t base, int32_t id, void* data){
		auto self = static_cast<SignalManager*>(arg);
		auto event = static_cast<esp_mqtt_event_handle_t>(data);
		switch ((esp_mqtt_event_id_t)id){
			case MQTT_EVENT_CONNECTED:
				ESP_LOGI("signal", "mqtt connected");
				self->connected = true;
				esp_mqtt_client_subscribe(self->mqtt, config::MqttTopicSignal, 1);
				self->publish(config::MqttTopicOnline, "online", true);
				self->publishState(self->servoManager->getState());
				self->publishBattery(self->battery->currentPercent, self->battery->currentMa);
				break;
			case MQTT_EVENT_DISCONNECTED:
				ESP_LOGW("signal", "mqtt disconnected");
				self->connected = false;
				break;
			case MQTT_EVENT_DATA:
				self->handleMessage(std::string(event->data, event->data_len));
				break;
			default:
				break;
		}
	}

	void handleMessage(const std::string& msg){
		if (msg == "open"){
			servoManager->queue.send(State::OPEN);
		} else if (msg == "closed"){
			servoManager->queue.send(State::CLOSED);
		} else if (msg == "state"){
			publishState(servoManager->getState());
		} else if (msg == "battery"){
			publishBattery(battery->currentPercent, battery->currentMa);
		} else if (msg.rfind("angle:", 0) == 0){
			int angle = atoi(msg.c_str() + 6);
			if (angle ==0){
				angle = 10;
			}
			servoManager->angleQueue.send(angle);
		}
	}

	// esp-mqtt is thread safe, so this is callable from any task. Anything
	// dropped while offline is resent in full on the next MQTT_EVENT_CONNECTED.
	void publish(const char* topic, const char* payload, bool retain){
		if (!connected) return;
		esp_mqtt_client_publish(mqtt, topic, payload, 0, 1, retain);
	}

	void publishState(State state){
		publish(config::MqttTopicState, state == State::OPEN ? "open" : "closed", true);
	}

	// The current is retained too, so a server that restarts knows straight
	// away whether the lock is charging.
	void publishBattery(int batteryPercent, int currentMa){
		publish(config::MqttTopicBattery, std::to_string(batteryPercent).c_str(), true);
		if (batteryPercent != 999) publish(config::MqttTopicCurrent, std::to_string(currentMa).c_str(), true);
	}

};
