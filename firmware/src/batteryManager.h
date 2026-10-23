#pragma once

#include <functional>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_log.h"

#include "constants.h"


// Minimal BQ27441 driver covering what the SparkFun library was used for:
// state of charge, voltage, average current and setting the design capacity.
struct Bq27441{

	static constexpr uint8_t Address{0x55};
	static constexpr uint16_t DeviceId{0x0421};
	static constexpr uint16_t UnsealKey{0x8000};

	static constexpr uint8_t CmdControl{0x00};
	static constexpr uint8_t CmdVoltage{0x04};
	static constexpr uint8_t CmdFlags{0x06};
	static constexpr uint8_t CmdAvgCurrent{0x10};
	static constexpr uint8_t CmdSoc{0x1C};

	static constexpr uint16_t CtlStatus{0x00};
	static constexpr uint16_t CtlDeviceType{0x01};
	static constexpr uint16_t CtlSetCfgUpdate{0x13};
	static constexpr uint16_t CtlSealed{0x20};
	static constexpr uint16_t CtlSoftReset{0x42};

	static constexpr uint8_t ExtDataClass{0x3E};
	static constexpr uint8_t ExtDataBlock{0x3F};
	static constexpr uint8_t ExtBlockData{0x40};
	static constexpr uint8_t ExtChecksum{0x60};
	static constexpr uint8_t ExtControl{0x61};

	static constexpr uint8_t ClassState{82};
	static constexpr uint8_t DesignCapacityOffset{10};

	static constexpr uint16_t StatusSealed{1 << 13};
	static constexpr uint16_t FlagCfgUpMode{1 << 4};

	static constexpr int TimeoutMs{100};
	static constexpr int CfgModeWaitMs{2000};

	i2c_master_dev_handle_t dev{};

	bool begin(i2c_master_bus_handle_t bus){
		i2c_device_config_t cfg{};
		cfg.dev_addr_length = I2C_ADDR_BIT_LEN_7;
		cfg.device_address = Address;
		cfg.scl_speed_hz = 100000;
		if (i2c_master_bus_add_device(bus, &cfg, &dev) != ESP_OK) return false;
		return controlRead(CtlDeviceType) == DeviceId;
	}

	bool write(uint8_t reg, const uint8_t* data, size_t len){
		uint8_t buf[33];
		buf[0] = reg;
		for (size_t i = 0; i < len; i++) buf[i + 1] = data[i];
		return i2c_master_transmit(dev, buf, len + 1, TimeoutMs) == ESP_OK;
	}

	bool writeByte(uint8_t reg, uint8_t value){
		return write(reg, &value, 1);
	}

	bool read(uint8_t reg, uint8_t* dest, size_t len){
		return i2c_master_transmit_receive(dev, &reg, 1, dest, len, TimeoutMs) == ESP_OK;
	}

	uint16_t readWord(uint8_t cmd){
		uint8_t d[2]{};
		read(cmd, d, 2);
		return (uint16_t)d[1] << 8 | d[0];
	}

	bool controlWrite(uint16_t sub){
		uint8_t d[2]{(uint8_t)(sub & 0xFF), (uint8_t)(sub >> 8)};
		return write(CmdControl, d, 2);
	}

	uint16_t controlRead(uint16_t sub){
		if (!controlWrite(sub)) return 0;
		return readWord(CmdControl);
	}

	// 999 (the "unknown" sentinel the controller expects) if the gauge doesn't answer
	int soc(){
		uint8_t d[2]{};
		if (!read(CmdSoc, d, 2)) return 999;
		return (uint16_t)d[1] << 8 | d[0];
	}
	int voltage(){ return readWord(CmdVoltage); }
	int avgCurrent(){ return (int16_t)readWord(CmdAvgCurrent); }
	uint16_t flags(){ return readWord(CmdFlags); }

