package bootstrap

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type ProjectConfigInput struct {
	Connection       Connection     `json:"connection"`
	ProjectID        string         `json:"projectId"`
	Config           map[string]any `json:"config,omitempty"`
	Confirmed        bool           `json:"confirmed,omitempty"`
	ExpectedRevision string         `json:"expectedRevision,omitempty"`
}

func validConfigAspect(value any) bool {
	s, ok := value.(string)
	if !ok {
		return false
	}
	switch s {
	case "16:9", "9:16", "1:1", "4:3", "3:4":
		return true
	}
	return false
}

func projectConfigConnection(ctx context.Context, c Contract, conn Connection) error {
	if err := checkConnection(ctx, c, conn); err != nil {
		return err
	}
	health, err := connectionJSON(ctx, conn.Endpoint, "/api/health", "GET", nil)
	if err != nil {
		return err
	}
	if health["pid"] != conn.PID || health["studioBuildId"] != conn.BuildID || health["productVersion"] != conn.Version || health["runtimeMode"] != conn.RuntimeMode {
		return fmt.Errorf("service_identity_changed: reconnect and review before continuing")
	}
	if health["projectConfigApiVersion"] != float64(1) {
		return fmt.Errorf("capability_missing: projectConfigApiVersion=1 required; do not fall back to another Runtime")
	}
	return nil
}

func validateProjectConfig(result map[string]any, projectID string) error {
	config, ok := result["config"].(map[string]any)
	if !ok || len(config) != 1 {
		return fmt.Errorf("incompatible project config response")
	}
	aspect, exists := config["aspectRatio"]
	if !exists || (aspect != nil && !validConfigAspect(aspect)) || result["schemaVersion"] != float64(1) || result["projectId"] != projectID || !revisionPattern.MatchString(stringPath(result, "projectRevision")) || !revisionPattern.MatchString(stringPath(result, "configRevision")) {
		return fmt.Errorf("incompatible project config response")
	}
	return nil
}

func connectedProjectConfig(ctx context.Context, c Contract, in ProjectConfigInput) (map[string]any, error) {
	path, err := workflowPath(in.ProjectID, "project-config")
	if err != nil {
		return nil, err
	}
	if in.Config != nil {
		if !in.Confirmed || !revisionPattern.MatchString(in.ExpectedRevision) {
			return nil, fmt.Errorf("confirmed and expectedRevision (project SHA256) required")
		}
		if len(in.Config) != 1 || !validConfigAspect(in.Config["aspectRatio"]) {
			return nil, fmt.Errorf("config must contain only aspectRatio: 16:9, 9:16, 1:1, 4:3 or 3:4")
		}
	}
	if err = projectConfigConnection(ctx, c, in.Connection); err != nil {
		return nil, err
	}
	if in.Config == nil {
		result, err := connectionJSON(ctx, in.Connection.Endpoint, path, "GET", nil)
		if err != nil {
			return nil, err
		}
		if err = validateProjectConfig(result, in.ProjectID); err != nil {
			return nil, err
		}
		return result, nil
	}
	written, err := connectionJSON(ctx, in.Connection.Endpoint, path, "PATCH", map[string]any{"confirmed": true, "expectedRevision": in.ExpectedRevision, "config": in.Config})
	if err != nil {
		return nil, fmt.Errorf("write outcome unconfirmed; GET current project-config before retry; do not retry blindly: %w", err)
	}
	if err = validateProjectConfig(written, in.ProjectID); err != nil {
		return nil, fmt.Errorf("write may have committed; GET project-config before retry: %w", err)
	}
	changed, ok := written["changed"].(bool)
	if !ok || written["previousRevision"] != in.ExpectedRevision || changed != (written["projectRevision"] != in.ExpectedRevision) {
		return nil, fmt.Errorf("write receipt incompatible; GET project-config before retry; do not retry blindly")
	}
	readback, err := connectedProjectConfig(ctx, c, ProjectConfigInput{Connection: in.Connection, ProjectID: in.ProjectID})
	if err != nil {
		return nil, fmt.Errorf("write may have committed; readback failed; do not retry blindly: %w", err)
	}
	if readback["projectRevision"] != written["projectRevision"] || readback["configRevision"] != written["configRevision"] || readback["config"].(map[string]any)["aspectRatio"] != in.Config["aspectRatio"] || written["config"].(map[string]any)["aspectRatio"] != in.Config["aspectRatio"] {
		return nil, fmt.Errorf("project config readback mismatch; GET current project-config before retry; do not retry blindly")
	}
	return written, nil
}

func addProjectConfigTools(server *mcp.Server, c Contract) {
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_project_config", Description: "Read connected project canvas config when config is omitted. Change only aspectRatio with confirmed=true and expectedRevision from current projectRevision, then verify by readback. No workflow or media changes.", Annotations: &mcp.ToolAnnotations{DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, in ProjectConfigInput) (*mcp.CallToolResult, map[string]any, error) {
		result, err := connectedProjectConfig(ctx, c, in)
		return nil, result, err
	})
}
