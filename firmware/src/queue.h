#pragma once

#include <Arduino.h>

template<typename T>
struct Queue{
	QueueHandle_t handle;

	Queue(int size){
		handle = xQueueCreate(size, sizeof(T));
	}

	void send(const T& item){
		xQueueSend(handle, &item, portMAX_DELAY);
	}

	T receive(){
		T item;
		xQueueReceive(handle, &item, portMAX_DELAY);
		return item;
	}

	void clear(){
		xQueueReset(handle);
	}
};
