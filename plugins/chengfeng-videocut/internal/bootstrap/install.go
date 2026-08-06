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

type installerCommandFunc func(context.Context, string, []string, string, time.Duration) CommandResult

const runtimePackageDownloadLimit int64 = 2 << 30

func installRuntime(ctx context.Context, c Contract, approval string) (map[string]any, error) {
	return installRuntimeWithOptions(ctx, c, approval, nil)
}

func installRuntimeWithOptions(ctx context.Context, c Contract, approval string, testOptions *installTestOptions) (map[string]any, error) {
	// One bounded context covers the single Runtime package download, its local installer,
	// and the final Runtime readback. It remains below the MCP host's 1201s
	// boundary while allowing a real cold install to exceed the CLI's 9m budget.
	callCtx, cancel := context.WithTimeout(ctx, runtimeInstallCallTimeout)
	defer cancel()
	plan, err := buildInstallPlan(c, testOptions)
	if err != nil {
		return nil, err
	}
	if !validSHA256(plan.RuntimePackageSHA256) || plan.ApprovalDigest == "" {
		return nil, fmt.Errorf("Runtime %s release package is not locked: package digest is unpublished; installation is unavailable", plan.ReleaseVersion)
	}
	if !validSHA256(approval) || approval != plan.ApprovalDigest {
		return nil, fmt.Errorf("approvalDigest does not match the current release, platform, target, assets, and impact")
	}
	temp, err := os.MkdirTemp("", "chengfeng-videocut-installer-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(temp)
	runtimePackagePath := filepath.Join(temp, filepath.Base(plan.RuntimePackageAsset))
	if testOptions != nil {
		if testOptions.RuntimePackageFile != "" {
			if err := copyFile(testOptions.RuntimePackageFile, runtimePackagePath, 0o700); err != nil {
				return nil, err
			}
		}
	}
	if _, err := os.Stat(runtimePackagePath); err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("inspect Runtime package: %w", err)
		}
		if err := download(callCtx, releaseURL(c, plan.RuntimePackageAsset), runtimePackagePath, runtimePackageDownloadLimit); err != nil {
			return nil, fmt.Errorf("download Runtime package: %w", err)
		}
	}
	actual, err := fileSHA256(runtimePackagePath)
	if err != nil {
		return nil, err
	}
	if actual != plan.RuntimePackageSHA256 {
		return nil, fmt.Errorf("Runtime package SHA-256 mismatch")
	}
	if err := os.Chmod(runtimePackagePath, 0o700); err != nil {
		return nil, err
	}
	args := []string{"--target-root", plan.TargetRoot, "--ensure-service", "--json"}
	runInstaller := installerCommandFunc(runInstallerCommand)
	if testOptions != nil && testOptions.RunInstaller != nil {
		runInstaller = testOptions.RunInstaller
	}
	result := runInstaller(callCtx, runtimePackagePath, args, temp, runtimeInstallerTimeout)
	if !result.OK {
		return nil, fmt.Errorf("Runtime package installer failed with exit %d: %s", result.ExitCode, strings.TrimSpace(result.Stderr))
	}
	if err := callCtx.Err(); err != nil {
		return nil, fmt.Errorf("runtime install call exceeded its bounded deadline before final readback: %w", err)
	}
	status := inspectRuntime(callCtx, c)
	if !status.Ready {
		return nil, fmt.Errorf("installer exited successfully but runtime is not ready: %s", status.Reason)
	}
	return map[string]any{"ok": true, "plan": plan, "installer": result, "runtime": status}, nil
}

func releaseURL(c Contract, asset string) string {
	return fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", c.Repository, c.ReleaseTag, asset)
}

func download(ctx context.Context, url, destination string, maxBytes int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := &http.Client{}
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
