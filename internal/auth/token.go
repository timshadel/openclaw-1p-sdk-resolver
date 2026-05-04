package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
)

const (
	// ServiceAccountTokenEnv is the logical service token input name.
	ServiceAccountTokenEnv = "OP_SERVICE_ACCOUNT_TOKEN"
	// ServiceAccountTokenFileEnv is the file-backed service token input name.
	ServiceAccountTokenFileEnv = "OP_SERVICE_ACCOUNT_TOKEN_FILE"
	// KeychainServiceEnv selects the macOS Keychain generic-password service.
	KeychainServiceEnv = "OP_SERVICE_ACCOUNT_TOKEN_KEYCHAIN_SERVICE"
	// KeychainAccountEnv selects the macOS Keychain generic-password account.
	KeychainAccountEnv = "OP_SERVICE_ACCOUNT_TOKEN_KEYCHAIN_ACCOUNT"

	defaultKeychainService = "openclaw-1p-sdk-resolver"
	defaultKeychainAccount = "OP_SERVICE_ACCOUNT_TOKEN"
)

// ErrTokenMissing reports that no service account token source produced a token.
var ErrTokenMissing = errors.New("service account token missing")

// ErrTokenAmbiguous reports that both env and file token inputs were set.
var ErrTokenAmbiguous = errors.New("both OP_SERVICE_ACCOUNT_TOKEN and OP_SERVICE_ACCOUNT_TOKEN_FILE are set")

// FileReader reads token files. It exists to keep tests off disk when useful.
type FileReader func(path string) ([]byte, error)

// TokenSource describes where a service account token came from without exposing it.
type TokenSource string

const (
	TokenSourceEnv      TokenSource = "env"
	TokenSourceFile     TokenSource = "file"
	TokenSourceKeychain TokenSource = "keychain"
)

// TokenResult contains a loaded token and a nonsecret source label.
type TokenResult struct {
	Token  string
	Source TokenSource
}

// LoadServiceAccountToken loads the service account token from env, file, or Keychain.
func LoadServiceAccountToken(ctx context.Context, env map[string]string, readFile FileReader, keychain KeychainReader) (TokenResult, error) {
	envToken := strings.TrimSpace(env[ServiceAccountTokenEnv])
	filePath := strings.TrimSpace(env[ServiceAccountTokenFileEnv])
	if envToken != "" && filePath != "" {
		return TokenResult{}, ErrTokenAmbiguous
	}
	if envToken != "" {
		return TokenResult{Token: envToken, Source: TokenSourceEnv}, nil
	}
	if filePath != "" {
		if readFile == nil {
			readFile = os.ReadFile
		}
		content, err := readFile(filePath)
		if err != nil {
			return TokenResult{}, fmt.Errorf("read service account token file: %w", err)
		}
		token := strings.TrimSpace(string(content))
		if token == "" {
			return TokenResult{}, ErrTokenMissing
		}
		return TokenResult{Token: token, Source: TokenSourceFile}, nil
	}
	if keychain == nil {
		keychain = SecurityKeychainReader{}
	}
	service := strings.TrimSpace(env[KeychainServiceEnv])
	if service == "" {
		service = defaultKeychainService
	}
	account := strings.TrimSpace(env[KeychainAccountEnv])
	if account == "" {
		account = defaultKeychainAccount
	}
	token, err := keychain.ReadGenericPassword(ctx, service, account)
	if err != nil {
		return TokenResult{}, ErrTokenMissing
	}
	return TokenResult{Token: token, Source: TokenSourceKeychain}, nil
}
