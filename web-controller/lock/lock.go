package lock

import (
	"fmt"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"open-lock/web-controller/config"
)

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

type Client struct {
	cfg      config.Config
	mqtt     mqtt.Client
	mu       sync.RWMutex
	state    State
	stopPoll chan struct{}
}

func New(cfg config.Config) (*Client, error) {
	c := &Client{
		cfg:      cfg,
		state:    StateUnknown,
		stopPoll: make(chan struct{}),
	}

	opts := mqtt.NewClientOptions().
		AddBroker(fmt.Sprintf("tcp://%s:%d", cfg.MQTTBroker, cfg.MQTTPort)).
		SetClientID(cfg.ClientID).
		SetAutoReconnect(true).
		SetOnConnectHandler(c.onConnect)

	if !cfg.Anon {
		opts.SetUsername(cfg.Username).SetPassword(cfg.Password)
	}

	c.mqtt = mqtt.NewClient(opts)
	if tok := c.mqtt.Connect(); tok.Wait() && tok.Error() != nil {
		return nil, tok.Error()
	}

	return c, nil
}

func (c *Client) onConnect(mc mqtt.Client) {
	mc.Subscribe(c.cfg.TopicState, 1, func(_ mqtt.Client, msg mqtt.Message) {
		c.mu.Lock()
		defer c.mu.Unlock()
		switch string(msg.Payload()) {
		case "open":
			c.state = StateOpen
		case "closed":
			c.state = StateClosed
		}
	})
	c.requestState()
}

func (c *Client) requestState() {
	c.mqtt.Publish(c.cfg.TopicSignal, 1, false, "state")
}

func (c *Client) Open() {
	c.mqtt.Publish(c.cfg.TopicSignal, 1, false, "open")
}

func (c *Client) Close() {
	c.mqtt.Publish(c.cfg.TopicSignal, 1, false, "closed")
}

func (c *Client) State() State {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state
}

// StartPolling sends a state request at cfg.PollInterval whenever state is unknown.
func (c *Client) StartPolling() {
	go func() {
		ticker := time.NewTicker(c.cfg.PollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if c.State() == StateUnknown {
					c.requestState()
				}
			case <-c.stopPoll:
				return
			}
		}
	}()
}

func (c *Client) Stop() {
	close(c.stopPoll)
	c.mqtt.Disconnect(250)
}
