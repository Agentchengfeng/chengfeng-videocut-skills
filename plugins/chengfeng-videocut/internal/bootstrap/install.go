package bootstrap

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type installerCommandFunc func(context.Context, string, []string, string, time.Duration) CommandResult

const (
	runtimePackageDownloadLimit int64 = 2 << 30
	runtimePackageExtractLimit  int64 = 4 << 30
	runtimeMetadataLimit        int64 = 1 << 20
	runtimeManifestLimit        int64 = 1 << 20
	runtimePackageEntryLimit          = 32
)

var runtimePackageLegalFiles = []string{
	"LICENSES.md", "LICENSE", "NOTICE.md", "MODIFICATIONS.md",
	"THIRD_PARTY_NOTICES.md", "THIRD_PARTY_LICENSES.md",
	"LICENSES/HyperFrames-Apache-2.0.txt",
}

type npmVersionMetadata struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Dist    struct {
		Integrity string `json:"integrity"`
		Tarball   string `json:"tarball"`
	} `json:"dist"`
}

type npmPackageJSON struct {
	Name          string            `json:"name"`
	Version       string            `json:"version"`
	Description   string            `json:"description"`
	License       string            `json:"license"`
	OS            []string          `json:"os"`
	CPU           []string          `json:"cpu"`
	Files         []string          `json:"files"`
	PublishConfig map[string]string `json:"publishConfig"`
	Private       *bool             `json:"private"`
}

type runtimePackageManifest struct {
	SchemaVersion    int                `json:"schemaVersion"`
	Product          string             `json:"product"`
	ProductVersion   string             `json:"productVersion"`
	PlatformKey      string             `json:"platformKey"`
	NPMPackage       manifestNPMPackage `json:"npmPackage"`
	DistributionMode string             `json:"distributionMode"`
	LicenseStatus    string             `json:"licenseStatus"`
	LicenseNote      string             `json:"licenseNote"`
	Legal            packageLegal       `json:"legal"`
	SBOM             packageSBOM        `json:"sbom"`
	Installer        packageInstaller   `json:"installer"`
}

