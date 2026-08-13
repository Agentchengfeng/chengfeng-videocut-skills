package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	if len(os.Args) != 2 {
		fatal(fmt.Errorf("usage: native-mcp-smoke /absolute/path/to/mcp"))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "chengfeng-native-smoke", Version: "0.11.6-local.1"}, nil)
	cmd := exec.Command(os.Args[1])
	cmd.Stderr = os.Stderr
	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: cmd}, nil)
	if err != nil {
		fatal(err)
	}
	defer session.Close()
	if cache := os.Getenv("CHENGFENG_VIDEOCUT_SMOKE_RENAME_CACHE"); cache != "" {
		if err := os.Rename(cache, cache+"-renamed"); err != nil {
			fatal(fmt.Errorf("live cache rename failed: %w", err))
		}
	}
	init := session.InitializeResult()
	expectedServer := strings.TrimSpace(os.Getenv("CHENGFENG_VIDEOCUT_EXPECT_SERVER"))
	if expectedServer == "" {
		expectedServer = "chengfeng-videocut-local-development"
	}
	if init.ServerInfo == nil || init.ServerInfo.Name != expectedServer || init.ServerInfo.Version != "0.11.6-local.1" {
		fatal(fmt.Errorf("unexpected server info: %#v", init.ServerInfo))
	}
	listed, err := session.ListTools(ctx, nil)
	if err != nil {
		fatal(err)
	}
	names := []string{}
	byName := map[string]*mcp.Tool{}
	for _, tool := range listed.Tools {
		names = append(names, tool.Name)
		byName[tool.Name] = tool
	}
	sort.Strings(names)
	want := []string{"runtime_cli", "runtime_install", "runtime_status", "show_workflow_confirmation"}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		fatal(fmt.Errorf("tools=%v", names))
	}
	if byName["runtime_install"].Annotations == nil || byName["runtime_install"].Annotations.ReadOnlyHint {
		fatal(fmt.Errorf("runtime_install annotations are not write-impacting"))
	}
	if byName["runtime_cli"].Annotations == nil || byName["runtime_cli"].Annotations.OpenWorldHint == nil || !*byName["runtime_cli"].Annotations.OpenWorldHint {
		fatal(fmt.Errorf("runtime_cli must explicitly declare openWorldHint=true"))
	}
	if byName["show_workflow_confirmation"].Meta["openai/outputTemplate"] == nil {
		fatal(fmt.Errorf("Apps outputTemplate is missing"))
	}
	resource, err := session.ReadResource(ctx, &mcp.ReadResourceParams{URI: "ui://chengfeng-videocut/workflow-confirm-v1.html"})
	if err != nil {
		fatal(err)
	}
	if len(resource.Contents) != 1 || !strings.Contains(resource.Contents[0].Text, "approvalDigest") {
		fatal(fmt.Errorf("embedded Apps resource is incomplete"))
	}
	revision := strings.Repeat("a", 64)
	workflow, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "show_workflow_confirmation", Arguments: map[string]any{"projectId": "smoke", "stage": "cut_review_ready", "expectedProjectRevision": revision, "expectedCutsRevision": revision, "expectedEditListRevision": "none"}})
	if err != nil {
		fatal(err)
	}
	workflowJSON, _ := json.Marshal(workflow.StructuredContent)
	if !strings.Contains(string(workflowJSON), "continue_cut") {
		fatal(fmt.Errorf("workflow confirmation missing action"))
	}
	install, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "show_workflow_confirmation", Arguments: map[string]any{"kind": "runtime_install"}})
	if err != nil {
		fatal(err)
	}
	installJSON, _ := json.Marshal(install.StructuredContent)
	if strings.Contains(string(installJSON), `"approvalDigest":"`) || !strings.Contains(string(installJSON), "npm 平台包 integrity 或安装器摘要尚未发布") {
		fatal(fmt.Errorf("unpublished install plan did not fail closed: %s", installJSON))
	}
	status, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "runtime_status", Arguments: map[string]any{}})
	if err != nil {
		fatal(err)
	}
	statusJSON, _ := json.Marshal(status.StructuredContent)
	if expected := strings.TrimSpace(os.Getenv("CHENGFENG_VIDEOCUT_EXPECT_STATUS")); expected != "" {
		if !strings.Contains(string(statusJSON), `"state":"`+expected+`"`) {
			fatal(fmt.Errorf("runtime status=%s, want %s", statusJSON, expected))
		}
		if expected == "development_ready" && (!strings.Contains(string(statusJSON), `"developmentMode":true`) || !strings.Contains(string(statusJSON), `"releaseReady":false`)) {
			fatal(fmt.Errorf("development status lacks exact readiness fields: %s", statusJSON))
		}
	}
	fmt.Printf("PASS protocol=%s version=%s tools=%s resource=%d workflow=%d install=%d status=%s\n", init.ProtocolVersion, init.ServerInfo.Version, strings.Join(names, ","), len(resource.Contents[0].Text), len(workflowJSON), len(installJSON), statusJSON)
}

func fatal(err error) { fmt.Fprintln(os.Stderr, "native MCP smoke:", err); os.Exit(1) }
