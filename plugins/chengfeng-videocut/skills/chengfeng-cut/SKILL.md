---
name: chengfeng-cut
description: 剪辑中文口播原素材：逐词转录、词典修字出修字表、五轮扫描找口误与重复、汇总表与重复句子表、打开 Studio 让用户复核、复盘沉淀用户偏好与词典。只产出一份已复核的删词账本，不切媒体、不做字幕、不做分镜动画。用户说剪口播、处理口误、生成口播基础素材、继续剪口播，或确认卡回传 action=return_cut_review 时使用。不要用于执行物理剪切、导出剪后视频、单独安装、单独打开工作台或口播分镜成片。
user-invocable: true
---

# 剪口播

从一条视频到**一份人工复核过的删词账本（Cuts + EDL）**，不碰媒体文件。七步一线：

```text
0  就绪     引用「检查更新」的就绪检查（本 Skill 不带环境逻辑）
1  建档     真实视频 → 云端逐词转录 → 产品建项目 → 起服务 → 读回状态
2  修字     词典把字改对（通用一本 + 用户一本）→ 出修字表
3  删词     读偏好与规则 → 五轮扫描，每轮只找一类，只记行
4  汇总     删词汇总表 + 重复句子表 → 按表自读校验
5  审核     全量提交 → 两张表呈给用户 → 打开 Studio 亲自复核
6  复盘交棒  对比提案与终版 → 归档三抽屉 → 报告四件事
```

**不切媒体**：账本改一次是几十毫秒，切一次是一个不可撤销的文件。到本 Skill 结束，
磁盘上没有任何新视频。Skill 做语义判断与编排；产品 Runtime 是项目、Cuts 和
Studio 状态的唯一写入者。

**用户只在三处说话**：同源项目选继续还是重来（仅剪过时）、Studio 复核、完成确认。
其余一律单向汇报，不停下等回复。**每步的完成判据是它的产出物**：没出表，不算完成。

先读取并执行 [业务 Skill 的阶段合同](../../references/business-workflow-contract.md)。
本文步骤与合同阶段的对应：1=preflight+Product state readback，5=proposal+Product CAS，
审核=project-level review binding。合同后三个阶段（确认、执行、验收）属于导出 Skill。

各条规矩的事故来历在 [事故簿](references/lessons.md)——规矩在正文，故事在那边。

## 0. 就绪

先执行 [检查更新](../chengfeng-check-updates/SKILL.md) 的「就绪检查」——skills 是否
最新、Runtime 是否配套；**插件根**也在那里定位（本文命令里的 `<插件根>` 都代入
那个字面路径）。只有拿到「就绪」才继续；「需新会话」或「停」都按它的处置执行
（含「禁止自制替代界面」禁令）。

若就绪结果为 `runtime.kind=desktop-managed`，它与 CLI 安装共用同一稳定入口和
`launchd/windows-task` 服务，直接继续；不要查找 Electron 安装目录、另装 Bun /
FFmpeg，或启动第二个 Runtime。

## 1. 建档：真实输入 → 转录 → 产品建项目

**干什么**：把用户的本地真实视频和云端逐词稿交给产品，原子建档，起服务，读回状态。

下列均调用 MCP `runtime_cli`；`argv` 是结构化数组，不拼 shell 字符串：

```json
{"argv":["project","create","<项目目录>","--video","<任务目录内的视频文件>","--transcript","<任务目录内的逐词稿>","--json"]}
{"argv":["service","ensure","--json"]}
{"argv":["workflow","get","<项目目录>","--json"]}
{"argv":["cuts","get","<项目目录>","--json"]}
```

规矩：

- 只接受用户给出的真实口播视频或现有真实项目；没有真实媒体就停止，禁止用示例、
  占位视频顶替
- 转录只用当前环境已获准的**云端 ASR**；禁止回退本地 ASR；没有可用云端 ASR 时报告
  `missing_cloud_transcription_adapter`，不开 Studio、不伪造 transcript
- `--video` / `--transcript` 必须是任务目录内的真实文件；画幅比不要传——产品会
  从视频实际尺寸自动推导（Runtime 0.4.4+）。只有用户明确要求特殊画幅时才加
  `--aspect-ratio W:H`
