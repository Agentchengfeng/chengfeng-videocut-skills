//go:build !windows

package bootstrap

import (
	"fmt"
	"strings"
)

// BuildWindowsCommandLine is also built on Unix so its escaping contract is
// covered before shipping the cross-compiled Windows binary.
func BuildWindowsCommandLine(launcher string, args []string) (string, error) {
	all := append([]string{launcher}, args...)
	quoted := make([]string, len(all))
	for i, value := range all {
		if strings.ContainsAny(value, "\x00\r\n") {
			return "", fmt.Errorf("command argument %d contains unsupported data", i)
		}
		value = strings.ReplaceAll(value, "%", "%%")
		value = strings.ReplaceAll(value, "\"", "\"\"")
		quoted[i] = "\"" + value + "\""
	}
	return "\"" + strings.Join(quoted, " ") + "\"", nil
}
