#pragma once

#include <functional>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_sleep.h"

#include "constants.h"


constexpr int ButtonDebounceMs{30};
constexpr int ButtonReleasePollMs{50};

// Interrupt driven instead of polled, so the button costs nothing while idle.
// Light sleep can only wake on a gpio level, not an edge, so the pin uses a
// low-level interrupt that the isr masks until the task sees the release.
struct Button{

	gpio_num_t pin{(gpio_num_t)config::ButtonPin};
	TaskHandle_t task{};

	std::function<void()> trigger = [](){};

	Button(){
		if (!config::ButtonEnabled) return;

		gpio_config_t io{};
		io.pin_bit_mask = 1ULL << pin;
		io.mode = GPIO_MODE_INPUT;
		io.pull_up_en = GPIO_PULLUP_ENABLE;
		io.intr_type = GPIO_INTR_DISABLE;
		gpio_config(&io);

		gpio_install_isr_service(0);
		gpio_isr_handler_add(pin, isr, this);
		gpio_wakeup_enable(pin, GPIO_INTR_LOW_LEVEL);
		esp_sleep_enable_gpio_wakeup();
	};

	static void isr(void* arg){
		auto self = static_cast<Button*>(arg);
		gpio_intr_disable(self->pin);
		BaseType_t woken = pdFALSE;
		if (self->task) vTaskNotifyGiveFromISR(self->task, &woken);
		portYIELD_FROM_ISR(woken);
	}

	void run(void* param){
		task = xTaskGetCurrentTaskHandle();
		gpio_intr_enable(pin);
		for(;;){
			ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

			vTaskDelay(pdMS_TO_TICKS(ButtonDebounceMs));
			if (gpio_get_level(pin) == 0){
				trigger();
			}

			while (gpio_get_level(pin) == 0){
				vTaskDelay(pdMS_TO_TICKS(ButtonReleasePollMs));
			}
			vTaskDelay(pdMS_TO_TICKS(ButtonDebounceMs));
			gpio_intr_enable(pin);
		}
	}

};
