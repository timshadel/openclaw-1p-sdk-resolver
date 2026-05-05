package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/spf13/cobra"
	"github.com/timshadel/openclaw-1p-sdk-resolver/internal/auth"
	envpkg "github.com/timshadel/openclaw-1p-sdk-resolver/internal/env"
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
	root.AddCommand(newTokenCommand(ctx, stdout, runtime))
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
	var write bool
	var force bool
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "token",
		Short: "Import the 1Password service account token into the system keyring",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runToken(ctx, stdout, runtime, tokenOptions{Write: write, Force: force, JSON: asJSON})
		},
	}
	cmd.Flags().BoolVar(&write, "write", false, "Write token to the system keyring")
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

type tokenOptions struct {
	Write bool
	Force bool
	JSON  bool
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
	target, err := auth.TargetFromEnv(runtime.Env)
	if err != nil {
		return err
	}
	token, err := auth.LoadImportToken(runtime.Env, runtime.TokenFile)
	if err != nil {
		return err
	}
	keyring := runtime.Keyring
	if keyring == nil {
		keyring = auth.SystemKeyring{}
	}
	existed, err := keyring.ExistsGenericPassword(ctx, target.Service, target.Account)
	if err != nil {
		return err
	}
	payload := tokenPayload{
		Status:             "dry-run",
		DryRun:             !options.Write,
		WouldWrite:         true,
		Wrote:              false,
		Existed:            existed,
		Forced:             options.Force,
		TokenSource:        token.Source,
		TokenProof:         auth.TokenProofFor(token.Token),
		AccountFingerprint: target.AccountFingerprint(),
	}
	if options.Write {
		if existed && !options.Force {
			return auth.ErrKeyringItemExists
		}
		if err := keyring.WriteGenericPassword(ctx, target.Service, target.Account, token.Token, options.Force); err != nil {
			return err
		}
		payload.Status = "written"
		payload.Wrote = true
	}
	return writeTokenPayload(stdout, payload, options.JSON)
}

type doctorOptions struct {
	SDK  bool
	JSON bool
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
	config := resolver.LoadConfig(runtime.Env)
	token, target, err := auth.LoadRuntimeToken(ctx, runtime.Env, runtime.Keyring)
	if err != nil {
		return err
	}
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
		if err := checkSDK(ctx, token.Token, config.ClientName, config.ClientVersion); err != nil {
			payload.Status = "failed"
			payload.SDK = "failed"
			if writeErr := writeDoctorPayload(stdout, payload, options.JSON); writeErr != nil {
				return writeErr
			}
			return fmt.Errorf("sdk check failed")
		}
		payload.SDK = "ok"
	}
	return writeDoctorPayload(stdout, payload, options.JSON)
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
