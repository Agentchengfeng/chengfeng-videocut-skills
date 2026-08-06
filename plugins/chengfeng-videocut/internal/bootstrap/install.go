package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func installRuntime(ctx context.Context, c Contract, approval string) (map[string]any, error) {
	plan, err := BuildInstallPlan(c)
	if err != nil {
		return nil, err
	}
	if !validSHA256(plan.InstallerSHA256) || !validSHA256(plan.InstallManifestSHA256) || plan.ApprovalDigest == "" {
		return nil, fmt.Errorf("Runtime %s release asset is not locked: installer or install manifest digest is unpublished; installation is unavailable", plan.ReleaseVersion)
	}
	if !validSHA256(approval) || approval != plan.ApprovalDigest {
		return nil, fmt.Errorf("approvalDigest does not match the current release, platform, target, assets, and impact")
	}
	temp, err := os.MkdirTemp("", "chengfeng-videocut-installer-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(temp)
	installerPath := filepath.Join(temp, filepath.Base(plan.InstallerAsset))
	checksumPath := filepath.Join(temp, filepath.Base(plan.ChecksumAsset))
	manifestPath := filepath.Join(temp, filepath.Base(plan.InstallManifestAsset))
	if testOverridesEnabled() {
		if source := os.Getenv("CHENGFENG_VIDEOCUT_TEST_INSTALLER_FILE"); source != "" {
			if err := copyFile(source, installerPath, 0o700); err != nil {
				return nil, err
			}
		}
		if source := os.Getenv("CHENGFENG_VIDEOCUT_TEST_CHECKSUM_FILE"); source != "" {
			if err := copyFile(source, checksumPath, 0o600); err != nil {
				return nil, err
			}
		}
		if source := os.Getenv("CHENGFENG_VIDEOCUT_TEST_MANIFEST_FILE"); source != "" {
			if err := copyFile(source, manifestPath, 0o600); err != nil {
				return nil, err
			}
		}
	}
	if _, err := os.Stat(installerPath); err != nil {
		url := releaseURL(c, plan.InstallerAsset)
		if err := download(ctx, url, installerPath, 256<<20); err != nil {
			return nil, fmt.Errorf("download installer: %w", err)
		}
	}
	if _, err := os.Stat(checksumPath); err != nil {
		url := releaseURL(c, plan.ChecksumAsset)
		if err := download(ctx, url, checksumPath, 8<<20); err != nil {
			return nil, fmt.Errorf("download checksum manifest: %w", err)
		}
	}
	if _, err := os.Stat(manifestPath); err != nil {
		if err := download(ctx, releaseURL(c, plan.InstallManifestAsset), manifestPath, 8<<20); err != nil {
			return nil, fmt.Errorf("download install manifest: %w", err)
		}
	}
	manifest, err := os.ReadFile(checksumPath)
	if err != nil {
		return nil, err
	}
	checksums, err := parseChecksums(string(manifest))
	if err != nil {
		return nil, err
	}
	if checksums[plan.InstallerAsset] != plan.InstallerSHA256 {
		return nil, fmt.Errorf("checksum manifest does not match the pinned installer digest")
	}
	if checksums[plan.InstallManifestAsset] != plan.InstallManifestSHA256 {
		return nil, fmt.Errorf("checksum manifest does not match the pinned install manifest digest")
	}
	for _, name := range append(append([]string{}, plan.RuntimeAssets...), plan.ManagedToolAssets...) {
		if !validSHA256(checksums[name]) {
			return nil, fmt.Errorf("checksum manifest does not cover required asset %q", name)
		}
	}
	actual, err := fileSHA256(installerPath)
	if err != nil {
		return nil, err
	}
	if actual != plan.InstallerSHA256 {
		return nil, fmt.Errorf("installer SHA-256 mismatch")
	}
	actualManifest, err := fileSHA256(manifestPath)
	if err != nil {
		return nil, err
	}
	if actualManifest != plan.InstallManifestSHA256 {
		return nil, fmt.Errorf("install manifest SHA-256 mismatch")
	}
	if err := os.Chmod(installerPath, 0o700); err != nil {
		return nil, err
	}
	args, err := expandInstallerArgs(plan, checksumPath, manifestPath)
	if err != nil {
		return nil, err
	}
	result := runInstallerCommand(ctx, installerPath, args, temp, 10*time.Minute)
	if !result.OK {
		return nil, fmt.Errorf("compiled installer failed with exit %d: %s", result.ExitCode, strings.TrimSpace(result.Stderr))
	}
	status := inspectRuntime(ctx, c)
	if !status.Ready {
		return nil, fmt.Errorf("installer exited successfully but runtime is not ready: %s", status.Reason)
	}
	return map[string]any{"ok": true, "plan": plan, "installer": result, "runtime": status}, nil
}

func testOverridesEnabled() bool { return os.Getenv("CHENGFENG_VIDEOCUT_ALLOW_TEST_OVERRIDES") == "1" }

func releaseURL(c Contract, asset string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", c.Repository, c.ReleaseTag, asset)
}

func download(ctx context.Context, url, destination string, maxBytes int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Minute}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status %s", response.Status)
	}
	file, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	written, err := io.Copy(file, io.LimitReader(response.Body, maxBytes+1))
	if err != nil {
		return err
	}
	if written > maxBytes {
		return fmt.Errorf("download exceeds size limit")
	}
	return file.Sync()
}

func parseChecksums(text string) (map[string]string, error) {
	result := map[string]string{}
	for lineNumber, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 || !validSHA256(strings.ToLower(fields[0])) {
			return nil, fmt.Errorf("invalid SHA256SUMS line %d", lineNumber+1)
		}
		name := strings.TrimPrefix(fields[1], "*")
		if filepath.Base(name) != name || name == "." {
			return nil, fmt.Errorf("unsafe SHA256SUMS asset name")
		}
		if _, exists := result[name]; exists {
			return nil, fmt.Errorf("duplicate SHA256SUMS asset %q", name)
		}
		result[name] = strings.ToLower(fields[0])
	}
	return result, nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func copyFile(source, destination string, mode os.FileMode) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func expandInstallerArgs(plan InstallPlan, checksumPath, manifestPath string) ([]string, error) {
	replacements := map[string]string{"{targetRoot}": plan.TargetRoot, "{checksumFile}": checksumPath, "{manifestFile}": manifestPath, "{releaseTag}": plan.ReleaseTag, "{releaseVersion}": plan.ReleaseVersion}
	args := make([]string, len(plan.InstallerArguments))
	for i, arg := range plan.InstallerArguments {
		for token, value := range replacements {
			arg = strings.ReplaceAll(arg, token, value)
		}
		if strings.Contains(arg, "{") || strings.ContainsAny(arg, "\x00\r\n") {
			return nil, fmt.Errorf("unsupported installer argument template")
		}
		args[i] = arg
	}
	return args, nil
}