- 已有规范项目先 `inspect` 确认并复用，不重复创建 `projectId`；同一个视频剪过时
  问用户：继续上次，还是重来（这是三个说话点之一）。`project prepare` 是幂等
  编译器，只在恢复中断或明确刷新时用，中断了直接重跑即可
- `project create` 是唯一入口：不经过素材库、上传会话或额外 Skill；Skill 不得先写
  `project.json`
- 服务必须由脚本确认 `healthy=true`、`runtimeMode=launchd`（macOS）或
  `runtimeMode=windows-task`（Windows）、版本兼容、URL 为
  canonical 5190 后才继续；失败透传结构化错误并停止，禁止回退 foreground、换端口、
  杀未知进程
- 两份 readback 必须指向同一个 `projectId`，保存 workflow stage 与
  Project / Cuts / EditList 三个 revision；缺失或不一致即停止

## 2. 修字：把字改对，出修字表

**干什么**：在一切删词判断**之前**用词典修正转录听错的字——字不对，后面的判断必错；
听错的字不是多余的话，删词修不掉它。

```json
{"argv":["transcript","dictionary","<项目目录>","--dictionary","<插件根>/references/ai-term-dictionary.md","--json"]}
```

用你的文件工具检查 `$HOME/.chengfeng-videocut/dictionary.md` 是否存在；存在就再过一遍
（过渡做法：CLI 暂只收单文件，分两次跑；它只能补充、不能撤销上一遍——完整的
用户优先合并等多词典 CLI 发布）：

```json
{"argv":["transcript","dictionary","<项目目录>","--dictionary","<用户主目录>/.chengfeng-videocut/dictionary.md","--json"]}
```

**产出物：修字表**——把两次调用返回的 `applied` 清单合并成一张小表（原词 → 改成 →
上下文），报给用户。**改完必须看这份表**——词典不看上下文也会改错；看到不对就改
词典，不在别处打补丁。

只有词典解决不了、且作者手上有稿子时，才追加一次上下文对齐：

```json
{"argv":["transcript","align","<项目目录>","--script","<口播稿文件>","--json"]}
{"argv":["transcript","correct","<项目目录>","--file","<修正文件>","--json"]}
```

规矩：

- **只改文字，不改时间、词数、wordId**——产品逐词比对时间戳，动了直接拒绝
- **只换写法，不换意思**——真说错又重说的属于残句改口，归删词管
- 词典没有、稿子也确认不了的，**不许猜**：报告出来留给人补词典。塞一个编的名字
  比留一个听错的名字更坏
- 中文口语按原文保留：说「叉」「大模型」就是他说的话
- 词典是**每次转录都要过的一道闸**（同一段音频转两遍结果都不一样，见事故簿）

**文稿按标点分段**：转录里每个词带标点，文稿一个逗号一段、一句一行；字幕吃同一份
标点，两边断句一致。2026-07-28 之前的老项目没有标点，跑
调用 `runtime_cli`，参数 `{"argv":["transcript","regroup","<项目目录>","--json"]}` 重切段落即可（逐词校验 id/时间/文字
不变，对剪过的项目安全）；真要标点得重转——标点在旧转录里根本不存在。

## 3. 删词：五轮扫描，每轮只找一类

**干什么**：读材料，然后把播放顺序完整读五遍，每遍只带一个判据。一次带一个判据去读，
判断质量远高于一次带六个；每轮产出小、可检查。

先读材料：

```json
{"argv":["transcript","playback","<项目目录>","--json"]}
```

再用你的读文件工具读 `$HOME/.chengfeng-videocut/cut-preferences.md`（用户偏好，
他说过的算数；文件不存在就是新用户，跳过）。

判据在 [语义删除规则](references/semantic-deletion.md)（原则 + 判例）。
教材优先级：**用户偏好 > 用户判例 > 通用判例**。

