# web controller

A single Go binary that bridges the app to the lock firmware over MQTT.
With `UI_DIR` set it also serves the app's web build (a PWA, see
[`mobile/README.md`](../mobile/README.md#web-pwa)) at `/`.

Auth is expected to be handled at the edge (e.g. Cloudflare Access) — the server
has no login of its own.

## Layout

| Path | Purpose |
| --- | --- |
| `main.go` | wiring: config → MQTT door client → Gin router → graceful shutdown |
| `internal/config` | environment configuration |
| `internal/door` | MQTT client: publishes commands, caches lock state + battery |
| `internal/httpapi` | Gin router and handlers |

## HTTP endpoints

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/state` | `{"state":"open"\|"closed"\|"unknown"}` |
| `GET` | `/battery` | `{"battery":<int>,"current":<mA>,"charging":<bool>}` (`999` = fuel gauge unavailable; `current` is positive while charging) |
| `GET` | `/ws` | WebSocket: pushes `{"state":...,"battery":...,"current":...,"charging":...}` on connect, on every firmware report, and every 25s as a heartbeat |
| `POST` | `/open` | `{"sent":"open"}` |
| `POST` | `/close` | `{"sent":"closed"}` |
| `GET` | `/healthz` | `{"status":"ok"}` |
| `GET` | `/*` | the web build in `UI_DIR`, if set (SPA fallback to `index.html`) |

## MQTT contract (with the firmware)

Commands are published to `TOPIC_SIGNAL` (default `open-lock-signal`) as the
payloads `open`, `closed`, `state`, `battery`. The firmware reports on
`TOPIC_STATE` (`open`/`closed`) and `TOPIC_BATTERY` (integer percent, `999` on
error) and `TOPIC_CURRENT` (average battery current in mA, positive while
charging; `charging` is true above 10 mA). State is re-requested every `POLL_INTERVAL` while it is unknown.

## Configuration (environment)

`MQTT_BROKER`, `MQTT_PORT`, `MQTT_CLIENT_ID`, `MQTT_ANON`, `MQTT_USERNAME`,
`MQTT_PASSWORD`, `TOPIC_SIGNAL`, `TOPIC_STATE`, `TOPIC_BATTERY`, `TOPIC_CURRENT`,
`POLL_INTERVAL`, `HTTP_ADDR`, `UI_DIR`. See `../config.example.env`.

## Build

```
make build                     # the Go binary into bin/
UI_DIR=../mobile/dist make run # with the web build (npm run build:web in ../mobile)
go test ./...
```

The Nix module builds the web app (`packages.web`) and points `UI_DIR` at it.
