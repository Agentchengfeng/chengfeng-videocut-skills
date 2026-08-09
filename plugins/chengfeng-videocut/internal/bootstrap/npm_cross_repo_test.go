package bootstrap

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// TestCrossRepoRuntimeNPMPackIntegration is intentionally opt-in. The companion
// harness stages a package with the Runtime repository's real staging code and
// npm pack, then points this test at that exact tgz. Nothing is published and no
// installed Plugin or live Runtime is touched.
func TestCrossRepoRuntimeNPMPackIntegration(t *testing.T) {
	tarballPath := strings.TrimSpace(os.Getenv("CHENGFENG_VIDEOCUT_CROSS_REPO_TGZ"))
	if tarballPath == "" {
		t.Skip("set CHENGFENG_VIDEOCUT_CROSS_REPO_TGZ to a Runtime-generated npm pack tarball")
	}
	c, err := LoadContract()
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := readRuntimeManifestFromTGZ(tarballPath, c.Platforms[platformKey()].PackageManifest)
	if err != nil {
		t.Fatal(err)
	}
	if manifest.PlatformKey != platformKey() {
		t.Fatalf("fixture platform=%s, host=%s", manifest.PlatformKey, platformKey())
	}
	tarballBytes, err := os.ReadFile(tarballPath)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha512.Sum512(tarballBytes)
	integrity := "sha512-" + base64.StdEncoding.EncodeToString(sum[:])
	installerDigest := manifest.Installer.SHA256
	var registry *httptest.Server
	registry = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/runtime.tgz" {
			_, _ = w.Write(tarballBytes)
			return
		}
		metadata := npmVersionMetadata{Name: manifest.NPMPackage.Name, Version: manifest.NPMPackage.Version}
		metadata.Dist.Integrity = integrity
		metadata.Dist.Tarball = registry.URL + "/runtime.tgz"
		_ = json.NewEncoder(w).Encode(metadata)
	}))
	defer registry.Close()

	c.Registry = registry.URL
	c.DistributionMode = manifest.DistributionMode
	c.LicenseStatus = manifest.LicenseStatus
	assets := c.Platforms[platformKey()]
	assets.NPMPackage = manifest.NPMPackage.Name
	assets.NPMPackageVersion = manifest.NPMPackage.Version
	assets.DistIntegrity = &integrity
	assets.InstallerSHA256 = &installerDigest
	assets.TarballMaxBytes = int64(len(tarballBytes)) + 1024
	c.Platforms[platformKey()] = assets
	root := filepath.Join(t.TempDir(), "managed-runtime")
	t.Setenv("CHENGFENG_VIDEOCUT_HOME", root)
	plan, err := BuildInstallPlan(c)
	if err != nil {
		t.Fatal(err)
	}
	capabilities, _ := json.Marshal(c.Capabilities)
	installerCalled := false
	options := &installTestOptions{AllowLocalFixture: true, RunInstaller: func(_ context.Context, executable string, args []string, _ string, timeout time.Duration) CommandResult {
		installerCalled = true
		digest, digestErr := fileSHA256(executable)
		if digestErr != nil || digest != installerDigest {
			return CommandResult{ExitCode: 90, Stderr: fmt.Sprintf("fixture installer digest: %v %s", digestErr, digest)}
		}
		if !reflect.DeepEqual(args, []string{"--target-root", root, "--ensure-service", "--json"}) || timeout != runtimeInstallerTimeout {
			return CommandResult{ExitCode: 91, Stderr: "unexpected installer invocation"}
		}
		launcher, _ := launcherPath(c)
		if err := os.MkdirAll(filepath.Dir(launcher), 0o755); err != nil {
			return CommandResult{ExitCode: 92, Stderr: err.Error()}
		}
		script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'chengfeng-videocut 0.5.1'; exit 0; fi\nif [ \"$1\" = \"doctor\" ]; then echo '" + strings.ReplaceAll(fmt.Sprintf(`{"ok":true,"data":{"healthy":true,"capabilities":%s}}`, capabilities), "'", "'\\''") + "'; exit 0; fi\nexit 2\n"
		if err := os.WriteFile(launcher, []byte(script), 0o755); err != nil {
			return CommandResult{ExitCode: 93, Stderr: err.Error()}
		}
		return CommandResult{OK: true, ExitCode: 0, Stdout: "cross-repo fixture invoked"}
	}}
	result, err := installRuntimeWithOptions(context.Background(), c, plan.ApprovalDigest, options)
	if err != nil {
		t.Fatal(err)
	}
	if !installerCalled || !result["runtime"].(RuntimeStatus).Ready {
		t.Fatalf("cross-repo chain incomplete: %#v", result)
	}
}

func readRuntimeManifestFromTGZ(path, manifestPath string) (runtimePackageManifest, error) {
	var manifest runtimePackageManifest
	file, err := os.Open(path)
	if err != nil {
		return manifest, err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return manifest, err
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			return manifest, fmt.Errorf("manifest %s is absent", manifestPath)
		}
		if err != nil {
			return manifest, err
		}
		name := strings.TrimPrefix(header.Name, "./")
		if name != manifestPath {
			continue
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			return manifest, fmt.Errorf("manifest is not a regular file")
		}
		if header.Size <= 0 || header.Size > runtimeManifestLimit {
			return manifest, fmt.Errorf("manifest size is invalid")
		}
		data, err := io.ReadAll(io.LimitReader(reader, runtimeManifestLimit+1))
		if err != nil {
			return manifest, err
		}
		decoder := json.NewDecoder(strings.NewReader(string(data)))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&manifest); err != nil {
			return manifest, err
		}
		return manifest, nil
	}
}
