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
			if (!lipo.begin()) Serial.println("BQ27441 init failed");
			if (config::FuelGaugeReset){
				lipo.enterConfig();
				lipo.exitConfig(true);
			}
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
				Serial.printf("Battery: %d%% | voltage: %dmV | flags: 0x%04X\n", percent, lipo.voltage(), lipo.flags());
			}
			vTaskDelay(pdMS_TO_TICKS(config::BatteryPollMs));
		}
		
	}

	

	
};


