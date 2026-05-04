package cli

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	envpkg "github.com/timshadel/openclaw-1p-sdk-resolver/internal/env"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/resolver"
)

const version = "0.1.0"

// Execute runs the CLI.
func Execute(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	env := envpkg.FromOS()
	runtime := resolver.Runtime{Env: env}
	return ExecuteWithRuntime(ctx, args, stdin, stdout, stderr, runtime)
}

// ExecuteWithRuntime runs the CLI with injected dependencies.
func ExecuteWithRuntime(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer, runtime resolver.Runtime) error {
	root := &cobra.Command{
		Use:   "openclaw-1p-sdk-resolver",
		Short: "OpenClaw exec secrets provider backed by 1Password",
		Long:  "OpenClaw exec secrets provider backed by the official 1Password Go SDK.",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return resolver.ExecuteProtocol(ctx, stdin, stdout, runtime)
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.SetArgs(args)
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.AddCommand(newVersionCommand(stdout))
	root.AddCommand(newResolveCommand(ctx, stdin, stdout, runtime))
	return root.Execute()
}

func newVersionCommand(stdout io.Writer) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprintf(stdout, "openclaw-1p-sdk-resolver %s\n", version)
			return err
		},
	}
}

func newResolveCommand(ctx context.Context, stdin io.Reader, stdout io.Writer, runtime resolver.Runtime) *cobra.Command {
	var ids []string
	var fromStdin bool
	var asJSON bool
	var debug bool
	var reveal bool
	var yes bool
	cmd := &cobra.Command{
		Use:   "resolve --id <id>",
		Short: "Resolve one or more 1Password secret references",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runResolve(ctx, stdin, stdout, runtime, resolveOptions{
				IDs:       ids,
				FromStdin: fromStdin,
				JSON:      asJSON,
				Debug:     debug,
				Reveal:    reveal,
				Yes:       yes,
			})
		},
	}
	cmd.Flags().StringArrayVar(&ids, "id", nil, "ID or op:// secret reference to resolve")
	cmd.Flags().BoolVar(&fromStdin, "stdin", false, "Read IDs from stdin, one per line")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Write JSON output")
	cmd.Flags().BoolVar(&debug, "debug", false, "Include safe unresolved reason codes")
	cmd.Flags().BoolVar(&reveal, "reveal", false, "Print resolved secret values")
	cmd.Flags().BoolVar(&yes, "yes", false, "Confirm reveal mode non-interactively")
	return cmd
}

type resolveOptions struct {
	IDs       []string
	FromStdin bool
	JSON      bool
	Debug     bool
	Reveal    bool
	Yes       bool
}

type resolveRow struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Output string `json:"output"`
	Reason string `json:"reason,omitempty"`
}

func runResolve(ctx context.Context, stdin io.Reader, stdout io.Writer, runtime resolver.Runtime, options resolveOptions) error {
	if options.Reveal && !options.Yes {
		return fmt.Errorf("reveal requires --yes")
	}
	config := resolver.LoadConfig(runtime.Env)
	token, err := auth.LoadServiceAccountToken(ctx, runtime.Env, runtime.TokenFile, runtime.Keychain)
	if err != nil {
		return err
	}
	allIDs := append([]string{}, options.IDs...)
	if options.FromStdin {
		body, err := io.ReadAll(stdin)
		if err != nil {
			return fmt.Errorf("read stdin ids: %w", err)
		}
		for _, line := range strings.Split(string(body), "\n") {
			if trimmed := strings.TrimSpace(line); trimmed != "" {
				allIDs = append(allIDs, trimmed)
			}
		}
	}
	requested := resolver.BuildRequestedRefs(allIDs, config.DefaultVault)
	if len(requested) == 0 {
		return fmt.Errorf("no valid ids to resolve")
	}
	refs := make([]string, 0, len(requested))
	refToID := make(map[string]string, len(requested))
	for _, item := range requested {
		refs = append(refs, item.Ref)
		refToID[item.Ref] = item.ID
	}
	secretResolver := runtime.Resolver
	if secretResolver == nil {
		newResolver := runtime.NewResolver
		if newResolver == nil {
			newResolver = func(ctx context.Context, token string, clientName string, clientVersion string) (resolver.SecretResolver, error) {
				return resolver.NewOnePasswordResolver(ctx, token, clientName, clientVersion)
			}
		}
		secretResolver, err = newResolver(ctx, token.Token, config.ClientName, config.ClientVersion)
		if err != nil {
			return err
		}
	}
	resolved, err := secretResolver.ResolveRefs(ctx, refs)
	if err != nil {
		return err
	}
	rows := make([]resolveRow, 0, len(requested))
	for _, ref := range refs {
		id := refToID[ref]
		value, ok := resolved[ref]
		if !ok {
			row := resolveRow{ID: id, Status: "unresolved", Output: "missing"}
			if options.Debug {
				row.Reason = "sdk-unresolved"
			}
			rows = append(rows, row)
			continue
		}
		output := redact(value)
		if options.Reveal {
			output = value
		}
		row := resolveRow{ID: id, Status: "resolved", Output: output}
		if options.Debug {
			row.Reason = "resolved"
		}
		rows = append(rows, row)
	}
	if options.JSON {
		payload := map[string]any{"debug": options.Debug, "reveal": options.Reveal, "results": rows}
		return json.NewEncoder(stdout).Encode(payload)
	}
	for _, row := range rows {
		if options.Debug {
			if _, err := fmt.Fprintf(stdout, "%s\t%s\t%s\t%s\n", row.ID, row.Status, row.Output, row.Reason); err != nil {
				return err
			}
			continue
		}
		if _, err := fmt.Fprintf(stdout, "%s\t%s\t%s\n", row.ID, row.Status, row.Output); err != nil {
			return err
		}
	}
	return nil
}

func redact(value string) string {
	sum := sha256.Sum256([]byte(value))
	return fmt.Sprintf("len=%d sha256=%s", len(value), hex.EncodeToString(sum[:])[:12])
}
