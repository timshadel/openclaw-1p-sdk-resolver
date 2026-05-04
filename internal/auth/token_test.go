package auth

import (
	"context"
	"errors"
	"testing"
)

type fakeKeychain struct {
	token   string
	service string
	account string
	err     error
}

func (f *fakeKeychain) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	f.service = service
	f.account = account
	if f.err != nil {
		return "", f.err
	}
	return f.token, nil
}

func TestLoadServiceAccountToken(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		env     map[string]string
		file    string
		key     *fakeKeychain
		want    TokenResult
		wantErr error
	}{
		{
			name: "env token wins",
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
			name: "keychain fallback works",
			env: map[string]string{
				KeychainServiceEnv: "svc",
				KeychainAccountEnv: "acct",
			},
			key:  &fakeKeychain{token: "key-token"},
			want: TokenResult{Token: "key-token", Source: TokenSourceKeychain},
		},
		{
			name:    "missing token fails",
			env:     map[string]string{},
			key:     &fakeKeychain{err: ErrKeychainNotFound},
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
			var keychain KeychainReader = &fakeKeychain{err: ErrKeychainNotFound}
			if tt.key != nil {
				keychain = tt.key
			}
			got, err := LoadServiceAccountToken(context.Background(), tt.env, readFile, keychain)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if got != tt.want {
				t.Fatalf("got %#v, want %#v", got, tt.want)
			}
			if tt.name == "keychain fallback works" {
				if tt.key.service != "svc" || tt.key.account != "acct" {
					t.Fatalf("keychain lookup = %s/%s", tt.key.service, tt.key.account)
				}
			}
		})
	}
}