```text
第 1 轮  重复          句间重复、句内重复（最客观：两遍相同）
第 2 轮  残句与改口     说一半断掉、换个说法重说
第 3 轮  口误重说       说错的数字、专名、词，后面重说对的
第 4 轮  英文卡壳       词头 / 字母 / 音节重复
第 5 轮  口头禅与语气词  最主观，按用户偏好的密度与容忍度来
```

每轮动作固定：按本轮类型查判例 → 找到一处记一行（wordIds + 类型 + 风险）→
**不定夺别的类型**。后面轮次遇到已标记的词直接跳过，冲突留到汇总解决。

规矩：

- **判断只用 `transcript playback` 的播放顺序，不许自己从 `transcript.json` 拼**——
  「说了两遍」靠播出来相邻，自己拼会把跳号读成缺内容而误否（见事故簿）
- 删除只有「删除 / 未删除」两态；AI 原因不形成「建议删除」第三态
- 口误、重复、残句默认删前保后；长句、整句、分叉重说必须高风险复核
- 普通停顿不由 Skill 计算：相邻静音合并与 `natural-pause-v2` 由产品确定性执行

## 4. 汇总：两张表，表出来才动手

**干什么**：五轮的行合并成两张表——这是本步的产出物，也是给用户看的东西。

**删词汇总表**（逐条删词决定）：

```text
| # | 时间   | 类型   | 删除              | 剩下读作          | 风险 | 依据      |
|---|-------|--------|------------------|------------------|-----|----------|
| 1 | 00:12 | 重复   | 这个功能呢         | 这个功能它其实      | 低  | 判例 R2   |
| 2 | 02:31 | 改口   | 比如我就让他跟踪    | 比如我让grok跟踪    | 高  | 判例 R5   |
```

**重复句子表**（说了多遍的句子，逐词表看不出「录了几遍、保哪遍」，而这正是用户
最想核对的）：

```text
| 句子（开头）      | 说了几遍 | 保了哪遍        | 删了哪几遍   | 风险            |
|-----------------|--------|---------------|------------|-----------------|
| 因为今天有什么…   | 3      | 第 3 遍 00:08  | 第 1、2 遍  | 低——三遍基本一致  |
| 多数Agent能搜…   | 2      | 第 2 遍 04:40  | 第 1 遍     | 高——两遍说法有出入，重点听 |
```

然后**自读**：按表把删后的全文按播放顺序通读一遍，读不通的行撤销。
这是复核的定义：AI 自己再看一遍，不是拿去问用户；拿不准 = 不列（两态）。

## 5. 审核：到人工审核时才打开 Studio

**干什么**：全量提交候选，把两张表呈给用户，然后打开产品审核页让用户亲自复核。

```json
{"argv":["cuts","get","<项目目录>","--json"]}
{"argv":["cuts","set","<项目目录>","--file","<提案文件>","--expected-revision","<Cuts当前revision>","--json"]}
```

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

提交规矩：

- 候选是**本轮判断的完整结论，不是增量**——`cuts set` 是替换语义，交增量会把上一轮
  语义删词静默丢掉（见事故簿）；提交候选时禁止读取或手工合并
  `initialization.baselineCutWordIds`（产品自动并入停顿基线）
- `reasons` 落盘，如实写；产品会裁掉提到未删词的部分
- 不直接写 `cut-selection.json`、`project.json` 或事件日志
- `cuts get.data.revision` 是 Cuts 的 revision，`workflow get.data.revision` 是项目的，
  **禁止混用**
- 提交成功后必看 `noLongerCut`（本次不再删的词数）：不为零且非有意撤回 = 交了增量，
  回去补全量重交；读到 `"unknown"` 也要看见
- 随后立即再次 `workflow get` + `cuts get`，确认 `cut_review_ready` 与三个 revision；
  不一致即停，绝不直接写 JSON 或自动覆盖
- **提交后把 `<提案文件>` 留在任务目录**——第 6 步复盘要用（reasons 在用户编辑后
  会被产品裁掉，事后从账本反查不可靠）

然后**先呈表、再开页**：把两张表发给用户，让他拿着表进 Studio 复核。

```json
{"argv":["service","ensure","--json"]}
{"argv":["open","<项目目录>","--json"]}
```

