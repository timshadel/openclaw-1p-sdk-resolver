package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/99designs/keyring"
)

const keyringService = "openclaw-1p-sdk-resolver"

// ErrKeyringNotFound reports that no token was found in Keyring.
var ErrKeyringNotFound = errString("keyring token not found")

// ErrKeyringItemExists reports that a Keyring item already exists.
var ErrKeyringItemExists = errString("keyring token already exists")

type errString string

func (e errString) Error() string {
	return string(e)
}

// Keyring stores and reads generic password items without exposing secret material.
type Keyring interface {
	ReadGenericPassword(ctx context.Context, service string, account string) (string, error)
	ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error)
	WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error
}

// SystemKeyring stores credentials through github.com/99designs/keyring.
type SystemKeyring struct{}

// ServiceAccountKeyringService returns the fixed keyring service for this tool.
func ServiceAccountKeyringService() string {
	return keyringService
}

// ReadGenericPassword reads a credential from the system keyring.
func (SystemKeyring) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", fmt.Errorf("keyring read cancelled: %w", err)
	}
	ring, err := openKeyring(service)
	if err != nil {
		return "", err
	}
	item, err := ring.Get(account)
	if errors.Is(err, keyring.ErrKeyNotFound) {
		return "", ErrKeyringNotFound
	}
	if err != nil {
		return "", errors.New("keyring read failed")
	}
	return string(item.Data), nil
}

// ExistsGenericPassword reports whether a credential exists in the system keyring.
func (SystemKeyring) ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("keyring exists cancelled: %w", err)
	}
	ring, err := openKeyring(service)
	if err != nil {
		return false, err
	}
	_, err = ring.GetMetadata(account)
	if errors.Is(err, keyring.ErrKeyNotFound) || errors.Is(err, keyring.ErrMetadataNotSupported) || errors.Is(err, keyring.ErrMetadataNeedsCredentials) {
		_, getErr := ring.Get(account)
		if errors.Is(getErr, keyring.ErrKeyNotFound) {
			return false, nil
		}
		if getErr != nil {
			return false, errors.New("keyring existence check failed")
		}
		return true, nil
	}
	if err != nil {
		return false, errors.New("keyring metadata check failed")
	}
	return true, nil
}

// WriteGenericPassword writes or updates a credential in the system keyring.
func (SystemKeyring) WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("keyring write cancelled: %w", err)
	}
	ring, err := openKeyring(service)
	if err != nil {
		return err
	}
	if !force {
		exists, err := SystemKeyring{}.ExistsGenericPassword(ctx, service, account)
		if err != nil {
			return err
		}
		if exists {
			return ErrKeyringItemExists
		}
	}
	if err := ring.Set(keyring.Item{
		Key:         account,
		Data:        []byte(password),
		Label:       service,
		Description: "OpenClaw 1Password resolver service account token",
	}); err != nil {
		return errors.New("keyring write failed")
	}
	return nil
}

func openKeyring(service string) (keyring.Keyring, error) {
	ring, err := keyring.Open(keyring.Config{
		ServiceName:                    service,
		KeychainAccessibleWhenUnlocked: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open keyring: %w", err)
	}
	return ring, nil
}
