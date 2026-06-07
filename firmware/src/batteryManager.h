#pragma once

#include <SparkFunBQ27441.h>


#include "constants.h"


struct BatteryManager{

	int currentPercent{999};

	std::function<void(int)> notifier = [](int){
		Serial.println("lambda trigger");
	};

	
	BatteryManager(){
		if (config::FuelCheck){
			// i2c pins on esp32
			Wire.begin(config::BoardPinSDA, config::BoardPinSCL);
			lipo.begin();
			
			// lipo.begin();
			// if (!lipo.begin()) Serial.println("BQ27441");
			
			lipo.setCapacity(config::LipoCapacityMah);
		}
	}

	void run(void* param){
		for(;;){
			if (config::FuelCheck){ 
				int percent = lipo.soc();
				if (percent != currentPercent){
					currentPercent = percent;
					notifier(percent);
				}
				Serial.println(percent);
			}
			vTaskDelay(pdMS_TO_TICKS(5000));	
		}
		
	}

	

	
};


