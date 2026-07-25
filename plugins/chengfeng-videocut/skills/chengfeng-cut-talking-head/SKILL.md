---
name: chengfeng-cut-talking-head
description: 剪辑中文口播原素材：逐词转录、识别口误与重复、生成删词候选、在 Studio 审核后执行可靠物理剪切，并重建剪后字幕。用户说剪口播、处理口误、生成口播基础素材、继续剪口播，或确认卡回传 action=continue_cut / return_cut_review 时使用。不要用于单独安装、单独打开工作台、普通视频编辑或口播分镜成片。
user-invocable: true
---

# 剪口播

这是 `chengfeng-videocut` 的第一个业务入口。目标产物只有：

```text
source_cut.mp4 + subtitles.srt
```

Skill 做语义判断与编排；产品 Runtime 是项目、Cuts、媒体剪切和 Studio 状态的唯一写入者。

先读取并执行 [两个业务 Skill 的阶段合同](../../references/business-workflow-contract.md)。本 Skill 的任何一次续跑也必须保持其中的固定阶段：`preflight -> Product state readback -> proposal -> Product CAS -> project-level review binding -> user confirmation -> Product execution -> outcome verification`。

## 0. 每次先做 Runtime 预检

从 Codex 已启用 Plugin 列表精确取得 `chengfeng-videocut` 的 `source.path`。`SKILL_DIR` 不是 Codex 保证注入的变量；禁止依赖它、硬编码开发机路径或用 `find` 猜测安装目录：

```bash
PLUGIN_ROOT="$(codex plugin list --json | node -e 'let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => { const rows = JSON.parse(s).installed || []; const hit = rows.filter(x => x.enabled && x.name === "chengfeng-videocut" && x.source && x.source.path); if (hit.length !== 1) process.exit(1); process.stdout.write(hit[0].source.path); });')"
test -n "$PLUGIN_ROOT" && test -f "$PLUGIN_ROOT/.codex-plugin/plugin.json" || { echo "chengfeng-videocut enabled plugin root unavailable" >&2; exit 1; }
ENSURE="$PLUGIN_ROOT/scripts/ensure-runtime.cjs"
RUNNING="$PLUGIN_ROOT/scripts/ensure-running.cjs"
STUDIO="$PLUGIN_ROOT/scripts/ensure-studio.cjs"
VC="$PLUGIN_ROOT/scripts/videocut-cli.cjs"

node "$ENSURE" --install-if-missing --json
```

必须把它作为当前任务的内联步骤：

- `ready`：继续本 Skill。
- `missing`：脚本只提示一次“正在从 GitHub Release 安装”，校验完成后自动续跑。
- `runtime_unhealthy`、安装失败或安装后 doctor 失败：报告结构化诊断并停止。
- `runtime_capability_missing`：当前 Runtime 健康但缺少本流程要求的可编辑 EDL 契约；停止并要求升级，禁止回退旧剪辑链。
- 预检阶段禁止启动服务、打开 Studio 或创建项目。

详细协议见 [Runtime 与产品契约](../../references/runtime-and-product-contract.md)。

## 1. preflight：接受真实输入并直接 Product 建档

只接受用户给出的真实口播视频或现有真实项目。没有真实媒体就停止；禁止用示例、占位视频或浏览器里的其他项目顶替。

```text
[真实视频]
    |
    v
[产品 Runtime 云端逐词转录]
    |
    v
[Product project create]
```

优先使用产品 Runtime 的原视频转录命令；若尚未提供，改用当前环境已经获准的**云端 ASR** 生成任务目录内的逐词候选。本流程禁止回退到本地 ASR。没有可用转录能力时明确报告 `missing_cloud_transcription_adapter`，不要打开 Studio，也不要伪造 transcript。

转录时固定传递 --language zh-CN；模型按产品 Runtime 默认，无需额外指定：

```bash
node "$VC" transcribe run "$taskLocalVideo" \
  --language zh-CN \
  --json
```

转录成功后，新任务由 Product 原子创建并准备；Skill 不得先写 `project.json`：

```bash
node "$VC" project create "$jobDir" \
  --video "$taskLocalVideo" \
  --transcript "$transcriptFile" \
  --aspect-ratio "$aspectRatio" \
  --json
```

