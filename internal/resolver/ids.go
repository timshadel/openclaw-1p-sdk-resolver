package resolver

import (
	"strings"
)

// RequestedRef maps an input ID to a 1Password secret reference.
type RequestedRef struct {
	ID  string
	Ref string
}

// BuildRequestedRefs sanitizes IDs and maps them to 1Password secret references.
func BuildRequestedRefs(ids []string, defaultVault string) []RequestedRef {
	refs := make([]RequestedRef, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, rawID := range ids {
		id := strings.TrimSpace(rawID)
		if !validID(id) {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ref := id
		if !strings.HasPrefix(id, "op://") {
			if strings.TrimSpace(defaultVault) == "" {
				continue
			}
			ref = "op://" + strings.Trim(defaultVault, "/") + "/" + strings.TrimLeft(id, "/")
		}
		if !validRef(ref) {
			continue
		}
		refs = append(refs, RequestedRef{ID: id, Ref: ref})
	}
	return refs
}

func validID(id string) bool {
	if id == "" || strings.Contains(id, "\x00") || strings.ContainsAny(id, "\r\n") {
		return false
	}
	return !strings.Contains(id, "..")
}

func validRef(ref string) bool {
	if !strings.HasPrefix(ref, "op://") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(ref, "op://"), "/")
	if len(parts) < 3 {
		return false
	}
	for _, part := range parts {
		if strings.TrimSpace(part) == "" {
			return false
		}
	}
	return true
}
