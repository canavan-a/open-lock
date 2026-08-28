#include <Arduino.h>
#include "scheduler.h"


Scheduler *s;

void setup(){
	setCpuFrequencyMhz(80);
	Serial.begin(115200);
	Wire.begin(21, 22);
	Wire.setClock(100000);

	s = new Scheduler();
	s->start();	
}

void loop(){
	Serial.println("entering loop, (delay forever)");		
	vTaskDelay(portMAX_DELAY);
}
