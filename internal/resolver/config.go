package resolver

import (
	"strconv"
	"strings"
	"time"
)

const (
	defaultClientName    = "openclaw-1p-sdk-resolver"
	defaultClientVersion = "0.1.0"
	defaultTimeout       = 30 * time.Second

	// DefaultVaultEnv maps bare resolver IDs into this 1Password vault.
	DefaultVaultEnv = "OCOP_DEFAULT_VAULT"
	// TimeoutEnv controls resolver-mode timeout in milliseconds.
	TimeoutEnv = "OCOP_RESOLVER_TIMEOUT_MS"
	// ClientNameEnv overrides the 1Password SDK integration name.
	ClientNameEnv = "OCOP_RESOLVER_CLIENT_NAME"
	// ClientVersionEnv overrides the 1Password SDK integration version.
	ClientVersionEnv = "OCOP_RESOLVER_CLIENT_VERSION"
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
	timeout := defaultTimeout
	if raw := strings.TrimSpace(env[TimeoutEnv]); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			timeout = time.Duration(parsed) * time.Millisecond
		}
	}
	clientName := strings.TrimSpace(env[ClientNameEnv])
	if clientName == "" {
		clientName = defaultClientName
	}
	clientVersion := strings.TrimSpace(env[ClientVersionEnv])
	if clientVersion == "" {
		clientVersion = defaultClientVersion
	}
	return Config{
		DefaultVault:  strings.TrimSpace(env[DefaultVaultEnv]),
		Timeout:       timeout,
		ClientName:    clientName,
		ClientVersion: clientVersion,
	}
}
