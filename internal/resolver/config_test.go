package resolver

import (
	"testing"
	"time"
)

func TestLoadConfigUsesOCOPEnv(t *testing.T) {
	t.Parallel()
	config := LoadConfig(map[string]string{
		DefaultVaultEnv:  "Vault",
		TimeoutEnv:       "1234",
		ClientNameEnv:    "client",
		ClientVersionEnv: "1.2.3",
	})
	if config.DefaultVault != "Vault" {
		t.Fatalf("DefaultVault = %q, want Vault", config.DefaultVault)
	}
	if config.Timeout != 1234*time.Millisecond {
		t.Fatalf("Timeout = %s, want 1234ms", config.Timeout)
	}
	if config.ClientName != "client" {
		t.Fatalf("ClientName = %q, want client", config.ClientName)
	}
	if config.ClientVersion != "1.2.3" {
		t.Fatalf("ClientVersion = %q, want 1.2.3", config.ClientVersion)
	}
}

func TestLoadConfigIgnoresOldOPEnv(t *testing.T) {
	t.Parallel()
	config := LoadConfig(map[string]string{
		"OP_DEFAULT_VAULT":           "OldVault",
		"OP_RESOLVER_TIMEOUT_MS":     "5",
		"OP_RESOLVER_CLIENT_NAME":    "old-client",
		"OP_RESOLVER_CLIENT_VERSION": "9.9.9",
	})
	if config.DefaultVault != "" {
		t.Fatalf("DefaultVault = %q, want empty", config.DefaultVault)
	}
	if config.Timeout != defaultTimeout {
		t.Fatalf("Timeout = %s, want %s", config.Timeout, defaultTimeout)
	}
	if config.ClientName != defaultClientName {
		t.Fatalf("ClientName = %q, want %q", config.ClientName, defaultClientName)
	}
	if config.ClientVersion != defaultClientVersion {
		t.Fatalf("ClientVersion = %q, want %q", config.ClientVersion, defaultClientVersion)
	}
}
