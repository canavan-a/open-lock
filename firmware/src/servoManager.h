#pragma once
#include <Arduino.h>
#include <ESP32Servo.h>
#include <array>
#include <atomic>

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

	ServoManager(){
		// init with server in open state
		mutex = xSemaphoreCreateMutex();
		xSemaphoreTake(mutex, portMAX_DELAY);		
		unsafe_moveServo(Angles[static_cast<int>(State::OPEN)]);
		xSemaphoreGive(mutex);
	}

	void moveServo(State newState){
		xSemaphoreTake(mutex, portMAX_DELAY);
		if (newState != state){
			unsafe_moveServo(Angles[static_cast<int>(newState)]);
			state.store(newState);
		}

		xSemaphoreGive(mutex);
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


