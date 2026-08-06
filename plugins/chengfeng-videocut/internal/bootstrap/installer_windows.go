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
	capture, captureErr := attachProcessCapture(cmd)
	if captureErr != nil {
		return CommandResult{ExitCode: -1, Stderr: captureErr.Error(), Failure: "capture_setup_failed"}
	}
	if err := cmd.Start(); err != nil {
		capture.forceCloseAndJoin()
		return CommandResult{ExitCode: -1, Stderr: err.Error(), Failure: "process_start_failed"}
	}
	capture.closeChildEnds()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		streamsClosed := capture.awaitEOF(outputSettleTimeout)
		if !streamsClosed {
			capture.forceCloseAndJoin()
			return finalizeCommandResult(err, capture, "output_stream_unclosed", "process exited but an inherited output stream remained open; result rejected")
		}
		return finalizeCommandResult(err, capture, "", "")
	case <-ctx.Done():
		// taskkill /T terminates the entire descendant tree; /F prevents a child
		// from holding the installer temp directory after the confirmation expires.
		killCtx, killCancel := context.WithTimeout(context.Background(), 2*time.Second)
		kill := exec.CommandContext(killCtx, "taskkill.exe", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
		output, killErr := kill.CombinedOutput()
		killCancel()
		if killErr != nil {
			_ = cmd.Process.Kill()
		}
		settle := time.NewTimer(processSettleTimeout)
		defer settle.Stop()
		select {
		case err := <-done:
			streamsClosed := capture.awaitEOF(outputSettleTimeout)
			if !streamsClosed {
				capture.forceCloseAndJoin()
				return finalizeCommandResult(err, capture, "termination_unconfirmed", "process tree timed out; a detached descendant kept an output stream open, so tree termination is unconfirmed")
			}
			if killErr != nil {
				return finalizeCommandResult(err, capture, "termination_unconfirmed", fmt.Sprintf("process tree timed out; taskkill failed and fallback only targeted the parent, so tree termination is unconfirmed: %v: %s", killErr, output))
			}
			return finalizeCommandResult(err, capture, "timeout", "process tree timed out; taskkill tree termination confirmed")
		case <-settle.C:
			capture.forceCloseAndJoin()
			diagnostic := "process tree timed out; termination did not settle within the bounded window and is unconfirmed"
			if killErr != nil {
				diagnostic += fmt.Sprintf(": %v: %s", killErr, output)
			}
			return finalizeCommandResult(fmt.Errorf("process wait did not settle"), capture, "termination_unconfirmed", diagnostic)
		}
	}
}
