package resolver

import (
	"context"
	"io"

	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/protocol"
)

// Runtime contains injectable resolver-mode dependencies.
type Runtime struct {
	Env         map[string]string
	TokenFile   auth.FileReader
	Keychain    auth.KeychainReader
	Resolver    SecretResolver
	NewResolver func(ctx context.Context, token string, clientName string, clientVersion string) (SecretResolver, error)
}

// ExecuteProtocol runs OpenClaw exec-provider resolver mode.
func ExecuteProtocol(ctx context.Context, stdin io.Reader, stdout io.Writer, runtime Runtime) error {
	request, err := protocol.ReadRequest(stdin, protocol.DefaultMaxStdinBytes)
	if err != nil {
		return protocol.WriteResponse(stdout, protocol.EmptyResponse(protocol.DefaultProtocolVersion))
	}
	empty := protocol.EmptyResponse(request.ProtocolVersion)
	config := LoadConfig(runtime.Env)
	token, err := auth.LoadServiceAccountToken(ctx, runtime.Env, runtime.TokenFile, runtime.Keychain)
	if err != nil {
		return protocol.WriteResponse(stdout, empty)
	}
	requested := BuildRequestedRefs(request.IDs, config.DefaultVault)
	if len(requested) == 0 {
		return protocol.WriteResponse(stdout, empty)
	}
	refs := make([]string, 0, len(requested))
	refToID := make(map[string]string, len(requested))
	for _, item := range requested {
		refs = append(refs, item.Ref)
		refToID[item.Ref] = item.ID
	}
	ctx, cancel := context.WithTimeout(ctx, config.Timeout)
	defer cancel()
	secretResolver := runtime.Resolver
	if secretResolver == nil {
		newResolver := runtime.NewResolver
		if newResolver == nil {
			newResolver = func(ctx context.Context, token string, clientName string, clientVersion string) (SecretResolver, error) {
				return NewOnePasswordResolver(ctx, token, clientName, clientVersion)
			}
		}
		secretResolver, err = newResolver(ctx, token.Token, config.ClientName, config.ClientVersion)
		if err != nil {
			return protocol.WriteResponse(stdout, empty)
		}
	}
	resolved, err := secretResolver.ResolveRefs(ctx, refs)
	if err != nil {
		return protocol.WriteResponse(stdout, empty)
	}
	response := protocol.EmptyResponse(request.ProtocolVersion)
	for ref, value := range resolved {
		if id, ok := refToID[ref]; ok {
			response.Values[id] = value
		}
	}
	return protocol.WriteResponse(stdout, response)
}
