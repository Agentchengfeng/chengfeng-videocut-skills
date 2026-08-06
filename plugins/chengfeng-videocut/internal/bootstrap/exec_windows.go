//go:build windows

package bootstrap

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func platformCommand(launcher string, args []string) (*exec.Cmd, error) {
	comspec := os.Getenv("ComSpec")
	if comspec == "" {
		comspec = "cmd.exe"
	}
	line, err := BuildWindowsCommandLine(launcher, args)
	if err != nil {
		return nil, err
	}
	return exec.Command(comspec, "/d", "/v:off", "/s", "/c", line), nil
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	if exit, ok := err.(*exec.ExitError); ok {
		return exit.ExitCode()
	}
	return -1
}

// BuildWindowsCommandLine produces the single /c payload required to execute a
// stable .cmd launcher. Every token is quoted; percent expansion is disabled by
// doubling percent signs and delayed ! expansion is disabled by /v:off.
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
