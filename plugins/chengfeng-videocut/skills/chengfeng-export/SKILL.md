---
name: chengfeng-export
description: 把剪好的口播烧成一个成片文件：账本切片段、推近、字幕、HTML 画面层，一次全部烧进 mp4。用户说导出、出成片、烧字幕、渲染、导出视频、生成最终文件时使用。不要用于生成删词候选、写字幕、做画面动画。
user-invocable: true
---

# 导出（成片）

**这是链条最后一段，也是整个产品里唯一一个真正画出像素的地方。**

在它之前全部是标注：账本记「播哪些词」，字幕记「屏上写什么」，画面记「盖什么层」，
预览把这三样实时拼给人看，**不落盘**。导出把它们烧成一个文件。

```text
需要   edit-list.json（必须）、subtitles.json、visuals.json + modules/
产出   成片.mp4
```

渲染引擎、Headless Shell 与媒体工具全部由 Product Runtime 受管。用户无需安装
系统浏览器或媒体 CLI；若 Runtime 缺少任一能力，doctor/capability 门禁必须
拒绝导出，不转嫁给用户修复 `PATH`。

先读取并执行 [业务 Skill 的阶段合同](../../references/business-workflow-contract.md)
里的「结论等级」一节。**导出不进剪辑状态机**：它不改任何项目文件、不做 CAS 写入、
不推进 stage，产出是一个新文件，重跑一次就覆盖。所以它不需要确认卡。

## 0. Runtime 门禁

直接调用原生 MCP `runtime_status`；不在每个导出任务中检查 Plugin 更新。
`ready=true` 才继续。其他状态按 [检查更新](../chengfeng-check-updates/SKILL.md)
「检查 Runtime 就绪」处置；没有 ready 读回就停止，禁止自制替代界面。
不搜索 Electron 路径、不起第二个 Runtime，不要求用户另装系统依赖。

## 命令

依次调用 MCP `runtime_cli`；`argv` 是结构化数组，按用户选择调用对应导出形式：

```json
{"argv":["service","ensure","--json"]}
{"argv":["export","<project>","--dry-run","--json"]}
{"argv":["job","start","export","<project>","--json"]}
{"argv":["job","start","export","<project>","--out","/path/成片.mp4","--json"]}
{"argv":["job","start","export","<project>","--scale","1","--json"]}
{"argv":["job","start","export","<project>","--keep-work","--json"]}
```

`job start` 返回持久 `jobId` 后，用 `runtime_cli` 的结构化 argv 调用
`["job","get","<jobId>","--json"]` 或 `["job","list","--json"]` 追踪；只有用户明确
取消才调用 `["job","cancel","<jobId>","--json"]`。Codex、MCP 或页面退出不等于取消，
不得回退同步 `export` 旁路。

`service ensure` 身份不匹配、端口冲突或服务不健康时立即停止；不允许用 foreground
临时顶替后继续导出。

## 两步，别只跑第二步

```text
① --dry-run 先报计划    片长、帧数、字幕屏数、画面层数、推近段数、输出尺寸
                       念给用户听。数字不对就是上游不对，编码十分钟不会修好它
② job start 真跑       assemble → overlay → compose → verify 四段持久任务进度
```

`--dry-run` 里的 `warnings` 必须原样转述。它只报一类事：**某些字幕屏或画面层的词
已经被剪掉了**，所以它们不会出现在成片里。这是上游要决定的事，不是导出该替人吞掉的。

## 清晰度：源片是天花板，先看源再谈放大

导出前看一眼源分辨率（`--dry-run` 的 `source` 字段就有）：

```text
源宽 ≥2560（Retina 原生录屏）  → --scale 1，输出就是原生像素，这是最好的情况
源宽 <1920（如 960×720）      → 先停一下：问用户有没有同一次录制的高清导出。
                              录屏工具常常能把同一次录制重新导出成 3 倍分辨率，
                              换源比任何后期都管用（见下节）。确实没有 → --scale 2
```

