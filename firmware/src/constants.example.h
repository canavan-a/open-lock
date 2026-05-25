#pragma once 

namespace config{
	const int ServoGpio {16};
	const String MqttBroker {"localhost"};
	const int MqttPort {1883};
	const String MqttTopicSignal{"open-lock-signal"};
	const String MqttTopicState{"open-lock-state"}
	const MqttClientId{"esp32"};

	// enable this if no username and password
	const bool MqttAnon {true};
	
	const String MqttPassword {"password"};
	const String MqttUsername {"username"};

	const String NetworkSSID {"my-ssid"};
	const String NetworkPassword {"password"};
}
