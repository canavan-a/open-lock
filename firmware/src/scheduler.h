#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "servoManager.h"
#include "signalManager.h"
#include "batteryManager.h"
#include "button.h"

// Every task here blocks on a queue, notification or long delay, so the chip
// can light sleep between events. Wifi/mqtt run on their own driver tasks and
// call into SignalManager through event handlers.
struct Scheduler
{
	SignalManager *sig;
	ServoManager *serv;
	Button *btn;
	BatteryManager *battery;

	Scheduler() {
		serv = new ServoManager();
		btn = new Button();
		battery = new BatteryManager();
		sig = new SignalManager(serv, btn, battery);

	}

	static void servoTask(void* param){
		static_cast<Scheduler*>(param)->serv->run(param);
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
		xTaskCreate(servoTask, "servo", 4096, this, 1, NULL);
		xTaskCreate(servoAngleTask, "servoAngle", 4096, this, 1, NULL);
		if (config::ButtonEnabled){
			xTaskCreate(buttonListenerTask, "btn", 4096, this, 1, NULL);
		}
		if (config::FuelCheck){
			xTaskCreate(batteryTask, "battery", 4096, this, 1, NULL);
		}
	}

};
