#pragma once
#include <Arduino.h>

#include "servoManager.h"
#include "signalManager.h"
#include "batteryManager.h"
#include "button.h"

struct Scheduler
{
	SignalManager *sig;
	ServoManager *serv;
	Button *btn;
	
	Scheduler() {
		serv = new ServoManager();
		btn = new Button();
		battery = new BatteryManager();
		sig = new SignalManager(serv, btn, battery);
 
	}

	static void servoTask(void* param){
		static_cast<Scheduler*>(param)->serv->run(param);
	}

	static void signalTask(void* param){
		static_cast<Scheduler*>(param)->sig->run(param);
	}

	static void servoAngleTask(void* param){
		static_cast<Scheduler*>(param)->serv->runAngleListener(param);
	}

	static void buttonListenerTask(void* param){
		static_cast<Scheduler*>(param)->btn->run(param);
	}

	static void batteryTask(void* param){
		static_cast<Scheduler*>(param)->battery->run(param);
	}

	void start(){
		Serial.println("starting tasks");
		xTaskCreate(servoTask, "servo", 4096, this, 1, NULL);
		xTaskCreate(signalTask, "signal", 4096, this, 1, NULL);
		xTaskCreate(servoAngleTask, "servoAngle", 4096, this, 1, NULL);
		xTaskCreate(buttonListenerTask, "btn", 4096, this, 1, NULL);
		xTaskCreate(batteryTask, "battery", 4096, this, 1, NULL);
	}
	
};