`--video` 与 `--transcript` 必须是任务目录内的真实文件；`--aspect-ratio` 只能是 `3:4 / 4:3 / 16:9`，未指定时不传该参数让产品使用默认 `4:3`。已有规范项目先用 `inspect` 确认并复用；不要重复创建 `projectId`。只有恢复 `cut_prepare_running` 或明确刷新已有任务时才使用 `project prepare`。

`project create` 是本地真实视频和云端逐词稿进入 Product 的直接入口；不经过素材库、material-library、上传会话、导入 flow 或额外 Skill。创建成功后仍处于 preflight：在所有 state readback 和 Cuts API 前，让 Product 声明式确保常驻服务；脚本只调用 `service ensure --json`，不自行管理进程：

```bash
node "$RUNNING" --json
```

只有脚本确认服务 `healthy=true`、`runtimeMode=launchd`、版本兼容、PID 有效且 URL 为 canonical 5190 入口后，才继续。失败时透传 Product 的结构化错误并停止；禁止回退 foreground、换端口或杀未知进程。

随后进行 **Product state readback**，再产生任何语义候选：

```bash
node "$VC" workflow get "$jobDir" --json
node "$VC" cuts get "$jobDir" --json
```

两份 readback 必须指向同一个 Product 返回的 `projectId`，并保存当前 workflow stage、Project / Cuts / EditList revisions；缺失或不一致时停止，禁止猜测或用本地文件补齐。

## 2. proposal → Product CAS：生成并提交删词候选

先读 [语义删除规则](references/semantic-deletion.md)。候选只引用稳定 `wordIds`：

```json
{
  "schemaVersion": 1,
  "cutWordIds": ["word-12", "word-13"],
  "reasons": [
    { "wordIds": ["word-12", "word-13"], "kind": "repeat", "risk": "low" }
  ]
}
```

固定原则：

- 删除只有“删除 / 未删除”两态；AI 原因不形成“建议删除”第三态。
- 口误、重复和残句默认删前保后；长句、整句和分叉重说必须高风险复核。
- 普通停顿不由 Skill 计算。相邻静音合并与 `natural-pause-v2` 由 Product 确定性执行。
- 候选 `cutWordIds` 只列语义删词；禁止读取、复制或手工合并 `initialization.baselineCutWordIds`。`cuts set` 会以 semantic-overlay 让 Product 在锁内完成合并。
- 不直接写 `cut-selection.json`、`project.json` 或事件日志。

读取 Cuts 自己的 revision，再提交候选：

```bash
node "$VC" cuts get "$jobDir" --json
node "$VC" cuts set "$jobDir" \
  --file "$proposalFile" \
  --expected-revision "$latestCutsRevision" \
  --json
```

`cuts get.data.revision` 是 `cut-selection.json` 的 revision；`workflow get.data.revision` 是 `project.json` 的 revision。两者禁止混用。

`cuts set` 返回成功后，立即再次 `workflow get` 与 `cuts get`，确认 Product readback 的 `projectId`、`cut_review_ready`、Project / Cuts / EditList revisions；CAS 返回或读回不一致即停止并重新审核，绝不直接写 JSON 或自动覆盖。

## 3. project-level review binding：到人工审核时才打开 Studio

只有 transcript 与 Cuts 已落盘、工作流已经进入 `cut_review_ready`，才准备打开审核页。即使流程起点已经 ensure，打开前也必须再次幂等 ensure，再取得产品返回的项目 URL：

```bash
node "$RUNNING" --json
node "$VC" open "$jobDir" --json
```

不要直接打开这个 URL。先把返回的 URL 交给能力门禁：

```bash
node "$STUDIO" \
  --url "$productUrl" \
  --view koubo \
  --json
```

脚本会保留项目 hash，并确认 5190 单一产品入口真的注册了 HyperFrames 顶层 `koubo` 视图。只有返回 `ok=true`，才使用 Codex 内置浏览器打开 `studio.url`，然后停止自动推进，等待用户划词、恢复和保存。公开 Skill 不切换到第二个 Studio 端口。

在打开浏览器前，把 `productUrl` 的 `#project/<projectId>` 与刚才 API/readback 的 `projectId` 严格比对，并绑定 `stage=cut_review_ready`、Project / Cuts / EditList revisions。`ensure-studio` 的 `ok=true` 只证明产品面能力，不能代替 URL/hash 项目身份和 revision 的项目级绑定；任何一项不一致都重新 readback，不打开或确认。

