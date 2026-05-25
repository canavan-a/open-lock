#pragma once
#include <Arduino.h>

#include "servoManager.h"
#include "signalManager.h"

struct Scheduler
{
	SignalManager *sig;
	ServoManager *serv;
	
	Scheduler() {
		serv = new ServoManager();
		sig = new SignalManager(serv);
	}

	static void servoTask(void* param){
		static_cast<Scheduler*>(param)->serv->run(param);
	}

	static void signalTask(void* param){
		static_cast<Scheduler*>(param)->sig->run(param);
	}

	void start(){
		Serial.println("starting tasks");
		xTaskCreate(servoTask, "servo", 4096, this, 1, NULL);
		xTaskCreate(signalTask, "signal", 4096, this, 1, NULL);
	}
	
};
