package resolver

import (
	"strconv"
	"strings"
	"time"
)

const (
	defaultClientName    = "openclaw-1p-sdk-resolver"
	defaultClientVersion = "0.1.0"
)

// Config controls resolver behavior.
type Config struct {
	DefaultVault  string
	Timeout       time.Duration
	ClientName    string
	ClientVersion string
}

// LoadConfig reads resolver config from environment.
func LoadConfig(env map[string]string) Config {
	timeout := 30 * time.Second
	if raw := strings.TrimSpace(env["OP_RESOLVER_TIMEOUT_MS"]); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			timeout = time.Duration(parsed) * time.Millisecond
		}
	}
	clientName := strings.TrimSpace(env["OP_RESOLVER_CLIENT_NAME"])
	if clientName == "" {
		clientName = defaultClientName
	}
	clientVersion := strings.TrimSpace(env["OP_RESOLVER_CLIENT_VERSION"])
	if clientVersion == "" {
		clientVersion = defaultClientVersion
	}
	return Config{
		DefaultVault:  strings.TrimSpace(env["OP_DEFAULT_VAULT"]),
		Timeout:       timeout,
		ClientName:    clientName,
		ClientVersion: clientVersion,
	}
}
