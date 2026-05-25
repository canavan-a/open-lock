#pragma once

#include <WiFi.h>
#include <PubSubClient.h>

#include "queue.h"
#include "constants.h"
#include "servoManager.h"

struct SignalManager {
	ServoManager* servoManager;
	WiFiClient wifiClient;
	PubSubclient mqtt{wifiClient};

	// pass queue from servoManager 
	SignalManager(ServoManager* sm): servoManager(sm) {
		Serial.println("connecting wifi");
		WiFi.begin(config::NetworkSSID, config::NetworkPassword);
		while (WiFi.status() != WL_CONNECTED) delay(500);
		
		Serial.println("wifi connected");
		WiFi.setSleep(true);

		mqtt.setServer(config::MqttBroker, config::MqttPort);
		
		mqtt.setCallback([this](char* topic, byte* payload, unsigned int length){
			String msg((char*)payload, length);
			if (msg == "open"){
				servoManager->queue.send(State::OPEN);
			} else if (msg == "closed"){
				servoManager->queue.send(State::CLOSED);
			} else if (msg == "state"){
				String state = servoManager->getState() == State::OPEN ? "open" : "closed";
				mqtt.publish(config::MqttTopicState, state.c_str());
			}
		});
		
		if (config::MqttAnon){
			mqtt.connect(config::MqttTopic);	
		} else {
			mqtt.connect(config::MqttClientId, config::MqttUsername, config::MqttPassword);
		}

		mqtt.subscribe(config::MqttTopicSignal);
		

	}

	

	void run(void* param){
		for(;;){
			mqtt.loop();
			vTaskDelay(10 / portTICK_PERIOD_MS); 
		}
	}

	
	
};
