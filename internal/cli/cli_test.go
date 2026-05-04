package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/resolver"
)

type cliFakeResolver struct {
	values map[string]string
}

func (f cliFakeResolver) ResolveRefs(ctx context.Context, refs []string) (map[string]string, error) {
	got := make(map[string]string)
	for _, ref := range refs {
		if value, ok := f.values[ref]; ok {
			got[ref] = value
		}
	}
	return got, nil
}

func TestResolveRedactsByDefault(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	err := ExecuteWithRuntime(
		context.Background(),
		[]string{"resolve", "--id", "MyAPI/token", "--json"},
		strings.NewReader(""),
		&stdout,
		&bytes.Buffer{},
		resolver.Runtime{
			Env:      map[string]string{auth.ServiceAccountTokenEnv: "token", "OP_DEFAULT_VAULT": "Vault"},
			Resolver: cliFakeResolver{values: map[string]string{"op://Vault/MyAPI/token": "secret-value"}},
		},
	)
	if err != nil {
		t.Fatalf("ExecuteWithRuntime: %v", err)
	}
	if strings.Contains(stdout.String(), "secret-value") {
		t.Fatalf("secret leaked in output: %s", stdout.String())
	}
	var payload struct {
		Results []struct {
			Status string `json:"status"`
			Output string `json:"output"`
		} `json:"results"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("json: %v", err)
	}
	if payload.Results[0].Status != "resolved" || !strings.HasPrefix(payload.Results[0].Output, "len=12 sha256=") {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestResolveRevealRequiresYes(t *testing.T) {
	t.Parallel()
	err := ExecuteWithRuntime(
		context.Background(),
		[]string{"resolve", "--id", "MyAPI/token", "--reveal"},
		strings.NewReader(""),
		&bytes.Buffer{},
		&bytes.Buffer{},
		resolver.Runtime{
			Env:      map[string]string{auth.ServiceAccountTokenEnv: "token", "OP_DEFAULT_VAULT": "Vault"},
			Resolver: cliFakeResolver{values: map[string]string{"op://Vault/MyAPI/token": "secret-value"}},
		},
	)
	if err == nil {
		t.Fatal("expected reveal confirmation error")
	}
}
