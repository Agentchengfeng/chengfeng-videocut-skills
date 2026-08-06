# chengfeng-videocut

给 Codex 用的中文口播剪辑 Marketplace 插件。

Plugin 根入口、四个业务入口和两个支持入口组成；共同规则是内部 reference，不占用户 Skill：

```text
Plugin 根名  -> 安装与 UI 群组名，不是同名 Skill
剪口播      -> 已复核的删词账本
字幕        -> subtitles.json
画面        -> visuals.json + HTML 模块
导出        -> 成片.mp4
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
检查更新    -> Marketplace 快照 -> 来源证明 -> 用户确认 -> 复读版本
共同规则    -> references/，不注册为 Skill
```

插件不复制剪辑产品本体。四个业务 Skill 负责判断和编排，确定性动作由 `chengfeng-videocut` Runtime 的 CLI / API 执行；只有进入人工审核阶段且 Studio 能力匹配时才打开界面。Bug 支持 Skill 不安装 Runtime、不启动 Studio，也不改项目。

## 安装

一行命令装插件（挂市场 + materialize 精确快照 + 安装，`&&` 串联，前一步成功才继续）。
Product Runtime / Studio 不需要单独寻找安装包：第一次让 Agent 真正干活时，原生 MCP
先显示固定版本、平台资产、目标与影响；用户确认同一 `approvalDigest` 后才下载、校验并
执行编译 installer。

**系统要求：macOS**（Apple Silicon / Intel）**或 Windows 10/11**。
Windows 支持自 Runtime v0.4.2 起正式可用（真机验收：安装、常驻服务、崩溃自愈、
重启自启、建档、导出成片全链通过）。虚拟机里试用 Windows 11 24H2+ 需先关 VBS：
`bcdedit /set {default} hypervisorlaunchtype off`（物理机不受影响）。

正式新装机唯一入口是 Plugin `runtime_install`。Runtime installer 把 Runtime、媒体工具
与 managed Headless Shell 装到 `~/.chengfeng-videocut`，核心剪辑链不要求系统安装
Node、Bun 或 FFmpeg。历史 Desktop / 既有安装仅在已经指向同一 Product 受管根时兼容复用。

| 依赖 | 用途 | 要求 |
| --- | --- | --- |
| Product managed tools | Runtime、媒体工具、Headless Shell | Runtime installer 随 manifest 安装 |
| Google Chrome | 导出成片时渲染字幕和动画 | 当前合同仍要求 |
| Node.js | 仅 Plugin 更新与 Bug draft/submit 辅助事务 | ≥ 20（核心剪辑不需要） |

```bash
# 仅在使用残余辅助事务时需要 Node；Chrome 仍用于导出
# Windows
winget install OpenJS.NodeJS.LTS Google.Chrome
```

**Runtime 装不上时，Agent 应停在安装指引上**——用自制审核页/播放器替代产品属于违反
Skill 合同的行为（真实发生过：Runtime 缺失时 Agent 手搓了一个"审片台"，产出与产品
完全不兼容）。遇到这种情况，把 Agent 的报错原文发 Issue。

本分支候选 Plugin 是 `0.11.0`：内容提交 A 为
`fb97bd8c1e17cfafa5de4335698126d8f6e5afae`，只增加 provenance 的快照 B 为
`78f44b508e738e15816e39a0363d2bbbcba4d7fb`。bootstrap 尚未改指针；Runtime 0.5.0 的
installer 与 install manifest 两个 pinned SHA-256 回填之前不得发布或把候选说成可安装。
当前公开的 0.10.8 快照仅是历史稳定入口：

```bash
codex plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref 1487e02b1c0c39ea74d079e8ce45da56bf59bc32 && codex plugin marketplace upgrade chengfeng-videocut --json && codex plugin add chengfeng-videocut@chengfeng-videocut
```

三段必须分开是 Codex 官方 CLI 的机制：`marketplace add --ref <SHA>` 先挂市场，
`marketplace upgrade` materialize 该精确快照及安装 metadata，`plugin add` 再从
已验证的市场快照安装；没有「直接从 Git 一步装」的形式。
想装完立即拿到播放器（不等首次任务），装完插件后对 Codex 说「**安装剪辑环境**」即可。

