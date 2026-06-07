package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"github.com/spf13/cobra"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	envpkg "github.com/timshadel/openclaw-1p-sdk-resolver/internal/env"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/observability"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/resolver"
)

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

// Execute runs the CLI.
func Execute(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) error {
	env := envpkg.FromOS()
	logs, err := observability.Open(env)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "logging disabled: %v\n", err)
		logs = observability.Nop()
	}
	defer func() {
		if err := logs.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "close logs: %v\n", err)
		}
	}()
	runtime := resolver.Runtime{Env: env, Logs: logs}
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
	root.AddCommand(newTokenCommand(ctx, stdout, runtime))
	root.AddCommand(newTrustCommand(ctx, stdout, runtime))
	root.AddCommand(newDoctorCommand(ctx, stdout, runtime))
	return root.Execute()
}

func newVersionCommand(stdout io.Writer) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			_, err := fmt.Fprintf(stdout, "openclaw-1p-sdk-resolver %s (%s, %s)\n", version, commit, date)
			return err
		},
	}
}

func newTokenCommand(ctx context.Context, stdout io.Writer, runtime resolver.Runtime) *cobra.Command {
	var promptAndSave bool
	var force bool
	var asJSON bool
	var removedWrite bool
	cmd := &cobra.Command{
		Use:   "token",
		Short: "Import the 1Password service account token into the system keyring",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			if removedWrite {
				return fmt.Errorf("--write was removed; use --prompt-and-save to save a prompted token")
			}
			return runToken(ctx, stdout, runtime, tokenOptions{PromptAndSave: promptAndSave, Force: force, JSON: asJSON})
		},
	}
	cmd.Flags().BoolVar(&promptAndSave, "prompt-and-save", false, "Prompt for a token and save it to the system keyring")
	cmd.Flags().BoolVar(&removedWrite, "write", false, "Removed; use --prompt-and-save")
	_ = cmd.Flags().MarkHidden("write")
	cmd.Flags().BoolVar(&force, "force", false, "Replace an existing system keyring token")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Write JSON output")
	return cmd
}

func newDoctorCommand(ctx context.Context, stdout io.Writer, runtime resolver.Runtime) *cobra.Command {
	var checkSDK bool
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "doctor",
		Short: "Check system keyring and 1Password SDK readiness",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDoctor(ctx, stdout, runtime, doctorOptions{SDK: checkSDK, JSON: asJSON})
		},
	}
	cmd.Flags().BoolVar(&checkSDK, "sdk", false, "Check coarse 1Password SDK auth")
	cmd.Flags().BoolVar(&asJSON, "json", false, "Write JSON output")
	return cmd
}

func newTrustCommand(ctx context.Context, stdout io.Writer, runtime resolver.Runtime) *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "trust",
		Short: "Manage current-app Keychain trust for the selected token",
		Args:  cobra.NoArgs,
	}
	cmd.PersistentFlags().BoolVar(&asJSON, "json", false, "Write JSON output")
	cmd.AddCommand(&cobra.Command{
		Use:   "update",
		Short: "Trust the current app for the selected keyring token",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTrustUpdate(ctx, stdout, runtime, trustOptions{JSON: asJSON})
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use:   "check",
		Short: "Check current-app Keychain trust without showing trust UI",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runTrustCheck(ctx, stdout, runtime, trustOptions{JSON: asJSON})
		},
	})
	return cmd
}

type tokenOptions struct {
	PromptAndSave bool
	Force         bool
	JSON          bool
}

type tokenPayload struct {
	Status             string           `json:"status"`
	DryRun             bool             `json:"dryRun"`
	WouldWrite         bool             `json:"wouldWrite"`
	Wrote              bool             `json:"wrote"`
	Existed            bool             `json:"existed"`
	Forced             bool             `json:"forced"`
	TokenSource        auth.TokenSource `json:"tokenSource"`
	TokenProof         auth.TokenProof  `json:"tokenProof"`
	AccountFingerprint string           `json:"accountFingerprint"`
}

