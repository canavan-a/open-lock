#include "esp_log.h"
#include "esp_pm.h"
#include "nvs_flash.h"

#include "scheduler.h"


Scheduler *s;

extern "C" void app_main(){
	esp_err_t err = nvs_flash_init();
	if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND){
		ESP_ERROR_CHECK(nvs_flash_erase());
		err = nvs_flash_init();
	}
	ESP_ERROR_CHECK(err);

	// light sleep whenever nothing holds a pm lock; the wifi driver and the
	// servo take locks while they need the clocks running
	esp_pm_config_t pm{};
	pm.max_freq_mhz = 80;
	pm.min_freq_mhz = 40;
	pm.light_sleep_enable = true;
	ESP_ERROR_CHECK(esp_pm_configure(&pm));

	s = new Scheduler();
	s->start();
	ESP_LOGI("main", "tasks started");
}
