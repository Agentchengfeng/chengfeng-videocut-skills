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
	Repository            string                    `json:"repository"`
	ReleaseTag            string                    `json:"releaseTag"`
	ReleaseVersion        string                    `json:"releaseVersion"`
	MinimumRuntimeVersion string                    `json:"minimumRuntimeVersion"`
	DefaultTargetRoot     string                    `json:"defaultTargetRoot"`
	Platforms             map[string]PlatformAssets `json:"platforms"`
	StudioCapabilities    map[string]any            `json:"studioCapabilities"`
	Capabilities          map[string]any            `json:"capabilities"`
}

type PlatformAssets struct {
	RuntimePackageAsset  string  `json:"runtimePackageAsset"`
	RuntimePackageSHA256 *string `json:"runtimePackageSHA256"`
	RuntimeLauncher      string  `json:"runtimeLauncher"`
}

type InstallPlan struct {
	Product              string `json:"product"`
	Action               string `json:"action"`
	ReleaseTag           string `json:"releaseTag"`
	ReleaseVersion       string `json:"releaseVersion"`
	Platform             string `json:"platform"`
	RuntimePackageAsset  string `json:"runtimePackageAsset"`
	RuntimePackageSHA256 string `json:"runtimePackageSHA256,omitempty"`
	TargetRoot           string `json:"targetRoot"`
	Impact               string `json:"impact"`
	ApprovalDigest       string `json:"approvalDigest,omitempty"`
}

var assetNamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func LoadContract() (Contract, error) {
	var c Contract
	decoder := json.NewDecoder(bytes.NewReader(pluginassets.RuntimeRequirements))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return c, fmt.Errorf("decode embedded runtime requirements: %w", err)
	}
	if c.SchemaVersion != 3 || c.Product == "" || c.Repository == "" || c.ReleaseTag == "" || c.ReleaseVersion == "" || c.MinimumRuntimeVersion == "" || c.DefaultTargetRoot == "" || len(c.Platforms) == 0 {
		return c, fmt.Errorf("embedded runtime requirements are incomplete")
	}
	for key, assets := range c.Platforms {
		if !assetNamePattern.MatchString(assets.RuntimePackageAsset) || assets.RuntimeLauncher == "" || filepath.IsAbs(assets.RuntimeLauncher) || strings.Contains(strings.ReplaceAll(assets.RuntimeLauncher, "\\", "/"), "../") {
			return c, fmt.Errorf("embedded platform contract %s is invalid", key)
		}
		if assets.RuntimePackageSHA256 != nil && !validSHA256(strings.TrimSpace(*assets.RuntimePackageSHA256)) {
			return c, fmt.Errorf("embedded platform package digest %s is invalid", key)
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
	RuntimePackageSHA256 string
	RuntimePackageFile   string
	RunInstaller         installerCommandFunc
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
	digest := ""
	if assets.RuntimePackageSHA256 != nil {
		digest = strings.ToLower(strings.TrimSpace(*assets.RuntimePackageSHA256))
	}
	if testOptions != nil && testOptions.RuntimePackageSHA256 != "" {
		digest = strings.ToLower(strings.TrimSpace(testOptions.RuntimePackageSHA256))
	}
	plan := InstallPlan{
		Product: c.Product, Action: "runtime_install", ReleaseTag: c.ReleaseTag,
		ReleaseVersion: c.ReleaseVersion, Platform: key, RuntimePackageAsset: assets.RuntimePackageAsset,
		RuntimePackageSHA256: digest, TargetRoot: root,
		Impact: "下载一个已锁定 SHA-256 的 Product Runtime 安装包；包内包含 Runtime、受管 Bun、FFmpeg 和 FFprobe，安装器只在本地解包和安装，不会再下载依赖。Headless Shell 不属于安装包；只有用户确认实际导出时，Runtime 才会按固定版本和 SHA-256 获取、校验并缓存它。写入 Product Runtime 目录，可能替换 current 版本。",
	}
	if !validSHA256(plan.RuntimePackageSHA256) {
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
