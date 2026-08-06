//go:build windows

package bootstrap

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
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
		"if \"%~1\"==\"--version\" (echo chengfeng-videocut 0.5.0& exit /b 0)\r\n" +
		"if \"%~1\"==\"doctor\" (echo {\"ok\":true,\"data\":{\"healthy\":true,\"capabilities\":" + string(caps) + "}}& exit /b 0)\r\n" +
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
