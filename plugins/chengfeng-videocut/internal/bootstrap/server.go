package bootstrap

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"

	pluginassets "github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const TemplateURI = "ui://chengfeng-videocut/workflow-confirm-v1.html"

var Version = "0.11.0"
var revisionPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type ConfirmationInput struct {
	Kind                     string   `json:"kind,omitempty" jsonschema:"workflow or runtime_install"`
	ProjectID                string   `json:"projectId,omitempty"`
	Stage                    string   `json:"stage,omitempty"`
	ExpectedProjectRevision  string   `json:"expectedProjectRevision,omitempty"`
	ExpectedCutsRevision     string   `json:"expectedCutsRevision,omitempty"`
	ExpectedEditListRevision string   `json:"expectedEditListRevision,omitempty"`
	SelectedCount            *int     `json:"selectedCount,omitempty"`
	RemovedDuration          *float64 `json:"removedDuration,omitempty"`
}

type RuntimeInstallInput struct {
	ApprovalDigest string `json:"approvalDigest"`
}
type RuntimeCLIInput struct {
	Argv []string `json:"argv"`
}
type EmptyInput struct{}

type stageText struct{ title, prompt, confirmLabel, confirmAction, confirmNext, reviewLabel, reviewAction, reviewNext string }

var stages = map[string]stageText{
	"cut_review_ready":        {"口播删词已审核", "确认后才会执行物理剪切。", "确认剪切", "continue_cut", "物理剪切", "继续审核", "return_cut_review", "返回删词"},
	"storyboard_review_ready": {"口播分镜已审核", "确认当前分镜后继续生成动画候选。", "确认分镜", "continue_finish_storyboard", "生成动画", "继续调整", "return_finish_storyboard", "返回分镜"},
	"animation_review_ready":  {"口播动画已审核", "确认当前动画后继续生成总时间线。", "确认动画", "continue_finish_animation", "生成时间线", "继续调整", "return_finish_animation", "返回动画"},
	"timeline_review_ready":   {"口播时间线已审核", "确认后才会导出并验收最终视频。", "确认导出", "continue_finish_timeline", "导出成片", "继续调整", "return_finish_timeline", "返回时间线"},
}

func NewServer(c Contract) *mcp.Server {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	server := mcp.NewServer(&mcp.Implementation{Name: "chengfeng-videocut", Version: Version}, &mcp.ServerOptions{Logger: logger})
	server.AddResource(&mcp.Resource{
		Name: "workflow-confirm-card", Title: "chengfeng-videocut 审核与安装确认", URI: TemplateURI,
		Description: "确认已保存的工作流 revision，或确认 Product Runtime 安装计划。", MIMEType: "text/html;profile=mcp-app",
		Meta: mcp.Meta{"ui": map[string]any{"prefersBorder": true}, "openai/widgetDescription": "确认 chengfeng-videocut 的人工审核阶段或 Runtime 安装计划。", "openai/widgetPrefersBorder": true},
	}, func(ctx context.Context, req *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		if req.Params.URI != TemplateURI {
			return nil, fmt.Errorf("unknown resource %s", req.Params.URI)
		}
		return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{URI: TemplateURI, MIMEType: "text/html;profile=mcp-app", Text: pluginassets.ReviewHTML, Meta: mcp.Meta{"ui": map[string]any{"prefersBorder": true}, "openai/widgetDescription": "确认 chengfeng-videocut 的人工审核阶段或 Runtime 安装计划。", "openai/widgetPrefersBorder": true}}}}, nil
	})
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true, OpenWorldHint: boolPtr(false), DestructiveHint: boolPtr(false), IdempotentHint: false}
	appsMeta := mcp.Meta{"ui": map[string]any{"resourceUri": TemplateURI}, "openai/outputTemplate": TemplateURI, "openai/toolInvocation/invoking": "正在打开确认卡片...", "openai/toolInvocation/invoked": "确认卡片已打开"}
	mcp.AddTool(server, &mcp.Tool{Name: "show_workflow_confirmation", Title: "显示工作流或安装确认卡片", Description: "只显示并回传稳定 revision 或 approvalDigest；不直接剪切、导出或安装。安装确认摘要是 Agent/host 的确认门，不是用户身份的密码学认证。", Annotations: readOnly, Meta: appsMeta}, func(ctx context.Context, req *mcp.CallToolRequest, input ConfirmationInput) (*mcp.CallToolResult, map[string]any, error) {
		output, err := confirmationOutput(c, input)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: output["reviewSummary"].(string) + "。请在卡片中确认下一步。"}}}, output, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_status", Title: "检查 Product Runtime", Description: "只检查唯一受管 Product Runtime 启动器、版本与 doctor 状态；不从 PATH 或源码回退。", Annotations: readOnly}, func(ctx context.Context, req *mcp.CallToolRequest, input EmptyInput) (*mcp.CallToolResult, RuntimeStatus, error) {
		status := inspectRuntime(ctx, c)
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("Runtime 状态：%s", status.State)}}}, status, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_install", Title: "安装 Product Runtime", Description: "仅接受确认卡片返回的 approvalDigest；重新计算 release、平台单个 Runtime 安装包、目标与影响摘要，精确匹配后校验 SHA-256 并在本地执行安装包。安装包内含受管依赖，安装过程不再下载依赖。此门防误操作，不构成身份认证。", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(true), IdempotentHint: false}}, func(ctx context.Context, req *mcp.CallToolRequest, input RuntimeInstallInput) (*mcp.CallToolResult, map[string]any, error) {
		output, err := installRuntime(ctx, c, strings.ToLower(strings.TrimSpace(input.ApprovalDigest)))
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "Product Runtime 已通过摘要校验并安装完成。"}}}, output, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "runtime_cli", Title: "调用 Product Runtime CLI", Description: "仅接收结构化 argv，并通过唯一受管启动器直接传参；不接受 shell 字符串、cwd、环境变量或 stdin。", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true), OpenWorldHint: boolPtr(true), IdempotentHint: false}}, func(ctx context.Context, req *mcp.CallToolRequest, input RuntimeCLIInput) (*mcp.CallToolResult, CommandResult, error) {
		if err := validateArgv(input.Argv); err != nil {
			return nil, CommandResult{}, err
		}
		launcher, err := validateManagedLauncher(c)
		if err != nil {
			return nil, CommandResult{}, err
		}
		fingerprint, err := launcherFingerprint(launcher)
		if err != nil {
			return nil, CommandResult{}, fmt.Errorf("fingerprint managed runtime launcher: %w", err)
		}
		result := runRuntimeCommand(ctx, launcher, input.Argv)
		if err := verifyLauncherFingerprint(c, fingerprint); err != nil {
			result.OK = false
			result.Failure = "launcher_integrity_changed"
			result.Stderr = strings.TrimSpace(result.Stderr + "\n" + err.Error())
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: fmt.Sprintf("Product Runtime CLI exit=%d", result.ExitCode)}}, IsError: !result.OK}, result, nil
	})
	return server
}

