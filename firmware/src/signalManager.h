#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

#include "queue.h"
#include "constants.h"
#include "servoManager.h"

struct SignalManager {
	ServoManager* servoManager;
	WiFiClient wifiClient;
	PubSubClient mqtt{wifiClient};
	SemaphoreHandle_t sendMutex;

	

	// pass queue from servoManager 
	SignalManager(ServoManager* sm): servoManager(sm) {
		sendMutex = xSemaphoreCreateMutex();
		Serial.println("connecting wifi");
		WiFi.begin(config::NetworkSSID, config::NetworkPassword);
		while (WiFi.status() != WL_CONNECTED) delay(500);
		
		Serial.println("wifi connected");
		WiFi.setSleep(true);

		mqtt.setServer(config::MqttBroker.c_str(), config::MqttPort);
		
		mqtt.setCallback([this](char* topic, byte* payload, unsigned int length){
			String msg((char*)payload, length);
			if (msg == "open"){
				servoManager->queue.send(State::OPEN);
			} else if (msg == "closed"){
				servoManager->queue.send(State::CLOSED);
			} else if (msg == "state"){
				safeSend(servoManager->getState());
			}
		});
		
		if (config::MqttAnon){
			mqtt.connect(config::MqttClientId.c_str());	
		} else {
			mqtt.connect(config::MqttClientId.c_str(), config::MqttUsername.c_str(), config::MqttPassword.c_str());
		}

		mqtt.subscribe(config::MqttTopicSignal.c_str());

		// pass lambda to servoManager

		servoManager->stateChangeTrigger = [this](State s){
					this->safeSend(s);
				};
		

	}

	void safeSend(State state){
		xSemaphoreTake(sendMutex, portMAX_DELAY);
		String stateStr = state == State::OPEN ? "open" : "closed";
		mqtt.publish(config::MqttTopicState.c_str(), stateStr.c_str());
		xSemaphoreGive(sendMutex);
	}
	

	void reconnectWifi(){
		if (WiFi.status() == WL_CONNECTED) return;
		WiFi.disconnect();
		WiFi.begin(config::NetworkSSID, config::NetworkPassword);
		while (WiFi.status() != WL_CONNECTED) vTaskDelay(500 / portTICK_PERIOD_MS);
	}

	void reconnectMqtt(){
		while (!mqtt.connected()) {
			bool ok = config::MqttAnon
				? mqtt.connect(config::MqttClientId.c_str())
				: mqtt.connect(config::MqttClientId.c_str(), config::MqttUsername.c_str(), config::MqttPassword.c_str());
			if (ok) {
				mqtt.subscribe(config::MqttTopicSignal.c_str());
			} else {
				vTaskDelay(5000 / portTICK_PERIOD_MS);
			}
		}
	}

	void run(void* param){
		for(;;){
			reconnectWifi();
			reconnectMqtt();
			mqtt.loop();
			vTaskDelay(10 / portTICK_PERIOD_MS);
		}
	}

	
	
};
