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
	secrets onepassword.SecretsAPI
	logs    observability.Loggers
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
	return &OnePasswordResolver{secrets: client.Secrets(), logs: logs}, nil
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
	logs := r.logsOrNop()
	logs.Info.InfoContext(ctx, "1password sdk resolving refs",
		slog.Int("ref_count", len(refs)),
	)
	response, err := r.secrets.ResolveAll(ctx, refs)
	if err != nil {
		logs.Error.ErrorContext(ctx, "1password sdk resolve all failed",
			slog.Int("ref_count", len(refs)),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	for ref, individual := range response.IndividualResponses {
		refFingerprint := observability.Fingerprint("secret-ref", ref)
		if individual.Error != nil {
			logs.Error.ErrorContext(ctx, "1password sdk resolve ref failed",
				slog.String("ref_sha256", refFingerprint),
				slog.String("error_type", string(individual.Error.Type)),
			)
			continue
		}
		if individual.Content == nil {
			logs.Error.WarnContext(ctx, "1password sdk resolve ref missing content",
				slog.String("ref_sha256", refFingerprint),
			)
			continue
		}
		values[ref] = individual.Content.Secret
		logs.Info.DebugContext(ctx, "1password sdk resolved ref",
			slog.String("ref_sha256", refFingerprint),
			slog.String("value_sha256", observability.Fingerprint(ref, individual.Content.Secret)),
		)
	}
	return values, nil
}

func (r *OnePasswordResolver) logsOrNop() observability.Loggers {
	if r.logs.Info != nil && r.logs.Error != nil {
		return r.logs
	}
	return observability.Nop()
}
