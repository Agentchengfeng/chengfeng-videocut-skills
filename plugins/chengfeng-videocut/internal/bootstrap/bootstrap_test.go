package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestProductionInstallPlanFailsClosedWithoutPinnedDigest(t *testing.T) {
	t.Setenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES", "")
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", t.TempDir())
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildInstallPlan(c)
	if err != nil {
		t.Fatal(err)
	}
	if plan.InstallerSHA256 != "" || plan.ApprovalDigest != "" {
		t.Fatalf("unlocked plan became approvable: %#v", plan)
	}
	if _, err := installRuntime(context.Background(), c, strings.Repeat("a", 64)); err == nil || !strings.Contains(err.Error(), "not locked") {
		t.Fatalf("expected locked-asset error, got %v", err)
	}
}

func TestApprovalDigestBindsInstallerPlatformTargetAndImpact(t *testing.T) {
	t.Setenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES", "1")
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_INSTALLER_SHA256", strings.Repeat("a", 64))
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_MANIFEST_SHA256", strings.Repeat("b", 64))
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", filepath.Join(t.TempDir(), "home one"))
	c, _ := LoadContract()
	first, err := BuildInstallPlan(c)
	if err != nil {
		t.Fatal(err)
	}
	if !validSHA256(first.ApprovalDigest) {
		t.Fatalf("invalid approval digest %q", first.ApprovalDigest)
	}
	first.Impact += " changed"
	changed, _ := approvalDigest(first)
	if changed == first.ApprovalDigest {
		t.Fatal("impact was not bound")
	}
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", filepath.Join(t.TempDir(), "home two"))
	second, _ := BuildInstallPlan(c)
	if second.ApprovalDigest == first.ApprovalDigest {
		t.Fatal("target was not bound")
	}
}

