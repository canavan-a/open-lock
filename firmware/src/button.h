#pragma once

#include <Arduino.h>

#include "constants.h"



struct Button{

	int pin{config::ButtonPin};

	std::function<void()> trigger = [](){
			Serial.println("button lambda init");
	};

	Button(){
		  pinMode(config::ButtonPin, INPUT_PULLUP);
	};


	void run(void* param){
		unsigned long debounceCurrent = millis();
		auto prev{HIGH}; // open
		static int count{};		
		for(;;){
			/// do thing here	
			auto pinValue {digitalRead(pin)};
			if(pinValue == LOW && prev == HIGH){
				Serial.println("change detected: triggering lambda");
				Serial.println(++count);
				trigger();
			}

			prev = pinValue;
			
			vTaskDelay(pdMS_TO_TICKS(50));
		}
	}
	
	
		
};
