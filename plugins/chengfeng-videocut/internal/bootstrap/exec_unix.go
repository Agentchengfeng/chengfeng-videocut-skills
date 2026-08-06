//go:build !windows

package bootstrap

import "os/exec"

func platformCommand(launcher string, args []string) (*exec.Cmd, error) {
	return exec.Command(launcher, args...), nil
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
