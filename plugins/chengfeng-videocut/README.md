# chengfeng-videocut Codex Plugin

`chengfeng-videocut` 是安装和 Plugin 群组名称，不是一个同名的业务 Skill。

```text
[Plugin: chengfeng-videocut]
       |
       +-- 剪口播 ----> chengfeng-cut
       +-- 字幕 ------> chengfeng-subtitle
       +-- 画面 ------> chengfeng-visual
       +-- 导出 ------> chengfeng-export
       +-- 上报 Bug --> chengfeng-report-bug
       +-- 检查更新 --> chengfeng-check-updates
       |
       +-- references/（内部合同，不注册为 Skill）
```

Plugin 根入口不被同名 router 或公共说明 Skill 覆盖。每个用户可执行能力都有一个不同的、完整的公开 ID：

```text
$chengfeng-videocut:chengfeng-cut
$chengfeng-videocut:chengfeng-report-bug
$chengfeng-videocut:chengfeng-check-updates
```

静态元数据、`agents/openai.yaml`、Plugin 首页 starter prompt 和 CLI 的 `$plugin:skill` 调用，不能单独证明 Desktop Slash/Plugin 群组已经在界面中展示；那一项必须由实际 Desktop UI 单独验收。

六个 raw Skill 都保留 `user-invocable: true`，以兼容已知 host 的手动选择 metadata；它不是群组显示、排序或可见性的公开保证。

## 能力边界

```text
剪口播      -> 已复核的删词账本（不产媒体）
画面        -> visuals.json + HTML 模块（风格库在 chengfeng-visual/animation-styles/）
导出        -> 成片.mp4（剪辑+推近+字幕+画面层一次烧成）
字幕        -> subtitles.json（按账本算时间，不再发布 SRT）
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
检查更新    -> Codex 原生 Marketplace 刷新 -> 用户确认 -> Plugin add -> 复读版本
```

共同边界只存在于 `references/runtime-and-product-contract.md` 与 `references/business-workflow-contract.md`。普通 reference 没有 `SKILL.md`、公开 ID 或 UI 卡片，不占用用户入口。

业务 Skill 共用原生 MCP 的四个工具：`runtime_status`、`runtime_cli`、
`show_workflow_confirmation`、`runtime_install`。Plugin package `0.11.0` 消费 Runtime
compatibility contract `0.5.0`；MCP 以提交在包内的 macOS Universal 2 / Windows x64
二进制离线启动，不需要系统 Node.js 或 Bun。`runtime_cli` 只接受结构化 `argv`，并且
只调用 Product 受管目录中的唯一稳定 launcher。Runtime 缺失时先显示安装卡片；用户
确认的 `approvalDigest` 同时绑定版本、平台单个 Runtime 安装包、该包 SHA-256、目标目录与
写入影响，`runtime_install` 会重新计算并精确比较，再下载和校验这一个包，最后在本地执行。
包内包含 Runtime、受管 Bun、FFmpeg、FFprobe 和 Headless Shell，不再下载 Release 的其他依赖。
0.5.0 发布摘要尚未填入 requirements 时安装明确
fail-closed。Studio 只在人工审核状态、浏览器真实读取同一服务的 capability manifest
并通过门禁后打开。

正式新装机唯一入口是 Plugin 的 `runtime_install`：单个 Runtime 安装包把 Runtime、平台受管
工具（含 managed Headless Shell）装入 `~/.chengfeng-videocut` 的版本化目录，并由
同一个稳定 launcher 执行 `service ensure`。历史 Desktop / 既有安装若已经写入同一
Product 受管根，可以被兼容复用，但 Desktop 不再是正式新装入口。Plugin 不搜索
Electron 资源目录，也不接受 foreground 进程冒充正式服务；
`chengfeng-report-bug` 对任何既有安装都保持只读。

`chengfeng-report-bug` 不安装 Runtime、不启动 Studio，也不改项目。Agent 直接
生成和通读脱敏 Issue 草稿；用户确认同一份 repo/title/body 后，只使用
当前 Agent 已有的 GitHub Issue 能力提交。能力不可用时返回草稿并明确写
「未提交」；没有明确 Issue URL 就不宣称成功。

`chengfeng-check-updates` 委托给 Codex 0.146+ 原生 Plugin 管理：用户要求检查
时执行 `plugin marketplace upgrade chengfeng-videocut`，再用
`plugin list --available --json` 展示 candidate；用户确认后执行
`plugin add chengfeng-videocut@chengfeng-videocut`，并以 `plugin list --json` 复读
installed/enabled 版本。不存在 `codex plugin update` 这个子命令。更新 Plugin
不安装、不替换 Runtime，也不改项目或媒体。当前会话不中途换 Skill，
激活成功后需新会话。

业务 Skill 的 Runtime 门禁不会每任务刷新 Marketplace。它只调用原生 MCP
`runtime_status`，并在缺失时经摘要确认卡进入 `runtime_install`。

Plugin 是独立的 `0.11.0` 版本；`runtime-requirements.json` 要求 Product Runtime `0.5.0`。两者不能互相替代。

## 开发验证

原生 MCP 开发基线是 Go 1.25；发布包必须提交预构建二进制，因为 Marketplace 安装不
保证运行构建生命周期，用户机器也不应需要 Go。构建产物必须复现出 macOS Universal 2
与 Windows x64：

```bash
go test ./...
./scripts/build-native-mcp.sh
go run ./cmd/native-mcp-raw-smoke ./bin/chengfeng-videocut-mcp
go run ./cmd/native-mcp-smoke ./bin/chengfeng-videocut-mcp
```

六个用户 Skill 都不要求系统 Node/Bun/Git/`gh`/Chrome/FFmpeg/FFprobe。
媒体和渲染依赖只由 Product Runtime 管理。仓库中的 Node 脚本仍可用于开发回归，
但不是用户流程。`runtime_cli` 为既有同步命令保留有界 9 分钟窗口；持久
job 契约当前只声明 `export`，不宣称 transcribe 已经 durable。Runtime 冷安装
从下载到最终读回共用 19 分钟内部上界，低于 MCP host 的 1201 秒边界。
