package resolver

import (
	"context"
	"io"
	"log/slog"

	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/observability"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/protocol"
)

// Runtime contains injectable resolver-mode dependencies.
type Runtime struct {
	Env         map[string]string
	TokenPrompt auth.TokenPrompt
	Keyring     auth.Keyring
	Resolver    SecretResolver
	NewResolver func(ctx context.Context, token string, clientName string, clientVersion string) (SecretResolver, error)
	CheckSDK    func(ctx context.Context, token string, clientName string, clientVersion string) error
	Logs        observability.Loggers
}

// ExecuteProtocol runs OpenClaw exec-provider resolver mode.
func ExecuteProtocol(ctx context.Context, stdin io.Reader, stdout io.Writer, runtime Runtime) error {
	request, err := protocol.ReadRequest(stdin, protocol.DefaultMaxStdinBytes)
	if err != nil {
		return protocol.WriteResponse(stdout, protocol.EmptyResponse(protocol.DefaultProtocolVersion))
	}
	empty := protocol.EmptyResponse(request.ProtocolVersion)
	config := LoadConfig(runtime.Env)
	logs := runtime.logs()
	logs.Info.InfoContext(ctx, "resolver request received",
		slog.Int("protocol_version", request.ProtocolVersion),
		slog.Int("id_count", len(request.IDs)),
		slog.Duration("timeout", config.Timeout),
	)
	ctx, cancel := context.WithTimeout(ctx, config.Timeout)
	defer cancel()

	responseCh := make(chan protocol.Response, 1)
	go func() {
		responseCh <- resolveRequest(ctx, request, config, runtime)
	}()

	select {
	case response := <-responseCh:
		logs.Info.InfoContext(ctx, "resolver response ready",
			slog.Int("value_count", len(response.Values)),
		)
		return protocol.WriteResponse(stdout, response)
	case <-ctx.Done():
		logs.Error.ErrorContext(ctx, "resolver request timed out",
			slog.Duration("timeout", config.Timeout),
			slog.String("error", ctx.Err().Error()),
		)
		return protocol.WriteResponse(stdout, empty)
	}
}

func resolveRequest(ctx context.Context, request protocol.Request, config Config, runtime Runtime) protocol.Response {
	empty := protocol.EmptyResponse(request.ProtocolVersion)
	logs := runtime.logs()
	requested := BuildRequestedRefs(request.IDs, config.DefaultVault)
	logs.Info.InfoContext(ctx, "resolver refs built",
		slog.Int("requested_id_count", len(request.IDs)),
		slog.Int("valid_ref_count", len(requested)),
		slog.Bool("default_vault_configured", config.DefaultVault != ""),
	)
	if len(requested) == 0 {
		return empty
	}
	refs := make([]string, 0, len(requested))
	refToID := make(map[string]string, len(requested))
	for _, item := range requested {
		refs = append(refs, item.Ref)
		refToID[item.Ref] = item.ID
		logs.Info.InfoContext(ctx, "resolver ref queued",
			slog.String("id_sha256", observability.Fingerprint("request-id", item.ID)),
			slog.String("ref_sha256", observability.Fingerprint(item.ID, item.Ref)),
		)
	}
	token, _, err := auth.LoadRuntimeToken(ctx, runtime.Env, runtime.Keyring)
	if err != nil {
		logs.Error.ErrorContext(ctx, "runtime token load failed",
			slog.String("error", err.Error()),
		)
		return empty
	}
	logs.Info.InfoContext(ctx, "runtime token loaded",
		slog.String("source", string(token.Source)),
	)
	secretResolver := runtime.Resolver
	if secretResolver == nil {
		newResolver := runtime.NewResolver
		if newResolver == nil {
			newResolver = func(ctx context.Context, token string, clientName string, clientVersion string) (SecretResolver, error) {
				return NewOnePasswordResolverWithLogs(ctx, token, clientName, clientVersion, logs)
			}
		}
		logs.Info.InfoContext(ctx, "creating 1password resolver",
			slog.String("client_name", config.ClientName),
			slog.String("client_version", config.ClientVersion),
		)
		secretResolver, err = newResolver(ctx, token.Token, config.ClientName, config.ClientVersion)
		if err != nil {
			logs.Error.ErrorContext(ctx, "create 1password resolver failed",
				slog.String("error", err.Error()),
			)
			return empty
		}
	}
	logs.Info.InfoContext(ctx, "resolving 1password refs",
		slog.Int("ref_count", len(refs)),
	)
	resolved, err := secretResolver.ResolveRefs(ctx, refs)
	if err != nil {
		logs.Error.ErrorContext(ctx, "resolve refs failed",
			slog.Int("ref_count", len(refs)),
			slog.String("error", err.Error()),
		)
		return empty
	}
	logs.Info.InfoContext(ctx, "resolved 1password refs",
		slog.Int("ref_count", len(refs)),
		slog.Int("resolved_count", len(resolved)),
	)
	response := protocol.EmptyResponse(request.ProtocolVersion)
	for ref, value := range resolved {
		if id, ok := refToID[ref]; ok {
			response.Values[id] = value
			logs.Info.InfoContext(ctx, "resolver ref resolved",
				slog.String("id_sha256", observability.Fingerprint("request-id", id)),
				slog.String("ref_sha256", observability.Fingerprint(id, ref)),
				slog.String("value_sha256", observability.Fingerprint(id, value)),
			)
		}
	}
	return response
}

func (r Runtime) logs() observability.Loggers {
	if r.Logs.Info != nil && r.Logs.Error != nil {
		return r.Logs
	}
	return observability.Nop()
}
