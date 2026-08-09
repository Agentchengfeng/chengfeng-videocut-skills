# 四个业务 Skill 的阶段合同

`chengfeng-cut` 必须引用并按本合同执行。本文件是普通内部 reference，不是用户可调用的 Skill，不创建项目副本、播放器、素材库、上传会话或媒体写入能力。

## 固定阶段

```text
preflight
  -> Product state readback
  -> proposal
  -> Product CAS
  -> project-level review binding
  -> user confirmation
  -> Product execution
  -> outcome verification
```

阶段不得跳过、合并成“已经审核”，或用缓存、浏览器 DOM、HTTP 200 代替 Product readback。

| 阶段 | 必须做 | 失败时 |
| --- | --- | --- |
| preflight | 核对兼容 Runtime、managed service；剪口播还核对用户提供的任务目录与其中的本地真实视频。新素材只调用 `project ingest <task-dir> --video <task-relative> --json`，由 Product 完成转录、暂存和原子建档；不走裸 `transcribe`、`--output`、素材库、material-library、上传会话或导入 Skill，也不读写 `transcript.json`。口播成片只接受现有 `projectId`，不得创建第二个项目。 | 停止并保留最后完整 Product 状态。 |
| Product state readback | 对现有项目执行 `workflow get`；剪口播的 `project ingest` 成功后也必须立即执行 `workflow get` 与 `cuts get`，以 Product 返回的 `projectId`、workflow stage、Project / Cuts / EditList revisions 为唯一输入。长逐词稿通过 `transcript playback --limit 64 --json` 和 `page.nextCursor` 串行读完；revision 变化或 cursor stale 时丢弃整轮，从第一页重读。 | 缺字段、项目不一致或 artifact 非 current 时 fail-closed。 |
| proposal | 子 Agent 只返回带类型的候选行；唯一协调者只在任务临时位置合并成一份全量语义候选。不改 `project.json`、Cuts、EditList、事件或媒体。 | 不提交、不进入审核。 |
| Product CAS | 子 Agent 只返回候选行，不写 Product。唯一协调者在同一完整 playback 版本上合并全量候选，并对每个稳定版本只调用一次 `cuts set` CAS；其他业务阶段仍使用上一步 readback 的 expected revision 调用 `artifact put` 或 Product transition。写入后立即 readback，确认 Product 返回的新 revision 与预期 stage。 | `revision_conflict`、cursor stale 或 readback 不匹配时丢弃整轮候选，从完整 Product readback 与 playback 重做；不覆盖、不增量补写。 |
| project-level review binding | 只有 `*_review_ready` 才允许 `open`。把 Product `open` 返回的 URL 中 `#project/<projectId>` 与 readback `projectId` 比对，并同时绑定精确 workflow stage、Project revision、Cuts revision（剪口播）和 EditList revision；成片阶段还绑定当前 artifact revision。`ensure-studio` capability PASS 只能证明产品面存在，不能替代这项项目级比对。 | URL/hash、stage 或任一 revision 不一致时不打开/不确认，重新 Product readback。 |
| user confirmation | 展示已绑定的项目级审核内容；只接受明确白名单 action。确认不产生一次性 Product receipt：该能力是本次明确非目标。 | 页面停留、预览播放、浏览器打开或“继续看看”都不是确认。 |
| Product execution | 收到确认后再次 Product state readback，逐项比对卡片绑定值；相等时才以卡片的 frozen revision 调用 `cuts apply`、阶段 confirm 或 `render run`。 | 任何变化回到审核；不得把 latest revision 替换为确认 revision。 |
| outcome verification | 读取 Product 规范产物和 verification 数据，再分别报告 API/readback、视觉帧与人工听感结论。 | 不把任一较弱证据升级为完成。 |

## 结论等级

| 结论 | 允许的证据 | 不代表 |
| --- | --- | --- |
| API/readback PASS | Product 结构化 readback、revision、stage、媒体/verification 字段相符 | 视觉画面或人已听过声音 |
| visual frame PASS | 真实项目在 Codex 内置浏览器中打开，画面帧与同一绑定 project/revision 可见且符合审核目标 | 音频听感 |
| human listening PASS | 人实际比较并明确记录的听音结论 | 自动播放、静音测试、DOM、截图或媒体流探测 |

没有真实人类听音记录时，必须报告 **human listening UNVERIFIED**；不得声称 PASS。若本轮没有真实 UI 路径，visual frame 也必须是 UNVERIFIED，而不是由静态测试代替。

## 共同停止条件

- 业务 Skill 按流程顺序：剪口播 → 字幕 → 画面 → 导出。**一段只产出一样东西，产出即交棒。**
  「导出」曾经排在第二位，因为它当时的含义是物理剪切、下游要拿 `source_cut.mp4` 去重新转写。
  字幕改成从账本算时间之后，那个前置条件消失了，导出也就变成了链条最后一段：成片。
- 不新增或暴露“验证”“播放器”“上传”或“素材库” Skill；也不新增第五个业务段。
- 不改 Product Runtime、Studio、`5190`、schema、source 或 Product 项目文件。
- 不改任何 Skill 的 `user-invocable` metadata；其存在不证明 host UI 可见。
- 支持 Skill 不进入本合同的剪辑状态机。
