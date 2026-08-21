package bootstrap

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestProductionInstallPlanFailsClosedWithoutPinnedDigest(t *testing.T) {
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", t.TempDir())
	// Legacy environment variables must never unlock the production binary.
	t.Setenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES", "1")
	t.Setenv("CHENGFENG_VIDEOCUT_TEST_RUNTIME_PACKAGE_SHA256", strings.Repeat("a", 64))
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	plan, err := BuildInstallPlan(c)
	if err != nil {
		t.Fatal(err)
	}
	if plan.RuntimePackageSHA256 != "" || plan.ApprovalDigest != "" {
		t.Fatalf("unlocked plan became approvable: %#v", plan)
	}
	if _, err := installRuntime(context.Background(), c, strings.Repeat("a", 64)); err == nil || !strings.Contains(err.Error(), "not locked") {
		t.Fatalf("expected locked-asset error, got %v", err)
	}
}

func TestRuntimePackageContractPinsExactGitHubReleaseAssetPerPlatform(t *testing.T) {
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	if c.SchemaVersion != 6 || c.Delivery != "github-release" || c.Repository != "Agentchengfeng/chengfeng-videocut" {
		t.Fatalf("GitHub Release contract is not exact: %#v", c)
	}
	for platform, assets := range c.Platforms {
		if !assetNamePattern.MatchString(assets.RuntimePackageAsset) || assets.RuntimePackageMaxBytes <= 0 || assets.RuntimeLauncher == "" {
			t.Fatalf("platform %s is missing the exact GitHub Release asset contract: %#v", platform, assets)
		}
		if platform == "windows-amd64" && (assets.RuntimePackageSHA256 == nil || !validSHA256(*assets.RuntimePackageSHA256)) {
			t.Fatalf("Windows public-beta installer digest must be pinned: %#v", assets)
		}
		if platform == "windows-amd64" && (assets.RuntimePackageURL == nil || !validGitHubReleaseAssetURL(c.Repository, *assets.RuntimePackageURL)) {
			t.Fatalf("Windows public-beta installer must pin the GitHub Asset API endpoint: %#v", assets)
		}
	}
}

func TestRuntimeContractSnapshotDrivesOperativeCompatibility(t *testing.T) {
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	if c.RuntimeSnapshot.SchemaVersion != 1 || len(c.RuntimeSnapshot.CLI.Commands) == 0 {
		t.Fatalf("canonical Runtime snapshot was not loaded: %#v", c.RuntimeSnapshot)
	}
	if !reflect.DeepEqual(c.Capabilities, c.RuntimeSnapshot.Capabilities) {
		t.Fatal("runtime_status requirements must be derived from the canonical Runtime snapshot")
	}
	if !reflect.DeepEqual(c.StudioCapabilities, c.RuntimeSnapshot.StudioCapabilities) {
		t.Fatal("Studio capability requirements must be derived from the canonical Runtime snapshot")
	}
	for _, key := range []string{
		"projectIngestVersion",
		"transcriptPlaybackPagingVersion",
		"operationAdmissionVersion",
		"operationAuditVersion",
		"operationIdempotencyVersion",
		"cloudTranscriptionProvider",
		"cloudTranscriptionTaskLocalOnly",
	} {
		if _, ok := c.Capabilities[key]; !ok {
			t.Fatalf("operative Runtime capabilities are missing %s", key)
		}
	}
	if !capabilitySubset(c.Capabilities, requiredRuntimeSnapshotCapabilities()) {
		t.Fatal("operative Runtime capabilities do not contain the complete required snapshot")
	}
	broken := c.RuntimeSnapshot
	broken.Capabilities = cloneMapAny(c.RuntimeSnapshot.Capabilities)
	delete(broken.Capabilities, "cloudTranscriptionProvider")
	if err := validateRuntimeContractSnapshot(c, broken); err == nil || !strings.Contains(err.Error(), "capability") {
		t.Fatalf("missing snapshot capability was not rejected: %v", err)
	}
	broken = c.RuntimeSnapshot
	broken.CLI.Commands = map[string]RuntimeCLICommandSpec{}
	for key, value := range c.RuntimeSnapshot.CLI.Commands {
		broken.CLI.Commands[key] = value
	}
	delete(broken.CLI.Commands, "project.ingest")
	if err := validateRuntimeContractSnapshot(c, broken); err == nil || !strings.Contains(err.Error(), "project.ingest") {
		t.Fatalf("missing CLI feature command was not rejected: %v", err)
	}
}

