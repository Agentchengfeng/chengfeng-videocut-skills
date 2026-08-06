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
	"strings"
	"testing"
	"time"
)

func TestProductionInstallPlanFailsClosedWithoutPinnedDigest(t *testing.T) {
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", t.TempDir())
	// Legacy environment variables must never unlock the production binary.
	t.Setenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES", "1")
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_INSTALLER_SHA256", strings.Repeat("a", 64))
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_MANIFEST_SHA256", strings.Repeat("b", 64))
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
	testOptions := &installTestOptions{InstallerSHA256: strings.Repeat("a", 64), InstallManifestSHA256: strings.Repeat("b", 64)}
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", filepath.Join(t.TempDir(), "home one"))
	c, _ := LoadContract()
	first, err := buildInstallPlan(c, testOptions)
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
	second, _ := buildInstallPlan(c, testOptions)
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

func TestCommandOutputOverflowFailsClosed(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix output fixture")
	}
	result := runProcessTree(context.Background(), exec.Command("/bin/sh", "-c", "yes x | head -c 40000"), 5*time.Second)
	if result.OK || !result.Truncated || result.Failure != "output_limit_exceeded" {
		t.Fatalf("overflow was not rejected: %#v", result)
	}
}

func TestRuntimeTimeoutsStayBelowHostBoundary(t *testing.T) {
	if runtimeProbeTimeout != 90*time.Second {
		t.Fatalf("probe timeout=%s", runtimeProbeTimeout)
	}
	if runtimeCLITimeout != 9*time.Minute || runtimeCLITimeout >= 1201*time.Second {
		t.Fatalf("runtime CLI timeout=%s must preserve long synchronous operations below the 1201s host boundary", runtimeCLITimeout)
	}
	if runtimeInstallCallTimeout != 19*time.Minute || runtimeInstallCallTimeout >= 1201*time.Second {
		t.Fatalf("runtime install call timeout=%s must stay below the 1201s host boundary", runtimeInstallCallTimeout)
	}
}

func TestSemverAndCapabilities(t *testing.T) {
	c, _ := LoadContract()
	if !semverAtLeast("0.5.1", "0.5.0") || semverAtLeast("0.4.9", "0.5.0") || semverAtLeast("junk", "0.5.0") || semverAtLeast("0.5.0junk", "0.5.0") || semverAtLeast("00.5.0", "0.5.0") {
		t.Fatal("semver comparison failed")
	}
	if !semverAtLeast("1.0.0", "1.0.0-rc.1") || semverAtLeast("1.0.0-rc.1", "1.0.0") || !semverAtLeast("1.0.0-rc.10", "1.0.0-rc.2") {
		t.Fatal("semver prerelease comparison failed")
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
	actualJobs["durableJobsApiVersion"] = "1"
	if capabilitySubset(actualJobs, requiredJobs) {
		t.Fatal("capability scalar types must match exactly")
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

func TestManagedLauncherRejectsHardLink(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("hard-link fixture targets macOS")
	}
	root := t.TempDir()
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, _ := LoadContract()
	launcher, _ := launcherPath(c)
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(launcher, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(launcher, filepath.Join(t.TempDir(), "alternate-launcher")); err != nil {
		t.Fatal(err)
	}
	if _, err := validateManagedLauncher(c); err == nil || !strings.Contains(err.Error(), "hard link") {
		t.Fatalf("expected hard-link rejection, got %v", err)
	}
}

func TestRuntimeStatusRejectsLauncherTamper(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("tamper fixture targets macOS")
	}
	root := t.TempDir()
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, _ := LoadContract()
	launcher, _ := launcherPath(c)
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo '# tampered' >> \"$0\"; echo 'chengfeng-videocut 0.5.0'; exit 0; fi\nexit 2\n"
	if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	status := inspectRuntime(context.Background(), c)
	if status.Ready || status.State != "unhealthy" || !strings.Contains(status.Reason, "changed during health check") {
		t.Fatalf("launcher tamper was not unhealthy: %#v", status)
	}
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
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	testOptions := &installTestOptions{InstallerSHA256: installerDigest, InstallManifestSHA256: manifestDigest, InstallerFile: installer, ChecksumFile: checksum, ManifestFile: manifest}
	plan, err := buildInstallPlan(c, testOptions)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := installRuntimeWithOptions(context.Background(), c, strings.Repeat("0", 64), testOptions); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("wrong approval was accepted: %v", err)
	}
	result, err := installRuntimeWithOptions(context.Background(), c, plan.ApprovalDigest, testOptions)
	if err != nil {
		t.Fatal(err)
	}
	status := result["runtime"].(RuntimeStatus)
	if !status.Ready {
		t.Fatalf("installed fixture not ready: %#v", status)
	}
}
