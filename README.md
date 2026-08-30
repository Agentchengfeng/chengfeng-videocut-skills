# chengfeng-videocut

> **Windows public beta:** this branch contains Plugin `0.11.7-beta.3` with
> marketplace/plugin id `chengfeng-videocut`. It accepts only the separately
> pinned `0.5.9` Windows Runtime GitHub Release Asset API endpoint, whose
> package checksum is part of the Plugin contract. This is not a signed,
> release-ready macOS build.

给 Codex 用的中文口播剪辑 Marketplace 插件。

Plugin 根入口、四个业务入口和两个支持入口组成；共同规则是内部 reference，不占用户 Skill：

```text
Plugin 根名  -> 安装与 UI 群组名，不是同名 Skill
剪口播      -> 已复核的删词账本
字幕        -> subtitles.json
画面        -> visuals.json + HTML 模块
导出        -> 成片.mp4
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
检查更新    -> Codex 原生 Marketplace 刷新 -> 用户确认 -> Plugin add -> 复读版本
共同规则    -> references/，不注册为 Skill
```

插件不复制剪辑产品本体。四个业务 Skill 负责判断和编排，确定性动作由 `chengfeng-videocut` Runtime 的 CLI / API 执行；只有进入人工审核阶段且 Studio 能力匹配时才打开界面。Bug 支持 Skill 不安装 Runtime、不启动 Studio，也不改项目。

## 安装

**公开入口是 Codex Plugin + GitHub Release，不走 npm。** 用户先由 Codex 从 GitHub
Marketplace 安装 Plugin；第一次需要 Runtime 时，原生 MCP 先显示固定 GitHub Release
tag、官方 Asset API URL、平台安装包、SHA-256、目标与影响。用户确认同一 `approvalDigest` 后才下载、校验并
执行安装器。剪辑 Runtime 和 Plugin 都不依赖用户系统的 Node、npm 或 npx。

**当前公测范围是 Windows x64。** 把下面这段发给 Codex 即可；它会通过 GitHub
Marketplace 安装固定 Plugin 快照，并在需要 Runtime 时使用固定 GitHub Release，不改
PowerShell execution policy，也不要求用户手工找安装包。

```text
请安装 chengfeng-videocut。
请从 Agentchengfeng/chengfeng-videocut-skills 的固定 GitHub commit 安装 chengfeng-videocut Plugin，并读回 marketplace 和 plugin 的 installed/enabled 状态。
需要 Product Runtime 时，先显示 runtime_install 确认卡；只从 requirements 锁定的 GitHub Release Asset API 下载本机平台安装包，校验 SHA-256 后安装并读回 doctor。
不要要求我手工安装 Node、npm、npx、Bun、FFmpeg、Chrome 或 Runtime；不要更改 PowerShell execution policy。
```

正式新装机唯一入口是 Plugin `runtime_install`。单个 GitHub Release Runtime 安装包内嵌 Runtime、受管 Bun、
FFmpeg 与 FFprobe，并装到 `~/.chengfeng-videocut`。Headless Shell 不属于安装期：只有用户确认
实际 export 后，Product Runtime 才按固定版本和 SHA-256 获取、校验并缓存它。六个用户 Skill 不要求系统
Bun、Git、`gh`、Chrome、FFmpeg 或 FFprobe，也不要求它们进入 `PATH`；Node、npm、npx 都不能成为 Runtime、导出或渲染的隐式依赖。
历史 Desktop / 既有安装仅在已经指向同一 Product 受管根时兼容复用。

| 依赖 | 用途 | 要求 |
| --- | --- | --- |
| Product Runtime GitHub Release 安装包 | Runtime、Bun、FFmpeg、FFprobe | 原生 MCP 精确下载、SHA-256 校验和本地安装，不调用用户 npm/Node |
| Product renderer manager | Headless Shell | 仅确认的实际 export 按锁下载、校验、缓存复用 |
| Codex Plugin 管理 | Marketplace 刷新、Plugin 安装/启用 | Codex 0.146+ 原生能力 |

**Runtime 装不上时，Agent 应停在安装指引上**——用自制审核页/播放器替代产品属于违反
Skill 合同的行为（真实发生过：Runtime 缺失时 Agent 手搓了一个"审片台"，产出与产品
完全不兼容）。遇到这种情况，把 Agent 的报错原文发 Issue。

本分支是 `0.11.7-beta.3` Windows 公测候选。发布时会给出一个不可变 Git commit；
用户只应从该 commit 安装，不应使用分支名或历史 `0.10.8` 入口。Windows 安装器尚未
签名，因此 Windows 可能显示未知发布者/SmartScreen 提示；这不是 Runtime 校验的替代，
用户须自行决定是否继续。没有 Runtime GitHub Release、匹配 SHA-256 和真实 Windows
安装回读时，不得把候选表述为可安装。