	bool waitCfgMode(bool want){
		for (int t = 0; t < CfgModeWaitMs; t += 10){
			if (((flags() & FlagCfgUpMode) != 0) == want) return true;
			vTaskDelay(pdMS_TO_TICKS(10));
		}
		return false;
	}

	uint8_t blockChecksum(){
		uint8_t block[32]{};
		read(ExtBlockData, block, 32);
		uint8_t sum = 0;
		for (uint8_t b : block) sum += b;
		return 255 - sum;
	}

	// Writes the design capacity only if it differs, so a normal boot doesn't
	// put the gauge through a soft reset. resetAlways forces the reset (and the
	// resimulation that comes with it) even when nothing changed.
	bool setCapacity(uint16_t mAh, bool resetAlways){
		bool wasSealed = controlRead(CtlStatus) & StatusSealed;
		if (wasSealed){
			controlWrite(UnsealKey);
			controlWrite(UnsealKey);
		}

		writeByte(ExtControl, 0x00);
		writeByte(ExtDataClass, ClassState);
		writeByte(ExtDataBlock, DesignCapacityOffset / 32);
		vTaskDelay(pdMS_TO_TICKS(10));

		uint8_t cur[2]{};
		read(ExtBlockData + DesignCapacityOffset % 32, cur, 2);
		uint16_t current = (uint16_t)cur[0] << 8 | cur[1];
		bool change = current != mAh;

		bool ok = true;
		if (change || resetAlways){
			ESP_LOGI("battery", "design capacity %u -> %u mAh", current, mAh);
			controlWrite(CtlSetCfgUpdate);
			ok = waitCfgMode(true);
			if (ok && change){
				writeByte(ExtControl, 0x00);
				writeByte(ExtDataClass, ClassState);
				writeByte(ExtDataBlock, DesignCapacityOffset / 32);
				vTaskDelay(pdMS_TO_TICKS(10));
				uint8_t capacity[2]{(uint8_t)(mAh >> 8), (uint8_t)(mAh & 0xFF)};
				write(ExtBlockData + DesignCapacityOffset % 32, capacity, 2);
				writeByte(ExtChecksum, blockChecksum());
			}
			controlWrite(CtlSoftReset);
			ok = waitCfgMode(false) && ok;
		}

		if (wasSealed) controlWrite(CtlSealed);
		return ok;
	}

};


struct BatteryManager{

	int currentPercent{999};

	Bq27441 lipo;
	bool ready{false};

	// called every poll; percent only changes occasionally, avgCurrentMa is
	// published regardless so the draw can be tracked over time
	std::function<void(int, int)> notifier = [](int, int){};

	BatteryManager(){
		if (!config::FuelCheck) return;

		i2c_master_bus_config_t bus{};
		bus.i2c_port = I2C_NUM_0;
		bus.sda_io_num = (gpio_num_t)config::BoardPinSDA;
		bus.scl_io_num = (gpio_num_t)config::BoardPinSCL;
		bus.clk_source = I2C_CLK_SRC_DEFAULT;
		bus.glitch_ignore_cnt = 7;
		bus.flags.enable_internal_pullup = true;

		i2c_master_bus_handle_t handle;
		if (i2c_new_master_bus(&bus, &handle) != ESP_OK || !lipo.begin(handle)){
			ESP_LOGE("battery", "BQ27441 init failed");
			return;
		}
		ready = true;
		if (!lipo.setCapacity(config::LipoCapacityMah, config::FuelGaugeReset)){
			ESP_LOGE("battery", "BQ27441 config update failed");
		}
	}

	void run(void* param){
		for(;;){
			int percent = ready ? lipo.soc() : 999;
			int current = ready ? lipo.avgCurrent() : 0;
			currentPercent = percent;
			notifier(percent, current);
			ESP_LOGI("battery", "%d%% | %dmV | %dmA | flags: 0x%04X", percent, lipo.voltage(), current, lipo.flags());
			vTaskDelay(pdMS_TO_TICKS(config::BatteryPollMs));
		}

	}

};