type packageFileRecord struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}
type packageLegal struct {
	Files []packageFileRecord `json:"files"`
}
type packageSBOM struct {
	Path   string `json:"path"`
	Format string `json:"format"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type manifestNPMPackage struct {
	Name    string   `json:"name"`
	Version string   `json:"version"`
	OS      []string `json:"os"`
	CPU     []string `json:"cpu"`
}

type packageInstaller struct {
	Asset      string `json:"asset"`
	Path       string `json:"path"`
	SHA256     string `json:"sha256"`
	Size       int64  `json:"size"`
	Executable bool   `json:"executable"`
}

func installRuntime(ctx context.Context, c Contract, approval string) (map[string]any, error) {
	return installRuntimeWithOptions(ctx, c, approval, nil)
}

func installRuntimeWithOptions(ctx context.Context, c Contract, approval string, testOptions *installTestOptions) (map[string]any, error) {
	callCtx, cancel := context.WithTimeout(ctx, runtimeInstallCallTimeout)
	defer cancel()
	plan, err := buildInstallPlan(c, testOptions)
	if err != nil {
		return nil, err
	}
	if !validSHA512SRI(plan.DistIntegrity) || !validSHA256(plan.InstallerSHA256) || plan.ApprovalDigest == "" {
		return nil, fmt.Errorf("Runtime %s npm package is not locked: dist.integrity or installer digest is unpublished; installation is unavailable", plan.RuntimeVersion)
	}
	if !validSHA256(approval) || approval != plan.ApprovalDigest {
		return nil, fmt.Errorf("approvalDigest does not match the current registry, package, version, integrity, platform, target, distribution policy, and impact")
	}
	temp, err := os.MkdirTemp("", "chengfeng-videocut-npm-runtime-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(temp)

	metadata, err := fetchNPMVersionMetadata(callCtx, plan)
	if err != nil {
		return nil, fmt.Errorf("fetch exact npm package metadata: %w", err)
	}
	if metadata.Name != plan.NPMPackage || metadata.Version != plan.NPMPackageVersion || metadata.Dist.Integrity != plan.DistIntegrity {
		return nil, fmt.Errorf("npm registry metadata does not match the approved package name, version, and integrity")
	}
	tarballURL, err := validateTarballURL(plan.Registry, metadata.Dist.Tarball)
	if err != nil {
		return nil, err
	}
	tarballPath := filepath.Join(temp, "runtime-package.tgz")
	if err := download(callCtx, tarballURL, tarballPath, plan.TarballMaxBytes); err != nil {
		return nil, fmt.Errorf("download npm Runtime tarball: %w", err)
	}
	if err := verifySHA512SRI(tarballPath, plan.DistIntegrity); err != nil {
		return nil, fmt.Errorf("verify npm Runtime tarball: %w", err)
	}
	extractRoot := filepath.Join(temp, "unpacked")
	if err := os.Mkdir(extractRoot, 0o700); err != nil {
		return nil, err
	}
	if err := extractRuntimePackage(tarballPath, extractRoot, plan); err != nil {
		return nil, fmt.Errorf("extract npm Runtime tarball: %w", err)
	}
	allowLocalFixture := testOptions != nil && testOptions.AllowLocalFixture
	manifest, err := validateRuntimePackage(extractRoot, plan, allowLocalFixture)
	if err != nil {
		return nil, fmt.Errorf("validate npm Runtime package: %w", err)
	}
	installerPath := filepath.Join(extractRoot, filepath.FromSlash(plan.InstallerPath))
	if err := os.Chmod(installerPath, 0o700); err != nil {
		return nil, err
	}
	args := []string{"--target-root", plan.TargetRoot, "--ensure-service", "--json"}
	runInstaller := installerCommandFunc(runInstallerCommand)
	if testOptions != nil && testOptions.RunInstaller != nil {
		runInstaller = testOptions.RunInstaller
	}
	result := runInstaller(callCtx, installerPath, args, extractRoot, runtimeInstallerTimeout)
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
	return map[string]any{"ok": true, "plan": plan, "packageManifest": manifest, "installer": result, "runtime": status}, nil
}

func fetchNPMVersionMetadata(ctx context.Context, plan InstallPlan) (npmVersionMetadata, error) {
	var metadata npmVersionMetadata
	endpoint, err := registryVersionURL(plan.Registry, plan.NPMPackage, plan.NPMPackageVersion)
	if err != nil {
		return metadata, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return metadata, err
	}
	response, err := registryHTTPClient().Do(req)
	if err != nil {
		return metadata, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return metadata, fmt.Errorf("unexpected HTTP status %s", response.Status)
	}
	limited := io.LimitReader(response.Body, runtimeMetadataLimit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return metadata, err
	}
	if int64(len(data)) > runtimeMetadataLimit {
		return metadata, fmt.Errorf("npm metadata exceeds size limit")
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		return metadata, fmt.Errorf("decode npm metadata: %w", err)
	}
	return metadata, nil
}

func registryVersionURL(registry, packageName, version string) (string, error) {
	base, err := url.Parse(registry)
	if err != nil || base.Scheme == "" || base.Host == "" || base.RawQuery != "" || base.Fragment != "" || (base.Scheme != "https" && !isLoopbackHTTP(base)) {
		return "", fmt.Errorf("invalid npm registry origin")
	}
	if !npmPackagePattern.MatchString(packageName) || !exactVersionPattern.MatchString(version) {
		return "", fmt.Errorf("npm package name and version must be exact")
	}
	return strings.TrimSuffix(registry, "/") + "/" + url.PathEscape(packageName) + "/" + url.PathEscape(version), nil
}

func validateTarballURL(registry, tarball string) (string, error) {
	base, err := url.Parse(registry)
	if err != nil {
		return "", err
	}
	candidate, err := url.Parse(tarball)
	if err != nil || !candidate.IsAbs() || candidate.User != nil || candidate.RawQuery != "" || candidate.Fragment != "" {
		return "", fmt.Errorf("npm tarball URL is invalid")
	}
	if candidate.Scheme != base.Scheme || !strings.EqualFold(candidate.Host, base.Host) {
		return "", fmt.Errorf("npm tarball URL must remain on the approved registry origin")
	}
	return candidate.String(), nil
}

func registryHTTPClient() *http.Client {
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("registry redirects are not allowed") }}
}

func isLoopbackHTTP(value *url.URL) bool {
	host := value.Hostname()
	return value.Scheme == "http" && (host == "127.0.0.1" || host == "::1" || strings.EqualFold(host, "localhost"))
}

func verifySHA512SRI(path, expected string) error {
	if !validSHA512SRI(expected) {
		return fmt.Errorf("invalid sha512 integrity")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha512.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := "sha512-" + base64.StdEncoding.EncodeToString(hash.Sum(nil))
	if actual != expected {
		return fmt.Errorf("dist.integrity mismatch")
	}
	return nil
}

func extractRuntimePackage(tarballPath, destination string, plan InstallPlan) error {
	file, err := os.Open(tarballPath)
	if err != nil {
		return err
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	allowedFiles := map[string]bool{
		"package/package.json": false,
		plan.PackageManifest:   false,
		plan.InstallerPath:     false,
	}
	for _, path := range runtimePackageLegalFiles {
		allowedFiles["package/"+path] = false
	}
	allowedFiles["package/SBOM.spdx.json"] = false
	allowedDirs := map[string]bool{"package": true, "package/": true, "package/payload": true, "package/payload/": true, "package/LICENSES": true, "package/LICENSES/": true}
	seen := map[string]bool{}
	var total int64
	entries := 0
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		entries++
		if entries > runtimePackageEntryLimit {
			return fmt.Errorf("tarball has too many entries")
		}
		name := strings.TrimPrefix(header.Name, "./")
		if !safePackagePath(strings.TrimSuffix(name, "/")) || seen[name] {
			return fmt.Errorf("unsafe or duplicate tar entry %q", header.Name)
		}
		seen[name] = true
		switch header.Typeflag {
		case tar.TypeDir:
			if !allowedDirs[name] {
				return fmt.Errorf("unexpected directory entry %q", name)
			}
			if err := os.MkdirAll(filepath.Join(destination, filepath.FromSlash(strings.TrimSuffix(name, "/"))), 0o700); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if _, ok := allowedFiles[name]; !ok {
				return fmt.Errorf("unexpected file entry %q", name)
			}
			if header.Size < 0 || total > runtimePackageExtractLimit-header.Size {
				return fmt.Errorf("tarball extracted size exceeds limit")
			}
			total += header.Size
			outputPath := filepath.Join(destination, filepath.FromSlash(name))
			if err := os.MkdirAll(filepath.Dir(outputPath), 0o700); err != nil {
				return err
			}
			output, err := os.OpenFile(outputPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
			if err != nil {
				return err
			}
			written, copyErr := io.CopyN(output, reader, header.Size)
			closeErr := output.Close()
			if copyErr != nil || written != header.Size {
				return fmt.Errorf("extract %s: %w", name, copyErr)
			}
			if closeErr != nil {
				return closeErr
			}
			allowedFiles[name] = true
		default:
			return fmt.Errorf("tar entry %q has forbidden link or special type %d", name, header.Typeflag)
		}
	}
	for name, found := range allowedFiles {
		if !found {
			return fmt.Errorf("required package entry %q is absent", name)
		}
	}
	return nil
}

func validateRuntimePackage(root string, plan InstallPlan, allowLocalFixture bool) (runtimePackageManifest, error) {
	var manifest runtimePackageManifest
	packageJSONPath := filepath.Join(root, "package", "package.json")
	packageData, err := readBoundedFile(packageJSONPath, runtimeManifestLimit)
	if err != nil {
		return manifest, err
	}
	var packageJSON npmPackageJSON
	packageDecoder := json.NewDecoder(strings.NewReader(string(packageData)))
	packageDecoder.DisallowUnknownFields()
	if err := packageDecoder.Decode(&packageJSON); err != nil {
		return manifest, err
	}
	if packageDecoder.Decode(&struct{}{}) != io.EOF {
		return manifest, fmt.Errorf("package.json trailing JSON is not allowed")
	}
	expectedOS, expectedCPU := npmPlatformValues(plan.Platform)
	expectedFiles := []string{strings.TrimPrefix(plan.PackageManifest, "package/")}
	expectedFiles = append(expectedFiles, runtimePackageLegalFiles...)
	expectedFiles = append(expectedFiles, "SBOM.spdx.json", strings.TrimPrefix(plan.InstallerPath, "package/"))
	formalPublish := packageJSON.Private == nil && len(packageJSON.PublishConfig) == 1 && packageJSON.PublishConfig["access"] == "public"
	localPrivate := allowLocalFixture && packageJSON.Private != nil && *packageJSON.Private && len(packageJSON.PublishConfig) == 0
	if packageJSON.Name != plan.NPMPackage || packageJSON.Version != plan.NPMPackageVersion || packageJSON.Description == "" || packageJSON.License != "SEE LICENSE IN LICENSES.md" || !sameStrings(packageJSON.OS, []string{expectedOS}) || !sameStrings(packageJSON.CPU, []string{expectedCPU}) || !sameStrings(packageJSON.Files, expectedFiles) || (!formalPublish && !localPrivate) {
		return manifest, fmt.Errorf("package.json identity, platform, files, or publish policy mismatch")
	}
	manifestPath := filepath.Join(root, filepath.FromSlash(plan.PackageManifest))
	manifestData, err := readBoundedFile(manifestPath, runtimeManifestLimit)
	if err != nil {
		return manifest, err
	}
	decoder := json.NewDecoder(strings.NewReader(string(manifestData)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return manifest, fmt.Errorf("decode package manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return manifest, fmt.Errorf("decode package manifest: trailing JSON is not allowed")
	}
	if manifest.SchemaVersion != 1 || manifest.Product != plan.Product || manifest.ProductVersion != plan.RuntimeVersion || manifest.PlatformKey != plan.Platform || manifest.NPMPackage.Name != plan.NPMPackage || manifest.NPMPackage.Version != plan.NPMPackageVersion || !sameStrings(manifest.NPMPackage.OS, []string{expectedOS}) || !sameStrings(manifest.NPMPackage.CPU, []string{expectedCPU}) || manifest.DistributionMode != plan.DistributionMode || manifest.LicenseStatus != plan.LicenseStatus || strings.TrimSpace(manifest.LicenseNote) == "" {
		return manifest, fmt.Errorf("package manifest identity, platform, distribution mode, or license status mismatch")
	}
	expectedInstallerRelative := strings.TrimPrefix(plan.InstallerPath, "package/")
	if manifest.Installer.Path != expectedInstallerRelative || manifest.Installer.Asset != filepath.Base(expectedInstallerRelative) || manifest.Installer.SHA256 != plan.InstallerSHA256 || manifest.Installer.Size <= 0 || manifest.Installer.Executable != installerExecutable(plan.Platform) {
		return manifest, fmt.Errorf("package installer manifest does not match approved path and digest")
	}
	installerPath := filepath.Join(root, filepath.FromSlash(plan.InstallerPath))
	info, err := os.Lstat(installerPath)
	if err != nil {
		return manifest, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != manifest.Installer.Size {
		return manifest, fmt.Errorf("installer is not the approved regular file and size")
	}
	digest, err := fileSHA256(installerPath)
	if err != nil {
		return manifest, err
	}
	if digest != plan.InstallerSHA256 {
		return manifest, fmt.Errorf("installer SHA-256 mismatch")
	}
	if len(manifest.Legal.Files) != len(runtimePackageLegalFiles) {
		return manifest, fmt.Errorf("legal material list is not exact")
	}
	for index, expectedPath := range runtimePackageLegalFiles {
		record := manifest.Legal.Files[index]
		if record.Path != expectedPath {
			return manifest, fmt.Errorf("legal material order/path is not exact")
		}
		if err := verifyPackageFileRecord(root, record); err != nil {
			return manifest, fmt.Errorf("legal material %s: %w", expectedPath, err)
		}
	}
	if manifest.SBOM.Path != "SBOM.spdx.json" || manifest.SBOM.Format != "SPDX-2.3" {
		return manifest, fmt.Errorf("SBOM receipt is not exact")
	}
	if err := verifyPackageFileRecord(root, packageFileRecord{Path: manifest.SBOM.Path, SHA256: manifest.SBOM.SHA256, Size: manifest.SBOM.Size}); err != nil {
		return manifest, fmt.Errorf("SBOM: %w", err)
	}
	return manifest, nil
}

func verifyPackageFileRecord(root string, record packageFileRecord) error {
	if strings.Contains(record.Path, "\\") || strings.HasPrefix(record.Path, "/") || filepath.ToSlash(filepath.Clean(record.Path)) != record.Path || strings.HasPrefix(record.Path, "../") || !validSHA256(record.SHA256) || record.Size <= 0 {
		return fmt.Errorf("record is invalid")
	}
	path := filepath.Join(root, "package", filepath.FromSlash(record.Path))
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() != record.Size {
		return fmt.Errorf("file type or size mismatch")
	}
	digest, err := fileSHA256(path)
	if err != nil {
		return err
	}
	if digest != record.SHA256 {
		return fmt.Errorf("SHA-256 mismatch")
	}
	return nil
}

func npmPlatformValues(platform string) (string, string) {
	switch platform {
	case "darwin-arm64":
		return "darwin", "arm64"
	case "darwin-amd64":
		return "darwin", "x64"
	case "windows-amd64":
		return "win32", "x64"
	default:
		return "", ""
	}
}

func installerExecutable(platform string) bool { return platform != "windows-amd64" }

func sameStrings(actual, expected []string) bool {
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index] != expected[index] {
			return false
		}
	}
	return true
}

func readBoundedFile(path string, maxBytes int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxBytes {
		return nil, fmt.Errorf("file exceeds size limit")
	}
	return data, nil
}

func download(ctx context.Context, sourceURL, destination string, maxBytes int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return err
	}
	response, err := registryHTTPClient().Do(req)
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
	written, copyErr := io.Copy(file, io.LimitReader(response.Body, maxBytes+1))
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if written > maxBytes {
		return fmt.Errorf("download exceeds size limit")
	}
	return nil
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
