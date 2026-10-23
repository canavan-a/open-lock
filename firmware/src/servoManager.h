#pragma once
#include <atomic>
#include <functional>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include "esp_pm.h"
#include "nvs.h"

#include "queue.h"
#include "constants.h"


enum State {
	OPEN = 0,
	CLOSED = 1,
};

constexpr int FlatDelay{1000};
constexpr int queueSize{10};

// same pulse range as ESP32Servo's defaults, so close angles saved by the old
// arduino firmware land in the same place
constexpr int ServoMinUs{544};
constexpr int ServoMaxUs{2400};
constexpr int ServoPeriodUs{20000};
constexpr int ServoDutyMax{(1 << 14) - 1};
constexpr int ServoPowerSettleMs{50};

constexpr ledc_mode_t ServoLedcMode{LEDC_LOW_SPEED_MODE};
constexpr ledc_channel_t ServoLedcChannel{LEDC_CHANNEL_0};
constexpr ledc_timer_t ServoLedcTimer{LEDC_TIMER_0};

struct ServoManager{

	SemaphoreHandle_t mutex;

	Queue<State> queue{queueSize};

	Queue<int> angleQueue{queueSize};
	int CloseAngle {10};

	std::atomic<State> state{OPEN};

	// held for the whole move: light sleep or an APB frequency drop would stall
	// or stretch the pwm signal mid-move
	esp_pm_lock_handle_t pmLock;

	std::function<void(State)> stateChangeTrigger = [](State){};

	ServoManager(){
		ESP_ERROR_CHECK(esp_pm_lock_create(ESP_PM_APB_FREQ_MAX, 0, "servo", &pmLock));

		ledc_timer_config_t timer{};
		timer.speed_mode = ServoLedcMode;
		timer.duty_resolution = LEDC_TIMER_14_BIT;
		timer.timer_num = ServoLedcTimer;
		timer.freq_hz = 1000000 / ServoPeriodUs;
		timer.clk_cfg = LEDC_USE_APB_CLK;
		ESP_ERROR_CHECK(ledc_timer_config(&timer));

		// claim the pin once; moves only change the duty. Reconfiguring the
		// channel per move re-reserves the gpio and logs a conflict warning.
		ledc_channel_config_t ch{};
		ch.gpio_num = config::ServoGpio;
		ch.speed_mode = ServoLedcMode;
		ch.channel = ServoLedcChannel;
		ch.timer_sel = ServoLedcTimer;
		ch.duty = 0;
		ESP_ERROR_CHECK(ledc_channel_config(&ch));
		ledc_stop(ServoLedcMode, ServoLedcChannel, 0);

		if (config::ServoPowerGpio >= 0){
			gpio_reset_pin((gpio_num_t)config::ServoPowerGpio);
			gpio_set_direction((gpio_num_t)config::ServoPowerGpio, GPIO_MODE_OUTPUT);
			gpio_set_level((gpio_num_t)config::ServoPowerGpio, 0);
		}

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

	// same nvs namespaces/keys arduino's Preferences used, so saved state survives the reflash
	static int getInt_(const char* ns, const char* key, int fallback){
		nvs_handle_t h;
		int32_t v = fallback;
		if (nvs_open(ns, NVS_READONLY, &h) == ESP_OK){
			nvs_get_i32(h, key, &v);
			nvs_close(h);
		}
		return v;
	}

	static void setInt_(const char* ns, const char* key, int value){
		nvs_handle_t h;
		if (nvs_open(ns, NVS_READWRITE, &h) == ESP_OK){
			nvs_set_i32(h, key, value);
			nvs_commit(h);
			nvs_close(h);
		}
	}

	State getPState_(){
		return (State)getInt_("lock-state", "state", 0);
	}

	void setPState_(State s){
		setInt_("lock-state", "state", s);
	}

	int getPCloseAngle_(){
		return getInt_("close-angle", "angle", 10);
	}

	void setPCloseAngle_(int angle){
		setInt_("close-angle", "angle", angle);
	}

	void moveServo(State newState){
		xSemaphoreTake(mutex, portMAX_DELAY);
		if (newState != state){
			int angle = newState == State::OPEN ? 0 : CloseAngle;
			ESP_LOGI("servo", "%s", angle != 0 ? "closing" : "opening");
			unsafe_moveServo(angle);

			state.store(newState);
			setPState_(newState);
		}

		xSemaphoreGive(mutex);
		stateChangeTrigger(newState);
	}

	void unsafe_moveServo(int angle) noexcept {
		esp_pm_lock_acquire(pmLock);
		if (config::ServoPowerGpio >= 0){
			gpio_set_level((gpio_num_t)config::ServoPowerGpio, 1);
			vTaskDelay(pdMS_TO_TICKS(ServoPowerSettleMs));
		}

		int us = ServoMinUs + (ServoMaxUs - ServoMinUs) * angle / 180;
		// update_duty also re-enables the output that ledc_stop turned off
		ledc_set_duty(ServoLedcMode, ServoLedcChannel, (uint32_t)us * ServoDutyMax / ServoPeriodUs);
		ledc_update_duty(ServoLedcMode, ServoLedcChannel);
		vTaskDelay(pdMS_TO_TICKS(FlatDelay));

		// equivalent of servo.detach(): hold the signal line low
		ledc_stop(ServoLedcMode, ServoLedcChannel, 0);
		if (config::ServoPowerGpio >= 0){
			gpio_set_level((gpio_num_t)config::ServoPowerGpio, 0);
		}
		esp_pm_lock_release(pmLock);
	}

	State getState(){
		return state.load();
	}

	void toggle(){
		xSemaphoreTake(mutex, portMAX_DELAY);
		if (state == State::OPEN){
			queue.send(State::CLOSED);
		} else{
			queue.send(State::OPEN);
		}
		xSemaphoreGive(mutex);
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