func confirmationOutput(c Contract, input ConfirmationInput) (map[string]any, error) {
	if input.Kind == "runtime_install" {
		plan, err := BuildInstallPlan(c)
		if err != nil {
			return nil, err
		}
		availability := "安装资产与影响已固定"
		options := []map[string]any{{"id": "confirm", "action": "install_runtime", "label": "确认安装", "badge": "会写入", "description": plan.Impact, "nextStep": "下载一个 Runtime 安装包、校验摘要并本地安装（不下载依赖）"}, {"id": "pause", "action": "pause_workflow", "label": "暂不安装", "badge": "不写入", "description": "保留当前环境，本次不下载或执行任何内容。", "nextStep": "暂停任务"}}
		selected := "confirm"
		prompt := "确认后 Agent 可把 approvalDigest 原样交给 runtime_install。此确认门防误操作，不是身份认证。"
		if !validSHA256(plan.RuntimePackageSHA256) {
			availability = "Runtime 0.5.0 单个安装包摘要尚未发布；执行会 fail-closed"
			options = options[1:]
			selected = "pause"
			prompt = "Release 摘要尚未锁定，本卡片只展示计划并允许暂停；不会生成可执行 approvalDigest。"
		}
		output := map[string]any{
			"kind": "runtime_install", "title": "安装 Product Runtime", "prompt": prompt,
			"projectId": "runtime", "stage": "runtime_install_ready", "selectedId": selected, "reviewSummary": availability,
			"installPlan": plan, "options": options,
		}
		if plan.ApprovalDigest != "" {
			output["approvalDigest"] = plan.ApprovalDigest
		}
		return output, nil
	}
	copy, ok := stages[input.Stage]
	if !ok {
		return nil, fmt.Errorf("unsupported stage %q", input.Stage)
	}
	if strings.TrimSpace(input.ProjectID) == "" || !revisionPattern.MatchString(input.ExpectedProjectRevision) {
		return nil, fmt.Errorf("workflow confirmation requires projectId and a SHA-256 expectedProjectRevision")
	}
	if input.Stage == "cut_review_ready" && (!revisionPattern.MatchString(input.ExpectedCutsRevision) || !(revisionPattern.MatchString(input.ExpectedEditListRevision) || input.ExpectedEditListRevision == "none")) {
		return nil, fmt.Errorf("cut_review_ready requires cuts and edit-list revisions")
	}
	details := []string{}
	if input.SelectedCount != nil && *input.SelectedCount >= 0 {
		details = append(details, fmt.Sprintf("已选 %d 个删除区间", *input.SelectedCount))
	}
	if input.RemovedDuration != nil && *input.RemovedDuration >= 0 {
		details = append(details, fmt.Sprintf("预计删除 %.1f 秒", *input.RemovedDuration))
	}
	if len(details) == 0 {
		details = append(details, "审核状态与 revision 已保存")
	}
	output := map[string]any{"kind": "workflow", "title": copy.title, "prompt": copy.prompt, "projectId": input.ProjectID, "stage": input.Stage, "expectedProjectRevision": input.ExpectedProjectRevision, "selectedId": "confirm", "reviewSummary": strings.Join(details, "，"), "options": []map[string]any{{"id": "confirm", "action": copy.confirmAction, "label": copy.confirmLabel, "badge": "推荐", "description": "使用当前已保存的审核结果。", "nextStep": copy.confirmNext}, {"id": "review", "action": copy.reviewAction, "label": copy.reviewLabel, "badge": "可修改", "description": "保留当前状态，回到同一个 Studio 继续调整。", "nextStep": copy.reviewNext}, {"id": "pause", "action": "pause_workflow", "label": "保存并暂停", "badge": "稍后继续", "description": "保存当前审核状态，本次不执行下一阶段。", "nextStep": "暂停任务"}}}
	if input.ExpectedCutsRevision != "" {
		output["expectedCutsRevision"] = input.ExpectedCutsRevision
	}
	if input.ExpectedEditListRevision != "" {
		output["expectedEditListRevision"] = input.ExpectedEditListRevision
	}
	return output, nil
}

func boolPtr(value bool) *bool { return &value }
