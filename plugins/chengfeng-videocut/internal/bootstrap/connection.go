package bootstrap

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Explicit existing-server access never executes a launcher or changes its registry.
// This is a local-development boundary, not a release-readiness assertion.
type ConnectionInput struct {
	Endpoint string `json:"endpoint"`
}
type Connection struct {
	Endpoint    string  `json:"endpoint"`
	PID         float64 `json:"pid"`
	BuildID     string  `json:"buildId"`
	Version     string  `json:"version"`
	RuntimeMode string  `json:"runtimeMode"`
}
type ProjectReadInput struct {
	Connection Connection `json:"connection"`
	ProjectID  string     `json:"projectId"`
	Resource   string     `json:"resource" jsonschema:"workflow, edit-list, subtitles, or visuals"`
}
type VisualsPutInput struct {
	Connection       Connection     `json:"connection"`
	ProjectID        string         `json:"projectId"`
	Confirmed        bool           `json:"confirmed"`
	ExpectedRevision string         `json:"expectedRevision"`
	Document         map[string]any `json:"document"`
}

const connectionLimit = 4 << 20

func connectionEndpoint(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid endpoint")
	}
	if u.Scheme != "http" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") || u.Port() == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return "", fmt.Errorf("endpoint must be an explicit HTTP loopback IP origin with port")
	}
	return "http://" + u.Host, nil
}

func connectionJSON(ctx context.Context, endpoint, path, method string, body any) (map[string]any, error) {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
		if len(data) > connectionLimit {
			return nil, fmt.Errorf("request too large")
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("redirect forbidden") }}
	response, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("service_unavailable: %w", err)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, connectionLimit+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > connectionLimit {
		return nil, fmt.Errorf("response too large")
	}
	var result map[string]any
	if err = json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("incompatible JSON response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		code := stringPath(result, "error", "code")
		return nil, fmt.Errorf("service HTTP %d %s: %s", response.StatusCode, code, stringPath(result, "error", "message"))
	}
	return result, nil
}

func connectExisting(ctx context.Context, c Contract, input ConnectionInput) (Connection, error) {
	if BuildChannel != "local-development" {
		return Connection{}, fmt.Errorf("existing-server access requires local-development Plugin; managed release readiness is unchanged")
	}
	endpoint, err := connectionEndpoint(input.Endpoint)
	if err != nil {
		return Connection{}, err
	}
	health, err := connectionJSON(ctx, endpoint, "/api/health", "GET", nil)
	if err != nil {
		return Connection{}, err
	}
	pid, _ := health["pid"].(float64)
	version := stringPath(health, "productVersion")
	build := stringPath(health, "studioBuildId")
	mode := stringPath(health, "runtimeMode")
	if health["schemaVersion"] != float64(1) || health["ok"] != true || health["product"] != "chengfeng-videocut" || pid <= 0 || build == "" || mode == "" || !semverAtLeast(version, c.MinimumRuntimeVersion) {
		return Connection{}, fmt.Errorf("incompatible service identity")
	}
	caps, err := connectionJSON(ctx, endpoint, "/chengfeng-videocut-capabilities.json", "GET", nil)
	if err != nil {
		return Connection{}, err
	}
	if caps["schemaVersion"] != float64(1) || caps["product"] != "chengfeng-videocut" || caps["studioVersion"] != version || !boolPath(caps, "features", "managedTimelineEditing") {
		return Connection{}, fmt.Errorf("incompatible service capabilities")
	}
	return Connection{endpoint, pid, build, version, mode}, nil
}

