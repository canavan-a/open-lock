package httpapi

import (
	"encoding/json"
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
	opened  int
	closed  int
}

func (f *fakeLock) Open()             { f.opened++ }
func (f *fakeLock) Close()            { f.closed++ }
func (f *fakeLock) State() door.State { return f.state }
func (f *fakeLock) Battery() int      { return f.battery }

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
	lk := &fakeLock{battery: 73}
	rec := httptest.NewRecorder()
	testRouter(lk).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/battery", nil))

	var body struct{ Battery int }
	json.Unmarshal(rec.Body.Bytes(), &body)
	if body.Battery != 73 {
		t.Errorf("battery = %d, want 73", body.Battery)
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
