package auth

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// ErrKeychainUnsupported reports that the current platform cannot read macOS Keychain.
var ErrKeychainUnsupported = errors.New("keychain unsupported")

// ErrKeychainNotFound reports that no token was found in Keychain.
var ErrKeychainNotFound = errors.New("keychain token not found")

// KeychainReader looks up secret material in a local credential store.
type KeychainReader interface {
	ReadGenericPassword(ctx context.Context, service string, account string) (string, error)
}

// SecurityKeychainReader reads generic passwords through macOS /usr/bin/security.
type SecurityKeychainReader struct{}

// ReadGenericPassword reads a generic password from macOS Keychain.
func (SecurityKeychainReader) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", ErrKeychainUnsupported
	}
	out, err := exec.CommandContext(ctx, "/usr/bin/security", "find-generic-password", "-s", service, "-a", account, "-w").Output()
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrKeychainNotFound, err)
	}
	token := strings.TrimSpace(string(out))
	if token == "" {
		return "", ErrKeychainNotFound
	}
	return token, nil
}