`--scale 2` 对低清源有用的原因：底片放大不会变清楚，但**字幕和动画是按输出尺寸
重画的**——观众真正在读的就是这两样；平台再压一次时，大图分到的码率也更高。

**不要为了「更清晰」去调 `--fps`。** 帧率跟着源片走；改它只会让动画的采样和录屏对不上。

## 换源边界

导出本身永远只读。当前公开 Runtime 合同没有已验证的原子「换源」命令，
因此本 Skill 不直接调用媒体 CLI 比对，不删文件/建硬链，不手改
`project.json` 或任何指纹。用户拿出高清版时，明确报告「自动换源尚未
实现」；要么继续使用当前受管源片，要么以新源片建新项目并重新转录。

## 验收：三件事，缺一件就不算导出完成

```text
① Product 结构验收      `job get` 的最终结果必须读回 `actualDuration`、
                     `hasAudio`、`renderedFrames`、`problems`，并和 dry-run 计划逐项比。
                     对不上就是 readback_mismatch 报错，文件留在盘上当证据，
                     不算导出完成
② 真实成片看像素      仅使用 Product 返回的成片验证 URL/帧产物，通过
                     Codex 内置浏览器用眼睛看。至少覆盖：一个推近段、
                     一个整屏动画段、一个只有字幕的段、一个层与层的边界
③ 人耳听感            没人真的听过，一律记 human listening UNVERIFIED
```

② 不许用预览截图代替。**预览和成片是两条渲染路径，验收要看的正是它们对不对得上**——
拿预览的图当成片的证据，等于把要验的那件事当成了前提。

**判推近要找判别性地标，整体印象会骗人**（2026-07-29 真踩过）：1.6 倍推近后的
屏幕页面看起来仍像"一整页"，缩略图上和全景几乎没差别——曾把正确的推近帧误判成
"推近丢了"，白追半小时、重导两次。正确判法是找**只有裁剪才能造成的证据**：
被裁掉一半的元素（气泡从中间断开）、消失的边缘元素（侧栏、标题栏）。
和源片同刻帧对比一眼定案。

若 Product 最终 job 没有返回成片验证 URL/帧产物，明确报告
**visual frame UNVERIFIED（自动成片抽帧尚未实现）**。不得私自调用系统
媒体 CLI，不得用 Studio 预览帧或静态 DOM 代替成片帧。

## 出问题往哪查

`--keep-work` 会在项目的 `.chengfeng-videocut/export/` 下留三样东西，
它们把「哪一半错了」直接分开：

```text
assembled.mkv    只有剪辑，没有任何盖的东西。它错 = 账本或切片错
overlay/*.png    只有盖的东西，透明底。它错 = 字幕样式或模块错
spans/*.mp4      合成后的分段。它错 = 推近或对齐错
```

对照表：

```text
成片没有字幕/动画       overlay PNG 是不是全透明？模块是不是没答应 seek？
动画停在第一帧          模块没实现 seek，或者 GSAP 时间线没 paused
画面整块白             模块少了 `:root { color-scheme: dark }`
推近的框歪了            模块的 viewBox 和层的 zoom 不是同一组数
成片比计划短            某个 span 帧数不够，看 compose 阶段的报错
层边界闪一小段原片      overlay 截图陈旧（帧标记验证失效）。产品靠页面顶部的
                      帧标记条自证每张截图属于哪一帧；若复发，先确认 overlay
                      PNG 顶部有标记条、compose 有裁掉它的 crop
缺少受管渲染器        Runtime doctor/capability 失败，停止并引导修复 Runtime
```

## 不许做什么

- 不许把「导出成功」说成「验收通过」——命令返回成功只是产品自己对得上，不是画面对
- 不许用预览截图、DOM、日志代替成片抽帧
- 不许没人听过就报 human listening PASS
- 不许为了让导出跑通去改项目文件（改字幕、删层、动账本）。导出只读，不写
- 不许在导出里补做上游的活：缺字幕就去写字幕，缺画面就去做画面，别在这一段临时糊一个
