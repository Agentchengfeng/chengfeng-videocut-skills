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
	RuntimeContract       RuntimeContractReference  `json:"runtimeContract"`
	RuntimeSnapshot       RuntimeContractSnapshot   `json:"-"`
	Delivery              string                    `json:"delivery"`
	Repository            string                    `json:"repository"`
	ReleaseTag            string                    `json:"releaseTag"`
	ReleaseVersion        string                    `json:"releaseVersion"`
	Registry              string                    `json:"registry"`
	DistributionMode      string                    `json:"requiredDistributionMode"`
	LicenseStatus         string                    `json:"requiredLicenseStatus"`
	DefaultTargetRoot     string                    `json:"defaultTargetRoot"`
	Platforms             map[string]PlatformAssets `json:"platforms"`
	StudioCapabilities    map[string]any            `json:"studioCapabilities"`
	Capabilities          map[string]any            `json:"capabilities"`
}

type RuntimeContractReference struct {
	Snapshot   string `json:"snapshot"`
	SHA256     string `json:"sha256"`
	Repository string `json:"repository"`
	Revision   string `json:"revision"`
}

type RuntimeContractSnapshot struct {
	SchemaVersion         int                `json:"schemaVersion"`
	Product               string             `json:"product"`
	RuntimeVersion        string             `json:"runtimeVersion"`
	MinimumRuntimeVersion string             `json:"minimumRuntimeVersion"`
	Capabilities          map[string]any     `json:"capabilities"`
	StudioCapabilities    map[string]any     `json:"studioCapabilities"`
	CLI                   RuntimeCLIContract `json:"cli"`
}

type RuntimeCLIContract struct {
	SchemaVersion         int                              `json:"schemaVersion"`
	EnvelopeSchemaVersion int                              `json:"envelopeSchemaVersion"`
	Commands              map[string]RuntimeCLICommandSpec `json:"commands"`
}

type RuntimeCLICommandSpec struct {
	Public   bool                       `json:"public"`
	Features []RuntimeCLICommandFeature `json:"features"`
}

type RuntimeCLICommandFeature struct {
	Kind       string `json:"kind"`
	Capability string `json:"capability,omitempty"`
	Operation  string `json:"operation,omitempty"`
	JobKind    string `json:"jobKind,omitempty"`
}

type PlatformAssets struct {
	RuntimePackageAsset    string  `json:"runtimePackageAsset"`
	RuntimePackageSHA256   *string `json:"runtimePackageSHA256"`
	RuntimePackageMaxBytes int64   `json:"runtimePackageMaxBytes"`
	NPMPackage             string  `json:"npmPackage"`
	NPMPackageVersion      string  `json:"npmPackageVersion"`
	DistIntegrity          *string `json:"distIntegrity"`
	TarballMaxBytes        int64   `json:"tarballMaxBytes"`
	PackageManifest        string  `json:"packageManifest"`
	InstallerPath          string  `json:"installerPath"`
	InstallerSHA256        *string `json:"installerSHA256"`
	RuntimeLauncher        string  `json:"runtimeLauncher"`
}

type InstallPlan struct {
	Product                string `json:"product"`
	Action                 string `json:"action"`
	RuntimeVersion         string `json:"runtimeVersion"`
	Delivery               string `json:"delivery"`
	Repository             string `json:"repository,omitempty"`
	ReleaseTag             string `json:"releaseTag,omitempty"`
	ReleaseVersion         string `json:"releaseVersion,omitempty"`
	RuntimePackageAsset    string `json:"runtimePackageAsset,omitempty"`
	RuntimePackageSHA256   string `json:"runtimePackageSHA256,omitempty"`
	RuntimePackageMaxBytes int64  `json:"runtimePackageMaxBytes,omitempty"`
	Registry               string `json:"registry"`
	NPMPackage             string `json:"npmPackage"`
	NPMPackageVersion      string `json:"npmPackageVersion"`
	DistIntegrity          string `json:"distIntegrity,omitempty"`
	Platform               string `json:"platform"`
	TarballMaxBytes        int64  `json:"tarballMaxBytes"`
	PackageManifest        string `json:"packageManifest"`
	InstallerPath          string `json:"installerPath"`
	InstallerSHA256        string `json:"installerSHA256,omitempty"`
	DistributionMode       string `json:"distributionMode"`
	LicenseStatus          string `json:"licenseStatus"`
	TargetRoot             string `json:"targetRoot"`
	Impact                 string `json:"impact"`
	ApprovalDigest         string `json:"approvalDigest,omitempty"`
}