func TestApprovalDigestBindsGitHubReleaseAssetPlatformTargetAndPolicy(t *testing.T) {
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", filepath.Join(t.TempDir(), "home one"))
	c, _ := LoadContract()
	assets := c.Platforms[platformKey()]
	packageDigest := strings.Repeat("a", 64)
	packageURL := "https://api.github.com/repos/Agentchengfeng/chengfeng-videocut/releases/assets/1"
	assets.RuntimePackageSHA256 = &packageDigest
	assets.RuntimePackageURL = &packageURL
	c.Platforms[platformKey()] = assets
	first, err := buildInstallPlan(c, nil)
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
	second, _ := buildInstallPlan(c, nil)
	if second.ApprovalDigest == first.ApprovalDigest {
		t.Fatal("target was not bound")
	}
	first.ReleaseTag += "-changed"
	changed, _ = approvalDigest(first)
	if changed == first.ApprovalDigest {
		t.Fatal("release tag was not bound")
	}
	first.ReleaseTag = c.ReleaseTag
	first.RuntimePackageURL += "1"
	changed, _ = approvalDigest(first)
	if changed == first.ApprovalDigest {
		t.Fatal("GitHub Asset API URL was not bound")
	}
	first.RuntimePackageURL = packageURL
	first.DistributionMode = "changed"
	changed, _ = approvalDigest(first)
	if changed == first.ApprovalDigest {
		t.Fatal("distribution mode was not bound")
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
	if runtimeInstallerTimeout != 18*time.Minute || runtimeInstallerTimeout <= runtimeCLITimeout || runtimeInstallCallTimeout-runtimeInstallerTimeout < time.Minute {
		t.Fatalf("installer timeout=%s must exceed the runtime CLI budget and reserve at least one minute for final readback", runtimeInstallerTimeout)
	}
	if runtimeInstallCallTimeout != 19*time.Minute || runtimeInstallCallTimeout >= 1201*time.Second {
		t.Fatalf("runtime install call timeout=%s must stay below the 1201s host boundary", runtimeInstallCallTimeout)
	}
}

func TestSemverAndCapabilities(t *testing.T) {
	c, _ := LoadContract()
	if !semverAtLeast("0.5.2", "0.5.1") || semverAtLeast("0.5.0", "0.5.1") || semverAtLeast("junk", "0.5.1") || semverAtLeast("0.5.1junk", "0.5.1") || semverAtLeast("00.5.1", "0.5.1") {
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
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.9'; exit 0; fi\nif [ \"$1\" = \"doctor\" ]; then echo '{\"ok\":true,\"data\":{\"healthy\":true,\"developmentMode\":false,\"releaseReady\":false,\"readinessMode\":\"public-beta\",\"capabilities\":" + string(caps) + "}}'; exit 0; fi\nprintf '%s\\n' \"$@\"\n"
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

func TestRuntimeStatusRejectsRuntime053(t *testing.T) {
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
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.3'; exit 0; fi\nif [ \"$1\" = \"doctor\" ]; then echo '{\"ok\":true,\"data\":{\"healthy\":true,\"developmentMode\":false,\"releaseReady\":true,\"readinessMode\":\"release-ready\",\"capabilities\":" + string(caps) + "}}'; exit 0; fi\nexit 2\n"
	if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	status := inspectRuntime(context.Background(), c)
	if status.Ready || status.RuntimeVersion != "0.5.3" || status.RequiredVersion != "0.5.9" {
		t.Fatalf("Runtime 0.5.3 must be incompatible with the 0.5.9 contract: %#v", status)
	}
}

func TestRuntimeStatusRejectsMissingOrWrongRequiredCapabilities(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	originalChannel := BuildChannel
	BuildChannel = "local-development"
	t.Cleanup(func() { BuildChannel = originalChannel })
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"missing project ingest", func(capabilities map[string]any) { delete(capabilities, "projectIngestVersion") }},
		{"wrong playback paging version", func(capabilities map[string]any) { capabilities["transcriptPlaybackPagingVersion"] = float64(2) }},
		{"missing operation admission", func(capabilities map[string]any) { delete(capabilities, "operationAdmissionVersion") }},
		{"wrong operation audit version", func(capabilities map[string]any) { capabilities["operationAuditVersion"] = float64(2) }},
		{"wrong operation idempotency type", func(capabilities map[string]any) { capabilities["operationIdempotencyVersion"] = "1" }},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
			launcher, launcherErr := launcherPath(c)
			if launcherErr != nil {
				t.Fatal(launcherErr)
			}
			if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
				t.Fatal(err)
			}
			actualCapabilities := map[string]any{}
			for name, value := range c.Capabilities {
				actualCapabilities[name] = value
			}
			scenario.mutate(actualCapabilities)
			caps, marshalErr := jsonMarshal(actualCapabilities)
			if marshalErr != nil {
				t.Fatal(marshalErr)
			}
			script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.9'; exit 0; fi\nif [ \"$1\" = \"doctor\" ] && [ \"$2\" = \"--local-development\" ] && [ \"$3\" = \"--json\" ]; then echo '{\"ok\":true,\"data\":{\"healthy\":true,\"developmentMode\":true,\"releaseReady\":false,\"readinessMode\":\"local-development\",\"capabilities\":" + string(caps) + "}}'; exit 0; fi\nexit 2\n"
			if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
				t.Fatal(err)
			}
			status := inspectRuntime(context.Background(), c)
			if status.Ready || status.State != "incompatible" || status.Compatibility == nil || status.Compatibility.CapabilityCompatible {
				t.Fatalf("Runtime with %s must be capability-incompatible: %#v", scenario.name, status)
			}
		})
	}
}

