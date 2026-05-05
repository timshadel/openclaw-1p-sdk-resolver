package resolver

import (
	"context"
	"errors"
	"reflect"
	"testing"

	onepassword "github.com/1password/onepassword-sdk-go"
)

type fakeSecretsAPI struct {
	resolveAllCalls int
	resolveAllRefs  []string
	resolveAllResp  onepassword.ResolveAllResponse
	resolveAllErr   error
}

func (f *fakeSecretsAPI) Resolve(ctx context.Context, secretReference string) (string, error) {
	return "", errors.New("unexpected Resolve call")
}

func (f *fakeSecretsAPI) ResolveAll(ctx context.Context, secretReferences []string) (onepassword.ResolveAllResponse, error) {
	f.resolveAllCalls++
	f.resolveAllRefs = append([]string(nil), secretReferences...)
	return f.resolveAllResp, f.resolveAllErr
}

func TestOnePasswordResolverResolveRefsUsesResolveAll(t *testing.T) {
	t.Parallel()
	refs := []string{"op://Vault/Item/one", "op://Vault/Item/two"}
	secrets := &fakeSecretsAPI{
		resolveAllResp: onepassword.ResolveAllResponse{IndividualResponses: map[string]onepassword.Response[onepassword.ResolvedReference, onepassword.ResolveReferenceError]{
			refs[0]: {Content: &onepassword.ResolvedReference{Secret: "first"}},
			refs[1]: {Content: &onepassword.ResolvedReference{Secret: "second"}},
		}},
	}
	resolver := &OnePasswordResolver{secrets: secrets}
	got, err := resolver.ResolveRefs(context.Background(), refs)
	if err != nil {
		t.Fatalf("ResolveRefs: %v", err)
	}
	if secrets.resolveAllCalls != 1 {
		t.Fatalf("ResolveAll calls = %d, want 1", secrets.resolveAllCalls)
	}
	if !reflect.DeepEqual(secrets.resolveAllRefs, refs) {
		t.Fatalf("ResolveAll refs = %#v, want %#v", secrets.resolveAllRefs, refs)
	}
	want := map[string]string{refs[0]: "first", refs[1]: "second"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("values = %#v, want %#v", got, want)
	}
}

func TestOnePasswordResolverResolveRefsReturnsPartialSuccess(t *testing.T) {
	t.Parallel()
	successRef := "op://Vault/Item/one"
	failedRef := "op://Vault/Item/missing"
	secrets := &fakeSecretsAPI{
		resolveAllResp: onepassword.ResolveAllResponse{IndividualResponses: map[string]onepassword.Response[onepassword.ResolvedReference, onepassword.ResolveReferenceError]{
			successRef: {Content: &onepassword.ResolvedReference{Secret: "first"}},
			failedRef:  {Error: refError(onepassword.ResolveReferenceErrorTypeVariantItemNotFound)},
		}},
	}
	resolver := &OnePasswordResolver{secrets: secrets}
	got, err := resolver.ResolveRefs(context.Background(), []string{successRef, failedRef})
	if err != nil {
		t.Fatalf("ResolveRefs: %v", err)
	}
	want := map[string]string{successRef: "first"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("values = %#v, want %#v", got, want)
	}
}

func TestOnePasswordResolverResolveRefsReturnsTopLevelError(t *testing.T) {
	t.Parallel()
	wantErr := errors.New("sdk unavailable")
	secrets := &fakeSecretsAPI{resolveAllErr: wantErr}
	resolver := &OnePasswordResolver{secrets: secrets}
	got, err := resolver.ResolveRefs(context.Background(), []string{"op://Vault/Item/one"})
	if !errors.Is(err, wantErr) {
		t.Fatalf("error = %v, want %v", err, wantErr)
	}
	if got != nil {
		t.Fatalf("values = %#v, want nil", got)
	}
}

func TestOnePasswordResolverResolveRefsOmitsEmptyIndividualResponse(t *testing.T) {
	t.Parallel()
	ref := "op://Vault/Item/empty"
	secrets := &fakeSecretsAPI{
		resolveAllResp: onepassword.ResolveAllResponse{IndividualResponses: map[string]onepassword.Response[onepassword.ResolvedReference, onepassword.ResolveReferenceError]{
			ref: {},
		}},
	}
	resolver := &OnePasswordResolver{secrets: secrets}
	got, err := resolver.ResolveRefs(context.Background(), []string{ref})
	if err != nil {
		t.Fatalf("ResolveRefs: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("values = %#v, want empty", got)
	}
}

func refError(errorType onepassword.ResolveReferenceErrorTypes) *onepassword.ResolveReferenceError {
	return &onepassword.ResolveReferenceError{Type: errorType}
}
