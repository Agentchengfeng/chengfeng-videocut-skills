package bootstrap

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type PlaybackInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
	Cursor     string     `json:"cursor,omitempty"`
	Limit      int        `json:"limit,omitempty"`
}
type CutsPutInput struct {
	Connection       Connection       `json:"connection"`
	ProjectID        string           `json:"projectId"`
	Confirmed        bool             `json:"confirmed"`
	ExpectedRevision string           `json:"expectedRevision"`
	OperationID      string           `json:"operationId"`
	CutWordIDs       []string         `json:"cutWordIds"`
	Reasons          []map[string]any `json:"reasons"`
}
type SubtitleInputsInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
}
type SubtitleSubmitInput struct {
	Connection         Connection `json:"connection"`
	ProjectID          string     `json:"projectId"`
	Confirmed          bool       `json:"confirmed"`
	ExpectedRevision   string     `json:"expectedRevision"`
	CandidateDirectory string     `json:"candidateDirectory"`
}
type ExportPlanInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
	Profile    string     `json:"profile"`
}
type ExportStartInput struct {
	Connection       Connection `json:"connection"`
	ProjectID        string     `json:"projectId"`
	Confirmed        bool       `json:"confirmed"`
	ExpectedSnapshot string     `json:"expectedSnapshot"`
	Profile          string     `json:"profile"`
	OutputPath       string     `json:"outputPath"`
	OperationID      string     `json:"operationId"`
}
type ExportJobInput struct {
	OperationID string     `json:"operationId,omitempty"`
	Connection  Connection `json:"connection"`
	ProjectID   string     `json:"projectId"`
	JobID       string     `json:"jobId,omitempty"`
	Cancel      bool       `json:"cancel,omitempty"`
	Confirmed   bool       `json:"confirmed,omitempty"`
}

var operationIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