`studio_capability_missing` 必须停止并说明版本不兼容；可以建议使用 `$chengfeng-report-videocut-bug` 生成脱敏 Issue 草稿。禁止仅因 URL 带有 `?view=koubo` 就认为新界面存在，也禁止回退到任何没有 capability manifest 的旧任务面板。

不要：

- 把“打开工作台”当任务第一步；
- 打开未通过 `ensure-studio.cjs` 的旧 Studio；
- 访问旧 `review.html`、8898 或 8899；
- 控制 Studio DOM、直接改媒体元素；
- 创建独立音频轨或占位字幕轨。

## 4. user confirmation → Product execution：确认卡与物理剪切

用户表示审核完成后：

1. 再次执行 `node "$RUNNING" --json`；成功后才恢复审核流程。页面关闭不代表服务停止，健康服务会被幂等复用。
2. 分别执行 `workflow get` 与 `cuts get`，取得当前 `projectId`、项目 revision、Cuts revision 与 `workflow get.data.editListRevision`。EDL 不存在时该值必须明确为 `none`，禁止省略。
3. 调用本插件 MCP App 的 `show_workflow_confirmation`，传入：

```text
projectId
stage=cut_review_ready
expectedProjectRevision
expectedCutsRevision
expectedEditListRevision
selectedCount（可选）
removedDuration（可选）
```

4. 卡片只回传 action，不直接剪切。
5. 收到 `action=continue_cut` 后再次执行 `node "$RUNNING" --json`，再执行 `workflow get` 与 `cuts get`；项目、Cuts、EDL 任一 revision 与卡片不一致，都停止并让用户核对新编辑。
6. 三个 revision 都一致时，仍使用卡片回传的确认 revision 执行；禁止把刚读取的“当前最新 revision”替换成确认 revision：

```bash
node "$VC" cuts apply "$jobDir" \
  --expected-revision "$confirmedProjectRevision" \
  --expected-edit-list-revision "$confirmedEditListRevision" \
  --confirmed \
  --json
```

`return_cut_review` 先再次 ensure-running，再返回同一 Studio；`pause_workflow` 保存状态后停止。

本次不实现一次性 confirmation receipt；卡片动作仍由 Agent 与 Product revision 比对约束，不把它描述为 Product 强制 receipt。

## 5. outcome verification：重建剪后字幕

物理剪切成功后，必须基于 `source_cut.mp4` 重新转录。先读 [剪后字幕校对](references/subtitle-correction.md)。禁止把原始字幕按删除区间机械拼成最终字幕。

字幕候选通过产品发布：

```bash
node "$VC" workflow get "$jobDir" --json
node "$VC" artifact put "$jobDir" \
  --type subtitles \
  --file "$subtitleProposal" \
  --expected-project-revision "$latestProjectRevision" \
  --expected-artifact-revision "$latestSubtitleRevisionOrNone" \
  --json
```

只有媒体可解码、有音频流、剪后字幕已发布且时间轴有效，才能报告基础素材包完成。报告必须分开写：Product 结构化 revision / artifact / verification 为 **API/readback PASS**；真实同项目浏览器帧审核才是 **visual frame PASS**；没有人实际听音时一律为 **human listening UNVERIFIED**，不得用播放、DOM、截图或媒体探测替代。

## 恢复与失败

- `revision_conflict`：重新读取状态，说明用户刚才的编辑，不自动覆盖；若 `reason=edit_list_changed_after_confirmation`，必须重新展示确认卡，不能沿用旧确认。
- `revision_required`：旧入口没有携带 `expectedEditListRevision`，按未确认处理并停止；禁止自动补成当前 EDL revision。
- `media_has_no_audio`：保留原素材和上一份有效产物，停止交付。
- `runtime_unhealthy`：不要循环重装。
- `service_identity_mismatch` 或 `service_port_conflict`：停止，不回退 foreground、不换端口、不杀未知进程。
- 页面关闭但服务仍在：读取 workflow 后从当前状态续做，不新建项目。
- 任何失败都不得把“能预览”说成“已经剪好”。
