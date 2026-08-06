//go:build windows

package bootstrap

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
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
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
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
		// taskkill /T terminates the entire descendant tree; /F prevents a child
		// from holding the installer temp directory after the confirmation expires.
		killCtx, killCancel := context.WithTimeout(context.Background(), 2*time.Second)
		kill := exec.CommandContext(killCtx, "taskkill.exe", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
		output, killErr := kill.CombinedOutput()
		killCancel()
		if killErr != nil {
			stderr.Write([]byte(fmt.Sprintf("\ntaskkill failed: %v: %s", killErr, output)))
			_ = cmd.Process.Kill()
		}
		err = <-done
		stderr.Write([]byte("\nprocess tree timed out and was killed"))
	}
	return CommandResult{OK: err == nil, ExitCode: exitCode(err), Stdout: string(stdout.data), Stderr: string(stderr.data), Truncated: stdout.truncated || stderr.truncated}
}
