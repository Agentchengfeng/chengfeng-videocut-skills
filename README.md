# chengfeng-videocut

> **Local-development candidate only:** this branch contains Plugin
> `0.11.4-local.1`, marketplace/plugin id
> `chengfeng-videocut-local-development`, and requires Runtime `0.5.3` with an
> exact machine-local authorization. It must not be published, promoted to
> `stable`, or installed over the public `chengfeng-videocut` Plugin. The
> release documentation below remains the fail-closed public baseline.

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

一行命令装插件（挂市场 + materialize 精确快照 + 安装，`&&` 串联，前一步成功才继续）。
Product Runtime / Studio 不需要单独寻找安装包：第一次让 Agent 真正干活时，原生 MCP
先显示固定 npm Registry、平台包精确版本、integrity、目标与影响；用户确认同一
`approvalDigest` 后才由原生 MCP 下载、安全解包、校验并执行包内安装器。用户不需要 npm/Node。
每个平台包还带固定法律材料与 SPDX 2.3 SBOM，均由 manifest 的 SHA-256 收据绑定并在安装前复核。

**系统要求：macOS**（Apple Silicon / Intel）**或 Windows 10/11**。
Windows 支持自 Runtime v0.4.2 起正式可用（真机验收：安装、常驻服务、崩溃自愈、
重启自启、建档、导出成片全链通过）。虚拟机里试用 Windows 11 24H2+ 需先关 VBS：
`bcdedit /set {default} hypervisorlaunchtype off`（物理机不受影响）。

正式新装机唯一入口是 Plugin `runtime_install`。单个 npm Runtime 平台包内嵌 Runtime、受管 Bun、
FFmpeg 与 FFprobe，并装到 `~/.chengfeng-videocut`。Headless Shell 不属于安装期：只有用户确认
实际 export 后，Product Runtime 才按固定版本和 SHA-256 获取、校验并缓存它。六个用户 Skill 都不要求系统
Node、Bun、Git、`gh`、Chrome、FFmpeg 或 FFprobe，也不要求它们进入 `PATH`。
历史 Desktop / 既有安装仅在已经指向同一 Product 受管根时兼容复用。

| 依赖 | 用途 | 要求 |
| --- | --- | --- |
| Product Runtime npm 平台包 | Runtime、Bun、FFmpeg、FFprobe | 原生 MCP 精确下载和本地安装，不调用用户 npm/Node |
| Product renderer manager | Headless Shell | 仅确认的实际 export 按锁下载、校验、缓存复用 |
| Codex Plugin 管理 | Marketplace 刷新、Plugin 安装/启用 | Codex 0.146+ 原生能力 |

**Runtime 装不上时，Agent 应停在安装指引上**——用自制审核页/播放器替代产品属于违反
Skill 合同的行为（真实发生过：Runtime 缺失时 Agent 手搓了一个"审片台"，产出与产品
完全不兼容）。遇到这种情况，把 Agent 的报错原文发 Issue。

本分支候选 Plugin 是 `0.11.2`。原始 `0.11.1` 候选曾产生内容 A 和 provenance B；
本轮追加修复已改变 Plugin 字节，因此集成后必须重新产生最终内容提交与
provenance 快照，不得沿用旧 A/B 宣称可发布。Runtime 0.5.1 各 npm 平台包的 pinned
sha512 integrity 与包内安装器 SHA-256 回填之前，同样不得发布或把候选说成可安装。
当前公开的 0.10.8 快照仅是历史稳定入口：

```bash
codex plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref 1487e02b1c0c39ea74d079e8ce45da56bf59bc32 && codex plugin marketplace upgrade chengfeng-videocut --json && codex plugin add chengfeng-videocut@chengfeng-videocut
```

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
  |      +--> npm Registry 精确版本元数据
  |      +--> sha512 integrity + 包内 manifest/installer SHA-256 校验
  |      +--> 安装后 doctor
  |      +--> 继续当前 Skill
  |
  +-- unhealthy / failed -------> 停止；不覆盖；不打开 Studio
```

Runtime 默认安装到：

```text
~/.chengfeng-videocut
```

Plugin 0.11.2 的合同固定为 Runtime `0.5.1`。requirements 每个平台只列一个精确
npm package/version、`distIntegrity`、包内 installer SHA-256 和稳定启动器；原生 MCP 不调用
npm、Node 或 lifecycle scripts。任一 pinned 摘要未发布时，确认卡
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

Plugin 0.11.2 依赖 Runtime 0.5.1 的 npm 平台包、managed tools、用户服务与当前 EDL / Studio 合同。稳定发布顺序是：

```text
Runtime 0.5.1 npm platform packages
  -> GitHub Actions 通过 npm Trusted Publishing 发布各平台包
  -> 每个平台一个内嵌 Runtime、Bun、FFmpeg、FFprobe 的包
  -> 把各平台 pinned sha512 integrity 与 installer SHA-256 回填 requirements
  -> 从公开 Registry 在 Windows / macOS 隔离环境安装并执行 doctor
  -> Plugin 内容提交 A
  -> 只增加 provenance 的 Marketplace 快照 B
  -> 根 Bootstrap 提交 C（只改 manifest / README，Plugin 子树仍等于 B）
  -> stable 指向 B，main 指向 C，Bootstrap manifest 固定 B
  -> 从公开入口验证干净安装与 0.10.5 更新
```

Plugin 运行时只直连 requirements 固定的 npm Registry，不从 GitHub Release 下载 Runtime；
GitHub 仅作为源码、Actions 构建与 Trusted Publishing 的发布来源。任何一步未通过都停止推进
下一项；本地候选测试不能代替公开 Registry 资产下载后的复验。

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
