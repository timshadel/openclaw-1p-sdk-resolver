package resolver

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/protocol"
)

type fakeResolver struct {
	values map[string]string
	err    error
}

func (f fakeResolver) ResolveRefs(ctx context.Context, refs []string) (map[string]string, error) {
	if f.err != nil {
		return nil, f.err
	}
	values := make(map[string]string)
	for _, ref := range refs {
		if value, ok := f.values[ref]; ok {
			values[ref] = value
		}
	}
	return values, nil
}

func TestExecuteProtocolResolvesPartialSuccess(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	err := ExecuteProtocol(
		context.Background(),
		bytes.NewBufferString(`{"protocolVersion":1,"ids":["MyAPI/token","Other/password"]}`),
		&stdout,
		Runtime{
			Env:      map[string]string{auth.ServiceAccountTokenEnv: "token", "OP_DEFAULT_VAULT": "Vault"},
			Resolver: fakeResolver{values: map[string]string{"op://Vault/MyAPI/token": "secret"}},
		},
	)
	if err != nil {
		t.Fatalf("ExecuteProtocol: %v", err)
	}
	var response protocol.Response
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if response.Values["MyAPI/token"] != "secret" {
		t.Fatalf("unexpected values: %#v", response.Values)
	}
	if _, ok := response.Values["Other/password"]; ok {
		t.Fatalf("unresolved value should be omitted: %#v", response.Values)
	}
}

func TestExecuteProtocolFailsClosed(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		stdin string
		env   map[string]string
	}{
		{name: "invalid json", stdin: `{`, env: map[string]string{auth.ServiceAccountTokenEnv: "token"}},
		{name: "missing token", stdin: `{"protocolVersion":1,"ids":["x"]}`, env: map[string]string{}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var stdout bytes.Buffer
			err := ExecuteProtocol(context.Background(), bytes.NewBufferString(tt.stdin), &stdout, Runtime{Env: tt.env, Keychain: missingKeychain{}})
			if err != nil {
				t.Fatalf("ExecuteProtocol: %v", err)
			}
			var response protocol.Response
			if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
				t.Fatalf("response JSON: %v", err)
			}
			if len(response.Values) != 0 {
				t.Fatalf("values = %#v, want empty", response.Values)
			}
		})
	}
}

type missingKeychain struct{}

func (missingKeychain) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	return "", auth.ErrKeychainNotFound
}
