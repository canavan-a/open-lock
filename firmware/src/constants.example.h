#pragma once 

namespace config{
	const int ServoGpio {16};
	const String MqttBroker {"localhost"};
	const int MqttPort {1883};
	const String MqttTopicSignal{"open-lock-signal"};
	const String MqttTopicState{"open-lock-state"}
	const String MqttClientId{"esp32"};

	// use this if adding INA219 module on Servo
	const bool UseServoCurrentMonitor{true};

	// enable this if no username and password
	const bool MqttAnon {true};
	
	const String MqttPassword {"password"};
	const String MqttUsername {"username"};

	const String NetworkSSID {"my-ssid"};
	const String NetworkPassword {"password"};
}