func checkConnection(ctx context.Context, c Contract, expected Connection) error {
	current, err := connectExisting(ctx, c, ConnectionInput{expected.Endpoint})
	if err != nil {
		return err
	}
	if current != expected {
		return fmt.Errorf("service_identity_changed: reconnect and review before continuing")
	}
	return nil
}
func projectResourcePath(id, resource string) (string, error) {
	if id == "" || id == "." || id == ".." || strings.ContainsAny(id, "/\\\x00") {
		return "", fmt.Errorf("invalid project id")
	}
	switch resource {
	case "workflow", "edit-list", "subtitles", "visuals", "cuts":
	default:
		return "", fmt.Errorf("unsupported resource")
	}
	return "/api/v1/projects/" + url.PathEscape(id) + "/" + resource, nil
}
func readConnectedProject(ctx context.Context, c Contract, input ProjectReadInput) (map[string]any, error) {
	path, err := projectResourcePath(input.ProjectID, input.Resource)
	if err != nil {
		return nil, err
	}
	if err = checkConnection(ctx, c, input.Connection); err != nil {
		return nil, err
	}
	result, err := connectionJSON(ctx, input.Connection.Endpoint, path, "GET", nil)
	if err != nil {
		return nil, err
	}
	revision := stringPath(result, "revision")
	if result["schemaVersion"] != float64(1) || result["projectId"] != input.ProjectID || !(revision == "none" || revisionPattern.MatchString(revision)) {
		return nil, fmt.Errorf("incompatible project response")
	}
	return result, nil
}
func putConnectedVisuals(ctx context.Context, c Contract, input VisualsPutInput) (map[string]any, error) {
	if !input.Confirmed || !(input.ExpectedRevision == "none" || revisionPattern.MatchString(input.ExpectedRevision)) || input.Document == nil {
		return nil, fmt.Errorf("confirmed, expectedRevision and document are required")
	}
	path, err := projectResourcePath(input.ProjectID, "visuals")
	if err != nil {
		return nil, err
	}
	if err = checkConnection(ctx, c, input.Connection); err != nil {
		return nil, err
	}
	written, err := connectionJSON(ctx, input.Connection.Endpoint, path, "PUT", map[string]any{"expectedRevision": input.ExpectedRevision, "document": input.Document})
	if err != nil {
		return nil, fmt.Errorf("write outcome unconfirmed; inspect current visuals before retry (an explicit revision_conflict rejects the write): %w", err)
	}
	readback, err := readConnectedProject(ctx, c, ProjectReadInput{input.Connection, input.ProjectID, "visuals"})
	if err != nil {
		return nil, fmt.Errorf("write may have committed; readback failed, do not retry blindly: %w", err)
	}
	if written["revision"] != readback["revision"] || !reflect.DeepEqual(written["document"], readback["document"]) {
		return nil, fmt.Errorf("write committed but readback changed; inspect before retry")
	}
	return readback, nil
}
func addConnectionTools(server *mcp.Server, c Contract) {
	addProjectConfigTools(server, c)
	addIngestTools(server, c)
	addModuleTools(server, c)
	addMediaTools(server, c)
	addWorkflowConnectionTools(server, c)
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_connect", Description: "Explicit local-development connection to an existing loopback workbench. Checks identity/capabilities; never starts services or changes managed installation. Not release readiness.", Annotations: readOnly}, func(ctx context.Context, _ *mcp.CallToolRequest, input ConnectionInput) (*mcp.CallToolResult, Connection, error) {
		v, e := connectExisting(ctx, c, input)
		return nil, v, e
	})
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_project", Description: "Read workflow, edit-list, subtitles or visuals from the explicitly connected workbench registry; rechecks service identity.", Annotations: readOnly}, func(ctx context.Context, _ *mcp.CallToolRequest, input ProjectReadInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := readConnectedProject(ctx, c, input)
		return nil, v, e
	})
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_visuals_put", Description: "Save a confirmed visual document with expectedRevision through the connected service's existing validator and writer, then read back. Does not upload module files.", Annotations: &mcp.ToolAnnotations{DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(false)}}, func(ctx context.Context, _ *mcp.CallToolRequest, input VisualsPutInput) (*mcp.CallToolResult, map[string]any, error) {
		v, e := putConnectedVisuals(ctx, c, input)
		return nil, v, e
	})
}
