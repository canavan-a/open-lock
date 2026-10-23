#pragma once

namespace config{
	const int ServoGpio {16};
	// GPIO switching a MOSFET/load switch on the servo's supply, so the servo
	// draws nothing between moves. -1 if the servo is wired straight to the rail.
	const int ServoPowerGpio {-1};
	// How long the pwm is held per move before the new state is reported. An
	// MG995 needs ~0.3 s for 90 degrees unloaded; lower this until the bolt
	// sometimes stops short, then add margin.
	const int ServoMoveMs {700};

	const char* const MqttBroker {"localhost"};
	const int MqttPort {1883};
	const char* const MqttTopicSignal{"open-lock-signal"};
	const char* const MqttTopicState{"open-lock-state"};
	const char* const MqttTopicBattery{"open-lock-battery"};
	// average battery current in mA (negative = discharging), for measuring draw
	const char* const MqttTopicCurrent{"open-lock-current"};
	// retained "online", replaced by the broker with "offline" if the lock drops
	const char* const MqttTopicOnline{"open-lock-online"};
	const char* const MqttClientId{"esp32"};
	const int MqttKeepaliveSec{60};

	// i2c pins for battery monitoring
	const bool FuelCheck{true};
	const int BoardPinSDA{21};
	const int BoardPinSCL{22};

	const int LipoCapacityMah{10000};
	const bool FuelGaugeReset{false};
	const int BatteryPollMs{300000};

	// enable this if no username and password
	const bool MqttAnon {true};

	const char* const MqttPassword {"password"};
	const char* const MqttUsername {"username"};

	const char* const NetworkSSID {"my-ssid"};
	const char* const NetworkPassword {"password"};
	// Beacons (~102 ms each) the radio may sleep through. Worst-case command
	// latency is about WifiListenInterval * 102 ms; higher saves more power.
	const int WifiListenInterval {3};

	const bool ButtonEnabled {true};
	const int ButtonPin {4};
}