func runToken(ctx context.Context, stdout io.Writer, runtime resolver.Runtime, options tokenOptions) error {
	logs := logsOrNop(runtime)
	logs.Info.InfoContext(ctx, "token command started",
		slog.Bool("prompt_and_save", options.PromptAndSave),
		slog.Bool("force", options.Force),
		slog.Bool("json", options.JSON),
	)
	if err := auth.RejectImportTokenEnv(runtime.Env); err != nil {
		logs.Error.ErrorContext(ctx, "removed import token env present",
			slog.String("error", err.Error()),
		)
		return err
	}
	target, err := auth.TargetFromEnv(runtime.Env)
	if err != nil {
		logs.Error.ErrorContext(ctx, "token target load failed",
			slog.String("error", err.Error()),
		)
		return err
	}
	token, err := auth.LoadPromptToken(runtime.TokenPrompt)
	if err != nil {
		logs.Error.ErrorContext(ctx, "prompt token load failed",
			slog.String("error", err.Error()),
		)
		return err
	}
	keyring := runtime.Keyring
	if keyring == nil {
		keyring = auth.SystemKeyring{}
	}
	existed, err := keyring.ExistsGenericPassword(ctx, target.Service, target.Account)
	if err != nil {
		logs.Error.ErrorContext(ctx, "keyring token existence check failed",
			slog.String("account_sha256", target.AccountFingerprint()),
			slog.String("error", err.Error()),
		)
		return err
	}
	logs.Info.InfoContext(ctx, "keyring token existence checked",
		slog.String("account_sha256", target.AccountFingerprint()),
		slog.Bool("existed", existed),
	)
	payload := tokenPayload{
		Status:             "dry-run",
		DryRun:             !options.PromptAndSave,
		WouldWrite:         true,
		Wrote:              false,
		Existed:            existed,
		Forced:             options.Force,
		TokenSource:        token.Source,
		TokenProof:         auth.TokenProofFor(token.Token),
		AccountFingerprint: target.AccountFingerprint(),
	}
	if options.PromptAndSave {
		if existed && !options.Force {
			logs.Error.WarnContext(ctx, "keyring token exists and force not set",
				slog.String("account_sha256", target.AccountFingerprint()),
			)
			return auth.ErrKeyringItemExists
		}
		if err := keyring.WriteGenericPassword(ctx, target.Service, target.Account, token.Token, options.Force); err != nil {
			logs.Error.ErrorContext(ctx, "keyring token write failed",
				slog.String("account_sha256", target.AccountFingerprint()),
				slog.String("error", err.Error()),
			)
			return err
		}
		logs.Info.InfoContext(ctx, "keyring token written",
			slog.String("account_sha256", target.AccountFingerprint()),
			slog.Bool("forced", options.Force),
		)
		payload.Status = "written"
		payload.Wrote = true
	}
	return writeTokenPayload(stdout, payload, options.JSON)
}

type doctorOptions struct {
	SDK  bool
	JSON bool
}

type trustOptions struct {
	JSON bool
}

type trustPayload struct {
	Status             string `json:"status"`
	Trusted            bool   `json:"trusted"`
	Updated            bool   `json:"updated"`
	AccountFingerprint string `json:"accountFingerprint"`
}

func runTrustUpdate(ctx context.Context, stdout io.Writer, runtime resolver.Runtime, options trustOptions) error {
	logs := logsOrNop(runtime)
	target, err := auth.TargetFromEnv(runtime.Env)
	if err != nil {
		logs.Error.ErrorContext(ctx, "trust target load failed",
			slog.String("error", err.Error()),
		)
		return err
	}
	keyringTrust, err := trustKeyring(runtime)
	if err != nil {
		return err
	}
	if err := keyringTrust.TrustCurrentApplication(ctx, target.Service, target.Account); err != nil {
		logs.Error.ErrorContext(ctx, "keyring trust update failed",
			slog.String("account_sha256", target.AccountFingerprint()),
			slog.String("error", err.Error()),
		)
		return err
	}
	logs.Info.InfoContext(ctx, "keyring trust updated",
		slog.String("account_sha256", target.AccountFingerprint()),
	)
	return writeTrustPayload(stdout, trustPayload{
		Status:             "updated",
		Trusted:            true,
		Updated:            true,
		AccountFingerprint: target.AccountFingerprint(),
	}, options.JSON)
}

func runTrustCheck(ctx context.Context, stdout io.Writer, runtime resolver.Runtime, options trustOptions) error {
	logs := logsOrNop(runtime)
	target, err := auth.TargetFromEnv(runtime.Env)
	if err != nil {
		logs.Error.ErrorContext(ctx, "trust target load failed",
			slog.String("error", err.Error()),
		)
		return err
	}
	keyringTrust, err := trustKeyring(runtime)
	if err != nil {
		return err
	}
	if err := keyringTrust.CheckCurrentApplicationTrusted(ctx, target.Service, target.Account); err != nil {
		logs.Error.ErrorContext(ctx, "keyring trust check failed",
			slog.String("account_sha256", target.AccountFingerprint()),
			slog.String("error", err.Error()),
		)
		return err
	}
	logs.Info.InfoContext(ctx, "keyring trust check succeeded",
		slog.String("account_sha256", target.AccountFingerprint()),
	)
	return writeTrustPayload(stdout, trustPayload{
		Status:             "trusted",
		Trusted:            true,
		Updated:            false,
		AccountFingerprint: target.AccountFingerprint(),
	}, options.JSON)
}

