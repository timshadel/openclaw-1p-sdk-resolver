package observability

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOpenUsesXDGDefaults(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	logs, err := Open(map[string]string{"HOME": home})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	wantInfo := filepath.Join(home, ".local", "state", appName, "logs", "resolver.log")
	wantError := filepath.Join(home, ".local", "state", appName, "logs", "resolver-error.log")
	if logs.InfoPath != wantInfo || logs.ErrorPath != wantError {
		t.Fatalf("paths = %q/%q, want %q/%q", logs.InfoPath, logs.ErrorPath, wantInfo, wantError)
	}
	logs.Info.Info("hello", slog.String("kind", "info"))
	logs.Error.Error("failed", slog.String("kind", "error"))
	if err := logs.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	assertLogContains(t, wantInfo, "hello")
	assertLogContains(t, wantError, "failed")
}

func TestOpenUsesXDGConfigOverrides(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	configHome := filepath.Join(root, "config")
	infoPath := filepath.Join(root, "custom", "info.jsonl")
	errorPath := filepath.Join(root, "custom", "error.jsonl")
	configPath := filepath.Join(configHome, appName, "config.json")
	if err := os.MkdirAll(filepath.Dir(configPath), 0o700); err != nil {
		t.Fatalf("mkdir config: %v", err)
	}
	content, err := json.Marshal(Config{Logging: LoggingConfig{
		Level:     "debug",
		InfoPath:  infoPath,
		ErrorPath: errorPath,
	}})
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	if err := os.WriteFile(configPath, content, 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	logs, err := Open(map[string]string{"XDG_CONFIG_HOME": configHome, "HOME": root})
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	logs.Info.Debug("debug visible")
	if err := logs.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if logs.InfoPath != infoPath || logs.ErrorPath != errorPath {
		t.Fatalf("paths = %q/%q, want %q/%q", logs.InfoPath, logs.ErrorPath, infoPath, errorPath)
	}
	assertLogContains(t, infoPath, "debug visible")
}

func TestFingerprintDoesNotExposeInput(t *testing.T) {
	t.Parallel()
	got := Fingerprint("ref", "op://Vault/Item/field")
	if got == "" || strings.Contains(got, "Vault") || strings.Contains(got, "Item") {
		t.Fatalf("unsafe fingerprint: %q", got)
	}
}

func TestFingerprintIsScopedByName(t *testing.T) {
	t.Parallel()
	value := "same-secret-value"
	first := Fingerprint("first-name", value)
	if first != Fingerprint("first-name", value) {
		t.Fatal("same scope and value should produce stable fingerprint")
	}
	if first == Fingerprint("second-name", value) {
		t.Fatal("same value under different names should produce different fingerprints")
	}
}

func assertLogContains(t *testing.T, path string, want string) {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read log %s: %v", path, err)
	}
	if !strings.Contains(string(content), want) {
		t.Fatalf("log %s did not contain %q: %s", path, want, content)
	}
}
