package bootstrap

import (
	"context"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"path/filepath"
	"strings"
)

type MediaImportInput struct {
	Connection           Connection `json:"connection"`
	ProjectID            string     `json:"projectId"`
	SourcePath           string     `json:"sourcePath"`
	ExpectedSourceSHA256 string     `json:"expectedSourceSha256"`
	Confirmed            bool       `json:"confirmed"`
}
type MediaGetInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
	AssetID    string     `json:"assetId"`
}

func mediaConnection(ctx context.Context, c Contract, in Connection) error {
	if e := checkConnection(ctx, c, in); e != nil {
		return e
	}
	h, e := connectionJSON(ctx, in.Endpoint, "/api/health", "GET", nil)
	if e != nil {
		return e
	}
	if h["mediaAssetsApiVersion"] != float64(1) {
		return fmt.Errorf("capability_missing: mediaAssetsApiVersion=1 required")
	}
	return nil
}
func getConnectedMedia(ctx context.Context, c Contract, in MediaGetInput) (map[string]any, error) {
	if !moduleHash.MatchString(in.AssetID) {
		return nil, fmt.Errorf("invalid asset id")
	}
	if e := mediaConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	p, e := workflowPath(in.ProjectID, "media-assets")
	if e != nil {
		return nil, e
	}
	r, e := connectionJSON(ctx, in.Connection.Endpoint, p+"/"+in.AssetID, "GET", nil)
	if e != nil {
		return nil, e
	}
	if stringPath(r, "manifest", "assetId") != in.AssetID || stringPath(r, "manifest", "sha256") != in.AssetID || stringPath(r, "projectId") != in.ProjectID {
		return nil, fmt.Errorf("media readback identity mismatch")
	}
	return r, nil
}
func importConnectedMedia(ctx context.Context, c Contract, in MediaImportInput) (map[string]any, error) {
	if !in.Confirmed || !moduleHash.MatchString(in.ExpectedSourceSHA256) || !filepath.IsAbs(in.SourcePath) || !strings.EqualFold(filepath.Ext(in.SourcePath), ".mp4") {
		return nil, fmt.Errorf("confirmed local MP4 with expected SHA256 required")
	}
	if e := mediaConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	if e := moduleAncestors(in.SourcePath); e != nil {
		return nil, e
	}
	p, e := workflowPath(in.ProjectID, "media-assets")
	if e != nil {
		return nil, e
	}
	_, e = connectionJSON(ctx, in.Connection.Endpoint, p, "POST", map[string]any{"sourcePath": in.SourcePath, "expectedSourceSha256": in.ExpectedSourceSHA256, "confirmed": true})
	if e != nil {
		return nil, fmt.Errorf("media import not confirmed; query original SHA256 assetId before retry: %w", e)
	}
	return getConnectedMedia(ctx, c, MediaGetInput{in.Connection, in.ProjectID, in.ExpectedSourceSHA256})
}
func addMediaTools(s *mcp.Server, c Contract) {
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_media_import", Description: "Import an explicitly authorized local H264 MP4 as an immutable, hash-verified project asset. No transcription or timeline modification. After uncertain outcome query the same SHA256 assetId.", Annotations: &mcp.ToolAnnotations{DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in MediaImportInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := importConnectedMedia(ctx, c, in)
		return nil, r, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_media_get", Description: "Read one verified local project video asset manifest and content URL. Does not change timeline.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in MediaGetInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := getConnectedMedia(ctx, c, in)
		return nil, r, e
	})
}
