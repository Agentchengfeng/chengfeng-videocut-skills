//go:build windows

package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

func TestWindowsManagedCmdPreservesSpecialArguments(t *testing.T) {
	root := filepath.Join(t.TempDir(), "managed root & space")
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	launcher, err := launcherPath(c)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	caps, _ := json.Marshal(c.Capabilities)
	script := "@echo off\r\n" +
		"if \"%~1\"==\"--version\" (echo chengfeng-videocut 0.5.2& exit /b 0)\r\n" +
		"if \"%~1\"==\"doctor\" (echo {\"ok\":true,\"data\":{\"healthy\":true,\"developmentMode\":false,\"releaseReady\":true,\"readinessMode\":\"release-ready\",\"capabilities\":" + string(caps) + "}}& exit /b 0)\r\n" +
		":loop\r\nif \"%~1\"==\"\" exit /b 0\r\necho(%~1\r\nshift\r\ngoto loop\r\n"
	if err := os.WriteFile(launcher, []byte(script), 0o644); err != nil {
		t.Fatal(err)
	}
	status := inspectRuntime(context.Background(), c)
	if !status.Ready {
		t.Fatalf("Windows fixture runtime not ready: %#v", status)
	}
	result := runRuntimeCommand(context.Background(), launcher, []string{"echo", "space value", "a&b", `say "hi"`, "%PATH%"})
	if !result.OK {
		t.Fatalf("cmd failed: %#v", result)
	}
	for _, want := range []string{"space value", "a&b", `say "hi"`, "%PATH%"} {
		if !strings.Contains(result.Stdout, want) {
			t.Fatalf("%q missing from %q", want, result.Stdout)
		}
	}
}

func TestWindowsRunProcessTreeKillsDescendants(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child pid.txt")
	escaped := strings.ReplaceAll(pidFile, "'", "''")
	command := fmt.Sprintf(`$child=Start-Process -FilePath ping.exe -ArgumentList '-t','127.0.0.1' -PassThru -WindowStyle Hidden; Set-Content -LiteralPath '%s' -Value $child.Id; Wait-Process -Id $child.Id`, escaped)
	result := runProcessTree(context.Background(), exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command), 1500*time.Millisecond)
	if result.OK || !strings.Contains(result.Stderr, "process tree timed out") {
		t.Fatalf("timeout was not reported: %#v", result)
	}
	data, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); {
		output, _ := exec.Command("tasklist.exe", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH").CombinedOutput()
		if !strings.Contains(string(output), strconv.Itoa(pid)) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("descendant pid %d survived taskkill /T /F", pid)
}

func TestWindowsRelocationConvergesUnderConcurrency(t *testing.T) {
	directory := t.TempDir()
	source := filepath.Join(directory, "source.exe")
	content := []byte("content-addressed-native-mcp-fixture")
	if err := os.WriteFile(source, content, 0o600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	digest := fmt.Sprintf("%x", sum[:])
	destination := filepath.Join(directory, "cache", "mcp.exe")
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		t.Fatal(err)
	}
	var wait sync.WaitGroup
	errors := make(chan error, 16)
	for i := 0; i < 16; i++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			errors <- ensureRelocatedExecutable(source, destination, digest)
		}()
	}
	wait.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	if actual, err := fileSHA256(destination); err != nil || actual != digest {
		t.Fatalf("relocation digest=%q err=%v", actual, err)
	}
	staging, err := filepath.Glob(filepath.Join(filepath.Dir(destination), ".relocate-stage-*"))
	if err != nil || len(staging) != 0 {
		t.Fatalf("staging directories leaked: %v err=%v", staging, err)
	}
}

func TestWindowsRunProcessTreeKillFailureWithDetachedPipeIsBounded(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "detached pid.txt")
	t.Setenv("PATH", "") // Force taskkill lookup to fail; fallback only kills the parent.
	cmd := exec.Command(os.Args[0], "-test.run=^TestWindowsProcessTreeHelper$")
	cmd.Env = append(os.Environ(), "CHENGFENG_WINDOWS_PROCESS_HELPER=parent", "CHENGFENG_WINDOWS_PROCESS_PID_FILE="+pidFile)
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
	process, _ := os.FindProcess(pid)
	defer process.Kill()
	if elapsed > 4*time.Second {
		t.Fatalf("detached output pipe held call for %s: %#v", elapsed, result)
	}
	if result.OK || result.Failure != "termination_unconfirmed" || !strings.Contains(result.Stderr, "detached descendant") || strings.Contains(result.Stderr, "was killed") {
		t.Fatalf("taskkill failure was not bounded and fail-closed: %#v", result)
	}
}

func TestWindowsProcessTreeHelper(t *testing.T) {
	switch os.Getenv("CHENGFENG_WINDOWS_PROCESS_HELPER") {
	case "parent":
		child := exec.Command(os.Args[0], "-test.run=^TestWindowsProcessTreeHelper$")
		child.Env = append(os.Environ(), "CHENGFENG_WINDOWS_PROCESS_HELPER=detached")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		child.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | 0x00000008, HideWindow: true} // DETACHED_PROCESS
		if err := child.Start(); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(os.Getenv("CHENGFENG_WINDOWS_PROCESS_PID_FILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Minute)
	case "detached":
		time.Sleep(5 * time.Minute)
	default:
		return
	}
}
