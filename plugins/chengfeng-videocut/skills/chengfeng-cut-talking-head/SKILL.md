---
name: chengfeng-cut-talking-head
description: 剪辑中文口播原素材：逐词转录、按词典修正听错的专名、识别口误与重复、生成删词候选、打开 Studio 让用户复核。只产出一份已复核的删词账本，不切媒体、不做字幕、不做分镜动画。用户说剪口播、处理口误、生成口播基础素材、继续剪口播，或确认卡回传 action=return_cut_review 时使用。不要用于执行物理剪切、导出剪后视频、单独安装、单独打开工作台或口播分镜成片。
user-invocable: true
---

# 剪口播

这是 `chengfeng-videocut` 的第一个业务入口。目标产物只有一样：

```text
一份已经人工复核过的删词账本（Cuts + EDL）
```

**不切媒体。** 到本 Skill 结束为止，磁盘上没有任何新的视频文件——原片一动不动，账本记着哪些段要播，预览把它们拼起来给人听。物理剪切在下一段才发生。

```text
【本 Skill】──账本──▶ 导出 ──source_cut.mp4──▶ 字幕 ──subtitles.srt──▶ 分镜动画
```

**为什么不切**：账本改一次是几十毫秒，切一次是一个不可撤销的文件。把删词判断和媒体产出分开，用户就能反复改到满意，而不必为每一版都付一次剪切的代价。

Skill 做语义判断与编排；产品 Runtime 是项目、Cuts、媒体剪切和 Studio 状态的唯一写入者。

先读取并执行 [业务 Skill 的阶段合同](../../references/business-workflow-contract.md)。本 Skill 的任何一次续跑都必须保持其中的固定阶段，并且**只走到审核绑定为止**：`preflight -> Product state readback -> proposal -> Product CAS -> project-level review binding`。后面三个阶段（user confirmation -> Product execution -> outcome verification）属于导出 Skill。

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

## 2. 修字：把听错的专名换回来

**在判断该删什么之前做，不是之后。**

转录会把专名听错，也会把同一个词写成好几种。真实项目上一份 39 个含字母的词里出现过
**16 种写法**：`Grok` 被听成 `Clock` / `Glock` / `Gokul`，`Codex` 写成 `CodeX` / `codex`。

**删词修不掉这个。** 听错的字不是多余的话——把 `Clock` 删掉，那句话就缺一个词。

**词典这一步产品自己会做**，不用手工产对照表：

```bash
node "$VC" transcript dictionary "$jobDir" \
  --dictionary "$PLUGIN_ROOT/references/ai-term-dictionary.md" --json
```

它直接改，并列出改了哪几处、每处的上下文。**改完要看那份清单**——词典不看上下文，
所以它也会改错（比如把说话人真说的「Skills」normalize 成「Skill」）。看到不对就改词典，
不要在别处打补丁。

只有词典解决不了、而作者手上有稿子时，才追加一次上下文对齐：

```bash
node "$VC" transcript align "$jobDir" --script "$scriptPath" --json   # 只报不改
node "$VC" transcript correct "$jobDir" --file "$correctionFile" --json
```

固定原则：

- **只改文字，不改时间、不改词数、不改 wordId。** 产品会逐词比对时间戳，动了任何一个直接拒绝——时间是所有已做剪辑的地基。
- **只换写法，不换意思。** 说话人真的说错又重说，那属于残句改口，归下一步删词管。
- **词典里没有、且稿子里没有任何一个写法能确认正确时，不许猜。** 报告出来，留给人补词典。往用户片子里塞一个编的名字，比留一个听错的名字更坏。
- 中文口语按原文保留。说话人说「叉」「大模型」「智能体」，那就是他说的话。
- **同一段音频转两遍，结果不一样。** 实测第二遍把 `Grok` 听成 `Clock` / `Gokul` / `Glock`，
  `Codex` 听成 `CodeX`。所以词典不是「偶尔修个别名字」，是**每次转录都要过的一道闸**。

**为什么必须在判断之前**：稿子还是错的时候去判断该删什么，判断就得一路绕开错名字——
判据里那条「专名听错不算删除理由」就是这么来的，它是补丁，不是解法。修完字，那条补丁才不用生效。

## 文稿是按标点分段的

转录里每个词带着它后面的标点（火山给的），文稿栏按标点分段——**一个逗号就是一段**。
所以那一栏读起来是一句一行，不是一整坨。