随后用 Codex 内置浏览器读取同一 canonical origin 的
`/chengfeng-videocut-capabilities.json`，验证其中声明 `koubo` 顶层视图；不要再调用
Plugin 的 Node `ensure-studio.cjs`。

规矩：

- 只有门禁返回 `ok=true` 才用 Codex 内置浏览器打开 `studio.url`，然后停止自动推进，
  等用户划词、恢复、保存
- 打开前把 `productUrl` 的 `#project/<projectId>` 与 readback 的 `projectId` 严格比对，
  并绑定 `stage=cut_review_ready` 与三个 revision——门禁 `ok=true` 只证明产品面能力，
  不能替代项目级绑定；任何不一致重新 readback
- `studio_capability_missing`：停止并说明版本不兼容，可建议 `$chengfeng-report-bug`；
  禁止因 URL 带 `?view=koubo` 就认为新界面存在，禁止回退旧任务面板
- 不要把「打开工作台」当任务第一步；不访问旧 `review.html`、8898/8899；
  不控制 Studio DOM、不直接改媒体元素；不创建独立音频轨或占位字幕轨

## 6. 复盘交棒：用户批改的作业不许扔

用户复核完成后，先读回：

```json
{"argv":["workflow","get","<项目目录>","--json"]}
{"argv":["cuts","get","<项目目录>","--json"]}
```

**复盘**（过渡做法，产品的 `cuts diff` 命令发布后替换）：拿第 5 步留存的
`<提案文件>` 与读回的终版 `cutWordIds` 对比——

- **用户恢复的**（提案里有、终版没有）= AI 删错了。对照 proposal 里自己写的
  reason 问：错在哪一类？
- **用户补删的**（终版有、提案没有、也不在 `initialization.baselineCutWordIds`
  停顿基线里）= AI 漏了。问：这属于哪个类型，为什么没识别出来？
  （基线只在这里用于剔除停顿词，仍然禁止把它并进提交）

归档三个抽屉：

- 口味差异 → `~/.chengfeng-videocut/cut-preferences.md` 追加（Agent 维护的
  markdown，只追加与改写自己的节；文件不存在就创建）
- 专名错误 → `~/.chengfeng-videocut/dictionary.md` 追加（两列表格，追加前查重）
- 规则空白 → 偏好文件「待升级判例」节记一笔；同类第三次出现时向用户报告，
  建议升级进通用判例（人审后才动 skills 仓库）
- 零差异也要记：偏好文件项目记录一行「全盘采纳」

**报告四件事**：删了多少词、少了多少秒；当前 stage（应为 `cut_review_ready`）；
项目 / Cuts / EDL 三个 revision；复盘摘要（提案 N 条，采纳 X 恢复 Y 补删 Z，
主要分歧一句话）。然后告诉用户下一步跑导出。

**不弹确认卡，不执行剪切**——物理剪切的确认卡属于导出 Skill，那张卡冻结的必须是
用户按下确认那一刻的 revision。

`return_cut_review`：先再次调用 `runtime_cli`：`{"argv":["service","ensure","--json"]}`，再返回同一 Studio 继续复核；
不触发复盘，复盘只在最终交棒做一次。

报告分级：Product 结构化 revision 为 **API/readback PASS**；真实浏览器帧审核才是
**visual frame PASS**；没人实际听音一律 **human listening UNVERIFIED**，不得用播放、
DOM、截图或媒体探测替代。

## 恢复与失败

- `revision_conflict`：重新读取状态，说明用户刚才的编辑，不自动覆盖
- `runtime_unhealthy`：不循环重装
- `service_identity_mismatch` / `service_port_conflict`：停止，不回退 foreground、
  不换端口、不杀未知进程
- 页面关闭但服务仍在：读取 workflow 后从当前状态续做，不新建项目
- 任何失败都不得把「账本已写」说成「已经剪好」——到这一段为止没有任何媒体文件产生

附注：本 Skill 接受**本地真实视频**与**云端逐词稿**直接进入产品，这是合同 preflight
的要求；两者都真实存在是一切判断的前提。