func trustKeyring(runtime resolver.Runtime) (auth.KeyringTrust, error) {
	if runtime.Keyring == nil {
		return auth.SystemKeyring{}, nil
	}
	keyringTrust, ok := runtime.Keyring.(auth.KeyringTrust)
	if !ok {
		return nil, fmt.Errorf("keyring trust operations unavailable")
	}
	return keyringTrust, nil
}

type doctorPayload struct {
	Status             string           `json:"status"`
	Keyring            string           `json:"keyring"`
	SDK                string           `json:"sdk"`
	TokenSource        auth.TokenSource `json:"tokenSource"`
	TokenProof         auth.TokenProof  `json:"tokenProof"`
	AccountFingerprint string           `json:"accountFingerprint"`
}

func runDoctor(ctx context.Context, stdout io.Writer, runtime resolver.Runtime, options doctorOptions) error {
	logs := logsOrNop(runtime)
	logs.Info.InfoContext(ctx, "doctor command started",
		slog.Bool("sdk", options.SDK),
		slog.Bool("json", options.JSON),
	)
	config := resolver.LoadConfig(runtime.Env)
	token, target, err := auth.LoadRuntimeToken(ctx, runtime.Env, runtime.Keyring)
	if err != nil {
		logs.Error.ErrorContext(ctx, "doctor runtime token load failed",
			slog.String("error", err.Error()),
		)
		return err
	}
	logs.Info.InfoContext(ctx, "doctor runtime token loaded",
		slog.String("source", string(token.Source)),
		slog.String("account_sha256", target.AccountFingerprint()),
	)
	payload := doctorPayload{
		Status:             "ok",
		Keyring:            "ok",
		SDK:                "skipped",
		TokenSource:        token.Source,
		TokenProof:         auth.TokenProofFor(token.Token),
		AccountFingerprint: target.AccountFingerprint(),
	}
	if options.SDK {
		checkSDK := runtime.CheckSDK
		if checkSDK == nil {
			checkSDK = resolver.CheckOnePasswordSDK
		}
		logs.Info.InfoContext(ctx, "doctor sdk check started",
			slog.String("client_name", config.ClientName),
			slog.String("client_version", config.ClientVersion),
		)
		if err := checkSDK(ctx, token.Token, config.ClientName, config.ClientVersion); err != nil {
			payload.Status = "failed"
			payload.SDK = "failed"
			logs.Error.ErrorContext(ctx, "doctor sdk check failed",
				slog.String("error", err.Error()),
			)
			if writeErr := writeDoctorPayload(stdout, payload, options.JSON); writeErr != nil {
				return writeErr
			}
			return fmt.Errorf("sdk check failed")
		}
		logs.Info.InfoContext(ctx, "doctor sdk check succeeded")
		payload.SDK = "ok"
	}
	return writeDoctorPayload(stdout, payload, options.JSON)
}

func logsOrNop(runtime resolver.Runtime) observability.Loggers {
	if runtime.Logs.Info != nil && runtime.Logs.Error != nil {
		return runtime.Logs
	}
	return observability.Nop()
}

func writeTokenPayload(stdout io.Writer, payload tokenPayload, asJSON bool) error {
	if asJSON {
		return json.NewEncoder(stdout).Encode(payload)
	}
	if _, err := fmt.Fprintf(stdout, "status: %s\n", payload.Status); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "dryRun: %t\n", payload.DryRun); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "existed: %t\n", payload.Existed); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "accountSHA256: %s\n", payload.AccountFingerprint); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "tokenLast3: %s\n", payload.TokenProof.Last3); err != nil {
		return err
	}
	_, err := fmt.Fprintf(stdout, "tokenSHA256: %s\n", payload.TokenProof.SHA256)
	return err
}

func writeDoctorPayload(stdout io.Writer, payload doctorPayload, asJSON bool) error {
	if asJSON {
		return json.NewEncoder(stdout).Encode(payload)
	}
	if _, err := fmt.Fprintf(stdout, "status: %s\n", payload.Status); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "keyring: %s\n", payload.Keyring); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "sdk: %s\n", payload.SDK); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "accountSHA256: %s\n", payload.AccountFingerprint); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "tokenLast3: %s\n", payload.TokenProof.Last3); err != nil {
		return err
	}
	_, err := fmt.Fprintf(stdout, "tokenSHA256: %s\n", payload.TokenProof.SHA256)
	return err
}

func writeTrustPayload(stdout io.Writer, payload trustPayload, asJSON bool) error {
	if asJSON {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(payload)
	}
	if _, err := fmt.Fprintf(stdout, "status: %s\n", payload.Status); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "trusted: %t\n", payload.Trusted); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "updated: %t\n", payload.Updated); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "account_sha256: %s\n", payload.AccountFingerprint); err != nil {
		return err
	}
	return nil
}
