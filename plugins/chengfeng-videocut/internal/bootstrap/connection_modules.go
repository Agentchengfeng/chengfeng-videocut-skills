package bootstrap

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

type ModuleFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int    `json:"bytes"`
}
type ModuleManifest struct {
	SchemaVersion int          `json:"schemaVersion"`
	ModuleID      string       `json:"moduleId"`
	Version       string       `json:"version"`
	Entry         string       `json:"entry"`
	Files         []ModuleFile `json:"files"`
}
type ModulePublishInput struct {
	Connection         Connection `json:"connection"`
	ProjectID          string     `json:"projectId"`
	Confirmed          bool       `json:"confirmed"`
	CandidateDirectory string     `json:"candidateDirectory"`
}
type ModuleGetInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
	ModuleID   string     `json:"moduleId"`
	Version    string     `json:"version"`
}

var moduleID = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)
var modulePath = regexp.MustCompile(`^[A-Za-z0-9_-][A-Za-z0-9_.-]*(/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.(html|js|mjs|css|svg|json|png|jpg|jpeg|webp|woff2)$`)
var moduleHash = regexp.MustCompile(`^[a-f0-9]{64}$`)
var moduleReserved = regexp.MustCompile(`(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)`)

func portableModulePath(path string) bool {
	for _, p := range strings.Split(path, "/") {
		if strings.HasSuffix(p, ".") || moduleReserved.MatchString(p) {
			return false
		}
	}
	return true
}

func readCandidateFile(path string) ([]byte, error) {
	if e := moduleAncestors(path); e != nil {
		return nil, e
	}
	before, e := os.Lstat(path)
	if e != nil {
		return nil, e
	}
	if !before.Mode().IsRegular() || before.Size() > 512*1024 {
		return nil, fmt.Errorf("bounded regular file required")
	}
	f, e := os.Open(path)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	s, e := f.Stat()
	if e != nil {
		return nil, e
	}
	if !s.Mode().IsRegular() || !os.SameFile(before, s) {
		return nil, fmt.Errorf("candidate changed")
	}
	b, e := io.ReadAll(io.LimitReader(f, 512*1024+1))
	if len(b) > 512*1024 {
		return nil, fmt.Errorf("candidate too large")
	}
	if e2 := moduleAncestors(path); e2 != nil {
		return nil, e2
	}
	return b, e
}

