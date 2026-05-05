package resolver

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

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
		bytes.NewBufferString(`{"protocolVersion":1,"provider":"openclaw-1p-sdk-resolver","ids":["MyAPI/token","Other/password"]}`),
		&stdout,
		Runtime{
			Env:      map[string]string{auth.ServiceAccountTokenNameEnv: "main", DefaultVaultEnv: "Vault"},
			Keyring:  fakeKeyring{token: "token"},
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
		{name: "invalid json", stdin: `{`, env: map[string]string{auth.ServiceAccountTokenNameEnv: "main"}},
		{name: "unknown field", stdin: `{"protocolVersion":1,"provider":"openclaw-1p-sdk-resolver","ids":["x"],"extra":true}`, env: map[string]string{auth.ServiceAccountTokenNameEnv: "main"}},
		{name: "missing token", stdin: `{"protocolVersion":1,"ids":["x"]}`, env: map[string]string{auth.ServiceAccountTokenNameEnv: "main"}},
		{name: "env token present", stdin: `{"protocolVersion":1,"ids":["x"]}`, env: map[string]string{auth.ServiceAccountTokenNameEnv: "main", auth.ServiceAccountTokenEnv: "token"}},
		{name: "file token present", stdin: `{"protocolVersion":1,"ids":["x"]}`, env: map[string]string{auth.ServiceAccountTokenNameEnv: "main", auth.ServiceAccountTokenFileEnv: "/token"}},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var stdout bytes.Buffer
			err := ExecuteProtocol(context.Background(), bytes.NewBufferString(tt.stdin), &stdout, Runtime{Env: tt.env, Keyring: fakeKeyring{}})
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

func TestExecuteProtocolTimesOutBlockedTokenLoad(t *testing.T) {
	t.Parallel()
	stdout := executeProtocolWithBlockingRuntime(t, Runtime{
		Env: map[string]string{
			auth.ServiceAccountTokenNameEnv: "main",
			TimeoutEnv:                      "5",
		},
		Keyring: blockingKeyring{},
	})
	assertEmptyResponse(t, stdout)
}

func TestExecuteProtocolTimesOutBlockedResolverCreation(t *testing.T) {
	t.Parallel()
	stdout := executeProtocolWithBlockingRuntime(t, Runtime{
		Env: map[string]string{
			auth.ServiceAccountTokenNameEnv: "main",
			TimeoutEnv:                      "5",
		},
		Keyring: fakeKeyring{token: "token"},
		NewResolver: func(ctx context.Context, token string, clientName string, clientVersion string) (SecretResolver, error) {
			select {}
		},
	})
	assertEmptyResponse(t, stdout)
}

func TestExecuteProtocolTimesOutBlockedResolverCall(t *testing.T) {
	t.Parallel()
	stdout := executeProtocolWithBlockingRuntime(t, Runtime{
		Env: map[string]string{
			auth.ServiceAccountTokenNameEnv: "main",
			TimeoutEnv:                      "5",
		},
		Keyring:  fakeKeyring{token: "token"},
		Resolver: blockingResolver{},
	})
	assertEmptyResponse(t, stdout)
}

func executeProtocolWithBlockingRuntime(t *testing.T, runtime Runtime) []byte {
	t.Helper()
	var stdout bytes.Buffer
	start := time.Now()
	err := ExecuteProtocol(
		context.Background(),
		bytes.NewBufferString(`{"protocolVersion":1,"ids":["MyAPI/token"]}`),
		&stdout,
		runtime,
	)
	if err != nil {
		t.Fatalf("ExecuteProtocol: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("ExecuteProtocol took %s, want bounded timeout", elapsed)
	}
	return stdout.Bytes()
}

func assertEmptyResponse(t *testing.T, stdout []byte) {
	t.Helper()
	var response protocol.Response
	if err := json.Unmarshal(stdout, &response); err != nil {
		t.Fatalf("response JSON: %v", err)
	}
	if len(response.Values) != 0 {
		t.Fatalf("values = %#v, want empty", response.Values)
	}
}

type fakeKeyring struct {
	token string
}

func (f fakeKeyring) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	if f.token == "" {
		return "", auth.ErrKeyringNotFound
	}
	return f.token, nil
}

func (f fakeKeyring) ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error) {
	return f.token != "", nil
}

func (f fakeKeyring) WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error {
	return nil
}

type blockingKeyring struct{}

func (blockingKeyring) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	select {}
}

func (blockingKeyring) ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error) {
	return false, nil
}

func (blockingKeyring) WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error {
	return nil
}

type blockingResolver struct{}

func (blockingResolver) ResolveRefs(ctx context.Context, refs []string) (map[string]string, error) {
	select {}
}
