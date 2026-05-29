# Firmware

ESP32 firmware built with PlatformIO. Connects to WiFi and an MQTT broker, then drives a servo to open or close the lock.

## Dependencies

- [ESP32Servo](https://github.com/madhephaestus/ESP32Servo)
- [PubSubClient](https://github.com/knolleary/pubsubclient)

## Configuration

Copy `src/constants.example.h` to `src/constants.h` and fill in your values:

```cpp
namespace config {
    const int ServoGpio {16};           // GPIO pin the servo signal wire is connected to

    const String MqttBroker {"192.168.1.100"};
    const int MqttPort {1883};
    const String MqttTopicSignal {"open-lock-signal"};  // topic the firmware subscribes to
    const String MqttTopicState  {"open-lock-state"};   // topic the firmware publishes state on
    const String MqttClientId    {"esp32"};

    const bool MqttAnon {true};         // set false to use username/password below
    const String MqttUsername {"username"};
    const String MqttPassword {"password"};

    const String NetworkSSID     {"my-ssid"};
    const String NetworkPassword {"password"};
}
```

`src/constants.h` is gitignored — never commit credentials.

## Build and flash

Replace `ttyUSB0` with your ESP32's serial port:

```bash
pio run --target upload --upload-port /dev/ttyUSB0 && pio device monitor --port /dev/ttyUSB0 --baud 115200
```

## MQTT commands

Publish to `MqttTopicSignal` (default `open-lock-signal`):

| Payload | Effect |
|---------|--------|
| `open` | Move servo to open position (0°) |
| `closed` | Move servo to closed position (saved close angle) |
| `state` | Request current state — firmware replies on `MqttTopicState` |
| `angle:<n>` | Set and persist the close angle in degrees (e.g. `angle:90`) |

State updates are published automatically to `MqttTopicState` (default `open-lock-state`) as `open` or `closed` whenever the lock moves.

## Persistent state

The close angle and last lock state are stored in ESP32 NVS (non-volatile storage) and restored on boot, so the servo returns to its last position after a power cycle.

## Architecture

Three FreeRTOS tasks run concurrently:

- **servo** — dequeues state commands and drives the servo
- **servoAngle** — dequeues angle-set commands and persists the new close angle
- **signal** — maintains WiFi/MQTT connections and forwards incoming messages to the servo queues
