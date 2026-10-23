package httpapi

import (
	"strings"
	"time"

	"encoding/json"
	"github.com/gorilla/websocket"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"open-lock/web-controller/internal/door"
)

type fakeLock struct {
	state   door.State
	battery int
	current int
	opened  int
	closed  int
	updates chan door.Snapshot
}

func (f *fakeLock) Open()             { f.opened++ }
func (f *fakeLock) Close()            { f.closed++ }
func (f *fakeLock) State() door.State { return f.state }
func (f *fakeLock) Battery() int      { return f.battery }
func (f *fakeLock) Snapshot() door.Snapshot {
	return door.Snapshot{State: f.state.String(), Battery: f.battery, Current: f.current, Charging: f.current > door.ChargingMinMa}
}

func (f *fakeLock) Subscribe() (<-chan door.Snapshot, func()) {
	if f.updates == nil {
		f.updates = make(chan door.Snapshot, 1)
	}
	f.updates <- f.Snapshot()
	return f.updates, func() {}
}

func testRouter(lk Locker) http.Handler {
	ui := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>ui")}}
	return New(lk, ui, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestStateEndpoint(t *testing.T) {
	lk := &fakeLock{state: door.StateOpen}
	rec := httptest.NewRecorder()
	testRouter(lk).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/state", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var body struct{ State string }
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body.State != "open" {
		t.Errorf("state = %q, want open", body.State)
	}
}

func TestBatteryEndpoint(t *testing.T) {
	lk := &fakeLock{battery: 73, current: 370}
	rec := httptest.NewRecorder()
	testRouter(lk).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/battery", nil))

	var body struct {
		Battery  int
		Current  int
		Charging bool
	}
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body.Battery != 73 || body.Current != 370 || !body.Charging {
		t.Errorf("body = %+v, want 73/370/charging", body)
	}
}

func TestOpenCloseEndpoints(t *testing.T) {
	lk := &fakeLock{}
	r := testRouter(lk)

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/open", nil))
	if rec.Code != http.StatusAccepted || lk.opened != 1 {
		t.Errorf("open: status=%d opened=%d", rec.Code, lk.opened)
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/close", nil))
	if rec.Code != http.StatusAccepted || lk.closed != 1 {
		t.Errorf("close: status=%d closed=%d", rec.Code, lk.closed)
	}
}

func TestUIFallback(t *testing.T) {
	r := testRouter(&fakeLock{})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "<!doctype html>ui" {
		t.Errorf("index: status=%d body=%q", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/some/spa/route", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "<!doctype html>ui" {
		t.Errorf("spa fallback: status=%d body=%q", rec.Code, rec.Body.String())
	}
}

func TestSocketPushesSnapshots(t *testing.T) {
	lk := &fakeLock{state: door.StateOpen, battery: 80}
	srv := httptest.NewServer(testRouter(lk))
	defer srv.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	var got door.Snapshot
	if err := conn.ReadJSON(&got); err != nil {
		t.Fatalf("read initial: %v", err)
	}
	if got != (door.Snapshot{State: "open", Battery: 80}) {
		t.Errorf("initial snapshot = %+v", got)
	}

	lk.updates <- door.Snapshot{State: "closed", Battery: 79}
	if err := conn.ReadJSON(&got); err != nil {
		t.Fatalf("read update: %v", err)
	}
	if got != (door.Snapshot{State: "closed", Battery: 79}) {
		t.Errorf("pushed snapshot = %+v", got)
	}
}
