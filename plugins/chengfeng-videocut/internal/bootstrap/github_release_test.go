package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestGitHubReleaseInstallVerifiesPinnedAssetBeforeExecution(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets the supported macOS contract")
	}
	root := filepath.Join(t.TempDir(), "managed-root")
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	capabilities, err := json.Marshal(c.Capabilities)
	if err != nil {
		t.Fatal(err)
	}
	installer := fmt.Sprintf(`#!/bin/sh
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
`, string(capabilities))
	installerPath := filepath.Join(t.TempDir(), "release-installer")
	if err := os.WriteFile(installerPath, []byte(installer), 0o700); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(installer))
	digest := hex.EncodeToString(sum[:])
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	options := &installTestOptions{RuntimePackageFile: installerPath, RuntimePackageURL: "https://api.github.com/repos/Agentchengfeng/chengfeng-videocut/releases/assets/1", RuntimePackageSHA256: digest}
	plan, err := buildInstallPlan(c, options)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Delivery != "github-release" || plan.RuntimePackageSHA256 != digest || !validSHA256(plan.ApprovalDigest) {
		t.Fatalf("GitHub Release plan is not pinned and approvable: %#v", plan)
	}
	if _, err := installRuntimeWithOptions(context.Background(), c, strings.Repeat("0", 64), options); err == nil || !strings.Contains(err.Error(), "approvalDigest") {
		t.Fatalf("wrong approval was accepted: %v", err)
	}
	installerCalls := 0
	options.RunInstaller = func(ctx context.Context, executable string, args []string, directory string, timeout time.Duration) CommandResult {
		installerCalls++
		if timeout != runtimeInstallerTimeout {
			t.Fatalf("installer timeout=%s", timeout)
		}
		return runInstallerCommand(ctx, executable, args, directory, timeout)
	}
	result, err := installRuntimeWithOptions(context.Background(), c, plan.ApprovalDigest, options)
	if err != nil {
		t.Fatal(err)
	}
	if installerCalls != 1 || !result["runtime"].(RuntimeStatus).Ready {
		t.Fatalf("pinned GitHub Release install did not become ready: calls=%d result=%#v", installerCalls, result)
	}
}

func TestGitHubReleaseInstallRejectsDigestMismatchBeforeExecution(t *testing.T) {
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	asset := filepath.Join(t.TempDir(), "asset")
	if err := os.WriteFile(asset, []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	digest := strings.Repeat("a", 64)
	options := &installTestOptions{
		RuntimePackageFile:   asset,
		RuntimePackageURL:    "https://api.github.com/repos/Agentchengfeng/chengfeng-videocut/releases/assets/1",
		RuntimePackageSHA256: digest,
		RunInstaller: func(context.Context, string, []string, string, time.Duration) CommandResult {
			t.Fatal("installer must not run when the GitHub Release asset digest mismatches")
			return CommandResult{}
		},
	}
	plan, err := buildInstallPlan(c, options)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := installRuntimeWithOptions(context.Background(), c, plan.ApprovalDigest, options); err == nil || !strings.Contains(err.Error(), "SHA-256 mismatch") {
		t.Fatalf("expected GitHub Release digest rejection, got %v", err)
	}
}

func TestRuntimeRepairReplacesChannelMismatchAndReadsBackTargetChannel(t *testing.T) {
	if platformKey() != "darwin-arm64" && platformKey() != "darwin-amd64" {
		t.Skip("Unix fixture targets the supported macOS contract")
	}
	originalChannel := BuildChannel
	BuildChannel = "release"
	t.Cleanup(func() { BuildChannel = originalChannel })
	root := filepath.Join(t.TempDir(), "managed-root")
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	capabilities, err := json.Marshal(c.Capabilities)
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
	localDevelopmentLauncher := fmt.Sprintf(`#!/bin/sh
if [ "$1" = "--version" ]; then echo 'chengfeng-videocut 0.5.7'; exit 0; fi
if [ "$1" = "doctor" ]; then echo '{"ok":false,"data":{"healthy":false,"developmentMode":true,"releaseReady":false,"readinessMode":"unready","distributionChannel":"local-development","distributionMode":"local-test-only","licenseStatus":"UNVERIFIED","capabilities":%s}}'; exit 1; fi
exit 2
`, string(capabilities))
	if err := os.WriteFile(launcher, []byte(localDevelopmentLauncher), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "projects", "keep"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "config.json"), []byte("{\"keep\":true}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	installer := fmt.Sprintf(`#!/bin/sh
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
if [ "$1" = "doctor" ]; then echo '{"ok":true,"data":{"healthy":true,"developmentMode":false,"releaseReady":false,"publicBeta":true,"readinessMode":"public-beta","distributionChannel":"public-beta","distributionMode":"public-beta","licenseStatus":"UNVERIFIED","capabilities":%s}}'; exit 0; fi
exit 2
EOF
chmod 0755 "$target/bin/chengfeng-videocut"
`, string(capabilities))
	installerPath := filepath.Join(t.TempDir(), "release-installer")
	if err := os.WriteFile(installerPath, []byte(installer), 0o700); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(installer))
	digest := hex.EncodeToString(sum[:])
	options := &installTestOptions{
		RuntimePackageFile:   installerPath,
		RuntimePackageURL:    "https://api.github.com/repos/Agentchengfeng/chengfeng-videocut/releases/assets/1",
		RuntimePackageSHA256: digest,
	}
	current := inspectRuntime(context.Background(), c)
	if current.State != "runtime_channel_mismatch" || !current.Repairable {
		t.Fatalf("fixture did not expose a repairable channel mismatch: %#v", current)
	}
	installPlan, err := buildInstallPlan(c, options)
	if err != nil {
		t.Fatal(err)
	}
	repairPlan, err := bindRepairPlan(installPlan, current)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repairRuntimeWithOptions(context.Background(), c, strings.Repeat("0", 64), options); err == nil || !strings.Contains(err.Error(), "approvalDigest") {
		t.Fatalf("wrong repair approval was accepted: %v", err)
	}
	result, err := repairRuntimeWithOptions(context.Background(), c, repairPlan.ApprovalDigest, options)
	if err != nil {
		t.Fatal(err)
	}
	status := result["runtime"].(RuntimeStatus)
	if !status.Ready || status.State != "ready" || status.ObservedChannel != "public-beta" {
		t.Fatalf("repair did not reach the target channel: %#v", status)
	}
	if result["plan"].(InstallPlan).Action != "runtime_repair" {
		t.Fatalf("repair executed with the wrong action: %#v", result["plan"])
	}
	if _, err := os.Stat(filepath.Join(root, "projects", "keep")); err != nil {
		t.Fatalf("repair removed the project sentinel: %v", err)
	}
	if data, err := os.ReadFile(filepath.Join(root, "config.json")); err != nil || string(data) != "{\"keep\":true}\n" {
		t.Fatalf("repair changed config.json: %q %v", data, err)
	}
}

func TestGitHubReleaseApprovalBindsReleaseIdentity(t *testing.T) {
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	digest := strings.Repeat("b", 64)
	first, err := buildInstallPlan(c, &installTestOptions{RuntimePackageURL: "https://api.github.com/repos/Agentchengfeng/chengfeng-videocut/releases/assets/1", RuntimePackageSHA256: digest})
	if err != nil {
		t.Fatal(err)
	}
	changed := first
	changed.ReleaseTag = "v9.9.9"
	changedDigest, err := approvalDigest(changed)
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(changedDigest, first.ApprovalDigest) {
		t.Fatal("release tag was not bound to approvalDigest")
	}
}
