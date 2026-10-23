// Package door is the MQTT bridge to the physical lock. It publishes commands on
// the signal topic and keeps a cached view of the lock state and battery level
// reported by the firmware on the state and battery topics.
package door

import (
	"context"
	"log/slog"
	"strconv"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"open-lock/web-controller/internal/config"
)

// State is the lock's last known position.
type State int

const (
	StateUnknown State = iota
	StateOpen
	StateClosed
)

func (s State) String() string {
	switch s {
	case StateOpen:
		return "open"
	case StateClosed:
		return "closed"
	default:
		return "unknown"
	}
}

// BatteryUnknown is the sentinel the firmware publishes (and we report) when the
// fuel gauge cannot be read.
const BatteryUnknown = 999

// Door owns the MQTT connection and the cached lock state.
type Door struct {
	cfg    config.Config
	log    *slog.Logger
	client mqtt.Client

	mu      sync.RWMutex
	state   State
	battery int
	subs    map[chan Snapshot]struct{}
}

// Snapshot is everything the UI shows. It is pushed to subscribers on every
// firmware report, including repeats of an unchanged state, since those are
// the firmware acknowledging a command.
type Snapshot struct {
	State   string `json:"state"`
	Battery int    `json:"battery"`
}

// New connects to the broker and subscribes to the state and battery topics.
// It blocks until the initial connection succeeds or fails.
func New(cfg config.Config, log *slog.Logger) (*Door, error) {
	d := &Door{
		cfg:     cfg,
		log:     log,
		state:   StateUnknown,
		battery: BatteryUnknown,
	}

	opts := mqtt.NewClientOptions().
		AddBroker(cfg.BrokerURL()).
		SetClientID(cfg.ClientID).
		SetAutoReconnect(true).
		SetOnConnectHandler(d.onConnect).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			log.Warn("mqtt connection lost", "err", err)
		})

	if !cfg.Anon {
		opts.SetUsername(cfg.Username).SetPassword(cfg.Password)
	}

	d.client = mqtt.NewClient(opts)
	if tok := d.client.Connect(); tok.Wait() && tok.Error() != nil {
		return nil, tok.Error()
	}
	return d, nil
}

func (d *Door) onConnect(mc mqtt.Client) {
	d.log.Info("mqtt connected", "broker", d.cfg.BrokerURL())

	mc.Subscribe(d.cfg.TopicState, 1, func(_ mqtt.Client, msg mqtt.Message) {
		d.handleState(msg.Payload())
	})
	mc.Subscribe(d.cfg.TopicBattery, 1, func(_ mqtt.Client, msg mqtt.Message) {
		d.handleBattery(msg.Payload())
	})

	d.requestState()
	d.requestBattery()
}

func (d *Door) handleState(payload []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()
	switch string(payload) {
	case "open":
		d.state = StateOpen
	case "closed":
		d.state = StateClosed
	default:
		return
	}
	d.log.Debug("lock state updated", "state", d.state)
	d.broadcastLocked()
}

func (d *Door) handleBattery(payload []byte) {
	pct, err := strconv.Atoi(string(payload))
	if err != nil {
		pct = BatteryUnknown
	}
	d.mu.Lock()
	d.battery = pct
	d.broadcastLocked()
	d.mu.Unlock()
}

// Snapshot returns the current state and battery together.
func (d *Door) Snapshot() Snapshot {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.snapshotLocked()
}

func (d *Door) snapshotLocked() Snapshot {
	return Snapshot{State: d.state.String(), Battery: d.battery}
}

// Subscribe returns a channel that receives the current snapshot immediately
// and then one per firmware report, and a func to unsubscribe. A subscriber
// that falls behind only ever sees the latest snapshot, never a backlog.
func (d *Door) Subscribe() (<-chan Snapshot, func()) {
	ch := make(chan Snapshot, 1)
	d.mu.Lock()
	if d.subs == nil {
		d.subs = make(map[chan Snapshot]struct{})
	}
	d.subs[ch] = struct{}{}
	ch <- d.snapshotLocked()
	d.mu.Unlock()

	return ch, func() {
		d.mu.Lock()
		delete(d.subs, ch)
		d.mu.Unlock()
	}
}

// broadcastLocked must be called with d.mu held for writing.
func (d *Door) broadcastLocked() {
	s := d.snapshotLocked()
	for ch := range d.subs {
		select {
		case <-ch:
		default:
		}
		ch <- s
	}
}

func (d *Door) requestState()   { d.client.Publish(d.cfg.TopicSignal, 1, false, "state") }
func (d *Door) requestBattery() { d.client.Publish(d.cfg.TopicSignal, 1, false, "battery") }

// Open asks the firmware to unlock.
func (d *Door) Open() { d.client.Publish(d.cfg.TopicSignal, 1, false, "open") }

// Close asks the firmware to lock. The firmware's payload for this is "closed".
func (d *Door) Close() { d.client.Publish(d.cfg.TopicSignal, 1, false, "closed") }

// State returns the last known lock position.
func (d *Door) State() State {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.state
}

// Battery returns the last reported charge percentage, or BatteryUnknown.
func (d *Door) Battery() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.battery
}

// Poll re-requests the lock state on cfg.PollInterval for as long as it is
// unknown. The firmware only reports on change or on request, so this recovers
// state after a controller restart that missed the retained message.
func (d *Door) Poll(ctx context.Context) {
	ticker := time.NewTicker(d.cfg.PollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if d.State() == StateUnknown {
				d.requestState()
			}
		}
	}
}

// Stop disconnects from the broker.
func (d *Door) Stop() { d.client.Disconnect(250) }
