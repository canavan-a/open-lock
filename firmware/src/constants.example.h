#pragma once 

namespace config{
	const int ServoGpio {16};
	const String MqttBroker {"localhost"};
	const int MqttPort {1883};
	const String MqttTopicSignal{"open-lock-signal"};
	const String MqttTopicState{"open-lock-state"}
	const String MqttTopicBattery{"open-lock-battery"};
	const String MqttClientId{"esp32"};

	// i2c pins for battery monitoring
	const bool FuelCheck{true};
	const int BoardPinSDA{21};
	const int BoardPinSCL{22};

	const int LipoCapacityMah{10000};
	const bool FuelGaugeReset{false};
	const int BatteryPollMs{60000};

	// enable this if no username and password
	const bool MqttAnon {true};
	
	const String MqttPassword {"password"};
	const String MqttUsername {"username"};

	const String NetworkSSID {"my-ssid"};
	const String NetworkPassword {"password"};

	const bool ButtonEnabled {true};
	const int ButtonPin {4};
}
