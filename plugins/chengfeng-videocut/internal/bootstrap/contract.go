package bootstrap

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	pluginassets "github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut"
)

type Contract struct {
	SchemaVersion         int                       `json:"schemaVersion"`
	Product               string                    `json:"product"`
	RuntimeVersion        string                    `json:"runtimeVersion"`
	MinimumRuntimeVersion string                    `json:"minimumRuntimeVersion"`
	Registry              string                    `json:"registry"`
	DistributionMode      string                    `json:"requiredDistributionMode"`
	LicenseStatus         string                    `json:"requiredLicenseStatus"`
	DefaultTargetRoot     string                    `json:"defaultTargetRoot"`
	Platforms             map[string]PlatformAssets `json:"platforms"`
	StudioCapabilities    map[string]any            `json:"studioCapabilities"`
	Capabilities          map[string]any            `json:"capabilities"`
}

type PlatformAssets struct {
	NPMPackage        string  `json:"npmPackage"`
	NPMPackageVersion string  `json:"npmPackageVersion"`
	DistIntegrity     *string `json:"distIntegrity"`
	TarballMaxBytes   int64   `json:"tarballMaxBytes"`
	PackageManifest   string  `json:"packageManifest"`
	InstallerPath     string  `json:"installerPath"`
	InstallerSHA256   *string `json:"installerSHA256"`
	RuntimeLauncher   string  `json:"runtimeLauncher"`
}

type InstallPlan struct {
	Product           string `json:"product"`
	Action            string `json:"action"`
	RuntimeVersion    string `json:"runtimeVersion"`
	Registry          string `json:"registry"`
	NPMPackage        string `json:"npmPackage"`
	NPMPackageVersion string `json:"npmPackageVersion"`
	DistIntegrity     string `json:"distIntegrity,omitempty"`
	Platform          string `json:"platform"`
	TarballMaxBytes   int64  `json:"tarballMaxBytes"`
	PackageManifest   string `json:"packageManifest"`
	InstallerPath     string `json:"installerPath"`
	InstallerSHA256   string `json:"installerSHA256,omitempty"`
	DistributionMode  string `json:"distributionMode"`
	LicenseStatus     string `json:"licenseStatus"`
	TargetRoot        string `json:"targetRoot"`
	Impact            string `json:"impact"`
	ApprovalDigest    string `json:"approvalDigest,omitempty"`
}

var npmPackagePattern = regexp.MustCompile(`^@[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$`)
var exactVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
var sriSHA512Pattern = regexp.MustCompile(`^sha512-[A-Za-z0-9+/]{86}==$`)

func LoadContract() (Contract, error) {
	var c Contract
	decoder := json.NewDecoder(bytes.NewReader(pluginassets.RuntimeRequirements))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return c, fmt.Errorf("decode embedded runtime requirements: %w", err)
	}
	if c.SchemaVersion != 4 || c.Product == "" || !exactVersionPattern.MatchString(c.RuntimeVersion) || c.MinimumRuntimeVersion == "" || c.Registry == "" || c.DistributionMode == "" || c.LicenseStatus == "" || c.DefaultTargetRoot == "" || len(c.Platforms) == 0 {
		return c, fmt.Errorf("embedded runtime requirements are incomplete")
	}
	if !strings.HasPrefix(c.Registry, "https://") || strings.HasSuffix(c.Registry, "/") {
		return c, fmt.Errorf("embedded npm registry must be an HTTPS origin without a trailing slash")
	}
	for key, assets := range c.Platforms {
		if !npmPackagePattern.MatchString(assets.NPMPackage) || !exactVersionPattern.MatchString(assets.NPMPackageVersion) || assets.NPMPackageVersion != c.RuntimeVersion || assets.TarballMaxBytes <= 0 || assets.TarballMaxBytes > runtimePackageDownloadLimit || !safePackagePath(assets.PackageManifest) || !safePackagePath(assets.InstallerPath) || assets.PackageManifest != "package/chengfeng-videocut-runtime-package.json" || !strings.HasPrefix(assets.InstallerPath, "package/payload/") || assets.RuntimeLauncher == "" || filepath.IsAbs(assets.RuntimeLauncher) || strings.Contains(strings.ReplaceAll(assets.RuntimeLauncher, "\\", "/"), "../") {
			return c, fmt.Errorf("embedded platform contract %s is invalid", key)
		}
		if assets.DistIntegrity != nil && !validSHA512SRI(strings.TrimSpace(*assets.DistIntegrity)) {
			return c, fmt.Errorf("embedded npm integrity %s is invalid", key)
		}
		if assets.InstallerSHA256 != nil && !validSHA256(strings.TrimSpace(*assets.InstallerSHA256)) {
			return c, fmt.Errorf("embedded installer digest %s is invalid", key)
		}
	}
	return c, nil
}

func platformKey() string {
	osName := runtime.GOOS
	arch := runtime.GOARCH
	if osName == "windows" {
		return "windows-" + arch
	}
	return osName + "-" + arch
}

