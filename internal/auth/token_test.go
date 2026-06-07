package auth

import (
	"context"
	"errors"
	"testing"
)

type fakeKeyring struct {
	token   string
	service string
	account string
	exists  bool
	err     error
}

func (f *fakeKeyring) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	f.service = service
	f.account = account
	if f.err != nil {
		return "", f.err
	}
	return f.token, nil
}

func (f *fakeKeyring) ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error) {
	f.service = service
	f.account = account
	return f.exists, f.err
}

func (f *fakeKeyring) WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error {
	f.service = service
	f.account = account
	f.token = password
	return f.err
}

func TestTargetFromEnv(t *testing.T) {
	t.Parallel()
	target, err := TargetFromEnv(map[string]string{ServiceAccountTokenNameEnv: "main"})
	if err != nil {
		t.Fatalf("TargetFromEnv: %v", err)
	}
	if target.Service != "openclaw-1p-sdk-resolver" || target.Account != "tokens/main" {
		t.Fatalf("target = %#v", target)
	}
	for _, name := range []string{"", "bad/name", "bad\nname", "../bad"} {
		_, err := TargetFromEnv(map[string]string{ServiceAccountTokenNameEnv: name})
		if err == nil {
			t.Fatalf("expected invalid name error for %q", name)
		}
	}
}

func TestTargetFromEnvIgnoresOldOPName(t *testing.T) {
	t.Parallel()
	_, err := TargetFromEnv(map[string]string{"OP_SERVICE_ACCOUNT_TOKEN_NAME": "main"})
	if !errors.Is(err, ErrTokenNameMissing) {
		t.Fatalf("error = %v, want ErrTokenNameMissing", err)
	}
}

func TestRejectImportTokenEnv(t *testing.T) {
	t.Parallel()
	for _, env := range []map[string]string{
		{ServiceAccountTokenEnv: "token"},
		{ServiceAccountTokenFileEnv: "/token"},
		{ServiceAccountTokenEnv: "token", ServiceAccountTokenFileEnv: "/token"},
	} {
		env := env
		t.Run("rejects removed env", func(t *testing.T) {
			t.Parallel()
			if err := RejectImportTokenEnv(env); !errors.Is(err, ErrTokenRuntimeEnvPresent) {
				t.Fatalf("error = %v, want ErrTokenRuntimeEnvPresent", err)
			}
		})
	}
	if err := RejectImportTokenEnv(map[string]string{}); err != nil {
		t.Fatalf("empty env error = %v", err)
	}
}

func TestLoadPromptToken(t *testing.T) {
	t.Parallel()
	got, err := LoadPromptToken(func(prompt string) (string, error) {
		if prompt == "" {
			t.Fatal("prompt should not be empty")
		}
		return " prompt-token\n", nil
	})
	if err != nil {
		t.Fatalf("LoadPromptToken: %v", err)
	}
	if got != (TokenResult{Token: "prompt-token", Source: TokenSourcePrompt}) {
		t.Fatalf("got %#v", got)
	}
	_, err = LoadPromptToken(func(prompt string) (string, error) {
		return "   ", nil
	})
	if !errors.Is(err, ErrTokenMissing) {
		t.Fatalf("empty prompt error = %v, want ErrTokenMissing", err)
	}
}

func TestLoadRuntimeTokenUsesKeyringOnly(t *testing.T) {
	t.Parallel()
	keyring := &fakeKeyring{token: "key-token"}
	got, target, err := LoadRuntimeToken(context.Background(), map[string]string{ServiceAccountTokenNameEnv: "main"}, keyring)
	if err != nil {
		t.Fatalf("LoadRuntimeToken: %v", err)
	}
	if got != (TokenResult{Token: "key-token", Source: TokenSourceKeyring}) {
		t.Fatalf("got %#v", got)
	}
	if target.Account != "tokens/main" || keyring.account != "tokens/main" {
		t.Fatalf("target/keyring = %#v/%s", target, keyring.account)
	}
	for _, env := range []map[string]string{
		{ServiceAccountTokenNameEnv: "main", ServiceAccountTokenEnv: ""},
		{ServiceAccountTokenNameEnv: "main", ServiceAccountTokenFileEnv: ""},
	} {
		_, _, err := LoadRuntimeToken(context.Background(), env, keyring)
		if !errors.Is(err, ErrTokenRuntimeEnvPresent) {
			t.Fatalf("error = %v, want ErrTokenRuntimeEnvPresent", err)
		}
	}
}
