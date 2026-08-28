// Package config loads the web-controller's runtime configuration from the
// environment. Every field has a sane default so the binary runs with no setup
// against a local anonymous broker.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	MQTTBroker   string
	MQTTPort     int
	TopicSignal  string
	TopicState   string
	TopicBattery string
	ClientID     string
	Anon         bool
	Username     string
	Password     string
	PollInterval time.Duration
	HTTPAddr     string
}

// BrokerURL returns the tcp:// URL the MQTT client should dial.
func (c Config) BrokerURL() string {
	return fmt.Sprintf("tcp://%s:%d", c.MQTTBroker, c.MQTTPort)
}

func Default() Config {
	return Config{
		MQTTBroker:   "localhost",
		MQTTPort:     1883,
		TopicSignal:  "open-lock-signal",
		TopicState:   "open-lock-state",
		TopicBattery: "open-lock-battery",
		ClientID:     "web-controller",
		Anon:         true,
		PollInterval: 2 * time.Second,
		HTTPAddr:     ":8080",
	}
}

// FromEnv starts from Default and overrides any field whose environment variable
// is set.
func FromEnv() Config {
	c := Default()
	if v := os.Getenv("MQTT_BROKER"); v != "" {
		c.MQTTBroker = v
	}
	if v := os.Getenv("MQTT_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			c.MQTTPort = n
		}
	}
	if v := os.Getenv("TOPIC_SIGNAL"); v != "" {
		c.TopicSignal = v
	}
	if v := os.Getenv("TOPIC_STATE"); v != "" {
		c.TopicState = v
	}
	if v := os.Getenv("TOPIC_BATTERY"); v != "" {
		c.TopicBattery = v
	}
	if v := os.Getenv("MQTT_CLIENT_ID"); v != "" {
		c.ClientID = v
	}
	if v := os.Getenv("MQTT_ANON"); v != "" {
		c.Anon = v == "true" || v == "1"
	}
	if v := os.Getenv("MQTT_USERNAME"); v != "" {
		c.Username = v
	}
	if v := os.Getenv("MQTT_PASSWORD"); v != "" {
		c.Password = v
	}
	if v := os.Getenv("POLL_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			c.PollInterval = d
		}
	}
	if v := os.Getenv("HTTP_ADDR"); v != "" {
		c.HTTPAddr = v
	}
	return c
}
