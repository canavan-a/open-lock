#pragma once
#include <Arduino.h>
#include <ESP32Servo.h>
#include <array>
#include <atomic>
#include <Preferences.h>

#include "queue.h"
#include "constants.h"

enum State {
	OPEN = 0,
	CLOSED = 1,
};

constexpr std::array<int, 2>  Angles{0, 180}; 
constexpr int FlatDelay{1000};
constexpr int queueSize{10};

struct ServoManager{

	SemaphoreHandle_t mutex;

	Queue<State> queue{queueSize};
	Servo servo;
	int servoPin{config::ServoGpio};
	
	std::atomic<State> state{OPEN};

	Preferences prefs;

	std::function<void(State)> stateChangeTrigger = [](State){
		Serial.println("lambda init");
	};

	ServoManager(){

		
		// init with server in previous persistent state
		mutex = xSemaphoreCreateMutex();
		xSemaphoreTake(mutex, portMAX_DELAY);
		State pState = getPState_();
		unsafe_moveServo(Angles[static_cast<int>(pState)]);
		state = pState;
		xSemaphoreGive(mutex);
	}

	State getPState_(){			
		prefs.begin("lock-state", true);
		State s = (State)prefs.getInt("state", 0);
		prefs.end();
		return s;
	}

	void setPState_(State s){
		prefs.begin("lock-state", false);
		prefs.putInt("state", s);
		prefs.end();
	}

	void moveServo(State newState){
		xSemaphoreTake(mutex, portMAX_DELAY);
		if (newState != state){
			unsafe_moveServo(Angles[static_cast<int>(newState)]);
			state.store(newState);
			setPState_(newState);
		}

		xSemaphoreGive(mutex);
		stateChangeTrigger(newState);
	}

	void unsafe_moveServo(int angle) noexcept {
		servo.attach(servoPin);
		servo.write(angle);
		delay(FlatDelay);
		servo.detach();
	}
	
	State getState(){
		return state.load();
	}
	

	void run(void* param){
		for(;;){
			State value = queue.receive();
			moveServo(value);
		}
	}
	
};


