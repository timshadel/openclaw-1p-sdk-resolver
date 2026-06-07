//go:build darwin && cgo

package auth

/*
#cgo LDFLAGS: -framework CoreFoundation -framework Security

#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>

static void openclawCFDictionaryAddValue(CFMutableDictionaryRef dict, CFTypeRef key, CFTypeRef value) {
	CFDictionaryAddValue(dict, key, value);
}
*/
import "C"
import (
	"context"
	"errors"
	"fmt"
	"unsafe"
)

// CheckCurrentApplicationTrusted verifies the current app can read the item without UI.
func (SystemKeyring) CheckCurrentApplicationTrusted(ctx context.Context, service string, account string) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("keyring trust check cancelled: %w", err)
	}
	status := copyGenericPasswordNoUI(service, account)
	switch status {
	case C.errSecSuccess:
		return nil
	case C.errSecItemNotFound:
		return ErrKeyringNotFound
	case C.errSecInteractionNotAllowed:
		return ErrKeyringNotTrusted
	default:
		return errors.New("keyring trust check failed")
	}
}

func copyGenericPasswordNoUI(service string, account string) C.OSStatus {
	query := C.CFDictionaryCreateMutable(
		C.kCFAllocatorDefault,
		0,
		&C.kCFTypeDictionaryKeyCallBacks,
		&C.kCFTypeDictionaryValueCallBacks,
	)
	defer C.CFRelease(C.CFTypeRef(query))

	addCFValue(query, C.CFTypeRef(C.kSecClass), C.CFTypeRef(C.kSecClassGenericPassword))
	addCFValue(query, C.CFTypeRef(C.kSecMatchLimit), C.CFTypeRef(C.kSecMatchLimitOne))
	addCFValue(query, C.CFTypeRef(C.kSecReturnData), C.CFTypeRef(C.kCFBooleanTrue))
	addCFValue(query, C.CFTypeRef(C.kSecUseAuthenticationUI), C.CFTypeRef(C.kSecUseAuthenticationUIFail))

	serviceRef := cfString(service)
	defer C.CFRelease(C.CFTypeRef(serviceRef))
	accountRef := cfString(account)
	defer C.CFRelease(C.CFTypeRef(accountRef))
	addCFValue(query, C.CFTypeRef(C.kSecAttrService), C.CFTypeRef(serviceRef))
	addCFValue(query, C.CFTypeRef(C.kSecAttrAccount), C.CFTypeRef(accountRef))

	var result C.CFTypeRef
	status := C.SecItemCopyMatching(C.CFDictionaryRef(query), &result)
	if status == C.errSecSuccess && result != 0 {
		C.CFRelease(result)
	}
	return status
}

func addCFValue(dict C.CFMutableDictionaryRef, key C.CFTypeRef, value C.CFTypeRef) {
	C.openclawCFDictionaryAddValue(dict, key, value)
}

func cfString(value string) C.CFStringRef {
	cstr := C.CString(value)
	defer C.free(unsafe.Pointer(cstr))
	return C.CFStringCreateWithCString(C.kCFAllocatorDefault, cstr, C.kCFStringEncodingUTF8)
}
