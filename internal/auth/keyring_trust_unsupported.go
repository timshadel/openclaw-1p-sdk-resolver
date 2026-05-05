//go:build !darwin || !cgo

package auth

import (
	"context"
	"errors"
)

// CheckCurrentApplicationTrusted verifies the current app can read the item without UI.
func (SystemKeyring) CheckCurrentApplicationTrusted(ctx context.Context, service string, account string) error {
	return errors.New("keyring trust checks are only supported on macOS with cgo")
}