func moduleAncestors(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return fmt.Errorf("absolute clean candidate path required")
	}
	for p := path; ; p = filepath.Dir(p) {
		s, e := os.Lstat(p)
		if e != nil {
			return e
		}
		if s.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("candidate symlink rejected")
		}
		if p == filepath.Dir(p) {
			break
		}
	}
	return nil
}
func readModuleCandidate(dir string) (ModuleManifest, map[string]string, error) {
	var manifest ModuleManifest
	if e := moduleAncestors(dir); e != nil {
		return manifest, nil, e
	}
	raw, e := readCandidateFile(filepath.Join(dir, "module-manifest.json"))
	if e != nil {
		return manifest, nil, e
	}
	if len(raw) > 65536 {
		return manifest, nil, fmt.Errorf("manifest too large")
	}
	if e = json.Unmarshal(raw, &manifest); e != nil {
		return manifest, nil, e
	}
	if manifest.SchemaVersion != 1 || !moduleID.MatchString(manifest.ModuleID) || !moduleID.MatchString(manifest.Version) || len(manifest.Files) < 1 || len(manifest.Files) > 32 || !strings.HasSuffix(manifest.Entry, ".html") {
		return manifest, nil, fmt.Errorf("invalid module manifest")
	}
	if !portableModulePath(manifest.ModuleID) || !portableModulePath(manifest.Version) {
		return manifest, nil, fmt.Errorf("reserved module identity")
	}
	files := map[string]string{}
	seen := map[string]bool{}
	total := 0
	entry := false
	for _, f := range manifest.Files {
		if !portableModulePath(f.Path) {
			return manifest, nil, fmt.Errorf("reserved module path")
		}
		if !modulePath.MatchString(f.Path) || strings.EqualFold(f.Path, "module-manifest.json") || strings.Contains("/"+f.Path+"/", "/../") || seen[strings.ToLower(f.Path)] || f.Bytes < 0 || f.Bytes > 512*1024 || !moduleHash.MatchString(f.SHA256) {
			return manifest, nil, fmt.Errorf("invalid module file")
		}
		seen[strings.ToLower(f.Path)] = true
		total += f.Bytes
		if total > 2*1024*1024 {
			return manifest, nil, fmt.Errorf("package too large")
		}
		path := filepath.Join(dir, filepath.FromSlash(f.Path))
		if e = moduleAncestors(path); e != nil {
			return manifest, nil, e
		}
		b, err := readCandidateFile(path)
		if err != nil {
			return manifest, nil, err
		}
		sum := sha256.Sum256(b)
		if len(b) != f.Bytes || hex.EncodeToString(sum[:]) != f.SHA256 {
			return manifest, nil, fmt.Errorf("file hash mismatch")
		}
		files[f.Path] = base64.StdEncoding.EncodeToString(b)
		entry = entry || f.Path == manifest.Entry
	}
	if !entry {
		return manifest, nil, fmt.Errorf("missing entry")
	}
	sort.Slice(manifest.Files, func(i, j int) bool { return manifest.Files[i].Path < manifest.Files[j].Path })
	return manifest, files, nil
}
func moduleConnection(ctx context.Context, c Contract, in Connection) error {
	if e := checkConnection(ctx, c, in); e != nil {
		return e
	}
	h, e := connectionJSON(ctx, in.Endpoint, "/api/health", "GET", nil)
	if e != nil {
		return e
	}
	if h["modulePublishApiVersion"] != float64(1) {
		return fmt.Errorf("capability_missing: modulePublishApiVersion=1 required")
	}
	return nil
}
func getConnectedModule(ctx context.Context, c Contract, in ModuleGetInput) (map[string]any, error) {
	if !moduleID.MatchString(in.ModuleID) || !moduleID.MatchString(in.Version) {
		return nil, fmt.Errorf("invalid module identity")
	}
	if e := moduleConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	p, e := workflowPath(in.ProjectID, "module-packages")
	if e != nil {
		return nil, e
	}
	return connectionJSON(ctx, in.Connection.Endpoint, p+"/"+in.ModuleID+"/"+in.Version, "GET", nil)
}
func publishConnectedModule(ctx context.Context, c Contract, in ModulePublishInput) (map[string]any, error) {
	if !in.Confirmed {
		return nil, fmt.Errorf("explicit user authorization required")
	}
	if e := moduleConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	m, files, e := readModuleCandidate(in.CandidateDirectory)
	if e != nil {
		return nil, e
	}
	p, e := workflowPath(in.ProjectID, "module-packages")
	if e != nil {
		return nil, e
	}
	if _, e = connectionJSON(ctx, in.Connection.Endpoint, p, "POST", map[string]any{"manifest": m, "files": files}); e != nil {
		return nil, fmt.Errorf("publish outcome unknown unless explicitly rejected; read same moduleId/version before retry: %w", e)
	}
	r, e := getConnectedModule(ctx, c, ModuleGetInput{in.Connection, in.ProjectID, m.ModuleID, m.Version})
	if e != nil {
		return nil, fmt.Errorf("publish readback unknown: %w", e)
	}
	raw, e := json.Marshal(r["manifest"])
	if e != nil {
		return nil, e
	}
	var actual ModuleManifest
	if e = json.Unmarshal(raw, &actual); e != nil {
		return nil, e
	}
	if !reflect.DeepEqual(actual, m) {
		return nil, fmt.Errorf("publish readback manifest mismatch; inspect same identity before retry")
	}
	return r, nil
}
func addModuleTools(s *mcp.Server, c Contract) {
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_module_publish", Description: "Publish an authorized bounded module-manifest.json package as an immutable project version; never changes visuals. Read same moduleId/version after unknown outcomes.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in ModulePublishInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := publishConnectedModule(ctx, c, in)
		return nil, r, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_module_get", Description: "Read verified manifest and same-origin file URLs for one connected project module version.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in ModuleGetInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := getConnectedModule(ctx, c, in)
		return nil, r, e
	})
}
