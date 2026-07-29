import widgetHtml from "./public/review-confirm.html" with { type: "text" };
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const templateUri = "ui://chengfeng-videocut/workflow-confirm-v1.html";
const revision = z.string().regex(/^[a-f0-9]{64}$/, "revision must be a SHA-256 string");
const optionalDocumentRevision = z.union([revision, z.literal("none")]);
const stages = [
  "cut_review_ready",
  "storyboard_review_ready",
  "animation_review_ready",
  "timeline_review_ready",
];

const stageCopy = {
  cut_review_ready: {
    title: "口播删词已审核",
    prompt: "确认后才会执行物理剪切。",
    confirm: { label: "确认剪切", action: "continue_cut", next: "物理剪切" },
    review: { label: "继续审核", action: "return_cut_review", next: "返回删词" },
  },
  storyboard_review_ready: {
    title: "口播分镜已审核",
    prompt: "确认当前分镜后继续生成动画候选。",
    confirm: { label: "确认分镜", action: "continue_finish_storyboard", next: "生成动画" },
    review: { label: "继续调整", action: "return_finish_storyboard", next: "返回分镜" },
  },
  animation_review_ready: {
    title: "口播动画已审核",
    prompt: "确认当前动画后继续生成总时间线。",
    confirm: { label: "确认动画", action: "continue_finish_animation", next: "生成时间线" },
    review: { label: "继续调整", action: "return_finish_animation", next: "返回动画" },
  },
  timeline_review_ready: {
    title: "口播时间线已审核",
    prompt: "确认后才会导出并验收最终视频。",
    confirm: { label: "确认导出", action: "continue_finish_timeline", next: "导出成片" },
    review: { label: "继续调整", action: "return_finish_timeline", next: "返回时间线" },
  },
};

function optionsFor(stage) {
  const copy = stageCopy[stage];
  return [
    {
      id: "confirm",
      action: copy.confirm.action,
      label: copy.confirm.label,
      badge: "推荐",
      description: `使用当前已保存的审核结果，下一步：${copy.confirm.next}。`,
      nextStep: copy.confirm.next,
    },
    {
      id: "review",
      action: copy.review.action,
      label: copy.review.label,
      badge: "可修改",
      description: "保留当前状态，回到同一个 Studio 继续调整。",
      nextStep: copy.review.next,
    },
    {
      id: "pause",
      action: "pause_workflow",
      label: "保存并暂停",
      badge: "稍后继续",
      description: "保存当前审核状态，本次不执行下一阶段。",
      nextStep: "暂停任务",
    },
  ];
}

const optionSchema = z.object({
  id: z.string(),
  action: z.string(),
  label: z.string(),
  badge: z.string(),
  description: z.string(),
  nextStep: z.string(),
});

const server = new McpServer({ name: "chengfeng-videocut", version: "0.5.2" });

registerAppResource(
  server,
  "workflow-confirm-card",
  templateUri,
  {},
  async () => ({
    contents: [{
      uri: templateUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        ui: { prefersBorder: true },
        "openai/widgetDescription": "确认 chengfeng-videocut 人工审核阶段的下一步。",
        "openai/widgetPrefersBorder": true,
      },
    }],
  }),
);

registerAppTool(
  server,
  "show_workflow_confirmation",
  {
    title: "显示口播工作流确认卡片",
    description: "仅在 Studio 审核结果已保存后显示。卡片只把稳定 action 和 revision 交回当前对话，不直接剪切或导出。",
    inputSchema: {
      projectId: z.string().min(1),
      stage: z.enum(stages),
      expectedProjectRevision: revision,
      expectedCutsRevision: revision.optional(),
      expectedEditListRevision: optionalDocumentRevision.optional(),
      selectedCount: z.number().int().nonnegative().optional(),
      removedDuration: z.number().nonnegative().optional(),
    },
    outputSchema: {
      title: z.string(),
      prompt: z.string(),
      projectId: z.string(),
      stage: z.string(),
      expectedProjectRevision: z.string(),
      expectedCutsRevision: z.string().optional(),
      expectedEditListRevision: z.string().optional(),
      selectedId: z.string(),
      reviewSummary: z.string(),
      options: z.array(optionSchema),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    _meta: {
      ui: { resourceUri: templateUri },
      "openai/outputTemplate": templateUri,
      "openai/toolInvocation/invoking": "正在打开审核确认卡片...",
      "openai/toolInvocation/invoked": "审核确认卡片已打开",
    },
  },
  async (input) => {
    if (input.stage === "cut_review_ready" && !input.expectedCutsRevision) {
      throw new Error("cut_review_ready requires expectedCutsRevision");
    }
    if (input.stage === "cut_review_ready" && !input.expectedEditListRevision) {
      throw new Error("cut_review_ready requires expectedEditListRevision");
    }
    const details = [];
    if (Number.isFinite(input.selectedCount)) details.push(`已选 ${input.selectedCount} 个删除区间`);
    if (Number.isFinite(input.removedDuration)) details.push(`预计删除 ${input.removedDuration.toFixed(1)} 秒`);
    const copy = stageCopy[input.stage];
    const structuredContent = {
      title: copy.title,
      prompt: copy.prompt,
      projectId: input.projectId,
      stage: input.stage,
      expectedProjectRevision: input.expectedProjectRevision,
      ...(input.expectedCutsRevision ? { expectedCutsRevision: input.expectedCutsRevision } : {}),
      ...(input.expectedEditListRevision
        ? { expectedEditListRevision: input.expectedEditListRevision }
        : {}),
      selectedId: "confirm",
      reviewSummary: details.length > 0 ? details.join("，") : "审核状态与 revision 已保存",
      options: optionsFor(input.stage),
    };
    return {
      structuredContent,
      content: [{ type: "text", text: `${structuredContent.reviewSummary}。请在卡片中确认下一步。` }],
    };
  },
);

await server.connect(new StdioServerTransport());
