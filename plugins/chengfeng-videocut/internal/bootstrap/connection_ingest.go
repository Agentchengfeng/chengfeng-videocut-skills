package bootstrap

import (
	"context"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"math"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

type IngestStartInput struct {
	Connection           Connection `json:"connection"`
	OperationID          string     `json:"operationId"`
	SourcePath           string     `json:"sourcePath"`
	ExpectedSourceSHA256 string     `json:"expectedSourceSha256"`
	TaskDirectory        string     `json:"taskDirectory"`
	Language             string     `json:"language,omitempty"`
	AspectRatio          string     `json:"aspectRatio,omitempty"`
	Confirmed            bool       `json:"confirmed"`
}
type IngestStatusInput struct {
	Connection  Connection `json:"connection"`
	OperationID string     `json:"operationId"`
}
type TranscriptCorrection struct {
	WordID string `json:"wordId"`
	Text   string `json:"text"`
}
type TranscriptCorrectInput struct {
	Connection       Connection             `json:"connection"`
	ProjectID        string                 `json:"projectId"`
	OperationID      string                 `json:"operationId"`
	ExpectedRevision string                 `json:"expectedRevision"`
	Corrections      []TranscriptCorrection `json:"corrections"`
	Confirmed        bool                   `json:"confirmed"`
}

func boundedCleanPath(p string) bool {
	return len(p) <= 4096 && filepath.IsAbs(p) && filepath.Clean(p) == p && !strings.ContainsFunc(p, unicode.IsControl)
}
func ingestConnection(ctx context.Context, c Contract, in Connection, capability string) error {
	if e := checkConnection(ctx, c, in); e != nil {
		return e
	}
	caps, e := connectionJSON(ctx, in.Endpoint, "/chengfeng-videocut-capabilities.json", "GET", nil)
	if e != nil {
		return e
	}
	features, _ := caps["features"].(map[string]any)
	if features[capability] != float64(1) {
		return fmt.Errorf("capability_missing: %s=1 required; do not switch Runtime or invoke a source CLI", capability)
	}
	return nil
}
func ingestResponse(r map[string]any, op string) (map[string]any, error) {
	if r["schemaVersion"] != float64(1) || r["operationId"] != op {
		return nil, fmt.Errorf("ingest response identity mismatch; query same operationId before retry")
	}
	switch r["status"] {
	case "accepted", "running", "succeeded", "failed", "interrupted":
	default:
		return nil, fmt.Errorf("invalid ingest status; query same operationId before retry")
	}
	switch r["stage"] {
	case "accepted", "ingest", "complete", "interrupted", "failed":
	default:
		return nil, fmt.Errorf("invalid ingest stage; query same operationId before retry")
	}
	if code := r["errorCode"]; code != nil {
		text, ok := code.(string)
		if !ok || len(text) > 128 || !operationIDPattern.MatchString(text) {
			return nil, fmt.Errorf("invalid bounded ingest error code")
		}
	}
	// Only publish the bounded operation receipt, never arbitrary server logs or credentials.
	out := map[string]any{"schemaVersion": r["schemaVersion"], "operationId": op, "status": r["status"], "stage": r["stage"], "errorCode": r["errorCode"], "result": nil}
	if result, ok := r["result"].(map[string]any); ok {
		id, hash, reviewURL := stringPath(result, "projectId"), stringPath(result, "sourceSha256"), stringPath(result, "url")
		if len(id) > 128 || len(reviewURL) > 4096 || !moduleHash.MatchString(hash) || result["registered"] != true {
			return nil, fmt.Errorf("invalid ingest result")
		}
		if _, e := workflowPath(id, "workflow"); e != nil {
			return nil, fmt.Errorf("invalid ingest project identity")
		}
		out["result"] = map[string]any{"projectId": result["projectId"], "sourceSha256": result["sourceSha256"], "url": result["url"], "registered": result["registered"]}
	}
	if r["status"] == "succeeded" && out["result"] == nil {
		return nil, fmt.Errorf("successful ingest missing result")
	}
	return out, nil
}

var ingestHTTPError = regexp.MustCompile(`service HTTP [0-9]{3}(?: [A-Za-z0-9_-]{1,128})?`)

// Keep error classification without reflecting arbitrary service messages, paths or credentials.
func ingestRequest(ctx context.Context, endpoint, path, method string, body any) (map[string]any, error) {
	r, e := connectionJSON(ctx, endpoint, path, method, body)
	if e == nil {
		return r, nil
	}
	if code := ingestHTTPError.FindString(e.Error()); code != "" {
		return nil, fmt.Errorf("%s", code)
	}
	return nil, fmt.Errorf("ingest transport or bounded JSON failure")
}
func connectedIngestStart(ctx context.Context, c Contract, in IngestStartInput) (map[string]any, error) {
	if !in.Confirmed || !operationIDPattern.MatchString(in.OperationID) || !moduleHash.MatchString(in.ExpectedSourceSHA256) || !boundedCleanPath(in.SourcePath) || !strings.EqualFold(filepath.Ext(in.SourcePath), ".wav") || !boundedCleanPath(in.TaskDirectory) || utf8.RuneCountInString(in.Language) > 32 || strings.ContainsFunc(in.Language, unicode.IsControl) {
		return nil, fmt.Errorf("confirmed, bounded operationId, absolute clean WAV sourcePath/taskDirectory and lowercase SHA256 required")
	}
	switch in.AspectRatio {
	case "", "16:9", "9:16", "1:1", "4:3", "3:4":
	default:
		return nil, fmt.Errorf("unsupported aspectRatio")
	}
	if e := ingestConnection(ctx, c, in.Connection, "ingestApiVersion"); e != nil {
		return nil, e
	}
	body := map[string]any{"operationId": in.OperationID, "sourcePath": in.SourcePath, "expectedSourceSha256": in.ExpectedSourceSHA256, "taskDirectory": in.TaskDirectory, "confirmed": true}
	if in.Language != "" {
		body["language"] = in.Language
	}
	if in.AspectRatio != "" {
		body["aspectRatio"] = in.AspectRatio
	}
	r, e := ingestRequest(ctx, in.Connection.Endpoint, "/api/v1/ingests", "POST", body)
	if e != nil {
		return nil, fmt.Errorf("ingest outcome unknown unless explicitly rejected; query runtime_ingest_status with the same operationId, never start a new paid request: %w", e)
	}
	return ingestResponse(r, in.OperationID)
}
func connectedIngestStatus(ctx context.Context, c Contract, in IngestStatusInput) (map[string]any, error) {
	if !operationIDPattern.MatchString(in.OperationID) {
		return nil, fmt.Errorf("invalid operationId")
	}
	if e := ingestConnection(ctx, c, in.Connection, "ingestApiVersion"); e != nil {
		return nil, e
	}
	r, e := ingestRequest(ctx, in.Connection.Endpoint, "/api/v1/ingests/"+url.PathEscape(in.OperationID), "GET", nil)
	if e != nil {
		return nil, e
	}
	return ingestResponse(r, in.OperationID)
}
func connectedTranscriptCorrect(ctx context.Context, c Contract, in TranscriptCorrectInput) (map[string]any, error) {
	if !in.Confirmed || !operationIDPattern.MatchString(in.OperationID) || !revisionPattern.MatchString(in.ExpectedRevision) || len(in.Corrections) < 1 || len(in.Corrections) > 500 || len(in.ProjectID) > 128 {
		return nil, fmt.Errorf("confirmed, operationId, transcript expectedRevision and 1..500 corrections required")
	}
	seen := map[string]bool{}
	for _, v := range in.Corrections {
		if v.WordID == "" || len(v.WordID) > 128 || strings.ContainsFunc(v.WordID, unicode.IsControl) || seen[v.WordID] || utf8.RuneCountInString(v.Text) > 1000 || strings.ContainsRune(v.Text, 0) {
			return nil, fmt.Errorf("invalid or duplicate correction")
		}
		seen[v.WordID] = true
	}
	p, e := workflowPath(in.ProjectID, "transcript-corrections")
	if e != nil {
		return nil, e
	}
	if e = ingestConnection(ctx, c, in.Connection, "transcriptCorrectionApiVersion"); e != nil {
		return nil, e
	}
	r, e := ingestRequest(ctx, in.Connection.Endpoint, p, "POST", map[string]any{"operationId": in.OperationID, "expectedRevision": in.ExpectedRevision, "corrections": in.Corrections, "confirmed": true})
	if e != nil {
		return nil, fmt.Errorf("correction outcome unconfirmed; preserve same operationId and input for idempotent replay, never replace revision blindly: %w", e)
	}
	if r["schemaVersion"] != float64(1) || r["operationId"] != in.OperationID || r["projectId"] != in.ProjectID || r["previousRevision"] != in.ExpectedRevision || !revisionPattern.MatchString(stringPath(r, "revision")) {
		return nil, fmt.Errorf("correction receipt mismatch; inspect same operation before retry")
	}
	if _, ok := r["changed"].(bool); !ok {
		return nil, fmt.Errorf("invalid correction changed field")
	}
	for _, key := range []string{"correctedWordCount", "subtitleScreensUpdated", "subtitleNeedsAttentionCount"} {
		value, ok := r[key].(float64)
		if !ok || value < 0 || value > 1000000 || math.Trunc(value) != value {
			return nil, fmt.Errorf("invalid bounded correction count")
		}
	}
	return map[string]any{"schemaVersion": r["schemaVersion"], "operationId": r["operationId"], "projectId": r["projectId"], "previousRevision": r["previousRevision"], "revision": r["revision"], "changed": r["changed"], "correctedWordCount": r["correctedWordCount"], "subtitleScreensUpdated": r["subtitleScreensUpdated"], "subtitleNeedsAttentionCount": r["subtitleNeedsAttentionCount"]}, nil
}
func addIngestTools(s *mcp.Server, c Contract) {
	rw := &mcp.ToolAnnotations{DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(true)}
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_ingest_start", Description: "Start explicitly authorized cloud ASR for one local WAV using source hash and an existing task directory without Product outputs. Returns promptly; poll the same operationId. Never blindly retry paid work.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in IngestStartInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := connectedIngestStart(ctx, c, in)
		return nil, r, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_ingest_status", Description: "Read exact ingest operation status from the same verified connection; does not submit or retry ASR.", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in IngestStatusInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := connectedIngestStatus(ctx, c, in)
		return nil, r, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_transcript_correct", Description: "Apply authorized bounded word text corrections using transcript CAS and a stable operationId; preserves word IDs, times and source audio.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in TranscriptCorrectInput) (*mcp.CallToolResult, map[string]any, error) {
		r, e := connectedTranscriptCorrect(ctx, c, in)
		return nil, r, e
	})
}