```text
我现在很少刷X了，
因为今天有什么值得研究已经被我外包给了Codex和Grok。
每天早上，
Codex都会调用Grok
```

字幕那一段也吃同一份标点，所以两边的断句是一致的。

**老项目可能没有标点**（2026-07-28 之前转的）。分段规则改了但转录没变的项目，
跑一次重切段落即可，不必重新转录：

```bash
node "$VC" transcript regroup "$jobDir" --json
```

它逐词校验 id / 时间 / 文字不变，所以对已经剪过、配过字幕的项目是安全的。
**真要标点还是得重转一次** —— 标点在转录里根本不存在，算不出来。

## 3. proposal → Product CAS：生成并提交删词候选

先读 [语义删除规则](references/semantic-deletion.md)。

**判断前必须取 Product 的播放顺序视图，不许自己从 `transcript.json` 拼：**

```bash
node "$VC" transcript playback "$jobDir" --json
```

判断「说了两遍」靠的是**播出来相邻**，不是文件里存着相邻。剪过的项目里段号必然跳号，而跳号会被
读成「有内容没给我看」，从而拒绝判断——2026-07-26 因此误否了两条正确判断。自己拼这份视图错过两次，
错法和后果见判据文件的「判断之前」一节。

候选只引用稳定 `wordIds`：

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
- **「只列语义删词」指本轮判断的完整结论，不是本轮新找到的增量。** semantic-overlay 是替换语义：Product 用「停顿基线 ∪ 本次提交」重建删词集合，上一次提交的语义词不会被保留。2026-07-26 交了增量，删词数从 430 掉到 394，声音仍对但账本退了，而 `changed: true` 看着一切正常。
- `reasons` 会被落盘（2026-07-26 起），要如实写。Product 保证理由不会比它解释的删除活得久，也会裁掉提到未删词的部分。
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

`cuts set` 自己会回读核对写入结果，成功时结果带 `readBackVerified: true`；写入与读回不一致会报 `readback_mismatch` 而不是返回成功。

**成功之后必须看 `noLongerCut`**：这是本次不再删的词数与样本。不为零且不是有意撤回，就说明交了增量，回去补全量重交。读不到当前状态时它是 `"unknown"`，那也要看见。

随后仍要立即再次 `workflow get` 与 `cuts get`，确认 Product readback 的 `projectId`、`cut_review_ready`、Project / Cuts / EditList revisions；CAS 返回或读回不一致即停止并重新审核，绝不直接写 JSON 或自动覆盖。

## 4. project-level review binding：到人工审核时才打开 Studio

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

## 5. 交棒：到账本为止

用户表示复核完成后，**本 Skill 就结束了**。不弹确认卡，不执行剪切。

结束前读回一次，把状态说清楚：

```bash
node "$VC" workflow get "$jobDir" --json
node "$VC" cuts get "$jobDir" --json
```

报告里写明三件事，然后告诉用户下一步跑导出：

```text
删了多少词、少了多少秒
当前 stage（应为 cut_review_ready）
项目 / Cuts / EDL 三个 revision
```

`return_cut_review`：先再次 `node "$RUNNING" --json`，再返回同一 Studio 继续复核。

**不要替用户决定「顺手剪了吧」。** 物理剪切不可撤销，它的确认卡属于导出 Skill —— 那张卡冻结的 revision 必须是用户按下确认那一刻的，不是复核结束那一刻的。这两个时刻之间用户随时可能再改一刀。

报告必须分开写：Product 结构化 revision 为 **API/readback PASS**；真实同项目浏览器帧审核才是 **visual frame PASS**；没有人实际听音时一律为 **human listening UNVERIFIED**，不得用播放、DOM、截图或媒体探测替代。

## 恢复与失败

- `revision_conflict`：重新读取状态，说明用户刚才的编辑，不自动覆盖。
- `runtime_unhealthy`：不要循环重装。
- `service_identity_mismatch` 或 `service_port_conflict`：停止，不回退 foreground、不换端口、不杀未知进程。
- 页面关闭但服务仍在：读取 workflow 后从当前状态续做，不新建项目。
- 任何失败都不得把「账本已写」说成「已经剪好」。**到这一段为止没有任何媒体文件产生**，说成剪好了就是在报告一件没发生的事。