三段必须分开是 Codex 官方 CLI 的机制：`marketplace add --ref <SHA>` 先挂市场，
`marketplace upgrade` materialize 该精确快照及安装 metadata，`plugin add` 再从
已验证的市场快照安装；没有「直接从 Git 一步装」的形式。
想装完立即拿到播放器（不等首次任务），装完插件后对 Codex 说「**安装剪辑环境**」即可。

用户更新路径只使用 Codex 0.146+ 原生能力：`plugin marketplace upgrade
chengfeng-videocut --json` 刷新 Git Marketplace，`plugin list --available --json`
展示候选；用户确认后执行 `plugin add
chengfeng-videocut@chengfeng-videocut --json`，再以 `plugin list --json` 读回实际
`version / installed / enabled`。Codex 0.146 没有 `plugin update` 子命令。
仓库根 Node bootstrap 和 Plugin 内 provenance/update 脚本只保留为开发/兼容回归，
不是用户更新流程。公开 Runtime 与双平台验收完成前，不得移动
`stable` 或把本候选表述为可下载版本。激活新 Plugin 后必须新开任务；
不要手工删除 cache。

装完插件后也可以直接对 Codex 说「**安装剪辑环境**」——「检查更新」Skill 的环境入口会
下载校验 Runtime、跑 doctor 自检并报告缺什么，不必先发起剪辑任务。

已安装后可用以下命令诊断身份（均不安装 Runtime）：

```bash
codex plugin marketplace list --json
codex plugin list --json
```

安装插件后，第一次使用任一业务 Skill 时会先检测产品 Runtime：

```text
runtime_status
  |
  +-- ready --> 复用 Product 受管根与同一个用户服务
  |
  +-- missing
  |      |
  |      +--> 安装确认卡 + approvalDigest
  |      +--> GitHub Release 固定 tag + Asset API URL + 安装包 SHA-256 校验
  |      +--> 安装后 doctor
  |      +--> 继续当前 Skill
  |
  +-- unhealthy / failed -------> 停止；不覆盖；不打开 Studio
```

Runtime 默认安装到：

```text
~/.chengfeng-videocut
```

Plugin 0.11.7-beta.3 的合同固定为 Runtime `0.5.9`。requirements 每个平台只列一个精确
GitHub Release tag、安装包 SHA-256 和稳定启动器；原生 MCP 不调用 npm、Node 或 lifecycle scripts。任一 pinned 摘要未发布时，确认卡
不生成可执行摘要，安装 fail-closed。Runtime 健康还不够：semver 必须达到最低版本并覆盖完整 capability 集。

每个业务流程在第一次产品 API 前、每次人工审核恢复前都经 MCP `runtime_cli` 执行：

```text
Skill -> Product service ensure -> managed user service ready -> 继续当前流程
                           |
                           +-> identity / port conflict -> 停止，不回退 foreground
```

服务由 Product 管理；Plugin 不直接运行 `launchctl`、`nohup`，也不会把 Codex 当前终端当作 Studio Server 的生命周期所有者。

## 使用

### 从具体任务开始

Plugin `chengfeng-videocut` 保留给安装和可能的 Desktop 群组展示，不能被同名 raw Skill 或公共说明 Skill 覆盖。Plugin namespace 必须保留，不能用裸 `$chengfeng` 代替：

```text
chengfeng-videocut:chengfeng-cut
chengfeng-videocut:chengfeng-report-bug
chengfeng-videocut:chengfeng-check-updates
```

Plugin 首页 starter prompt 最多三条；它不是 Skill 数量表。`SKILL.md` 的 `name` / `description` 与 `agents/openai.yaml` 提供发现元数据，但不能单独证明 Desktop Slash/Plugin 群组已经显示；后者须单独实测。

剪口播：

```text
使用“剪口播”处理这条视频。识别口误，等我审核后再物理剪切，并生成剪后字幕。
```

技术 ID：`chengfeng-videocut:chengfeng-cut`。

上报 Bug：

```text
使用“上报 Bug”整理刚才的问题。先给我看脱敏后的 GitHub Issue 草稿，确认后再提交。
```

技术 ID：`chengfeng-videocut:chengfeng-report-bug`。它会固定路由到产品或 Skills 仓库、
清理常见密钥与本地路径，并且只在用户确认同一份草稿后使用 Agent
已有 GitHub Issue 能力提交。该能力不可用时只返回草稿和「未提交」原因。