func TestWindowsCommandLineQuotesSpecialArguments(t *testing.T) {
	line, err := BuildWindowsCommandLine(`C:\Program Files\Video Cut\run.cmd`, []string{"space value", "a&b", `say "hi"`, "%PATH%", "bang!"})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"C:\Program Files\Video Cut\run.cmd"`, `"space value"`, `"a&b"`, `"say ""hi"""`, `"%%PATH%%"`, `"bang!"`} {
		if !strings.Contains(line, want) {
			t.Fatalf("%q missing from %q", want, line)
		}
	}
	if _, err := BuildWindowsCommandLine("run.cmd", []string{"bad\narg"}); err == nil {
		t.Fatal("newline should be rejected")
	}
}

func TestCommandOutputKeepsBoundedTail(t *testing.T) {
	w := &cappedBuffer{}
	input := strings.Repeat("x", maxCommandOutput+100) + "TAIL"
	if _, err := w.Write([]byte(input)); err != nil {
		t.Fatal(err)
	}
	if len(w.data) != maxCommandOutput || !strings.HasSuffix(string(w.data), "TAIL") || !w.truncated {
		t.Fatalf("tail contract failed: len=%d truncated=%v", len(w.data), w.truncated)
	}
}

func TestSemverAndCapabilities(t *testing.T) {
	c, _ := LoadContract()
	if !semverAtLeast("0.5.1", "0.5.0") || semverAtLeast("0.4.9", "0.5.0") || semverAtLeast("junk", "0.5.0") {
		t.Fatal("semver comparison failed")
	}
	doctor := map[string]any{"data": map[string]any{"capabilities": c.Capabilities}}
	data, _ := doctor["data"].(map[string]any)
	caps := data["capabilities"].(map[string]any)
	// Re-marshal through JSON-shaped values is unnecessary here; the embedded
	// contract already decoded arrays as []any.
	if !supportsCapabilities(doctor, caps) {
		t.Fatal("matching capabilities were rejected")
	}
	broken := map[string]any{}
	for k, v := range caps {
		broken[k] = v
	}
	broken["runtimeApiVersion"] = float64(99)
	if supportsCapabilities(map[string]any{"data": map[string]any{"capabilities": broken}}, caps) {
		t.Fatal("incompatible capability was accepted")
	}
	requiredJobs := map[string]any{}
	for key, value := range caps {
		requiredJobs[key] = value
	}
	requiredJobs["durableJobsApiVersion"] = float64(1)
	requiredJobs["durableJobKinds"] = []any{"export"}
	actualJobs := map[string]any{}
	for key, value := range caps {
		actualJobs[key] = value
	}
	actualJobs["durableJobsApiVersion"] = float64(1)
	actualJobs["durableJobKinds"] = []any{"export", "transcribe"}
	if !capabilitySubset(actualJobs, requiredJobs) {
		t.Fatal("durable job capability subset was rejected")
	}
	actualJobs["durableJobsApiVersion"] = float64(2)
	if capabilitySubset(actualJobs, requiredJobs) {
		t.Fatal("durable job API version must match exactly")
	}
}

func TestRuntimeStatusAndCLIUseManagedLauncher(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	root := t.TempDir()
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, _ := LoadContract()
	launcher, _ := launcherPath(c)
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	caps, _ := jsonMarshal(c.Capabilities)
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.0'; exit 0; fi\nif [ \"$1\" = \"doctor\" ]; then echo '{\"ok\":true,\"data\":{\"healthy\":true,\"capabilities\":" + string(caps) + "}}'; exit 0; fi\nprintf '%s\\n' \"$@\"\n"
	if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	status := inspectRuntime(context.Background(), c)
	if !status.Ready {
		t.Fatalf("fixture runtime not ready: %#v", status)
	}
	result := runRuntimeCommand(context.Background(), launcher, []string{"echo", "space value", "a&b", `say "hi"`})
	if !result.OK || !strings.Contains(result.Stdout, "a&b") || !strings.Contains(result.Stdout, `say "hi"`) {
		t.Fatalf("argv was not preserved: %#v", result)
	}
}

func TestManagedLauncherRejectsSymlink(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("symlink fixture targets macOS")
	}
	root := t.TempDir()
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, _ := LoadContract()
	launcher, _ := launcherPath(c)
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(target, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, launcher); err != nil {
		t.Fatal(err)
	}
	if _, err := validateManagedLauncher(c); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected symlink rejection, got %v", err)
	}
}

func TestRunProcessTreeKillsUnixDescendants(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix process-group test")
	}
	dir := t.TempDir()
	childPIDFile := filepath.Join(dir, "child.pid")
	script := filepath.Join(dir, "spawn-tree.sh")
	body := "#!/bin/sh\nsleep 300 &\necho $! > \"$1\"\nwait\n"
	if err := os.WriteFile(script, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	result := runProcessTree(context.Background(), exec.Command(script, childPIDFile), time.Second)
	if result.OK || !strings.Contains(result.Stderr, "process group timed out") {
		t.Fatalf("timeout was not reported: %#v", result)
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

func jsonMarshal(value any) ([]byte, error) {
	// Kept local to avoid tests constructing a capability schema by hand.
	return json.Marshal(value)
}

func TestFileSHA256(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fixture")
	if err := os.WriteFile(path, []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte("fixture"))
	got, err := fileSHA256(path)
	if err != nil || got != hex.EncodeToString(want[:]) {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestRuntimeInstallVerifiesFixtureAndCallsCompiledInstaller(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	fixture := t.TempDir()
	root := filepath.Join(t.TempDir(), "managed root")
	c, _ := LoadContract()
	assets := c.Platforms[platformKey()]
	capabilities, _ := json.Marshal(c.Capabilities)
	installer := filepath.Join(fixture, "installer")
	script := fmt.Sprintf(`#!/bin/sh
set -eu
target=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--target-root" ]; then target="$2"; shift 2; continue; fi
  shift
done
test -n "$target"
mkdir -p "$target/bin"
cat > "$target/bin/chengfeng-videocut" <<'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then echo 'chengfeng-videocut 0.5.0'; exit 0; fi
if [ "$1" = "doctor" ]; then echo '{"ok":true,"data":{"healthy":true,"capabilities":%s}}'; exit 0; fi
exit 2
EOF
chmod 0755 "$target/bin/chengfeng-videocut"
printf 'installed\n'
`, string(capabilities))
	if err := os.WriteFile(installer, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := filepath.Join(fixture, "manifest.json")
	if err := os.WriteFile(manifest, []byte(`{"schemaVersion":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	installerDigest, _ := fileSHA256(installer)
	manifestDigest, _ := fileSHA256(manifest)
	checksum := filepath.Join(fixture, "SHA256SUMS.txt")
	lines := []string{installerDigest + "  " + assets.InstallerAsset, manifestDigest + "  " + c.InstallManifestAsset}
	for _, name := range append(append([]string{}, assets.RuntimeAssets...), assets.ManagedToolAssets...) {
		lines = append(lines, strings.Repeat("c", 64)+"  "+name)
	}
	if err := os.WriteFile(checksum, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES", "1")
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_INSTALLER_FILE", installer)
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_CHECKSUM_FILE", checksum)
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_MANIFEST_FILE", manifest)
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_INSTALLER_SHA256", installerDigest)
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_MANIFEST_SHA256", manifestDigest)
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	plan, err := BuildInstallPlan(c)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := installRuntime(context.Background(), c, strings.Repeat("0", 64)); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("wrong approval was accepted: %v", err)
	}
	result, err := installRuntime(context.Background(), c, plan.ApprovalDigest)
	if err != nil {
		t.Fatal(err)
	}
	status := result["runtime"].(RuntimeStatus)
	if !status.Ready {
		t.Fatalf("installed fixture not ready: %#v", status)
	}
}
