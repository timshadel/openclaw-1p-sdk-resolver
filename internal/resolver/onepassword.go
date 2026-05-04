package resolver

import (
	"context"
	"fmt"

	onepassword "github.com/1password/onepassword-sdk-go"
)

// SecretResolver resolves 1Password secret references.
type SecretResolver interface {
	ResolveRefs(ctx context.Context, refs []string) (map[string]string, error)
}

// OnePasswordResolver resolves refs with the official 1Password Go SDK.
type OnePasswordResolver struct {
	client *onepassword.Client
}

// NewOnePasswordResolver creates a 1Password SDK-backed resolver.
func NewOnePasswordResolver(ctx context.Context, token string, clientName string, clientVersion string) (*OnePasswordResolver, error) {
	client, err := onepassword.NewClient(
		ctx,
		onepassword.WithServiceAccountToken(token),
		onepassword.WithIntegrationInfo(clientName, clientVersion),
	)
	if err != nil {
		return nil, fmt.Errorf("create 1password client: %w", err)
	}
	return &OnePasswordResolver{client: client}, nil
}

// CheckOnePasswordSDK verifies coarse SDK auth and connectivity without returning vault metadata.
func CheckOnePasswordSDK(ctx context.Context, token string, clientName string, clientVersion string) error {
	client, err := onepassword.NewClient(
		ctx,
		onepassword.WithServiceAccountToken(token),
		onepassword.WithIntegrationInfo(clientName, clientVersion),
	)
	if err != nil {
		return fmt.Errorf("create 1password client: %w", err)
	}
	if _, err := client.Vaults().List(ctx); err != nil {
		return fmt.Errorf("list vaults: %w", err)
	}
	return nil
}

// ResolveRefs resolves refs and returns partial successes.
func (r *OnePasswordResolver) ResolveRefs(ctx context.Context, refs []string) (map[string]string, error) {
	values := make(map[string]string, len(refs))
	for _, ref := range refs {
		value, err := r.client.Secrets().Resolve(ctx, ref)
		if err != nil {
			continue
		}
		values[ref] = value
	}
	return values, nil
}
