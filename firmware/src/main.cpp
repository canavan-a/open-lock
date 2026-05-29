#include <Arduino.h>
#include "scheduler.h"


Scheduler *s;

void setup(){
	Serial.begin(115200);

	Wire.begin();
	for(int i = 0; i < 127; i++) {
	    Wire.beginTransmission(i);
	    if(Wire.endTransmission() == 0)
	        Serial.println(i, HEX);
	}

	s = new Scheduler();
	s->start();	
}

void loop(){
	Serial.println("entering loop, (delay forever)");		
	vTaskDelay(portMAX_DELAY);
}
