package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/resolver"
)

type cliFakeKeyring struct {
	token    string
	exists   bool
	writes   int
	forced   bool
	password string
	err      error
}

func (f *cliFakeKeyring) ReadGenericPassword(ctx context.Context, service string, account string) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	if f.token == "" {
		return "", auth.ErrKeyringNotFound
	}
	return f.token, nil
}

func (f *cliFakeKeyring) ExistsGenericPassword(ctx context.Context, service string, account string) (bool, error) {
	return f.exists, f.err
}

func (f *cliFakeKeyring) WriteGenericPassword(ctx context.Context, service string, account string, password string, force bool) error {
	f.writes++
	f.forced = force
	f.password = password
	return f.err
}

func TestTokenDryRunDoesNotWrite(t *testing.T) {
	t.Parallel()
	keyring := &cliFakeKeyring{}
	var stdout bytes.Buffer
	err := ExecuteWithRuntime(
		context.Background(),
		[]string{"token", "--json"},
		strings.NewReader(""),
		&stdout,
		&bytes.Buffer{},
		resolver.Runtime{
			Env: map[string]string{
				auth.ServiceAccountTokenNameEnv: "main",
				auth.ServiceAccountTokenEnv:     "secret-token",
			},
			Keyring: keyring,
		},
	)
	if err != nil {
		t.Fatalf("ExecuteWithRuntime: %v", err)
	}
	if keyring.writes != 0 {
		t.Fatalf("writes = %d, want 0", keyring.writes)
	}
	assertNoLeak(t, stdout.String(), "secret-token", "main", "tokens/main")
	var payload tokenPayload
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json: %v", err)
	}
	if !payload.DryRun || payload.Wrote || payload.TokenProof.Last3 != "ken" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestTokenWriteAndForceBehavior(t *testing.T) {
	t.Parallel()
	t.Run("writes new token", func(t *testing.T) {
		t.Parallel()
		keyring := &cliFakeKeyring{}
		err := ExecuteWithRuntime(
			context.Background(),
			[]string{"token", "--write"},
			strings.NewReader(""),
			&bytes.Buffer{},
			&bytes.Buffer{},
			resolver.Runtime{
				Env: map[string]string{
					auth.ServiceAccountTokenNameEnv: "main",
					auth.ServiceAccountTokenEnv:     "secret-token",
				},
				Keyring: keyring,
			},
		)
		if err != nil {
			t.Fatalf("ExecuteWithRuntime: %v", err)
		}
		if keyring.writes != 1 || keyring.password != "secret-token" || keyring.forced {
			t.Fatalf("keyring = %#v", keyring)
		}
	})

	t.Run("existing requires force", func(t *testing.T) {
		t.Parallel()
		keyring := &cliFakeKeyring{exists: true}
		err := ExecuteWithRuntime(
			context.Background(),
			[]string{"token", "--write"},
			strings.NewReader(""),
			&bytes.Buffer{},
			&bytes.Buffer{},
			resolver.Runtime{
				Env: map[string]string{
					auth.ServiceAccountTokenNameEnv: "main",
					auth.ServiceAccountTokenEnv:     "secret-token",
				},
				Keyring: keyring,
			},
		)
		if !errors.Is(err, auth.ErrKeyringItemExists) {
			t.Fatalf("error = %v, want ErrKeyringItemExists", err)
		}
		if keyring.writes != 0 {
			t.Fatalf("writes = %d, want 0", keyring.writes)
		}
	})

	t.Run("force updates existing", func(t *testing.T) {
		t.Parallel()
		keyring := &cliFakeKeyring{exists: true}
		err := ExecuteWithRuntime(
			context.Background(),
			[]string{"token", "--write", "--force"},
			strings.NewReader(""),
			&bytes.Buffer{},
			&bytes.Buffer{},
			resolver.Runtime{
				Env: map[string]string{
					auth.ServiceAccountTokenNameEnv: "main",
					auth.ServiceAccountTokenEnv:     "secret-token",
				},
				Keyring: keyring,
			},
		)
		if err != nil {
			t.Fatalf("ExecuteWithRuntime: %v", err)
		}
		if keyring.writes != 1 || !keyring.forced {
			t.Fatalf("keyring = %#v", keyring)
		}
	})
}

func TestTokenInputErrors(t *testing.T) {
	t.Parallel()
	tests := []map[string]string{
		{auth.ServiceAccountTokenEnv: "secret-token"},
		{auth.ServiceAccountTokenNameEnv: "main"},
		{auth.ServiceAccountTokenNameEnv: "main", auth.ServiceAccountTokenEnv: "secret", auth.ServiceAccountTokenFileEnv: "/tmp/token"},
	}
	for _, env := range tests {
		env := env
		t.Run("error", func(t *testing.T) {
			t.Parallel()
			err := ExecuteWithRuntime(context.Background(), []string{"token"}, strings.NewReader(""), &bytes.Buffer{}, &bytes.Buffer{}, resolver.Runtime{Env: env, Keyring: &cliFakeKeyring{}})
			if err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestDoctorChecksKeyringAndSDK(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var sdkToken string
	err := ExecuteWithRuntime(
		context.Background(),
		[]string{"doctor", "--sdk", "--json"},
		strings.NewReader(""),
		&stdout,
		&bytes.Buffer{},
		resolver.Runtime{
			Env: map[string]string{auth.ServiceAccountTokenNameEnv: "main"},
			Keyring: &cliFakeKeyring{
				token: "secret-token",
			},
			CheckSDK: func(ctx context.Context, token string, clientName string, clientVersion string) error {
				sdkToken = token
				return nil
			},
		},
	)
	if err != nil {
		t.Fatalf("ExecuteWithRuntime: %v", err)
	}
	if sdkToken != "secret-token" {
		t.Fatalf("sdk token = %q", sdkToken)
	}
	assertNoLeak(t, stdout.String(), "secret-token", "main", "tokens/main")
	var payload doctorPayload
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json: %v", err)
	}
	if payload.SDK != "ok" || payload.TokenProof.Last3 != "ken" {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestDoctorRejectsTokenEnv(t *testing.T) {
	t.Parallel()
	err := ExecuteWithRuntime(
		context.Background(),
		[]string{"doctor"},
		strings.NewReader(""),
		&bytes.Buffer{},
		&bytes.Buffer{},
		resolver.Runtime{
			Env: map[string]string{
				auth.ServiceAccountTokenNameEnv: "main",
				auth.ServiceAccountTokenEnv:     "secret-token",
			},
			Keyring: &cliFakeKeyring{token: "secret-token"},
		},
	)
	if !errors.Is(err, auth.ErrTokenRuntimeEnvPresent) {
		t.Fatalf("error = %v, want ErrTokenRuntimeEnvPresent", err)
	}
}

func TestResolveCommandRemoved(t *testing.T) {
	t.Parallel()
	err := ExecuteWithRuntime(context.Background(), []string{"resolve"}, strings.NewReader(""), &bytes.Buffer{}, &bytes.Buffer{}, resolver.Runtime{Env: map[string]string{}})
	if err == nil {
		t.Fatal("expected unknown command error")
	}
}

func assertNoLeak(t *testing.T, output string, forbidden ...string) {
	t.Helper()
	for _, value := range forbidden {
		if strings.Contains(output, value) {
			t.Fatalf("output leaked %q: %s", value, output)
		}
	}
}
