//go:build !windows

package bootstrap

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRunProcessTreeKillsUnixDescendants(t *testing.T) {
	dir := t.TempDir()
	childPIDFile := filepath.Join(dir, "child.pid")
	script := filepath.Join(dir, "spawn-tree.sh")
	body := "#!/bin/sh\nsleep 300 &\necho $! > \"$1\"\nwait\n"
	if err := os.WriteFile(script, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	result := runProcessTree(context.Background(), exec.Command(script, childPIDFile), 3*time.Second)
	if result.OK || result.Failure != "timeout" || !strings.Contains(result.Stderr, "termination confirmed") {
		t.Fatalf("timeout was not confirmed: %#v", result)
	}
	data, err := os.ReadFile(childPIDFile)
	if err != nil {
		t.Fatalf("pid file missing: %v; result=%#v", err, result)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); {
		if err := syscall.Kill(pid, 0); err == syscall.ESRCH {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("descendant pid %d survived process-group timeout", pid)
}

func TestRunProcessTreeDetachedPipeIsBoundedAndUnconfirmed(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "detached.pid")
	cmd := exec.Command(os.Args[0], "-test.run=^TestProcessTreeHelper$")
	cmd.Env = append(os.Environ(), "CHENGFENG_PROCESS_HELPER=parent", "CHENGFENG_PROCESS_PID_FILE="+pidFile)
	started := time.Now()
	result := runProcessTree(context.Background(), cmd, 300*time.Millisecond)
	elapsed := time.Since(started)
	data, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatalf("detached pid missing: %v; result=%#v", err, result)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Kill(pid, syscall.SIGKILL)
	if elapsed > 4*time.Second {
		t.Fatalf("detached output pipe held call for %s: %#v", elapsed, result)
	}
	if result.OK || result.Failure != "termination_unconfirmed" || !strings.Contains(result.Stderr, "detached descendant") || strings.Contains(result.Stderr, "was killed") {
		t.Fatalf("detached descendant was not fail-closed: %#v", result)
	}
	if err := syscall.Kill(pid, 0); err != nil {
		t.Fatalf("fixture detached child was unexpectedly terminated, so the unconfirmed path was not exercised: %v", err)
	}
}

func TestProcessTreeHelper(t *testing.T) {
	switch os.Getenv("CHENGFENG_PROCESS_HELPER") {
	case "parent":
		child := exec.Command(os.Args[0], "-test.run=^TestProcessTreeHelper$")
		child.Env = append(os.Environ(), "CHENGFENG_PROCESS_HELPER=detached")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(os.Getenv("CHENGFENG_PROCESS_PID_FILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Minute)
	case "detached":
		time.Sleep(5 * time.Minute)
	default:
		return
	}
}