func TestLocalDevelopmentBuildAcceptsOnlyExactDevelopmentReadiness(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	originalChannel := BuildChannel
	BuildChannel = "local-development"
	t.Cleanup(func() { BuildChannel = originalChannel })
	c, _ := LoadContract()
	if c.MinimumRuntimeVersion != "0.5.9" {
		t.Fatalf("local development ingest contract must require Runtime 0.5.9, got %s", c.MinimumRuntimeVersion)
	}
	caps, _ := jsonMarshal(c.Capabilities)
	for _, scenario := range []struct {
		name      string
		fields    string
		wantReady bool
	}{
		{"exact local readiness", `"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development"`, true},
		{"missing development marker", `"healthy":true,"releaseReady":false,"readinessMode":"local-development"`, false},
		{"release-ready cannot masquerade as local", `"healthy":true,"developmentMode":true,"releaseReady":true,"readinessMode":"local-development"`, false},
		{"wrong readiness mode", `"healthy":true,"developmentMode":true,"releaseReady":false,"readinessMode":"release-ready"`, false},
		{"unhealthy local runtime", `"healthy":false,"developmentMode":true,"releaseReady":false,"readinessMode":"local-development"`, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
			launcher, _ := launcherPath(c)
			if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
				t.Fatal(err)
			}
			doctorJSON := fmt.Sprintf(`{"ok":true,"data":{%s,"capabilities":%s}}`, scenario.fields, caps)
			script := "#!/bin/sh\n" +
				"if [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.9'; exit 0; fi\n" +
				"if [ \"$1\" = \"doctor\" ] && [ \"$2\" = \"--local-development\" ] && [ \"$3\" = \"--json\" ]; then echo '" + doctorJSON + "'; exit 0; fi\n" +
				"exit 3\n"
			if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
				t.Fatal(err)
			}
			status := inspectRuntime(context.Background(), c)
			if status.Ready != scenario.wantReady {
				t.Fatalf("ready=%v, want %v: %#v", status.Ready, scenario.wantReady, status)
			}
			if scenario.wantReady {
				if status.State != "development_ready" || !status.DevelopmentMode || status.ReleaseReady {
					t.Fatalf("local readiness was not explicit: %#v", status)
				}
			} else if status.State == "development_ready" {
				t.Fatalf("invalid readiness reached development_ready: %#v", status)
			}
		})
	}
}

