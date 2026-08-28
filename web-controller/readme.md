# web controller

A single Go binary that bridges the browser UI to the lock firmware over MQTT.
The built React UI (`ui/`) is embedded into the binary and served at `/`.

Auth is expected to be handled at the edge (e.g. Cloudflare Access) — the server
has no login of its own.

## Layout

| Path | Purpose |
| --- | --- |
| `main.go` | wiring: config → MQTT door client → Gin router → graceful shutdown |
| `static.go` | `//go:embed all:ui/dist` |
| `internal/config` | environment configuration |
| `internal/door` | MQTT client: publishes commands, caches lock state + battery |
| `internal/httpapi` | Gin router and handlers |
| `ui/` | Vite + React + Tailwind/daisyUI single-page UI |

## HTTP endpoints

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/state` | `{"state":"open"\|"closed"\|"unknown"}` |
| `GET` | `/battery` | `{"battery":<int>}` (`999` = fuel gauge unavailable) |
| `POST` | `/open` | `{"sent":"open"}` |
| `POST` | `/close` | `{"sent":"closed"}` |
| `GET` | `/healthz` | `{"status":"ok"}` |
| `GET` | `/*` | embedded UI (SPA fallback to `index.html`) |

## MQTT contract (with the firmware)

Commands are published to `TOPIC_SIGNAL` (default `open-lock-signal`) as the
payloads `open`, `closed`, `state`, `battery`. The firmware reports on
`TOPIC_STATE` (`open`/`closed`) and `TOPIC_BATTERY` (integer percent, `999` on
error). State is re-requested every `POLL_INTERVAL` while it is unknown.

## Configuration (environment)

`MQTT_BROKER`, `MQTT_PORT`, `MQTT_CLIENT_ID`, `MQTT_ANON`, `MQTT_USERNAME`,
`MQTT_PASSWORD`, `TOPIC_SIGNAL`, `TOPIC_STATE`, `TOPIC_BATTERY`, `POLL_INTERVAL`,
`HTTP_ADDR`. See `../config.example.env`.

## Build

```
make build        # builds ui/ then the Go binary into bin/
make dev-ui       # vite dev server, proxies API calls to :8080
go test ./...
```

`ui/dist` is committed so `go build` / the Nix package work without Node.
Rebuild it (`make build-ui`) and commit the result whenever the UI changes.
