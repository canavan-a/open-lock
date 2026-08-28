package door

import (
	"io"
	"log/slog"
	"testing"
)

func newTestDoor() *Door {
	return &Door{
		log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		state:   StateUnknown,
		battery: BatteryUnknown,
	}
}

func TestHandleState(t *testing.T) {
	tests := []struct {
		payload string
		want    State
	}{
		{"open", StateOpen},
		{"closed", StateClosed},
		{"garbage", StateUnknown},
		{"", StateUnknown},
	}
	for _, tc := range tests {
		d := newTestDoor()
		d.handleState([]byte(tc.payload))
		if got := d.State(); got != tc.want {
			t.Errorf("handleState(%q) => %v, want %v", tc.payload, got, tc.want)
		}
	}
}

func TestHandleStateKeepsPreviousOnGarbage(t *testing.T) {
	d := newTestDoor()
	d.handleState([]byte("open"))
	d.handleState([]byte("nonsense"))
	if got := d.State(); got != StateOpen {
		t.Errorf("state changed on garbage payload: got %v", got)
	}
}

func TestHandleBattery(t *testing.T) {
	tests := []struct {
		payload string
		want    int
	}{
		{"42", 42},
		{"0", 0},
		{"100", 100},
		{"999", 999},
		{"not-a-number", BatteryUnknown},
		{"", BatteryUnknown},
	}
	for _, tc := range tests {
		d := newTestDoor()
		d.handleBattery([]byte(tc.payload))
		if got := d.Battery(); got != tc.want {
			t.Errorf("handleBattery(%q) => %d, want %d", tc.payload, got, tc.want)
		}
	}
}

func TestStateString(t *testing.T) {
	for s, want := range map[State]string{
		StateOpen:    "open",
		StateClosed:  "closed",
		StateUnknown: "unknown",
		State(99):    "unknown",
	} {
		if got := s.String(); got != want {
			t.Errorf("State(%d).String() = %q, want %q", s, got, want)
		}
	}
}