检查更新：

```text
使用“检查更新”检查 chengfeng-videocut Skills 的可信 Marketplace 更新；先报告状态，不要直接激活。
```

技术 ID：`chengfeng-videocut:chengfeng-check-updates`。

## 架构

```text
Codex
  |
  +-- Plugin: chengfeng-videocut（根名称）
  +-- chengfeng-cut
  +-- chengfeng-subtitle
  +-- chengfeng-visual
  +-- chengfeng-export
  +-- chengfeng-report-bug (支持入口)
  +-- chengfeng-check-updates (支持入口)
  +-- references/ (内部合同，不是 Skill)
  +-- show_workflow_confirmation (MCP App)
  |
  v
Product Runtime
  |
  +-- runtime_install -> 受管 Runtime / Bun / FFmpeg / FFprobe
  +-- confirmed export -> locked Headless Shell cache
  |
  +-- service ensure -> macOS LaunchAgent / Windows 计划任务
  +-- CLI / API
  +-- project truth + revision / CAS
  +-- media cut / render / verify
  +-- Studio（只在 review-ready 时打开）
```

确认卡不是独立 Skill。它只把白名单 action、`projectId` 与 revision 交回当前 Codex 对话；卡片本身不执行剪切或导出。

## 仓库结构

```text
chengfeng-videocut-skills/
├── .agents/plugins/marketplace.json
├── plugins/chengfeng-videocut/
│   ├── .codex-plugin/plugin.json
│   ├── .mcp.json
│   ├── runtime-requirements.json
│   ├── bin/chengfeng-videocut-mcp     # macOS Universal 2
│   ├── bin/chengfeng-videocut-mcp.exe # Windows x64
│   ├── cmd/ + internal/              # Go 原生 MCP 源码
│   ├── public/review-confirm.html
│   ├── scripts/
│   ├── references/
│   └── skills/
│       ├── chengfeng-cut/
│       ├── chengfeng-subtitle/
│       ├── chengfeng-visual/
│       ├── chengfeng-export/
│       ├── chengfeng-report-bug/
│       └── chengfeng-check-updates/
├── LICENSE
├── NOTICE.md
└── CITATION.cff
```

发布插件提交预构建的 macOS Universal 2 与 Windows x64 原生 MCP，不包含
`node_modules`。Marketplace 不保证构建生命周期，用户机器也不应需要 Go，因此二进制
必须作为发布内容提交；构建要用 `-trimpath`、空 build id 并做双次 SHA-256 复现检查。

## 发布边界

Plugin 0.11.7-beta.3 依赖 Runtime 0.5.9 的 GitHub Release 安装包、managed tools、用户服务与当前 EDL / Studio 合同。发布顺序是：

```text
Runtime 0.5.9 GitHub Release 安装包
  -> GitHub Actions 构建每个平台一个内嵌 Runtime、Bun、FFmpeg、FFprobe 的包
  -> 上传到不可变 GitHub Release，并把 tag、资产名和 SHA-256 回填 requirements
  -> 从公开 GitHub Release 在 Windows / macOS 隔离环境安装并执行 doctor
  -> Plugin 内容提交 A
  -> 只增加 provenance 的 Marketplace 快照 B
  -> 根 Bootstrap 提交 C（只改 manifest / README，Plugin 子树仍等于 B）
  -> stable 指向 B，main 指向 C，Bootstrap manifest 固定 B
  -> 从公开 GitHub commit 验证干净 Plugin 安装和 Runtime 安装
```

Plugin 运行时只直连 requirements 固定的 GitHub Release 资产；GitHub 同时是源码、构建与
Runtime 发布来源。任何一步未通过都停止推进下一项；本地候选测试不能代替公开 Release
资产下载后的复验。

## 开发验证

```bash
cd plugins/chengfeng-videocut
npm install
npm run build
npm test
```

另外运行 Plugin validator、前端 YAML/公开 ID 契约测试，并在隔离 Codex 上下文中确认四个业务 Skill 和两个支持 Skill，且不存在已退休的 basics。静态文件存在不等于斜杠/技能选择器已经显示，后者必须单独实测。

## 官方来源

本项目由 **chengfeng / AI产品自由** 原创并维护。

```text
GitHub: Agentchengfeng
X: chengfeng240928
小红书 / 公众号 / B站 / 抖音 / 视频号: AI产品自由
```

原始仓库：<https://github.com/Agentchengfeng/chengfeng-videocut-skills>

## 协议

本项目使用 Apache License 2.0。转载、翻译、二次发布或改造时，请保留原作者、原始仓库链接、`LICENSE` 和 `NOTICE.md`。
