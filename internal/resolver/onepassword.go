package resolver

import (
	"context"
	"fmt"
	"log/slog"

	onepassword "github.com/1password/onepassword-sdk-go"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/observability"
)

// SecretResolver resolves 1Password secret references.
type SecretResolver interface {
	ResolveRefs(ctx context.Context, refs []string) (map[string]string, error)
}

// OnePasswordResolver resolves refs with the official 1Password Go SDK.
type OnePasswordResolver struct {
	client *onepassword.Client
	logs   observability.Loggers
}

// NewOnePasswordResolver creates a 1Password SDK-backed resolver.
func NewOnePasswordResolver(ctx context.Context, token string, clientName string, clientVersion string) (*OnePasswordResolver, error) {
	return NewOnePasswordResolverWithLogs(ctx, token, clientName, clientVersion, observability.Nop())
}

// NewOnePasswordResolverWithLogs creates a 1Password SDK-backed resolver with structured logging.
func NewOnePasswordResolverWithLogs(ctx context.Context, token string, clientName string, clientVersion string, logs observability.Loggers) (*OnePasswordResolver, error) {
	client, err := onepassword.NewClient(
		ctx,
		onepassword.WithServiceAccountToken(token),
		onepassword.WithIntegrationInfo(clientName, clientVersion),
	)
	if err != nil {
		return nil, fmt.Errorf("create 1password client: %w", err)
	}
	return &OnePasswordResolver{client: client, logs: logs}, nil
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
		r.logs.Info.DebugContext(ctx, "1password sdk resolving ref",
			slog.String("ref_sha256", observability.Fingerprint("secret-ref", ref)),
		)
		value, err := r.client.Secrets().Resolve(ctx, ref)
		if err != nil {
			r.logs.Error.ErrorContext(ctx, "1password sdk resolve ref failed",
				slog.String("ref_sha256", observability.Fingerprint("secret-ref", ref)),
				slog.String("error", err.Error()),
			)
			continue
		}
		values[ref] = value
		r.logs.Info.DebugContext(ctx, "1password sdk resolved ref",
			slog.String("ref_sha256", observability.Fingerprint("secret-ref", ref)),
			slog.String("value_sha256", observability.Fingerprint(ref, value)),
		)
	}
	return values, nil
}
