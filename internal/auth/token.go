package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
)

const (
	// ServiceAccountTokenNameEnv selects the system keyring account suffix.
	ServiceAccountTokenNameEnv = "OCOP_SERVICE_ACCOUNT_TOKEN_NAME"
	// ServiceAccountTokenEnv is the write-only token import input.
	ServiceAccountTokenEnv = "OCOP_SERVICE_ACCOUNT_TOKEN"
	// ServiceAccountTokenFileEnv is the write-only file-backed token import input.
	ServiceAccountTokenFileEnv = "OCOP_SERVICE_ACCOUNT_TOKEN_FILE"
)

// ErrTokenMissing reports that no service account token source produced a token.
var ErrTokenMissing = errors.New("service account token missing")

// ErrTokenAmbiguous reports that both env and file token inputs were set.
var ErrTokenAmbiguous = errors.New("both OCOP_SERVICE_ACCOUNT_TOKEN and OCOP_SERVICE_ACCOUNT_TOKEN_FILE are set")

// ErrTokenRuntimeEnvPresent reports that a write-only token input was present outside import mode.
var ErrTokenRuntimeEnvPresent = errors.New("write-only token env is not allowed for this command")

// ErrTokenNameMissing reports that OCOP_SERVICE_ACCOUNT_TOKEN_NAME is missing.
var ErrTokenNameMissing = errors.New("service account token name missing")

// ErrTokenNameInvalid reports that OCOP_SERVICE_ACCOUNT_TOKEN_NAME is invalid.
var ErrTokenNameInvalid = errors.New("service account token name invalid")

// FileReader reads token files. It exists to keep tests off disk when useful.
type FileReader func(path string) ([]byte, error)

// TokenSource describes where a service account token came from without exposing it.
type TokenSource string

const (
	TokenSourceEnv     TokenSource = "env"
	TokenSourceFile    TokenSource = "file"
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

// LoadImportToken loads a write-only token from env or file for keyring import.
func LoadImportToken(env map[string]string, readFile FileReader) (TokenResult, error) {
	envToken, hasEnvToken := env[ServiceAccountTokenEnv]
	filePath, hasFileToken := env[ServiceAccountTokenFileEnv]
	envToken = strings.TrimSpace(envToken)
	filePath = strings.TrimSpace(filePath)
	if hasEnvToken && hasFileToken {
		return TokenResult{}, ErrTokenAmbiguous
	}
	if hasEnvToken {
		if envToken == "" {
			return TokenResult{}, ErrTokenMissing
		}
		return TokenResult{Token: envToken, Source: TokenSourceEnv}, nil
	}
	if hasFileToken {
		if filePath == "" {
			return TokenResult{}, ErrTokenMissing
		}
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
	return TokenResult{}, ErrTokenMissing
}

// LoadRuntimeToken loads the service account token from the system keyring only.
func LoadRuntimeToken(ctx context.Context, env map[string]string, keyring Keyring) (TokenResult, TokenTarget, error) {
	if _, ok := env[ServiceAccountTokenEnv]; ok {
		return TokenResult{}, TokenTarget{}, ErrTokenRuntimeEnvPresent
	}
	if _, ok := env[ServiceAccountTokenFileEnv]; ok {
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
