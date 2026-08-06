package bootstrap

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
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
	ChecksumAsset         string                    `json:"checksumAsset"`
	InstallManifestAsset  string                    `json:"installManifestAsset"`
	InstallManifestSHA256 *string                   `json:"installManifestSHA256"`
	DefaultTargetRoot     string                    `json:"defaultTargetRoot"`
	InstallerArguments    []string                  `json:"installerArguments"`
	Platforms             map[string]PlatformAssets `json:"platforms"`
	Capabilities          map[string]any            `json:"capabilities"`
}

type PlatformAssets struct {
	InstallerAsset    string   `json:"installerAsset"`
	InstallerSHA256   *string  `json:"installerSHA256"`
	RuntimeLauncher   string   `json:"runtimeLauncher"`
	RuntimeAssets     []string `json:"runtimeAssets"`
	ManagedToolAssets []string `json:"managedToolAssets"`
}

type InstallPlan struct {
	Product               string   `json:"product"`
	Action                string   `json:"action"`
	ReleaseTag            string   `json:"releaseTag"`
	ReleaseVersion        string   `json:"releaseVersion"`
	Platform              string   `json:"platform"`
	InstallerAsset        string   `json:"installerAsset"`
	InstallerSHA256       string   `json:"installerSHA256,omitempty"`
	ChecksumAsset         string   `json:"checksumAsset"`
	InstallManifestAsset  string   `json:"installManifestAsset"`
	InstallManifestSHA256 string   `json:"installManifestSHA256,omitempty"`
	TargetRoot            string   `json:"targetRoot"`
	RuntimeAssets         []string `json:"runtimeAssets"`
	ManagedToolAssets     []string `json:"managedToolAssets"`
	InstallerArguments    []string `json:"installerArguments"`
	Impact                string   `json:"impact"`
	ApprovalDigest        string   `json:"approvalDigest,omitempty"`
}

var assetNamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

func LoadContract() (Contract, error) {
	var c Contract
	if err := json.Unmarshal(pluginassets.RuntimeRequirements, &c); err != nil {
		return c, fmt.Errorf("decode embedded runtime requirements: %w", err)
	}
	if c.SchemaVersion != 2 || c.Product == "" || c.Repository == "" || c.ReleaseTag == "" || c.ReleaseVersion == "" || c.ChecksumAsset == "" {
		return c, fmt.Errorf("embedded runtime requirements are incomplete")
	}
	if !assetNamePattern.MatchString(c.ChecksumAsset) || !assetNamePattern.MatchString(c.InstallManifestAsset) || len(c.InstallerArguments) == 0 {
		return c, fmt.Errorf("embedded install asset contract is invalid")
	}
	for key, assets := range c.Platforms {
		if !assetNamePattern.MatchString(assets.InstallerAsset) || len(assets.RuntimeAssets) == 0 || len(assets.ManagedToolAssets) == 0 || filepath.IsAbs(assets.RuntimeLauncher) || strings.Contains(strings.ReplaceAll(assets.RuntimeLauncher, "\\", "/"), "../") {
			return c, fmt.Errorf("embedded platform contract %s is invalid", key)
		}
		for _, name := range append(append([]string{}, assets.RuntimeAssets...), assets.ManagedToolAssets...) {
			if !assetNamePattern.MatchString(name) {
				return c, fmt.Errorf("embedded platform asset %q is invalid", name)
			}
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
	InstallerSHA256       string
	InstallManifestSHA256 string
	InstallerFile         string
	ChecksumFile          string
	ManifestFile          string
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
	if assets.InstallerSHA256 != nil {
		digest = strings.ToLower(strings.TrimSpace(*assets.InstallerSHA256))
	}
	if testOptions != nil && testOptions.InstallerSHA256 != "" {
		digest = strings.ToLower(strings.TrimSpace(testOptions.InstallerSHA256))
	}
	manifestDigest := ""
	if c.InstallManifestSHA256 != nil {
		manifestDigest = strings.ToLower(strings.TrimSpace(*c.InstallManifestSHA256))
	}
	if testOptions != nil && testOptions.InstallManifestSHA256 != "" {
		manifestDigest = strings.ToLower(strings.TrimSpace(testOptions.InstallManifestSHA256))
	}
	plan := InstallPlan{
		Product: c.Product, Action: "runtime_install", ReleaseTag: c.ReleaseTag,
		ReleaseVersion: c.ReleaseVersion, Platform: key, InstallerAsset: assets.InstallerAsset,
		InstallerSHA256: digest, ChecksumAsset: c.ChecksumAsset, InstallManifestAsset: c.InstallManifestAsset, InstallManifestSHA256: manifestDigest, TargetRoot: root,
		RuntimeAssets:      append([]string(nil), assets.RuntimeAssets...),
		ManagedToolAssets:  append([]string(nil), assets.ManagedToolAssets...),
		InstallerArguments: append([]string(nil), c.InstallerArguments...),
		Impact:             "下载并执行已锁定摘要的官方编译安装器；写入 Product Runtime 目录，可能替换 current 版本与托管工具。",
	}
	if !validSHA256(plan.InstallerSHA256) || !validSHA256(plan.InstallManifestSHA256) {
		return plan, nil
	}
	plan.ApprovalDigest, err = approvalDigest(plan)
	return plan, err
}

func approvalDigest(plan InstallPlan) (string, error) {
	canonical := plan
	canonical.ApprovalDigest = ""
	sort.Strings(canonical.RuntimeAssets)
	sort.Strings(canonical.ManagedToolAssets)
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
