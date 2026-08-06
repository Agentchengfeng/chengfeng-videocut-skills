//go:build !windows

package bootstrap

import (
	"context"
	"os/exec"
	"syscall"
	"time"
)

func runInstallerCommand(parent context.Context, executable string, args []string, directory string, timeout time.Duration) CommandResult {
	cmd := exec.Command(executable, args...)
	cmd.Dir = directory
	return runProcessTree(parent, cmd, timeout)
}

func runProcessTree(parent context.Context, cmd *exec.Cmd, timeout time.Duration) CommandResult {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, stderr := &cappedBuffer{}, &cappedBuffer{}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	if err := cmd.Start(); err != nil {
		return CommandResult{ExitCode: -1, Stderr: err.Error()}
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	var err error
	select {
	case err = <-done:
	case <-ctx.Done():
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		err = <-done
		stderr.Write([]byte("\nprocess group timed out and was killed"))
	}
	return CommandResult{OK: err == nil, ExitCode: exitCode(err), Stdout: string(stdout.data), Stderr: string(stderr.data), Truncated: stdout.truncated || stderr.truncated}
}
