#pragma once

#include <SparkFunBQ27441.h>

#include "constants.h"


struct BatteryManager{

	int currentPercent{999};

	std::functional<void(int)> notifier = [](int){
		Serial.println("lambda trigger");	
	};

	
	BatteryManager(){
		// i2c pins on esp32
		Wire.begin(config::BoardPinSDA, config::BoardPinSCL);
		lipo.begin();
		lipo.setCapacity(config::LipoCapacityMah);
	}

	void run(void* param){
		for(;;){
			int percent = lipo.soc();
			if (percent != currentPercent){
				currentPercent = percent;
				notifier(percent);
			}
			Serial.println(percent);
			vTaskDelay(pdMS_TO_TICKS(5000));	
		}
		
	}

	

	
};