func runtimeRoot(c Contract) (string, error) {
	if explicit := strings.TrimSpace(os.Getenv("CHENGFENG_VIDEOCUT_HOME")); explicit != "" {
		return filepath.Abs(explicit)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}
	target := strings.TrimSpace(c.DefaultTargetRoot)
	if strings.HasPrefix(target, "~/") {
		return filepath.Join(home, filepath.FromSlash(strings.TrimPrefix(target, "~/"))), nil
	}
	if filepath.IsAbs(target) {
		return filepath.Clean(target), nil
	}
	return "", fmt.Errorf("defaultTargetRoot must be absolute or home-relative")
}

func BuildInstallPlan(c Contract) (InstallPlan, error) {
	return buildInstallPlan(c, nil)
}

type installTestOptions struct {
	RunInstaller      installerCommandFunc
	AllowLocalFixture bool
}

func buildInstallPlan(c Contract, testOptions *installTestOptions) (InstallPlan, error) {
	key := platformKey()
	assets, ok := c.Platforms[key]
	if !ok {
		return InstallPlan{}, fmt.Errorf("unsupported platform %s", key)
	}
	root, err := runtimeRoot(c)
	if err != nil {
		return InstallPlan{}, err
	}
	integrity := ""
	if assets.DistIntegrity != nil {
		integrity = strings.TrimSpace(*assets.DistIntegrity)
	}
	installerDigest := ""
	if assets.InstallerSHA256 != nil {
		installerDigest = strings.ToLower(strings.TrimSpace(*assets.InstallerSHA256))
	}
	plan := InstallPlan{
		Product: c.Product, Action: "runtime_install", RuntimeVersion: c.RuntimeVersion,
		Registry: c.Registry, NPMPackage: assets.NPMPackage, NPMPackageVersion: assets.NPMPackageVersion,
		DistIntegrity: integrity, Platform: key, TarballMaxBytes: assets.TarballMaxBytes,
		PackageManifest: assets.PackageManifest, InstallerPath: assets.InstallerPath,
		InstallerSHA256: installerDigest, DistributionMode: c.DistributionMode,
		LicenseStatus: c.LicenseStatus, TargetRoot: root,
		Impact: "从固定 npm Registry 下载一个精确版本且锁定 sha512 integrity 的平台 Product Runtime 包；Plugin 原生解包，不调用 npm、Node 或 lifecycle scripts。包内安装器包含 Runtime、受管 Bun、FFmpeg 和 FFprobe；Headless Shell 仍只在用户确认实际导出时由 Runtime 按固定版本和摘要获取并缓存。写入 Product Runtime 目录，可能替换 current 版本。",
	}
	if !validSHA512SRI(plan.DistIntegrity) || !validSHA256(plan.InstallerSHA256) {
		return plan, nil
	}
	plan.ApprovalDigest, err = approvalDigest(plan)
	return plan, err
}

func approvalDigest(plan InstallPlan) (string, error) {
	canonical := plan
	canonical.ApprovalDigest = ""
	data, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func validSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && strings.ToLower(value) == value
}

func validSHA512SRI(value string) bool { return sriSHA512Pattern.MatchString(value) }

func safePackagePath(value string) bool {
	if value == "" || strings.Contains(value, "\\") || strings.HasPrefix(value, "/") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(value))
	return clean == value && clean != "." && clean != ".." && !strings.HasPrefix(clean, "../") && strings.HasPrefix(clean, "package/")
}

func launcherPath(c Contract) (string, error) {
	assets, ok := c.Platforms[platformKey()]
	if !ok {
		return "", fmt.Errorf("unsupported platform %s", platformKey())
	}
	root, err := runtimeRoot(c)
	if err != nil {
		return "", err
	}
	return filepath.Join(root, filepath.FromSlash(strings.ReplaceAll(assets.RuntimeLauncher, "\\", "/"))), nil
}

func validateManagedLauncher(c Contract) (string, error) {
	root, err := runtimeRoot(c)
	if err != nil {
		return "", err
	}
	launcher, err := launcherPath(c)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, launcher)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("runtime launcher escapes managed root")
	}
	current := root
	parts := strings.Split(rel, string(filepath.Separator))
	for i, part := range append([]string{""}, parts...) {
		if i > 0 {
			current = filepath.Join(current, part)
		}
		info, statErr := os.Lstat(current)
		if statErr != nil {
			return "", fmt.Errorf("managed runtime launcher is absent: %w", statErr)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("managed runtime path must not contain symlinks: %s", current)
		}
		if i < len(parts) && !info.IsDir() {
			return "", fmt.Errorf("managed runtime parent is not a directory: %s", current)
		}
		if i == len(parts) && (!info.Mode().IsRegular() || (runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0)) {
			return "", fmt.Errorf("managed runtime launcher is not an executable regular file")
		}
		if i == len(parts) {
			if err := validateSingleLink(current, info); err != nil {
				return "", err
			}
		}
	}
	return launcher, nil
}
