package observability

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

const appName = "openclaw-1p-sdk-resolver"

// Config controls file-backed logging.
type Config struct {
	Logging LoggingConfig `json:"logging"`
}

// LoggingConfig contains log destination and level overrides.
type LoggingConfig struct {
	Enabled   *bool  `json:"enabled,omitempty"`
	Level     string `json:"level,omitempty"`
	InfoPath  string `json:"infoPath,omitempty"`
	ErrorPath string `json:"errorPath,omitempty"`
}

// Loggers contains separate operational and error loggers.
type Loggers struct {
	Info      *slog.Logger
	Error     *slog.Logger
	Close     func() error
	InfoPath  string
	ErrorPath string
}

// Nop returns disabled loggers.
func Nop() Loggers {
	noop := slog.New(slog.NewTextHandler(io.Discard, nil))
	return Loggers{Info: noop, Error: noop, Close: func() error { return nil }}
}

// Open creates configured file-backed loggers.
func Open(env map[string]string) (Loggers, error) {
	config, err := LoadConfig(env)
	if err != nil {
		return Loggers{}, err
	}
	if config.Logging.Enabled != nil && !*config.Logging.Enabled {
		return Nop(), nil
	}

	infoPath := strings.TrimSpace(config.Logging.InfoPath)
	errorPath := strings.TrimSpace(config.Logging.ErrorPath)
	if infoPath == "" {
		infoPath = filepath.Join(xdgStateHome(env), appName, "logs", "resolver.log")
	}
	if errorPath == "" {
		errorPath = filepath.Join(xdgStateHome(env), appName, "logs", "resolver-error.log")
	}

	level := parseLevel(config.Logging.Level)
	infoFile, err := openLogFile(infoPath)
	if err != nil {
		return Loggers{}, fmt.Errorf("open info log: %w", err)
	}
	errorFile := infoFile
	if errorPath != infoPath {
		errorFile, err = openLogFile(errorPath)
		if err != nil {
			_ = infoFile.Close()
			return Loggers{}, fmt.Errorf("open error log: %w", err)
		}
	}

	infoLogger := slog.New(slog.NewJSONHandler(infoFile, &slog.HandlerOptions{Level: level}))
	errorLogger := slog.New(slog.NewJSONHandler(errorFile, &slog.HandlerOptions{Level: slog.LevelWarn}))
	closeFn := func() error {
		errs := []error{infoFile.Close()}
		if errorPath != infoPath {
			errs = append(errs, errorFile.Close())
		}
		return errors.Join(errs...)
	}
	return Loggers{
		Info:      infoLogger,
		Error:     errorLogger,
		Close:     closeFn,
		InfoPath:  infoPath,
		ErrorPath: errorPath,
	}, nil
}

// LoadConfig reads optional XDG JSON config.
func LoadConfig(env map[string]string) (Config, error) {
	path := ConfigPath(env)
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Config{}, nil
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config %s: %w", path, err)
	}
	var config Config
	if err := json.Unmarshal(content, &config); err != nil {
		return Config{}, fmt.Errorf("parse config %s: %w", path, err)
	}
	return config, nil
}

// ConfigPath returns the XDG config path used by default.
func ConfigPath(env map[string]string) string {
	return filepath.Join(xdgConfigHome(env), appName, "config.json")
}

// Fingerprint returns a nonsecret SHA-256 fingerprint scoped by a name.
//
// The scope prevents the same sensitive value stored under different names from
// producing the same log fingerprint.
func Fingerprint(scope string, value string) string {
	sum := sha256.Sum256([]byte(scope + "\x00" + value))
	return hex.EncodeToString(sum[:])
}

func openLogFile(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
}

func parseLevel(raw string) slog.Leveler {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func xdgConfigHome(env map[string]string) string {
	if path := strings.TrimSpace(env["XDG_CONFIG_HOME"]); path != "" {
		return path
	}
	return filepath.Join(homeDir(env), ".config")
}

func xdgStateHome(env map[string]string) string {
	if path := strings.TrimSpace(env["XDG_STATE_HOME"]); path != "" {
		return path
	}
	return filepath.Join(homeDir(env), ".local", "state")
}

func homeDir(env map[string]string) string {
	if home := strings.TrimSpace(env["HOME"]); home != "" {
		return home
	}
	if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
		return home
	}
	return "."
}
