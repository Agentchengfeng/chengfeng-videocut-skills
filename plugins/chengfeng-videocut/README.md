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
检查更新    -> 官方 Marketplace 快照 -> 来源证明 -> 用户确认 -> 复读版本
```

共同边界只存在于 `references/runtime-and-product-contract.md` 与 `references/business-workflow-contract.md`。普通 reference 没有 `SKILL.md`、公开 ID 或 UI 卡片，不占用用户入口。

业务 Skill 共用原生 MCP 的四个工具：`runtime_status`、`runtime_cli`、
`show_workflow_confirmation`、`runtime_install`。Plugin package `0.11.0` 消费 Runtime
compatibility contract `0.5.0`；MCP 以提交在包内的 macOS Universal 2 / Windows x64
二进制离线启动，不需要系统 Node.js 或 Bun。`runtime_cli` 只接受结构化 `argv`，并且
只调用 Product 受管目录中的唯一稳定 launcher。Runtime 缺失时先显示安装卡片；用户
确认的 `approvalDigest` 同时绑定版本、平台 installer、install manifest、目标目录与
写入影响，`runtime_install` 会重新计算并精确比较，再校验 pinned SHA-256 和同 Release
清单，最后才执行编译安装器。0.5.0 发布摘要尚未填入 requirements 时安装明确
fail-closed。Studio 只在人工审核状态、浏览器真实读取同一服务的 capability manifest
并通过门禁后打开。

正式新装机唯一入口是 Plugin 的 `runtime_install`：编译安装器把 Runtime、平台受管
工具（含 managed Headless Shell）装入 `~/.chengfeng-videocut` 的版本化目录，并由
同一个稳定 launcher 执行 `service ensure`。历史 Desktop / 既有安装若已经写入同一
Product 受管根，可以被兼容复用，但 Desktop 不再是正式新装入口。Plugin 不搜索
Electron 资源目录，也不接受 foreground 进程冒充正式服务；
`chengfeng-report-bug` 对任何既有安装都保持只读。

`chengfeng-report-bug` 不安装 Runtime、不启动 Studio，也不改项目。它只生成脱敏 Issue 草稿，用户确认同一份正文后才调用 GitHub CLI；没有明确 Issue URL 就不宣称上报成功。

`chengfeng-check-updates` 把“发现候选”与“改变用户安装”分成两个事务。`--inspect`
与普通检查都直接读取当前 Plugin cache；检查阶段不会以用户 `CODEX_HOME` 调用任何
`codex` 命令，也不会写用户的 Marketplace、配置或 cache。联网发现只在一次性临时
`CODEX_HOME` 中把官方 `stable` 解析为发布快照 `snapshotRevision`（40-hex，记作
B）；包内 provenance 再把该快照绑定到内容提交 `contentRevision`（40-hex，记作
A）和可重算的 `publisherChecksum`。只有 version + B + A + SHA-256 四项一致才会
展示候选；`stable` 只是临时候选发现入口，不是用户安装的持久引用。

候选还必须通过 Git 来源证明：临时 Marketplace 的 origin 必须是官方仓库，HEAD
必须等于 B，A 必须是 B 可达的提交，且 A 到 B 的 Plugin 子树只能新增 provenance；
工作树必须干净，清单摘要也必须等于 `publisherChecksum`。当前安装则必须来自同一
exact pinned Marketplace 的官方 Git 工作树，所选 cache 与该快照中的 Plugin 字节
完全一致。cache 中允许保留更低版本目录，但活跃项必须是唯一的最高 strict semver；
若两个目录具有相同的最高 semver 优先级，则以 `installed_identity_untrusted`
停止，不能猜测该用哪个。

用户确认所见四项后，脚本会重新隔离 stage；候选未漂移才进入写事务。用户
Marketplace 始终固定到 exact B。写入前再以 CAS 复读 Marketplace 与 cache；状态
变化就返回 `activation_state_changed`，不开始激活。状态未变才通过官方命令执行
remove → add `--ref B` → upgrade，再直接复读 cache 验证 version + B + A +
SHA-256。命令失败但安装仍与旧状态完全相同时返回
`activation_failed_no_change`，不做多余回滚；已经发生变化时才尝试恢复更新前的
exact snapshot revision。只有完整恢复才返回
`activation_failed_rolled_back`（cache 锁冲突为
`activation_cache_locked_rolled_back`），恢复不完整返回
`activation_failed_rollback_incomplete` 并明确报告实际状态。历史 0.10.5 安装没有
完整 provenance 时仍可作为一次性迁移源：检查结果带
`legacyInstalledIdentity=true`，继续使用同一个
`update_available_confirmation_required` 确认门，无需用户先做 Marketplace ref
变更；旧 revision、cache 版本、manifest 或清单互相矛盾时返回
`installed_identity_untrusted`。更新失败或回滚都不安装、不替换 Runtime，也不改
项目或媒体。

Windows 上，更新脚本与 GitHub npm bootstrap 都按 `PATHEXT` 优先解析原生可执行
扩展名，再回退无扩展名文件；`.cmd` / `.bat` 始终由 `ComSpec` 包装执行。因此 pnpm
目录同时存在 Unix `codex` shim 与 `codex.cmd` 时，会选择可在 Windows 启动的
`codex.cmd`。

首次 GitHub npm bootstrap 与日后更新是两条独立事务。bootstrap 预检无同名
Marketplace/Plugin 后，先以 manifest 的 exact 40-hex ref 执行 Marketplace add；
紧接着、在 upgrade 之前读取 available inventory。若这一步暴露出 add 前不可见的
历史 orphan Plugin，它会拒绝激活，只移除本次新加的 Marketplace 并保留 orphan，
不会调用 Plugin remove。通过该门禁后才执行 upgrade、Git/metadata 身份复读和
Plugin add；后续失败则按本次实际创建的状态执行 Plugin remove → Marketplace
remove，并再次复读确认。

Plugin 是独立的 `0.11.0` 版本；`runtime-requirements.json` 要求 Product Runtime `0.5.0`。两者不能互相替代。

## 开发验证

原生 MCP 开发基线是 Go 1.24；发布包必须提交预构建二进制，因为 Marketplace 安装不
保证运行构建生命周期，用户机器也不应需要 Go。构建产物必须复现出 macOS Universal 2
与 Windows x64：

```bash
go test ./...
./scripts/build-native-mcp.sh
go run ./cmd/native-mcp-smoke ./bin/chengfeng-videocut-mcp
```

核心剪辑、Runtime 状态/安装/调用都不依赖系统 Node/Bun。当前残余 Node-only 范围只有
Plugin Marketplace 更新脚本，以及 Bug draft/submit 安全事务；它们不是核心剪辑链，
但调用时仍要求 Node.js ≥ 20。不得把 0.11.0 宣称为所有辅助能力都零系统依赖。