var npmPackagePattern = regexp.MustCompile(`^@[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$`)
var assetNamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
var exactVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)
var sriSHA512Pattern = regexp.MustCompile(`^sha512-[A-Za-z0-9+/]{86}==$`)
var gitRevisionPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
var githubRepositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var releaseTagPattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$`)

const runtimeContractRepository = "https://github.com/Agentchengfeng/chengfeng-videocut.git"

func LoadContract() (Contract, error) {
	var c Contract
	decoder := json.NewDecoder(bytes.NewReader(pluginassets.RuntimeRequirements))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&c); err != nil {
		return c, fmt.Errorf("decode embedded runtime requirements: %w", err)
	}
	if c.SchemaVersion != 5 || c.Product == "" || !exactVersionPattern.MatchString(c.RuntimeVersion) || c.MinimumRuntimeVersion == "" || c.Delivery != "github-release" || !githubRepositoryPattern.MatchString(c.Repository) || !releaseTagPattern.MatchString(c.ReleaseTag) || !exactVersionPattern.MatchString(c.ReleaseVersion) || c.DistributionMode == "" || c.LicenseStatus == "" || c.DefaultTargetRoot == "" || len(c.Platforms) == 0 {
		return c, fmt.Errorf("embedded runtime requirements are incomplete")
	}
	if !safeSnapshotPath(c.RuntimeContract.Snapshot) || !validSHA256(c.RuntimeContract.SHA256) || c.RuntimeContract.Repository != runtimeContractRepository || !gitRevisionPattern.MatchString(c.RuntimeContract.Revision) {
		return c, fmt.Errorf("embedded Runtime contract snapshot reference is invalid")
	}
	snapshot, err := loadRuntimeContractSnapshot(c)
	if err != nil {
		return c, err
	}
	for key, assets := range c.Platforms {
		if !assetNamePattern.MatchString(assets.RuntimePackageAsset) || assets.RuntimePackageMaxBytes <= 0 || assets.RuntimePackageMaxBytes > runtimePackageDownloadLimit || assets.RuntimeLauncher == "" || filepath.IsAbs(assets.RuntimeLauncher) || strings.Contains(strings.ReplaceAll(assets.RuntimeLauncher, "\\", "/"), "../") {
			return c, fmt.Errorf("embedded platform contract %s is invalid", key)
		}
		if assets.RuntimePackageSHA256 != nil && !validSHA256(strings.TrimSpace(*assets.RuntimePackageSHA256)) {
			return c, fmt.Errorf("embedded release asset digest %s is invalid", key)
		}
	}
	c.RuntimeSnapshot = snapshot
	c.Capabilities = snapshot.Capabilities
	c.StudioCapabilities = snapshot.StudioCapabilities
	return c, nil
}

func loadRuntimeContractSnapshot(requirements Contract) (RuntimeContractSnapshot, error) {
	if requirements.RuntimeContract.Snapshot != "runtime-contract.snapshot.json" {
		return RuntimeContractSnapshot{}, fmt.Errorf("embedded Runtime contract snapshot path is unsupported")
	}
	sum := sha256.Sum256(pluginassets.RuntimeContractSnapshot)
	if hex.EncodeToString(sum[:]) != requirements.RuntimeContract.SHA256 {
		return RuntimeContractSnapshot{}, fmt.Errorf("embedded Runtime contract snapshot sha256 drifted")
	}
	var snapshot RuntimeContractSnapshot
	decoder := json.NewDecoder(bytes.NewReader(pluginassets.RuntimeContractSnapshot))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&snapshot); err != nil {
		return snapshot, fmt.Errorf("decode embedded Runtime contract snapshot: %w", err)
	}
	if err := validateRuntimeContractSnapshot(requirements, snapshot); err != nil {
		return snapshot, err
	}
	return snapshot, nil
}

func validateRuntimeContractSnapshot(requirements Contract, snapshot RuntimeContractSnapshot) error {
	if snapshot.SchemaVersion != 1 || snapshot.Product != requirements.Product || snapshot.RuntimeVersion != requirements.RuntimeVersion || snapshot.MinimumRuntimeVersion != requirements.MinimumRuntimeVersion || len(snapshot.Capabilities) == 0 || len(snapshot.StudioCapabilities) == 0 {
		return fmt.Errorf("embedded Runtime contract snapshot identity is invalid")
	}
	if snapshot.CLI.SchemaVersion != 1 || snapshot.CLI.EnvelopeSchemaVersion != 1 || len(snapshot.CLI.Commands) == 0 {
		return fmt.Errorf("embedded Runtime CLI contract snapshot is incomplete")
	}
	if !capabilitySubset(snapshot.Capabilities, requiredRuntimeSnapshotCapabilities()) {
		return fmt.Errorf("embedded Runtime capability snapshot is missing required fields")
	}
	if !capabilitySubset(snapshot.StudioCapabilities, requiredRuntimeSnapshotStudioCapabilities()) {
		return fmt.Errorf("embedded Runtime Studio capability snapshot is missing required fields")
	}
	if err := validateRuntimeCommandFeatures(snapshot.CLI.Commands); err != nil {
		return err
	}
	if !capabilitySubset(snapshot.Capabilities, requirements.Capabilities) {
		return fmt.Errorf("embedded Runtime requirements are not a subset of the canonical snapshot")
	}
	if !capabilitySubset(snapshot.StudioCapabilities, requirements.StudioCapabilities) {
		return fmt.Errorf("embedded Runtime Studio requirements are not a subset of the canonical snapshot")
	}
	return nil
}

func requiredRuntimeSnapshotCapabilities() map[string]any {
	return map[string]any{
		"runtimeApiVersion":               float64(1),
		"serviceApiVersion":               float64(1),
		"serviceOperations":               []any{"install", "start", "stop", "restart", "status", "logs", "ensure"},
		"managedStudioService":            true,
		"serviceParentProcessIndependent": true,
		"serviceCrashRestart":             true,
		"durableJobsApiVersion":           float64(1),
		"durableJobKinds":                 []any{"export"},
		"operationAdmissionVersion":       float64(1),
		"operationAuditVersion":           float64(1),
		"operationIdempotencyVersion":     float64(1),
		"editListSchemaVersion":           float64(1),
		"editListOperations":              []any{"move", "trim", "split", "delete", "restore", "delete-range", "restore-snapshot"},
		"managedArollProjection":          true,
		"expectedEditListRevision":        true,
		"projectIngestVersion":            float64(1),
		"transcriptPlaybackPagingVersion": float64(1),
		"cloudTranscriptionProvider":      "volcengine",
		"cloudTranscriptionTaskLocalOnly": true,
	}
}

func requiredRuntimeSnapshotStudioCapabilities() map[string]any {
	return map[string]any{
		"topLevelViews":             []any{"storyboard", "preview", "koubo"},
		"legacyWorkbenchPanel":      false,
		"managedTimelineEditing":    true,
		"managedTimelineOperations": []any{"move", "trim", "split", "delete", "restore", "delete-range", "restore-snapshot"},
	}
}

func validateRuntimeCommandFeatures(commands map[string]RuntimeCLICommandSpec) error {
	required := map[string][]RuntimeCLICommandFeature{
		"transcribe": {
			{Kind: "capability", Capability: "cloudTranscriptionProvider"},
			{Kind: "capability", Capability: "cloudTranscriptionTaskLocalOnly"},
		},
		"project.ingest": {
			{Kind: "capability", Capability: "projectIngestVersion"},
			{Kind: "capability", Capability: "operationAdmissionVersion"},
			{Kind: "capability", Capability: "operationAuditVersion"},
			{Kind: "capability", Capability: "operationIdempotencyVersion"},
		},
		"transcript.playback": {
			{Kind: "capability", Capability: "transcriptPlaybackPagingVersion"},
		},
		"transcript.retranscribe": {
			{Kind: "capability", Capability: "cloudTranscriptionProvider"},
			{Kind: "capability", Capability: "cloudTranscriptionTaskLocalOnly"},
		},
		"cuts.apply": {
			{Kind: "capability", Capability: "expectedEditListRevision"},
			{Kind: "capability", Capability: "editListSchemaVersion"},
		},
		"cuts.set": {
			{Kind: "capability", Capability: "operationAdmissionVersion"},
			{Kind: "capability", Capability: "operationAuditVersion"},
			{Kind: "capability", Capability: "operationIdempotencyVersion"},
		},
		"editList.get": {
			{Kind: "capability", Capability: "editListSchemaVersion"},
		},
		"editList.patch": {
			{Kind: "capability", Capability: "editListSchemaVersion"},
		},
		"export": {
			{Kind: "durable-job", JobKind: "export"},
			{Kind: "capability", Capability: "operationAdmissionVersion"},
			{Kind: "capability", Capability: "operationAuditVersion"},
			{Kind: "capability", Capability: "operationIdempotencyVersion"},
		},
		"job.start": {
			{Kind: "capability", Capability: "durableJobsApiVersion"},
			{Kind: "durable-job", JobKind: "export"},
			{Kind: "capability", Capability: "operationAdmissionVersion"},
			{Kind: "capability", Capability: "operationAuditVersion"},
			{Kind: "capability", Capability: "operationIdempotencyVersion"},
		},
		"job.get": {
			{Kind: "capability", Capability: "durableJobsApiVersion"},
		},
		"job.list": {
			{Kind: "capability", Capability: "durableJobsApiVersion"},
		},
		"job.cancel": {
			{Kind: "capability", Capability: "durableJobsApiVersion"},
		},
	}
	for _, operation := range []string{"install", "start", "stop", "restart", "status", "logs", "ensure"} {
		id := "service." + operation
		required[id] = []RuntimeCLICommandFeature{{Kind: "service", Operation: operation}}
	}
	for id, features := range required {
		command, ok := commands[id]
		if !ok || !command.Public {
			return fmt.Errorf("embedded Runtime CLI command %s is missing or not public", id)
		}
		for _, feature := range features {
			if !runtimeCommandHasFeature(command, feature) {
				return fmt.Errorf("embedded Runtime CLI command %s is missing feature %+v", id, feature)
			}
		}
	}
	return nil
}

func runtimeCommandHasFeature(command RuntimeCLICommandSpec, required RuntimeCLICommandFeature) bool {
	for _, candidate := range command.Features {
		if candidate == required {
			return true
		}
	}
	return false
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
	RunInstaller         installerCommandFunc
	AllowLocalFixture    bool
	RuntimePackageFile   string
	RuntimePackageSHA256 string
	AllowNPMFixture      bool
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
	if c.Delivery == "github-release" {
		digest := ""
		if assets.RuntimePackageSHA256 != nil {
			digest = strings.ToLower(strings.TrimSpace(*assets.RuntimePackageSHA256))
		}
		if testOptions != nil && testOptions.RuntimePackageSHA256 != "" {
			digest = strings.ToLower(strings.TrimSpace(testOptions.RuntimePackageSHA256))
		}
		plan := InstallPlan{
			Product: c.Product, Action: "runtime_install", RuntimeVersion: c.RuntimeVersion,
			Delivery: c.Delivery, Repository: c.Repository, ReleaseTag: c.ReleaseTag, ReleaseVersion: c.ReleaseVersion,
			Platform: key, RuntimePackageAsset: assets.RuntimePackageAsset, RuntimePackageSHA256: digest,
			RuntimePackageMaxBytes: assets.RuntimePackageMaxBytes, DistributionMode: c.DistributionMode,
			LicenseStatus: c.LicenseStatus, TargetRoot: root,
			Impact: "从固定 GitHub Release 下载一个精确版本且锁定 SHA-256 的平台 Product Runtime 安装包；安装器离线安装 Runtime、受管 Bun、FFmpeg 和 FFprobe。Headless Shell 仍只在用户确认实际导出时由 Runtime 按固定版本和摘要获取并缓存。写入 Product Runtime 目录，可能替换 current 版本。",
		}
		if !validSHA256(plan.RuntimePackageSHA256) {
			return plan, nil
		}
		var planErr error
		plan.ApprovalDigest, planErr = approvalDigest(plan)
		return plan, planErr
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

func safeSnapshotPath(value string) bool {
	if value == "" || strings.Contains(value, "\\") || strings.HasPrefix(value, "/") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(value))
	return clean == value && clean != "." && clean != ".." && !strings.Contains(clean, "/") && strings.HasSuffix(clean, ".json")
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
