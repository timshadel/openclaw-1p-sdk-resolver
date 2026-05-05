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

func TestLoadImportToken(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		env     map[string]string
		file    string
		want    TokenResult
		wantErr error
	}{
		{
			name: "env token works",
			env:  map[string]string{ServiceAccountTokenEnv: " token "},
			want: TokenResult{Token: "token", Source: TokenSourceEnv},
		},
		{
			name:    "both env and file fails",
			env:     map[string]string{ServiceAccountTokenEnv: "token", ServiceAccountTokenFileEnv: "/token"},
			wantErr: ErrTokenAmbiguous,
		},
		{
			name: "file token works",
			env:  map[string]string{ServiceAccountTokenFileEnv: "/token"},
			file: " file-token\n",
			want: TokenResult{Token: "file-token", Source: TokenSourceFile},
		},
		{
			name:    "missing token fails",
			env:     map[string]string{},
			wantErr: ErrTokenMissing,
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			readFile := func(path string) ([]byte, error) {
				if tt.file == "" {
					return nil, errors.New("unexpected file read")
				}
				return []byte(tt.file), nil
			}
			got, err := LoadImportToken(tt.env, readFile)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if got != tt.want {
				t.Fatalf("got %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestLoadImportTokenIgnoresOldOPInputs(t *testing.T) {
	t.Parallel()
	_, err := LoadImportToken(map[string]string{
		"OP_SERVICE_ACCOUNT_TOKEN":      "token",
		"OP_SERVICE_ACCOUNT_TOKEN_FILE": "/token",
	}, nil)
	if !errors.Is(err, ErrTokenMissing) {
		t.Fatalf("error = %v, want ErrTokenMissing", err)
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
