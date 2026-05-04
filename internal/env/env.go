package env

import "os"

// FromOS returns the current process environment as a map.
func FromOS() map[string]string {
	values := make(map[string]string, len(os.Environ()))
	for _, keyValue := range os.Environ() {
		for i := 0; i < len(keyValue); i++ {
			if keyValue[i] == '=' {
				values[keyValue[:i]] = keyValue[i+1:]
				break
			}
		}
	}
	return values
}
