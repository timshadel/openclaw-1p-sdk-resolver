package resolver

import "testing"

func TestBuildRequestedRefs(t *testing.T) {
	t.Parallel()
	got := BuildRequestedRefs([]string{
		"MyAPI/token",
		"op://Vault/Item/field",
		"bad\nid",
		"../bad",
		"MyAPI/token",
	}, "DefaultVault")
	want := []RequestedRef{
		{ID: "MyAPI/token", Ref: "op://DefaultVault/MyAPI/token"},
		{ID: "op://Vault/Item/field", Ref: "op://Vault/Item/field"},
	}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d: %#v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got[%d] = %#v, want %#v", i, got[i], want[i])
		}
	}
}

func TestBuildRequestedRefsRequiresDefaultVaultForShortIDs(t *testing.T) {
	t.Parallel()
	got := BuildRequestedRefs([]string{"MyAPI/token", "op://Vault/Item/field"}, "")
	if len(got) != 1 || got[0].Ref != "op://Vault/Item/field" {
		t.Fatalf("unexpected refs: %#v", got)
	}
}
