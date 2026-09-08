---
name: chengfeng-videocut-visual
description: 给剪好的口播配画面：绑定 HTML 动画、标注、推近或本地 MP4 B-roll，按已有字幕和词锚点同步预览。用户说做分镜、配画面、加动画、圈重点、B-roll、导入片头时使用。不要用于删词剪辑、字幕、物理剪切或成片渲染。
user-invocable: true
---

# 画面（分镜）

先完整读取[共享接入规则](../../references/plugin-access.md)，按本轮能力发现并复用实际 Plugin/工具入口；不要把 Runtime 缺失或工具未加载称为 Plugin 未安装。

**这是一件事，不是流程的一段。** 用户什么时候喊它就什么时候做，改完剪辑可以回来再做。

前提只有两个：**账本和字幕已经存在**（层按字幕屏放、时间从账本算）。

```text
需要   edit-list.json、transcript.json、subtitles.json
产出   visuals.json + 已发布 HTML 模块或已导入的不可变 MP4 素材
```

干完就停，**不指挥用户下一步**。

先读取并执行 [业务 Skill 的阶段合同](../../references/business-workflow-contract.md)。
**已有 MP4 / 片头 / 视频 B-roll**：先完整读取[本地视频交付](references/media-assets.md)，走视频导入与绑定路线；不把 MP4 塞进 HTML 模块包，不重建其动画、不重转录。下文抽帧、模块制作和推近规矩仅在制作 HTML 画面时适用。

模块写法的硬规矩见 [模块契约](references/visual-module-contract.md)，
判断规则见 [画面判断](references/visual-judgment.md)。

## 0. Runtime 门禁

用户已明确指定正在运行的本地工作台时，local-development 原生 MCP 可用
`runtime_connect({endpoint})` 核验该服务，保存返回的 endpoint/PID/buildId/version/runtimeMode。
此路径是显式 existing-server 接入，不是受管安装 `ready`，不执行 `service ensure`，
不启动第二服务、不复制注册。每次 `runtime_project` 携带同一 connection 和 projectId，
依次读取 workflow、edit-list、subtitles、visuals。身份变化必须重新连接并审核。
仅在用户已授权本次层文档修改后，用 `runtime_visuals_put` 传入原样的 expectedRevision、
confirmed=true 和完整 document；布尔值不是新确认令牌，不能代替用户授权。工具通过既有
服务校验/写入并回读；冲突回到读取/审核，不偷换 revision。
新增模块时先按[模块包交付](references/module-publish.md)在任务候选目录封装，经
`runtime_module_publish` 发布并用 `runtime_module_get` 回读后，再用 entryPath 做 visuals CAS；
发布本身不启用层、不改旧模块。缺工具或 modulePublishApiVersion=1 能力时停止，不尝试直接写项目。
该入口不抽帧、不执行长任务；需要这些能力而当前连接未提供时停止并报告缺口，
不能回退旧 Runtime、源码 CLI 或直接改项目数据绕过门禁。宿主未加载这些工具时先按共享入口
区分 disabled、tools_not_loaded 与版本能力差异；重新发现实际加载工具、只读核验身份，
仍未加载才提示宿主刷新/重开选项，不断言必须新任务，不能把源码已改当作本任务已生效。

纯素材候选制作不要求 Runtime；发布模块或绑定项目才检查对应工具与能力。经共享接入规则选定受管分支时，继续以下路径（下文 runtime_cli 示例仅属此分支）：

直接调用原生 MCP `runtime_status`；不在每个画面任务中检查 Plugin 更新。
`ready=true` 才继续。`runtime_channel_mismatch` 与其他非 ready 状态按
[检查更新](../chengfeng-videocut-check-updates/SKILL.md)
「检查 Runtime 就绪」处置；没有 ready 读回就停止，禁止自制替代界面。
不搜索 Electron 路径、不起第二个 Runtime，不要求用户另装系统依赖。

## 命令

依次调用 MCP `runtime_cli`；`argv` 是结构化数组，按需保留可选参数：

```json
{"argv":["service","ensure","--json"]}
{"argv":["visual","get","<project>","--json"]}
{"argv":["visual","frame","<project>","--cues","sub-0004,sub-0005","--count","12","--out","<dir>","--json"]}
{"argv":["visual","add","<project>","--module","modules/01-xx/index.html","--cues","sub-0004,sub-0005","--zoom","x,y,w,h","--id","vis-0001","--json"]}
{"argv":["visual","remove","<project>","--id","vis-0001","--json"]}
```

`service ensure` 必须先证明 canonical 5190 属于当前平台的托管服务；失败就透传并
停止，不回退 foreground 或自选端口。

层绑**字幕屏**（`--cues`），产品自己换算成词 id——层永远不可能绑上没人说的词，
剪辑变了层自己跟着挪。**不存秒数。**

## 四步，一步不跳

```text
① 文字定任务    读 subtitles.json，按语义分段，每段回答：
               教程/演示/证明，还是概念/逻辑/过渡？
② 抽帧看画面    visual frame 抽 8-12 帧，真的用眼睛看。
               实测 12 段里有 2 段被画面推翻文字预判 —— 这步不是走形式
③ 量运动窗口    相邻帧做像素差，找出滚动/切换/操作的时刻。
               层只盖稳定窗口，圈在画面开始动之前退场
④ 做层放层     写模块 → visual add → 在预览里逐层核对
```

### ② 的判断规则

```text
画面正是他说的东西     → 标注：圈住、说到哪个词圈哪里。真证据不许盖
画面弱相关/空白       → 小黑动画：整屏白底，从风格库做
画面自身足够清楚      → 不动。这是最常见的正确答案（实测 13 段里 4 段不动）
```

### ③ 的产出物是数字，不是感觉

```text
圈的坐标      像素统计量出来（灰度扫描找文字行），不许目测 —— 目测差过 50px
互动时刻      逐帧像素差找突变（实测一次从 4 跳到 335），圈在它之前 0.2s 退完
稳定窗口      开头常有滚动（他在找内容），层从停稳那屏的 cue 开始绑
```

## 推近（zoom）用之前先想

```text
默认不推近。   960x720 的录屏放大就糊，用户会立刻看出来
非推不可时     ≤1.6 倍、区域取 62.5% 见方居中 —— 构图完整 > 读清小字
字太小读不清   用圈引导视线就够了；真要读清，答案是高分辨率重录，不是放大
```

## 审阅循环

模块目录用**序号命名**（`01-daily-report`、`05-anim-task-split`），
时间线轨道上显示目录名，用户报号你改那一层，别的不动。

两条改层纪律，各对应一次真事故：

```text
改层必查模块     层收窄/延长后，模块里写死的相对时刻不会跟着变 ——
                圈的出场时刻可能落到层结束之后，永远不出现
验收看像素      截图看画面，不查 DOM 属性。「可见性翻转正确」的 iframe
                曾经物理上不在画面里 —— 属性全对、屏幕全空
```

## 不许做什么

- 不许跳过抽帧和运动窗口直接做（两种错各犯过一次：盖掉真证据、圈悬在滚动上）
- 不许把每段都做点什么——铺满不是目标，不动是常见答案
- 不许存秒数、不许目测坐标、不许在白底页面上加压暗
- 没有真实内容不许拿占位图充数
- 风格从注册表选，不得凭空发明
- **品牌图标用官方字形，不许手画替身**（X 用两笔交叉线画过，被用户抓了）。
  本地索引没有的，从 simple-icons 取单色官方 glyph（黑白风格正好配），
  原 svg 存进模块目录备查；同一条片里同一品牌只能长一个样
