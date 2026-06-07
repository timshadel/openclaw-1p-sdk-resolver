package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

const (
	// ServiceAccountTokenNameEnv selects the system keyring account suffix.
	ServiceAccountTokenNameEnv = "OCOP_SERVICE_ACCOUNT_TOKEN_NAME"
	// ServiceAccountTokenEnv is a removed token import input that fails fast when present.
	ServiceAccountTokenEnv = "OCOP_SERVICE_ACCOUNT_TOKEN"
	// ServiceAccountTokenFileEnv is a removed token import input that fails fast when present.
	ServiceAccountTokenFileEnv = "OCOP_SERVICE_ACCOUNT_TOKEN_FILE"
)

// ErrTokenMissing reports that no service account token source produced a token.
var ErrTokenMissing = errors.New("service account token missing")

// ErrTokenRuntimeEnvPresent reports that a removed token input was present.
var ErrTokenRuntimeEnvPresent = errors.New("OCOP_SERVICE_ACCOUNT_TOKEN and OCOP_SERVICE_ACCOUNT_TOKEN_FILE are not supported; use interactive token prompt")

// ErrTokenNameMissing reports that OCOP_SERVICE_ACCOUNT_TOKEN_NAME is missing.
var ErrTokenNameMissing = errors.New("service account token name missing")

// ErrTokenNameInvalid reports that OCOP_SERVICE_ACCOUNT_TOKEN_NAME is invalid.
var ErrTokenNameInvalid = errors.New("service account token name invalid")

// ErrTokenPromptUnavailable reports that the hidden token prompt cannot run.
var ErrTokenPromptUnavailable = errors.New("interactive token prompt unavailable")

// TokenPrompt reads a service account token from an interactive prompt.
type TokenPrompt func(prompt string) (string, error)

// TokenSource describes where a service account token came from without exposing it.
type TokenSource string

const (
	TokenSourcePrompt  TokenSource = "prompt"
	TokenSourceKeyring TokenSource = "keyring"
)

// TokenResult contains a loaded token and a nonsecret source label.
type TokenResult struct {
	Token  string
	Source TokenSource
}

// TokenTarget describes the fixed system keyring target for a named token.
type TokenTarget struct {
	Service string
	Account string
}

// TokenProof contains allowed nonsecret proof material for a token.
type TokenProof struct {
	Last3  string `json:"last3"`
	SHA256 string `json:"sha256"`
}

// AccountFingerprint returns a nonsecret account fingerprint.
func (t TokenTarget) AccountFingerprint() string {
	sum := sha256.Sum256([]byte(t.Account))
	return hex.EncodeToString(sum[:])
}

// TokenProofFor returns allowed nonsecret proof material for a token.
func TokenProofFor(token string) TokenProof {
	sum := sha256.Sum256([]byte(token))
	last3 := token
	if len(last3) > 3 {
		last3 = last3[len(last3)-3:]
	}
	return TokenProof{Last3: last3, SHA256: hex.EncodeToString(sum[:])}
}

// TargetFromEnv builds the fixed system keyring target from OCOP_SERVICE_ACCOUNT_TOKEN_NAME.
func TargetFromEnv(env map[string]string) (TokenTarget, error) {
	name := strings.TrimSpace(env[ServiceAccountTokenNameEnv])
	if name == "" {
		return TokenTarget{}, ErrTokenNameMissing
	}
	if !validTokenName(name) {
		return TokenTarget{}, ErrTokenNameInvalid
	}
	return TokenTarget{
		Service: keyringService,
		Account: "tokens/" + name,
	}, nil
}

// RejectImportTokenEnv fails when removed env/file token inputs are present.
func RejectImportTokenEnv(env map[string]string) error {
	if _, ok := env[ServiceAccountTokenEnv]; ok {
		return ErrTokenRuntimeEnvPresent
	}
	if _, ok := env[ServiceAccountTokenFileEnv]; ok {
		return ErrTokenRuntimeEnvPresent
	}
	return nil
}

// LoadPromptToken loads a service account token from an interactive hidden prompt.
func LoadPromptToken(readPrompt TokenPrompt) (TokenResult, error) {
	if readPrompt == nil {
		readPrompt = ReadTokenFromTTY
	}
	token, err := readPrompt("1Password service account token: ")
	if err != nil {
		return TokenResult{}, err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return TokenResult{}, ErrTokenMissing
	}
	return TokenResult{Token: token, Source: TokenSourcePrompt}, nil
}

// ReadTokenFromTTY reads a service account token from /dev/tty with echo disabled.
func ReadTokenFromTTY(prompt string) (string, error) {
	tty, err := os.OpenFile("/dev/tty", os.O_RDWR, 0)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTokenPromptUnavailable, err)
	}
	defer func() {
		_ = tty.Close()
	}()
	if _, err := fmt.Fprint(tty, prompt); err != nil {
		return "", fmt.Errorf("%w: %v", ErrTokenPromptUnavailable, err)
	}
	token, err := term.ReadPassword(int(tty.Fd()))
	if _, newlineErr := fmt.Fprintln(tty); newlineErr != nil && err == nil {
		err = newlineErr
	}
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrTokenPromptUnavailable, err)
	}
	return string(token), nil
}

// LoadRuntimeToken loads the service account token from the system keyring only.
func LoadRuntimeToken(ctx context.Context, env map[string]string, keyring Keyring) (TokenResult, TokenTarget, error) {
	if err := RejectImportTokenEnv(env); err != nil {
		return TokenResult{}, TokenTarget{}, ErrTokenRuntimeEnvPresent
	}
	target, err := TargetFromEnv(env)
	if err != nil {
		return TokenResult{}, TokenTarget{}, err
	}
	if keyring == nil {
		keyring = SystemKeyring{}
	}
	token, err := keyring.ReadGenericPassword(ctx, target.Service, target.Account)
	if err != nil {
		return TokenResult{}, TokenTarget{}, ErrTokenMissing
	}
	if strings.TrimSpace(token) == "" {
		return TokenResult{}, TokenTarget{}, ErrTokenMissing
	}
	return TokenResult{Token: token, Source: TokenSourceKeyring}, target, nil
}

func validTokenName(name string) bool {
	if strings.Contains(name, "\x00") || strings.ContainsAny(name, "\r\n") {
		return false
	}
	if strings.Contains(name, "/") || strings.Contains(name, "..") {
		return false
	}
	return true
}
