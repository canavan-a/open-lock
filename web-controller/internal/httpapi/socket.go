package httpapi

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"open-lock/web-controller/internal/door"
)

const (
	// Snapshots are re-sent this often even when nothing changed. Clients treat
	// a silence of a few heartbeats as a dead connection and reconnect, and the
	// traffic keeps proxies (Cloudflare drops idle sockets at 100s) from
	// closing the socket.
	socketHeartbeat = 25 * time.Second
	// The client has this long to answer a ping before the socket is dropped.
	socketPongWait  = 2 * socketHeartbeat
	socketWriteWait = 5 * time.Second
)

var upgrader = websocket.Upgrader{
	// Auth happens at the edge and CORS already allows every origin.
	CheckOrigin: func(*http.Request) bool { return true },
}

// serveSocket pushes a door.Snapshot as JSON on connect, on every firmware
// report and on every heartbeat until the client goes away. Clients send
// nothing; reads only exist to notice the close and handle pongs.
func serveSocket(w http.ResponseWriter, r *http.Request, lk Locker, log *slog.Logger) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Debug("websocket upgrade failed", "err", err)
		return
	}
	defer conn.Close()

	updates, unsubscribe := lk.Subscribe()
	defer unsubscribe()

	done := make(chan struct{})
	go func() {
		defer close(done)
		conn.SetReadLimit(512)
		conn.SetReadDeadline(time.Now().Add(socketPongWait))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(socketPongWait))
		})
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	heartbeat := time.NewTicker(socketHeartbeat)
	defer heartbeat.Stop()

	send := func(s door.Snapshot) error {
		conn.SetWriteDeadline(time.Now().Add(socketWriteWait))
		return conn.WriteJSON(s)
	}

	for {
		select {
		case s := <-updates:
			if err := send(s); err != nil {
				return
			}
		case <-heartbeat.C:
			if err := send(lk.Snapshot()); err != nil {
				return
			}
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(socketWriteWait)); err != nil {
				return
			}
		case <-done:
			return
		}
	}
}