func TestReleaseBuildRejectsDevelopmentDoctorResponse(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	originalChannel := BuildChannel
	BuildChannel = "release"
	t.Cleanup(func() { BuildChannel = originalChannel })
	root := t.TempDir()
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, _ := LoadContract()
	launcher, _ := launcherPath(c)
	if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
		t.Fatal(err)
	}
	caps, _ := jsonMarshal(c.Capabilities)
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.9'; exit 0; fi\n" +
		"if [ \"$1\" = \"doctor\" ] && [ \"$2\" = \"--json\" ]; then echo '{\"ok\":true,\"data\":{\"healthy\":true,\"developmentMode\":true,\"releaseReady\":false,\"readinessMode\":\"local-development\",\"capabilities\":" + string(caps) + "}}'; exit 0; fi\nexit 3\n"
	if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	status := inspectRuntime(context.Background(), c)
	if status.Ready || status.State == "development_ready" || !status.DevelopmentMode || status.ReleaseReady {
		t.Fatalf("release build accepted or hid development response: %#v", status)
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
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo '# tampered' >> \"$0\"; echo 'chengfeng-videocut 0.5.9'; exit 0; fi\nexit 2\n"
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

func cloneMapAny(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
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
	root := filepath.Join(t.TempDir(), "managed root")
	c, _ := LoadContract()
	capabilities, _ := json.Marshal(c.Capabilities)
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
if [ "$1" = "--version" ]; then echo 'chengfeng-videocut 0.5.9'; exit 0; fi
	if [ "$1" = "doctor" ]; then echo '{"ok":true,"data":{"healthy":true,"developmentMode":false,"releaseReady":false,"readinessMode":"public-beta","capabilities":%s}}'; exit 0; fi
exit 2
EOF
chmod 0755 "$target/bin/chengfeng-videocut"
printf 'installed\n'
`, string(capabilities))
	tarball, integrity, installerDigest := makeRuntimeNPMTarball(t, c, []byte(script), nil)
	server := serveNPMFixture(t, c, tarball, integrity, nil)
	defer server.Close()
	c = lockContractToFixture(t, c, server.URL, integrity, installerDigest)
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	installerCalls := 0
	installerTimeoutSeen := time.Duration(0)
	var installerArgs []string
	testOptions := &installTestOptions{
		RunInstaller: func(ctx context.Context, executable string, args []string, directory string, timeout time.Duration) CommandResult {
			installerCalls++
			installerTimeoutSeen = timeout
			installerArgs = append([]string(nil), args...)
			return runInstallerCommand(ctx, executable, args, directory, timeout)
		},
	}
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
	if installerCalls != 1 || installerTimeoutSeen != runtimeInstallerTimeout {
		t.Fatalf("installer runner received calls=%d timeout=%s, want one call with %s", installerCalls, installerTimeoutSeen, runtimeInstallerTimeout)
	}
	if want := []string{"--target-root", root, "--ensure-service", "--json"}; !reflect.DeepEqual(installerArgs, want) {
		t.Fatalf("runtime package arguments=%q, want %q", installerArgs, want)
	}
	status := result["runtime"].(RuntimeStatus)
	if !status.Ready {
		t.Fatalf("installed fixture not ready: %#v", status)
	}
}

func TestRuntimeInstallRejectsPackageDigestBeforeExecution(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets supported macOS contract")
	}
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", t.TempDir())
	c, _ := LoadContract()
	tarball, integrity, installerDigest := makeRuntimeNPMTarball(t, c, []byte("#!/bin/sh\nexit 0\n"), nil)
	tampered := append([]byte(nil), tarball...)
	tampered[len(tampered)-1] ^= 0xff
	server := serveNPMFixture(t, c, tampered, integrity, nil)
	defer server.Close()
	c = lockContractToFixture(t, c, server.URL, integrity, installerDigest)
	testOptions := &installTestOptions{
		RunInstaller: func(context.Context, string, []string, string, time.Duration) CommandResult {
			t.Fatal("installer must not run when npm dist.integrity mismatches")
			return CommandResult{}
		},
	}
	plan, err := buildInstallPlan(c, testOptions)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := installRuntimeWithOptions(context.Background(), c, plan.ApprovalDigest, testOptions); err == nil || !strings.Contains(err.Error(), "dist.integrity mismatch") {
		t.Fatalf("expected package digest failure, got %v", err)
	}
}

type fixtureTarEntry struct {
	name     string
	typeflag byte
	data     []byte
	linkname string
}

func makeRuntimeNPMTarball(t *testing.T, c Contract, installer []byte, extras []fixtureTarEntry) ([]byte, string, string) {
	t.Helper()
	assets := c.Platforms[platformKey()]
	installerSum := sha256.Sum256(installer)
	installerDigest := hex.EncodeToString(installerSum[:])
	osValue, cpuValue := npmPlatformValues(platformKey())
	manifest := runtimePackageManifest{
		SchemaVersion: 1, Product: c.Product, ProductVersion: c.RuntimeVersion,
		PlatformKey: platformKey(), DistributionMode: c.DistributionMode, LicenseStatus: c.LicenseStatus,
		LicenseNote: "fixture package is verified by the local test",
		NPMPackage:  manifestNPMPackage{Name: assets.NPMPackage, Version: assets.NPMPackageVersion, OS: []string{osValue}, CPU: []string{cpuValue}},
		Installer:   packageInstaller{Asset: filepath.Base(assets.InstallerPath), Path: strings.TrimPrefix(assets.InstallerPath, "package/"), Size: int64(len(installer)), SHA256: installerDigest, Executable: true},
	}
	legalEntries := []fixtureTarEntry{}
	for _, path := range runtimePackageLegalFiles {
		data := []byte("fixture legal material: " + path + "\n")
		sum := sha256.Sum256(data)
		manifest.Legal.Files = append(manifest.Legal.Files, packageFileRecord{Path: path, SHA256: hex.EncodeToString(sum[:]), Size: int64(len(data))})
		legalEntries = append(legalEntries, fixtureTarEntry{name: "package/" + path, typeflag: tar.TypeReg, data: data})
	}
	sbomData := []byte("{\"spdxVersion\":\"SPDX-2.3\"}\n")
	sbomSum := sha256.Sum256(sbomData)
	manifest.SBOM = packageSBOM{Path: "SBOM.spdx.json", Format: "SPDX-2.3", SHA256: hex.EncodeToString(sbomSum[:]), Size: int64(len(sbomData))}
	manifestData, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	packageFiles := []string{strings.TrimPrefix(assets.PackageManifest, "package/")}
	packageFiles = append(packageFiles, runtimePackageLegalFiles...)
	packageFiles = append(packageFiles, "SBOM.spdx.json", strings.TrimPrefix(assets.InstallerPath, "package/"))
	packageData, _ := json.Marshal(npmPackageJSON{Name: assets.NPMPackage, Version: assets.NPMPackageVersion, Description: "fixture", License: "SEE LICENSE IN LICENSES.md", Repository: npmRepository{Type: "git", URL: "https://github.com/Agentchengfeng/chengfeng-videocut.git"}, OS: manifest.NPMPackage.OS, CPU: manifest.NPMPackage.CPU, Files: packageFiles, PublishConfig: map[string]string{"access": "public"}})
	entries := []fixtureTarEntry{{name: "package/package.json", typeflag: tar.TypeReg, data: packageData}, {name: assets.PackageManifest, typeflag: tar.TypeReg, data: manifestData}, {name: "package/SBOM.spdx.json", typeflag: tar.TypeReg, data: sbomData}, {name: assets.InstallerPath, typeflag: tar.TypeReg, data: installer}}
	entries = append(entries, legalEntries...)
	entries = append(entries, extras...)
	tarball := buildFixtureTGZ(t, entries)
	sum := sha512.Sum512(tarball)
	return tarball, "sha512-" + base64.StdEncoding.EncodeToString(sum[:]), installerDigest
}

func buildFixtureTGZ(t *testing.T, entries []fixtureTarEntry) []byte {
	t.Helper()
	var output bytes.Buffer
	gz := gzip.NewWriter(&output)
	tw := tar.NewWriter(gz)
	for _, entry := range entries {
		typeflag := entry.typeflag
		if typeflag == 0 {
			typeflag = tar.TypeReg
		}
		header := &tar.Header{Name: entry.name, Mode: 0o644, Size: int64(len(entry.data)), Typeflag: typeflag, Linkname: entry.linkname}
		if typeflag != tar.TypeReg && typeflag != tar.TypeRegA {
			header.Size = 0
		}
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if header.Size > 0 {
			if _, err := tw.Write(entry.data); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func serveNPMFixture(t *testing.T, c Contract, tarball []byte, integrity string, mutate func(*npmVersionMetadata)) *httptest.Server {
	t.Helper()
	assets := c.Platforms[platformKey()]
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/runtime.tgz" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(tarball)
			return
		}
		metadata := npmVersionMetadata{Name: assets.NPMPackage, Version: assets.NPMPackageVersion}
		metadata.Dist.Integrity = integrity
		metadata.Dist.Tarball = server.URL + "/runtime.tgz"
		if mutate != nil {
			mutate(&metadata)
		}
		_ = json.NewEncoder(w).Encode(metadata)
	}))
	return server
}

func lockContractToFixture(t *testing.T, c Contract, registry, integrity, installerDigest string) Contract {
	t.Helper()
	c.Delivery = "npm-fixture"
	c.Registry = registry
	assets := c.Platforms[platformKey()]
	assets.DistIntegrity, assets.InstallerSHA256 = &integrity, &installerDigest
	assets.TarballMaxBytes = 16 << 20
	c.Platforms[platformKey()] = assets
	return c
}

func TestRuntimeInstallRejectsRegistryMetadataDriftBeforeDownload(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("macOS fixture")
	}
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", t.TempDir())
	c, _ := LoadContract()
	tarball, integrity, installerDigest := makeRuntimeNPMTarball(t, c, []byte("#!/bin/sh\nexit 0\n"), nil)
	server := serveNPMFixture(t, c, tarball, integrity, func(metadata *npmVersionMetadata) { metadata.Version = "9.9.9" })
	defer server.Close()
	c = lockContractToFixture(t, c, server.URL, integrity, installerDigest)
	plan, _ := BuildInstallPlan(c)
	if _, err := installRuntime(context.Background(), c, plan.ApprovalDigest); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("expected metadata mismatch, got %v", err)
	}
}

func TestRegistryURLsStayExactAndOnApprovedOrigin(t *testing.T) {
	endpoint, err := registryVersionURL("https://registry.npmjs.org", "@chengfeng/videocut-runtime-darwin-arm64", "0.5.1")
	if err != nil || !strings.Contains(endpoint, "%2F") || !strings.HasSuffix(endpoint, "/0.5.1") {
		t.Fatalf("unexpected exact version endpoint %q err=%v", endpoint, err)
	}
	if _, err := registryVersionURL("http://registry.npmjs.org", "@chengfeng/videocut-runtime-darwin-arm64", "0.5.1"); err == nil {
		t.Fatal("non-loopback HTTP registry was accepted")
	}
	if _, err := validateTarballURL("https://registry.npmjs.org", "https://cdn.example/runtime.tgz"); err == nil {
		t.Fatal("off-origin tarball was accepted")
	}
}

func TestPackageJSONLifecycleScriptsAreRejected(t *testing.T) {
	c, _ := LoadContract()
	plan, _ := BuildInstallPlan(c)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "package", "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	packageJSON := fmt.Sprintf(`{"name":%q,"version":%q,"description":"fixture","license":"UNLICENSED","os":["darwin"],"cpu":["arm64"],"files":[],"publishConfig":{"access":"public"},"scripts":{"install":"evil"}}`, plan.NPMPackage, plan.NPMPackageVersion)
	if err := os.WriteFile(filepath.Join(root, "package", "package.json"), []byte(packageJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateRuntimePackage(root, plan, false); err == nil || !strings.Contains(err.Error(), "unknown field \"scripts\"") {
		t.Fatalf("lifecycle scripts were not rejected: %v", err)
	}
}

func TestInstallerExecutableFlagIsPlatformAware(t *testing.T) {
	if !installerExecutable("darwin-arm64") || !installerExecutable("darwin-amd64") {
		t.Fatal("macOS installers must be marked executable")
	}
	if installerExecutable("windows-amd64") {
		t.Fatal("Windows installer executable flag must match canonical manifest false")
	}
}

func TestCanonicalWindowsPackageAcceptsNonPOSIXExecutableInstaller(t *testing.T) {
	c, _ := LoadContract()
	assets := c.Platforms["windows-amd64"]
	installer := []byte("MZ fixture")
	sum := sha256.Sum256(installer)
	digest := hex.EncodeToString(sum[:])
	plan := InstallPlan{Product: c.Product, RuntimeVersion: c.RuntimeVersion, NPMPackage: assets.NPMPackage, NPMPackageVersion: assets.NPMPackageVersion, Platform: "windows-amd64", PackageManifest: assets.PackageManifest, InstallerPath: assets.InstallerPath, InstallerSHA256: digest, DistributionMode: c.DistributionMode, LicenseStatus: c.LicenseStatus}
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "package", "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	packageFiles := []string{strings.TrimPrefix(plan.PackageManifest, "package/")}
	packageFiles = append(packageFiles, runtimePackageLegalFiles...)
	packageFiles = append(packageFiles, "SBOM.spdx.json", strings.TrimPrefix(plan.InstallerPath, "package/"))
	packageJSON, _ := json.Marshal(npmPackageJSON{Name: plan.NPMPackage, Version: plan.NPMPackageVersion, Description: "fixture", License: "SEE LICENSE IN LICENSES.md", Repository: npmRepository{Type: "git", URL: "https://github.com/Agentchengfeng/chengfeng-videocut.git"}, OS: []string{"win32"}, CPU: []string{"x64"}, Files: packageFiles, PublishConfig: map[string]string{"access": "public"}})
	manifestValue := runtimePackageManifest{SchemaVersion: 1, Product: plan.Product, ProductVersion: plan.RuntimeVersion, PlatformKey: plan.Platform, NPMPackage: manifestNPMPackage{Name: plan.NPMPackage, Version: plan.NPMPackageVersion, OS: []string{"win32"}, CPU: []string{"x64"}}, DistributionMode: plan.DistributionMode, LicenseStatus: plan.LicenseStatus, LicenseNote: "fixture", Installer: packageInstaller{Asset: filepath.Base(plan.InstallerPath), Path: strings.TrimPrefix(plan.InstallerPath, "package/"), SHA256: digest, Size: int64(len(installer)), Executable: false}}
	for _, path := range runtimePackageLegalFiles {
		data := []byte("fixture:" + path)
		sum := sha256.Sum256(data)
		manifestValue.Legal.Files = append(manifestValue.Legal.Files, packageFileRecord{Path: path, SHA256: hex.EncodeToString(sum[:]), Size: int64(len(data))})
		absolute := filepath.Join(root, "package", filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(absolute), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(absolute, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	sbomData := []byte("{}\n")
	sbomSum := sha256.Sum256(sbomData)
	manifestValue.SBOM = packageSBOM{Path: "SBOM.spdx.json", Format: "SPDX-2.3", SHA256: hex.EncodeToString(sbomSum[:]), Size: int64(len(sbomData))}
	manifest, _ := json.Marshal(manifestValue)
	if err := os.WriteFile(filepath.Join(root, "package", "package.json"), packageJSON, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(plan.PackageManifest)), manifest, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(plan.InstallerPath)), installer, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "package", "SBOM.spdx.json"), sbomData, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateRuntimePackage(root, plan, false); err != nil {
		t.Fatalf("canonical Windows package rejected: %v", err)
	}
}

func TestExtractRuntimePackageRejectsTraversalLinksSpecialsAndExtraFiles(t *testing.T) {
	c, _ := LoadContract()
	plan, _ := BuildInstallPlan(c)
	tests := []fixtureTarEntry{
		{name: "package/../escape", typeflag: tar.TypeReg, data: []byte("x")},
		{name: "package/payload/link", typeflag: tar.TypeSymlink, linkname: "/tmp/outside"},
		{name: "package/payload/device", typeflag: tar.TypeChar},
		{name: "package/extra.txt", typeflag: tar.TypeReg, data: []byte("x")},
	}
	for _, malicious := range tests {
		t.Run(strings.ReplaceAll(malicious.name, "/", "_"), func(t *testing.T) {
			tarball := buildFixtureTGZ(t, []fixtureTarEntry{malicious})
			path := filepath.Join(t.TempDir(), "bad.tgz")
			if err := os.WriteFile(path, tarball, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := extractRuntimePackage(path, t.TempDir(), plan); err == nil {
				t.Fatal("malicious tar entry was accepted")
			}
		})
	}
}

func TestRuntimePackageRejectsTamperedLegalReceipt(t *testing.T) {
	c, _ := LoadContract()
	c.Delivery = "npm-fixture"
	tarball, integrity, installerDigest := makeRuntimeNPMTarball(t, c, []byte("#!/bin/sh\nexit 0\n"), nil)
	assets := c.Platforms[platformKey()]
	assets.DistIntegrity, assets.InstallerSHA256 = &integrity, &installerDigest
	c.Platforms[platformKey()] = assets
	plan, _ := BuildInstallPlan(c)
	root := t.TempDir()
	path := filepath.Join(t.TempDir(), "runtime.tgz")
	if err := os.WriteFile(path, tarball, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := extractRuntimePackage(path, root, plan); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "package", "NOTICE.md"), []byte("tampered\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateRuntimePackage(root, plan, false); err == nil || !strings.Contains(err.Error(), "NOTICE.md") {
		t.Fatalf("tampered legal material was accepted: %v", err)
	}
}

func TestRuntimePackageRequiresExactRepositoryProvenance(t *testing.T) {
	c, _ := LoadContract()
	c.Delivery = "npm-fixture"
	tarball, integrity, installerDigest := makeRuntimeNPMTarball(t, c, []byte("#!/bin/sh\nexit 0\n"), nil)
	assets := c.Platforms[platformKey()]
	assets.DistIntegrity, assets.InstallerSHA256 = &integrity, &installerDigest
	c.Platforms[platformKey()] = assets
	plan, _ := BuildInstallPlan(c)
	root := t.TempDir()
	path := filepath.Join(t.TempDir(), "runtime.tgz")
	if err := os.WriteFile(path, tarball, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := extractRuntimePackage(path, root, plan); err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(root, "package", "package.json")
	data, err := os.ReadFile(packagePath)
	if err != nil {
		t.Fatal(err)
	}
	var packageJSON npmPackageJSON
	if err := json.Unmarshal(data, &packageJSON); err != nil {
		t.Fatal(err)
	}
	packageJSON.Repository.URL = "https://example.invalid/wrong.git"
	tampered, _ := json.Marshal(packageJSON)
	if err := os.WriteFile(packagePath, tampered, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := validateRuntimePackage(root, plan, false); err == nil || !strings.Contains(err.Error(), "package.json identity") {
		t.Fatalf("wrong repository provenance was accepted: %v", err)
	}
}
