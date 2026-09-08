# 共享接入：先发现，再复用，缺失才安装

六个 Skill 启动时完整读取本文件，再执行各自业务合同。Skill 是能力与用法，Plugin 是宿主安装交付单位；一个 Plugin 可包含多个独立维护的 Skill。看到 Skill 文本不等于 Plugin 已启用或工具已加载。

## 先确定能力与实际入口

1. 明确本轮操作：检查版本、整理 Bug、生成隔离候选，还是读取/修改项目。前三者不一律要求 Runtime；不要为写 Bug 草稿或纯素材生成安装剪辑环境。
2. 只读检查宿主实际 installed/enabled Plugin 和当前可调用工具。Codex 可先用 `codex plugin list --json`，记录 pluginId、version、marketplaceName、source 与 enabled；installedPath 仅在宿主返回时记录，不猜 cache 路径。结合当前工具发现结果确认能力。下文短工具名须映射到实际加载的命名空间，不硬编码 MCP 前缀，也不把 release marketplace 当成唯一安装身份。
3. 用户提供已有工作台 endpoint 时，优先用实际加载的 `runtime_connect` 验证身份、版本和本操作能力，再读取目标项目；详见 [existing-workflow.md](existing-workflow.md)。仅健康 HTTP 不证明兼容，connection 不证明受管安装 ready。地址/项目缺失时询问必要信息，不任意扫描用户端口。
4. 没有明确已有 endpoint 时，依据已发现入口选择受管路线；仅此路线使用 `runtime_status`、受管 launcher 和 `service ensure`。`runtime_cli` 不跟随 connection，不能混用两条路线。任何分支失败不得退回任意源码 CLI、另一端口或复制注册项目。

## 诊断必须分层

| 实际证据 | 报告与下一步 |
| --- | --- |
| 已确定所需 Plugin 身份，且宿主记录确认未安装 | `plugin_missing`；先确认受信精确来源，再申请必要安装授权。查不到提供者信息时标未知，不能推断缺包。 |
| 已安装但 disabled | `plugin_disabled`；解释启用影响，按宿主正式流程处理，不重复下载。 |
| 已启用但所需工具未加载 | `tools_not_loaded`；检查实际工具发现/宿主加载状态，不当作未安装。 |
| 受管 `runtime_status` 为 missing | `managed_runtime_missing`；不是 Plugin 缺失。只走既有确认卡、approvalDigest 和精确资产 SHA-256 门禁。 |
| 已连接服务缺少本操作 API/能力 | `runtime_capability_missing`；列明缺项，不重装 Plugin 冒充修复。 |

若已有 Plugin 的版本确实缺少所需工具，报告版本能力差异，走用户确认的更新流程，而非首次安装。状态可以同时存在：Plugin 已安装、受管根缺失、显式 foreground 工作台可用并不矛盾。
多个提供者都可用时优先用户指定且已验证兼容的现有提供者；不能因功能同名就静默换成另一收费/云端服务或上传素材。能力不足但没有已验证的可用候选时，明确待开发/待适配，不猜测重装可以修复。

## 按业务核对能力

| 操作 | 必需入口与边界 |
| --- | --- |
| 查更新 / Bug 草稿 / 纯素材候选 | 宿主 Plugin 状态 / 已有证据 / 对应生成程序；无项目操作则不强制 Runtime。Bug 诊断只按需要只读探测。 |
| 已有项目读取 | `runtime_connect` + `runtime_project`，有效 connection、projectId 与资源 revision。 |
| 已有转录剪口播 | `runtime_playback` + `runtime_cuts_put`，`existingWorkflowApiVersion=1`；保留语义审核、确认与 CAS。 |
| 字幕 | `runtime_subtitle_inputs` + `runtime_subtitle_submit`，`existingWorkflowApiVersion=1`；复用原候选生成/校验及输入 SHA、CAS。 |
| 画面绑定 / 模块交付 | `runtime_visuals_put`；需要模块包才检查 `runtime_module_publish/get` 和 `modulePublishApiVersion=1`，不把纯候选制作视为发布。 |
| 导出 | `runtime_export_plan/start/job`，`existingWorkflowApiVersion=1`；计划成功、用户确认、snapshot 与 durable job 门禁不变。纯 WAV 最终导出未因此保证支持。 |
| 新 WAV 转录建档 / 修字 | 仅新服务 features.ingestApiVersion=1 / transcriptCorrectionApiVersion=1 可调用 runtime_ingest_start/status / runtime_transcript_correct；先授权费用、绑定源hash及无Product输出的任务目录，未知结果查原operationId。旧服务照常报缺能力，不称未安装，不自动切换或伪造转录。视频新建仍使用另行选定且通过完整门禁的受管路线。 |

## 缺失安装与更新后验收

只从用户确认或发布方可信说明中获得精确来源、Plugin selector 与固定版本/不可变 ref；不猜仓库 URL，不把当前包名推广成所有环境唯一身份。执行前用宿主官方帮助核对支持的命令，并说明安装/启用范围、候选版本与必要授权。当前已装来源应复用，不能为同名插件随意添加第二份。

Codex 的示意参数必须替换为已发现且核验过的真实值，不能原样执行：

```text
codex plugin marketplace upgrade <marketplace-name> --json
codex plugin add <plugin-name>@<marketplace-name> --json
codex plugin list --json
```

首次来源缺失才经官方 `plugin marketplace add` 使用上述受信精确来源；检查请求不授权安装。安装成功须读回 installed/enabled/version，并重新发现实际加载工具，按所需能力执行只读 probe（例如连接及项目读取）。只报告已证实的层级：installed 不等于 tools loaded，不等于 Runtime ready。若工具仍未加载，才提供宿主刷新/重开选项；不要断言必须新任务，也不要无限重装、手改 cache 或以安装代替能力实现。

## 旧任务工具未加载时

先核对同一提供者的 installed/enabled/version、当前实际工具清单与本操作的只读 probe；不以工具总数判定就绪。仅使用宿主确实支持的刷新方式，Runtime 启动或连接不等于宿主工具刷新；不承诺通用热刷新，不改服务名或杀未知进程。

宿主刷新不可用或尝试后无效，且用户已授权委派本业务时，可由一个新执行子 Agent 只读验证同一提供者、同一 endpoint 的工具接入。验证成功后明确唯一执行者再交接；新 Agent 可调用不代表原任务已刷新。未获委派授权或验证失败则报告具体阻塞，不循环派 Agent、不要求用户反复说“继续”，也不绕行源码 CLI。

交接保留任务目录、source SHA256、原 operationId 及已有 projectId/revisions，先查原 operation：running 则跟踪原操作，succeeded 则复用并回读；unknown/notfound 不是自动重提的授权。只读验证不授权付费或写入提交；后续业务仍须满足原任务授权与对应合同，不因交接自动重试。