Bootstrap 仍只调用官方 `plugin marketplace add --ref <40hex>`、`plugin marketplace upgrade` 与 `plugin add`，随后做只读回查；Marketplace upgrade 只 materialize manifest 固定的精确插件快照，不安装、升级、启动或修改 Product Runtime。由于 Codex 0.146 会在 Marketplace 缺失时从 `plugin list` 隐藏同市场孤儿插件，Bootstrap 会紧接 `marketplace add`、在 `marketplace upgrade` 之前执行 `plugin list --marketplace <name> --available --json`；只有目标条目明确为 `installed=false`、`enabled=false` 才继续。若此时发现已安装或已启用的既有插件，只撤回本次新增的 Marketplace，明确保留孤儿插件状态并拒绝继续，避免 upgrade 先覆盖其 cache。其他失败若发生在插件激活已经开始之后，则先执行官方 `plugin remove`，再移除本次 `alreadyAdded=false` 的目标市场，并通过 `marketplace list` 与 `plugin list` 双重回查确认本次新增状态已消失；它不碰安装前已存在的 Marketplace 或插件，主错误与回滚结果会同时报告。Bootstrap 不复制 Skill 文件。manifest 固定不可变快照 B，B 内的 provenance 再绑定内容提交 A 与完整 bundle 摘要。npm 的 GitHub git-spec 在已验证环境中不能稳定启动，因此不把 `npx github:...` 作为对外稳定安装承诺。

发布完成后的远端分层为：`stable` 指向 B，仅供更新检查在隔离 `CODEX_HOME` 中发现
候选；用户 Marketplace 和 Bootstrap 都必须固定 B，不能跟踪 `stable`。`main` 指向只改
根 Bootstrap manifest 与 README 的提交 C，Plugin 子树与 B 完全相同。公开 Runtime
与双平台验收完成前，不得移动 `stable` 或把本候选表述为可下载版本。已经安装 0.10.5 /
0.10.6 的测试用户应让 Codex 执行“检查更新”，
核对 version + B + A + SHA-256 后确认激活，并在成功后新开任务；若 Windows 报 cache
被占用，先完整退出旧 Codex Desktop/任务再重试，不要手工删除 cache。

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
  |      +--> GitHub Release
  |      +--> SHA-256 校验
  |      +--> 安装后 doctor
  |      +--> 继续当前 Skill
  |
  +-- unhealthy / failed -------> 停止；不覆盖；不打开 Studio
```

Runtime 默认安装到：

```text
~/.chengfeng-videocut
```

Plugin 0.11.0 的合同固定为 Runtime `v0.5.0`。requirements 明确列出平台 installer、
install manifest、Runtime tarball 与平台 tools tarball；代码不硬编码这些名字。installer
和 install manifest 的 pinned SHA-256 任一未发布时，确认卡不生成可执行摘要，安装
fail-closed。Runtime 健康还不够：semver 必须达到最低版本并覆盖完整 capability 集。

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

技术 ID：`chengfeng-videocut:chengfeng-report-bug`。它会固定路由到产品或 Skills 仓库、清理常见密钥与本地路径、用脱敏内容指纹查重，并且只在用户确认同一份草稿后提交。

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
shared ensure-runtime
  |
  +-- Desktop managed root -> bundled Runtime / Bun / FFmpeg / FFprobe
  |
  +-- GitHub Release Runtime (CLI path)
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
│   ├── dist/server.mjs
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

Plugin 0.11.0 依赖 Runtime 0.5.0 的编译 installer、managed tools、用户服务与当前 EDL / Studio 合同。稳定发布顺序是：

```text
Runtime v0.5.0 Release
  -> 平台 installers、install manifest、Runtime 与 tools tarballs 进入 SHA256SUMS
  -> 把 installer + install manifest 两个 pinned SHA-256 回填 requirements
  -> 从公开附件在 Windows / macOS 隔离环境安装并执行 doctor
  -> Plugin 内容提交 A
  -> 只增加 provenance 的 Marketplace 快照 B
  -> 根 Bootstrap 提交 C（只改 manifest / README，Plugin 子树仍等于 B）
  -> stable 指向 B，main 指向 C，Bootstrap manifest 固定 B
  -> 从公开入口验证干净安装与 0.10.5 更新
```

任何一步未通过都停止推进下一项；本地候选测试不能代替公开资产下载后的复验。

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
