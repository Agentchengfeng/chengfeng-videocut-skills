# chengfeng-videocut Codex Plugin

`chengfeng-videocut` 是安装和 Plugin 群组名称，不是一个同名的业务 Skill。

```text
[Plugin: chengfeng-videocut]
       |
       +-- 剪口播 ----> chengfeng-cut-talking-head
       +-- 导出 ------> chengfeng-export-talking-head
       +-- 字幕 ------> chengfeng-subtitle-talking-head
       +-- 口播成片 --> chengfeng-finish-talking-head
       +-- 上报 Bug --> chengfeng-report-videocut-bug
       +-- 检查更新 --> chengfeng-check-videocut-updates
       |
       +-- references/（内部合同，不注册为 Skill）
```

Plugin 根入口不被同名 router 或公共说明 Skill 覆盖。每个用户可执行能力都有一个不同的、完整的公开 ID：

```text
$chengfeng-videocut:chengfeng-cut-talking-head
$chengfeng-videocut:chengfeng-finish-talking-head
$chengfeng-videocut:chengfeng-report-videocut-bug
$chengfeng-videocut:chengfeng-check-videocut-updates
```

静态元数据、`agents/openai.yaml`、Plugin 首页 starter prompt 和 CLI 的 `$plugin:skill` 调用，不能单独证明 Desktop Slash/Plugin 群组已经在界面中展示；那一项必须由实际 Desktop UI 单独验收。

六个 raw Skill 都保留 `user-invocable: true`，以兼容已知 host 的手动选择 metadata；它不是群组显示、排序或可见性的公开保证。

## 能力边界

```text
剪口播      -> 已复核的删词账本（不产媒体）
导出        -> source_cut.mp4
字幕        -> subtitles.srt
口播成片    -> final.mp4 + verification.json
上报 Bug    -> 脱敏草稿 -> 用户确认 -> GitHub Issue URL
检查更新    -> 官方 Marketplace 快照 -> 来源证明 -> 用户确认 -> 复读版本
```

共同边界只存在于 `references/runtime-and-product-contract.md` 与 `references/business-workflow-contract.md`。普通 reference 没有 `SKILL.md`、公开 ID 或 UI 卡片，不占用用户入口。

两个业务 Skill 共用 `scripts/ensure-runtime.cjs`、`scripts/ensure-running.cjs` 和 `runtime-requirements.json`。Plugin package `0.5.2` 消费 Runtime compatibility contract `0.2.1`：只接受 Runtime 0.2.1+ 与声明的 EDL、常驻 service、逐词稿操作能力；缺失时从精确的 `v0.2.1` Release 获取安装器和校验清单，校验后安装并执行 doctor。随后由 Product `service ensure --json` 幂等安装或恢复 macOS 用户服务；Plugin 不直接使用 `launchctl`、`nohup` 或 foreground 后台进程。Release 不存在、资产不完整或服务身份不匹配时安全停止，不会安装或覆盖旧 Runtime。Studio 只在人工审核状态且通过 `ensure-studio.cjs` 顶层视图能力门禁后打开。

`chengfeng-report-videocut-bug` 不安装 Runtime、不启动 Studio，也不改项目。它只生成脱敏 Issue 草稿，用户确认同一份正文后才调用 GitHub CLI；没有明确 Issue URL 就不宣称上报成功。

`chengfeng-check-videocut-updates` 的 `--inspect` 不 refresh；用户明确说检查更新后，它只对 Git Marketplace 运行官方 `codex plugin marketplace upgrade` 并比较 installed/available。本地 Marketplace 返回 `marketplace_not_refreshable`。官方 CLI 没有独立 stage：refresh 后的 snapshot 是唯一检查来源。激活前必须有 40-hex immutable commit、发布者 SHA-256 与 snapshot 内可重算的同一包清单哈希；裸 semver/tag 一律不可信。当前公开基线缺这些证明时返回 `update_metadata_untrusted`，不下载、不调用 `plugin add`。用户明确确认且传回所见 version/ref/SHA-256 后才以官方 `codex plugin add` 激活；随后必须从 installed cache 复读 version/ref/checksum 并重算 bundle inventory digest，任一不可观察或不一致即 `plugin_activation_unsupported`。失败绝不删除 cache、复制目录或更新 Runtime/项目。

Plugin 是独立的 `0.5.2` 版本；`runtime-requirements.json` 仍要求 Product Runtime `0.2.1`。两者不能互相替代。

## 开发验证

```bash
npm install
npm run build
npm test
```

发布目录需要 `dist/server.mjs` 与 `public/`，不包含 `node_modules/`。
