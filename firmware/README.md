# Firmware

ESP32 firmware built with PlatformIO on plain ESP-IDF. Connects to WiFi and an MQTT broker, then drives a servo to open or close the lock.

It is built around automatic light sleep: every task blocks on a queue, interrupt or long timer, so between events the CPU sleeps and the radio only wakes for the WiFi beacons it has to listen to. The access point buffers incoming commands until that wake-up, so command latency is roughly `WifiListenInterval × 102 ms`.

## Dependencies

- ESP-IDF 6 (`platform = espressif32 @ 7.0.1`, fetched by PlatformIO)
- [esp-mqtt](https://components.espressif.com/components/espressif/mqtt) (fetched by the IDF component manager from `src/idf_component.yml`)

Servo PWM, the BQ27441 fuel gauge and NVS are driven directly through ESP-IDF; no Arduino libraries are used.

## Configuration

Copy `src/constants.example.h` to `src/constants.h` and fill in your values:

```cpp
namespace config {
    const int ServoGpio {16};           // GPIO pin the servo signal wire is connected to
    const int ServoPowerGpio {-1};      // GPIO switching the servo's supply, -1 if always powered

    const char* const MqttBroker {"localhost"};
    const int MqttPort {1883};
    const char* const MqttTopicSignal {"open-lock-signal"};   // topic the firmware subscribes to
    const char* const MqttTopicState  {"open-lock-state"};    // retained lock state
    const char* const MqttTopicBattery{"open-lock-battery"};  // retained battery percent
    const char* const MqttTopicCurrent{"open-lock-current"};  // average battery current, mA
    const char* const MqttTopicOnline {"open-lock-online"};   // retained online/offline (last will)
    const char* const MqttClientId    {"esp32"};
    const int MqttKeepaliveSec {60};

    // enable this if no username and password
    const bool MqttAnon {true};
    const char* const MqttPassword {"password"};
    const char* const MqttUsername {"username"};

    const char* const NetworkSSID     {"my-ssid"};
    const char* const NetworkPassword {"password"};
    const int WifiListenInterval {3};   // beacons the radio may sleep through
    ...
}
```

`src/constants.h` is gitignored — never commit credentials.

### Tuning latency against battery

| `WifiListenInterval` | Worst-case command latency | Power |
|---|---|---|
| 1 | ~100 ms | highest |
| 3 (default) | ~300 ms | balanced |
| 10 | ~1 s | lowest |

The router's DTIM interval also matters: the ESP can't usefully listen less often than the AP announces buffered traffic, so keep DTIM at or below the listen interval.

`BatteryPollMs` sets how often the fuel gauge is read and battery/current are published (5 minutes in the example).

`ServoPowerGpio` is for a MOSFET or load switch on the servo's supply. A hobby servo draws several mA idle even with no signal; gating it removes that between moves.

## Build and flash

Replace `ttyUSB0` with your ESP32's serial port:

```bash
pio run --target upload --upload-port /dev/ttyUSB0 && pio device monitor --port /dev/ttyUSB0 --baud 115200
```

The partition table matches the old Arduino layout, so the saved close angle and lock state survive moving from the Arduino firmware.

## MQTT commands

Publish to `MqttTopicSignal` (default `open-lock-signal`):

| Payload | Effect |
|---------|--------|
| `open` | Move servo to open position (0°) |
| `closed` | Move servo to closed position (saved close angle) |
| `state` | Request current state — firmware replies on `MqttTopicState` |
| `battery` | Request battery percent — firmware replies on `MqttTopicBattery` |
| `angle:<n>` | Set and persist the close angle in degrees (e.g. `angle:90`) |

The firmware publishes, all at QoS 1:

| Topic | Payload | Retained |
|-------|---------|----------|
| `MqttTopicState` | `open` / `closed`, after every move or command | yes |
| `MqttTopicBattery` | percent, `999` if the gauge can't be read | yes |
| `MqttTopicCurrent` | average battery current in mA (negative while discharging) | no |
| `MqttTopicOnline` | `online` on connect; the broker sets `offline` if the lock drops | yes |

Everything retained is republished on every (re)connect.

## Persistent state

The close angle and last lock state are stored in ESP32 NVS (non-volatile storage) and restored on boot, so the servo returns to its last position after a power cycle.

## Architecture

- **servo** task — dequeues state commands and drives the servo. Holds a power-management lock while moving so the PWM keeps running.
- **servoAngle** task — dequeues angle-set commands and persists the new close angle
- **btn** task — woken by a GPIO interrupt (which can also wake the chip from light sleep), debounces, toggles the lock
- **battery** task — reads the BQ27441 every `BatteryPollMs`
- **SignalManager** — no task of its own; WiFi and MQTT events arrive from the ESP-IDF driver tasks. WiFi reconnects back off from 1 s up to 60 s.