func workflowConnection(ctx context.Context, c Contract, connection Connection) error {
	if err := checkConnection(ctx, c, connection); err != nil {
		return err
	}
	health, err := connectionJSON(ctx, connection.Endpoint, "/api/health", "GET", nil)
	if err != nil {
		return err
	}
	if health["existingWorkflowApiVersion"] != float64(1) {
		return fmt.Errorf("capability_missing: existingWorkflowApiVersion=1 required; do not fall back to another Runtime")
	}
	return nil
}
func workflowPath(id, resource string) (string, error) {
	p, e := projectResourcePath(id, "workflow")
	if e != nil {
		return "", e
	}
	return p[:len(p)-len("workflow")] + resource, nil
}
func validRevision(r string) bool { return r == "none" || revisionPattern.MatchString(r) }
func connectedPlayback(ctx context.Context, c Contract, in PlaybackInput) (map[string]any, error) {
	if in.Limit == 0 {
		in.Limit = 64
	}
	if in.Limit < 1 || in.Limit > 64 {
		return nil, fmt.Errorf("limit must be 1..64")
	}
	path, e := workflowPath(in.ProjectID, "playback")
	if e != nil {
		return nil, e
	}
	if e = workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	q := url.Values{"limit": {fmt.Sprint(in.Limit)}}
	if in.Cursor != "" {
		q.Set("cursor", in.Cursor)
	}
	return connectionJSON(ctx, in.Connection.Endpoint, path+"?"+q.Encode(), "GET", nil)
}
func connectedCuts(ctx context.Context, c Contract, in CutsPutInput) (map[string]any, error) {
	if !in.Confirmed || !validRevision(in.ExpectedRevision) || !operationIDPattern.MatchString(in.OperationID) {
		return nil, fmt.Errorf("confirmed, expectedRevision and operationId required")
	}
	p, e := projectResourcePath(in.ProjectID, "cuts")
	if e != nil {
		return nil, e
	}
	if e = workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	if in.CutWordIDs == nil {
		in.CutWordIDs = []string{}
	}
	if in.Reasons == nil {
		in.Reasons = []map[string]any{}
	}
	written, e := connectionJSON(ctx, in.Connection.Endpoint, p, "PUT", map[string]any{"mode": "semantic-overlay", "operationId": in.OperationID, "expectedRevision": in.ExpectedRevision, "cutWordIds": in.CutWordIDs, "reasons": in.Reasons})
	if e != nil {
		return nil, fmt.Errorf("write outcome unconfirmed; read current cuts before retry: %w", e)
	}
	current, e := readConnectedProject(ctx, c, ProjectReadInput{in.Connection, in.ProjectID, "cuts"})
	if e != nil {
		return nil, e
	}
	if current["revision"] != written["revision"] {
		return nil, fmt.Errorf("cuts readback changed; do not retry blindly")
	}
	return current, nil
}
func connectedSubtitleInputs(ctx context.Context, c Contract, in SubtitleInputsInput) (map[string]any, error) {
	p, e := workflowPath(in.ProjectID, "subtitle-inputs")
	if e != nil {
		return nil, e
	}
	if e = workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	data, e := connectionJSON(ctx, in.Connection.Endpoint, p, "GET", nil)
	if e != nil {
		return nil, e
	}
	if data["projectId"] != in.ProjectID {
		return nil, fmt.Errorf("project mismatch")
	}
	files, ok := data["files"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid inputs")
	}
	root, e := os.MkdirTemp("", "videocut-subtitle-inputs-")
	if e != nil {
		return nil, e
	}
	complete := false
	defer func() {
		if !complete {
			_ = os.RemoveAll(root)
		}
	}()
	paths := map[string]any{}
	for _, name := range []string{"transcript.json", "edit-list.json", "subtitles.json"} {
		raw, ok := files[name].(string)
		if !ok {
			if name != "subtitles.json" {
				return nil, fmt.Errorf("missing %s", name)
			}
			continue
		}
		path := filepath.Join(root, name)
		if e = os.WriteFile(path, []byte(raw), 0600); e != nil {
			return nil, e
		}
		paths[name] = path
	}
	complete = true
	return map[string]any{"projectId": in.ProjectID, "inputDirectory": root, "files": paths, "productionCommitted": false}, nil
}
func connectedSubtitleSubmit(ctx context.Context, c Contract, in SubtitleSubmitInput) (map[string]any, error) {
	if !filepath.IsAbs(in.CandidateDirectory) {
		return nil, fmt.Errorf("candidate directory must be absolute")
	}
	if !in.Confirmed || !validRevision(in.ExpectedRevision) {
		return nil, fmt.Errorf("confirmed and expectedRevision required")
	}
	p, e := workflowPath(in.ProjectID, "subtitles/candidate")
	if e != nil {
		return nil, e
	}
	if e = workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	if _, e = os.Stat(filepath.Join(in.CandidateDirectory, "INCOMPLETE")); !os.IsNotExist(e) {
		return nil, fmt.Errorf("candidate incomplete or unreadable")
	}
	read := func(name string) ([]byte, error) {
		path := filepath.Join(in.CandidateDirectory, name)
		link, e := os.Lstat(path)
		if e != nil || !link.Mode().IsRegular() {
			return nil, fmt.Errorf("candidate must be a regular file")
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
		if !s.Mode().IsRegular() || s.Size() > connectionLimit {
			return nil, fmt.Errorf("invalid candidate file")
		}
		if !os.SameFile(link, s) {
			return nil, fmt.Errorf("candidate changed while opening")
		}
		raw, e := io.ReadAll(io.LimitReader(f, connectionLimit+1))
		if e != nil {
			return nil, e
		}
		if len(raw) > connectionLimit {
			return nil, fmt.Errorf("candidate too large")
		}
		return raw, nil
	}
	document, e := read("subtitles.json")
	if e != nil {
		return nil, e
	}
	rawReceipt, e := read("candidate-receipt.json")
	if e != nil {
		return nil, e
	}
	var receipt map[string]any
	if e = json.Unmarshal(rawReceipt, &receipt); e != nil {
		return nil, e
	}
	written, e := connectionJSON(ctx, in.Connection.Endpoint, p, "POST", map[string]any{"expectedRevision": in.ExpectedRevision, "documentContent": string(document), "receipt": receipt})
	if e != nil {
		return nil, fmt.Errorf("write outcome unconfirmed; read subtitles before retry: %w", e)
	}
	current, e := readConnectedProject(ctx, c, ProjectReadInput{in.Connection, in.ProjectID, "subtitles"})
	if e != nil {
		return nil, e
	}
	if current["revision"] != written["revision"] {
		return nil, fmt.Errorf("subtitle readback changed")
	}
	return current, nil
}
func connectedExportPlan(ctx context.Context, c Contract, in ExportPlanInput) (map[string]any, error) {
	if in.Profile != "fast" && in.Profile != "master" {
		return nil, fmt.Errorf("profile must be fast or master")
	}
	p, e := workflowPath(in.ProjectID, "export-plan")
	if e != nil {
		return nil, e
	}
	if e = workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	return connectionJSON(ctx, in.Connection.Endpoint, p+"?profile="+in.Profile, "GET", nil)
}
func connectedExportStart(ctx context.Context, c Contract, in ExportStartInput) (map[string]any, error) {
	if !in.Confirmed || !revisionPattern.MatchString(in.ExpectedSnapshot) || !operationIDPattern.MatchString(in.OperationID) || !filepath.IsAbs(in.OutputPath) || (in.Profile != "fast" && in.Profile != "master") {
		return nil, fmt.Errorf("confirmed, expectedSnapshot, operationId, absolute outputPath and profile required")
	}
	if _, e := workflowPath(in.ProjectID, "export-plan"); e != nil {
		return nil, e
	}
	if e := workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	result, e := connectionJSON(ctx, in.Connection.Endpoint, "/api/v1/jobs", "POST", map[string]any{"kind": "export", "target": in.ProjectID, "operationId": in.OperationID, "params": map[string]any{"expectedSnapshot": in.ExpectedSnapshot, "outputPath": in.OutputPath, "profile": in.Profile}})
	if e != nil {
		return nil, fmt.Errorf("job admission outcome unknown; query jobs using operationId before retry: %w", e)
	}
	return result, nil
}
func connectedExportJob(ctx context.Context, c Contract, in ExportJobInput) (map[string]any, error) {
	if in.OperationID != "" && !in.Cancel {
		if !operationIDPattern.MatchString(in.OperationID) {
			return nil, fmt.Errorf("invalid operationId")
		}
		if e := workflowConnection(ctx, c, in.Connection); e != nil {
			return nil, e
		}
		return connectionJSON(ctx, in.Connection.Endpoint, "/api/v1/jobs/by-operation?operationId="+url.QueryEscape(in.OperationID)+"&projectId="+url.QueryEscape(in.ProjectID), "GET", nil)
	}
	if in.JobID == "" && !in.Cancel {
		if _, e := workflowPath(in.ProjectID, "workflow"); e != nil {
			return nil, e
		}
		if e := workflowConnection(ctx, c, in.Connection); e != nil {
			return nil, e
		}
		return connectionJSON(ctx, in.Connection.Endpoint, "/api/v1/jobs?limit=10&kind=export&projectId="+url.QueryEscape(in.ProjectID), "GET", nil)
	}
	if !operationIDPattern.MatchString(in.JobID) {
		return nil, fmt.Errorf("invalid job id")
	}
	if e := workflowConnection(ctx, c, in.Connection); e != nil {
		return nil, e
	}
	p := "/api/v1/jobs/" + url.PathEscape(in.JobID)
	job, e := connectionJSON(ctx, in.Connection.Endpoint, p, "GET", nil)
	if e != nil {
		return nil, e
	}
	if job["projectId"] != in.ProjectID || job["kind"] != "export" {
		return nil, fmt.Errorf("job target mismatch")
	}
	if in.Cancel {
		if !in.Confirmed {
			return nil, fmt.Errorf("cancel requires user confirmation")
		}
		return connectionJSON(ctx, in.Connection.Endpoint, p+"/cancel", "POST", map[string]any{})
	}
	return job, nil
}
func addWorkflowConnectionTools(s *mcp.Server, c Contract) {
	ro := &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}
	rw := &mcp.ToolAnnotations{DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(false)}
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_playback", Description: "Read bounded same-revision playback pages from the connected workbench.", Annotations: ro}, func(ctx context.Context, _ *mcp.CallToolRequest, in PlaybackInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedPlayback(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_cuts_put", Description: "Save one complete authorized cuts proposal using current cuts revision and operationId, then read back.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in CutsPutInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedCuts(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_subtitle_inputs", Description: "Stage exact existing transcript/EDL/reviewed subtitle bytes into a new temporary directory for the bundled candidate Skill. Never writes project inputs.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in SubtitleInputsInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedSubtitleInputs(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_subtitle_submit", Description: "Submit a generated and validated candidate directory through existing server source/result CAS, then read back. User authorization required.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in SubtitleSubmitInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedSubtitleSubmit(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_export_plan", Description: "Read deterministic export plan and frozen input fingerprint before confirmation.", Annotations: ro}, func(ctx context.Context, _ *mcp.CallToolRequest, in ExportPlanInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedExportPlan(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_export_start", Description: "Start durable export with confirmed snapshot fingerprint; service checks under project lock. Never overwrites existing output.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in ExportStartInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedExportStart(ctx, c, in)
		return nil, v, e
	})
	mcp.AddTool(s, &mcp.Tool{Name: "runtime_export_job", Description: "Read a project-bound durable export, or cancel only with explicit confirmation.", Annotations: rw}, func(ctx context.Context, _ *mcp.CallToolRequest, in ExportJobInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := connectedExportJob(ctx, c, in)
		return nil, v, e
	})
}
