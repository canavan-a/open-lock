#pragma once
#include <Arduino.h>
#include <ESP32Servo.h>
#include <array>
#include <atomic>
#include <Preferences.h>

#include <INA219_WE.h>

#include "queue.h"
#include "constants.h"


constexpr float SERVO_CLIP_THRESHOLD{2000000};

struct ServoCurrentMonitor {

	INA219_WE ina219;
	
	ServoCurrentMonitor(){
		ina219.init();	
	};

	float getCurrent(){
		return ina219.getCurrent_mA();
	}

	bool currentSafe(){
		return getCurrent()<SERVO_CLIP_THRESHOLD;
	}
	
};


enum State {
	OPEN = 0,
	CLOSED = 1,
};

constexpr int FlatDelay{1000};
constexpr int queueSize{10};

struct ServoManager{

	SemaphoreHandle_t mutex;

	Queue<State> queue{queueSize};
	
	Queue<int> angleQueue{queueSize};
	int CloseAngle {10};
	
	Servo servo;
	int servoPin{config::ServoGpio};
	
	std::atomic<State> state{OPEN};

	ServoCurrentMonitor monitor{};

	Preferences prefs;

	std::function<void(State)> stateChangeTrigger = [](State){
		Serial.println("lambda init");
	};

	ServoManager(){

		
		// init with server in previous persistent state
		mutex = xSemaphoreCreateMutex();
		xSemaphoreTake(mutex, portMAX_DELAY);
		State pState = getPState_();
		CloseAngle = getPCloseAngle_();
		
		int angle = pState == State::OPEN ? 0 : CloseAngle;
		unsafe_moveServo(angle);
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

	int getPCloseAngle_(){
		prefs.begin("close-angle", true);
		int angle = prefs.getInt("angle", 10);
		prefs.end();
		return angle;
	}

	void setPCloseAngle_(int angle){
		prefs.begin("close-angle", false);
		prefs.putInt("angle", angle);
		prefs.end();
	}

	void moveServo(State newState){
		xSemaphoreTake(mutex, portMAX_DELAY);
		if (newState != state){
			int angle = newState == State::OPEN ? 0 : CloseAngle;
			if (angle != 0){
				int current{0};
				for(;;){
					++current;
					unsafe_moveServo(current, 15);					
					if (current == angle)
						break;

					if (!config::ServoCurrentMonitor)
						continue;

					if (!monitor.currentSafe()){
						queue.clear();
						queue.send(State::OPEN);
						break;
					}
									
				}	
			} else{
				unsafe_moveServo(0);
			}

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
	
	void unsafe_moveServo(int angle, int delayValue) noexcept {
		servo.attach(servoPin);
		servo.write(angle);
		delay(delayValue);
		servo.detach();
	}
	
	State getState(){
		return state.load();
	}

	void setAngle(int angle){
		xSemaphoreTake(mutex, portMAX_DELAY);
		CloseAngle = angle;
		setPCloseAngle_(angle);
		xSemaphoreGive(mutex);
	}
	

	void run(void* param){
		for(;;){
			State value = queue.receive();
			moveServo(value);
		}
	}

	void runAngleListener(void *param){
		for(;;){
			int newAngle = angleQueue.receive();
			setAngle(newAngle);
		}
	}
	
};




