---
name: chengfeng-videocut-check-updates
description: 检查并管理 chengfeng-videocut 的 Codex Plugin 版本和 Product Runtime 就绪状态。用户说检查更新、更新剪辑 Skills、安装剪辑环境、装播放器、检查剪辑环境、剪辑环境就绪了吗、配置转录凭证时使用。不用于剪辑、字幕、画面、导出本身或项目数据迁移。
user-invocable: true
---

# 检查更新（环境总管）

先完整读取[共享接入规则](../../references/plugin-access.md)，按本轮能力发现并复用实际 Plugin/工具入口；不要把 Runtime 缺失或工具未加载称为 Plugin 未安装。

本 Skill 只管两件事：Codex Plugin 更新与 Product Runtime 就绪。业务
Skill 每次启动先发现并复用满足能力的入口，按所选路线检查 Runtime，**不会把 Plugin 联网更新
检查当成每个剪辑任务的第 0 步**。

本 Skill 不建项目、不打开 Studio、不转录媒体。

## 一、检查 Plugin 版本

Plugin 的首次安装和后续更新都只使用 Codex 0.146+ 的原生 GitHub Marketplace 管理能力，
不运行包内 Node 更新器，也不要求用户安装 Git、Node、npm、npx 或其他系统 CLI。

### 1. 读当前状态

调用 Codex 原生命令：

```text
codex plugin list --json
```

记录 installed 项的 `pluginId / version / enabled / marketplaceName`，并检查实际加载工具。
后续占位符必须替换为已发现的真实来源与 selector，不默认 release marketplace。
确认所需 Plugin 身份未安装才报告 plugin_missing；提供者未知、版本缺工具、disabled、tools_not_loaded 和 Runtime 缺失分别诊断。
检查请求不自动新增安装源。

### 2. 用户明确要求「检查更新」时刷新 Marketplace

```text
codex plugin marketplace upgrade <marketplace-name> --json
codex plugin list --marketplace <marketplace-name> --available --json
```

这是 Codex 0.146 已验证的原生语义：`marketplace upgrade` 刷新 Git
Marketplace snapshot，不等于激活新 Plugin。禁止写不存在的
`codex plugin update` 命令。

- 没有更高 available version：报告 `current`。
- 有更高 available version：展示 installed 与 candidate 版本，停下等用户
  确认；检查本身不激活。
- 网络、认证或 Marketplace 刷新失败：原样报告原生错误，不手工改
  cache，不回退包内脚本。

### 3. 用户确认候选版本后激活

```text
codex plugin add <plugin-name>@<marketplace-name> --json
codex plugin list --json
```

只有 `plugin add` 返回候选版本的 `installedPath`，且紧接着的 list 读回
显示同版本 `installed=true / enabled=true`，才报告 `activated`。激活成功后
还必须重新发现实际加载工具并执行所需能力的只读 probe；未加载才建议宿主刷新/重开，
不得断言必须新任务，不把 installed 当作 loaded 或 Runtime ready。

原生命令失败或读回版本不匹配时，只能报告 `activation_unverified`；
不得声称已更新，不得手工复制、删除或改名 Plugin cache。

### 首次安装源缺失

确认 Plugin 确实缺失且用户授权安装后，才能使用 Codex 原生安装流程。
精确来源、不可变 ref 和 selector 须来自受信发布说明或用户确认；不猜 URL：

```text
codex plugin marketplace add <trusted-source> --ref <immutable-ref> --json
codex plugin add <plugin-name>@<marketplace-name> --json
```

然后必须 `codex plugin list --json` 读回，并核验实际工具加载与只读 probe。Marketplace 的
远程来源、快照刷新、cache 与启用状态由 Codex 原生管理；Skill 不再
自行实现 Git provenance 或回滚器。

## 二、检查 Runtime 就绪

先按共享入口判断是否需要 Runtime。用户指定工作台优先只读连接并检查本操作能力：
新 WAV 建档核对实际加载的 `runtime_ingest_start/status` 与服务 `features.ingestApiVersion=1`；
修字核对 `runtime_transcript_correct` 与 `features.transcriptCorrectionApiVersion=1`。
两端满足才报告对应能力可用；工具未加载与服务缺能力分别诊断，不能一概称 existing connection 不支持，
也不因此重装 Plugin。检查本身不提交转录或修字；业务执行另按 [existing-workflow.md](../../references/existing-workflow.md) 的授权和结果合同。
只有选择受管路线才调用 MCP `runtime_status`：

- `state=ready` 且 `ready=true`：报告**就绪**。
- `state=missing`：调用 `show_workflow_confirmation`，参数
  `{"kind":"runtime_install"}`。只有用户明确确认同一张卡片后，才把返回的
  `approvalDigest` 原样交给 `runtime_install`。
- `state=runtime_channel_mismatch`：先展示 `observedChannel / expectedChannel /
  runtimeVersion / targetRoot`。若 `repairable=true`，调用
  `show_workflow_confirmation`，参数 `{"kind":"runtime_repair"}`；只有用户明确
  确认同一张卡片后，才把返回的 `approvalDigest` 原样交给 `runtime_repair`。
  修复只原子替换受管 `app / tools / launcher / service`，必须保留 `projects`、
  `config.json` 和原媒体。若 `repairable=false`，停止并要求改用匹配通道的 Plugin，
  不得拿正式包覆盖开发通道。
- `state=unhealthy`：停止，报告结构化 `reason`。禁止自制审核页、播放器、
  时间线或任何替代界面。
- `state=incompatible`：停止，报告当前版本、最低版本和 capability
  差异；不回退旧剪辑链。

Runtime 安装或修复后再调用一次 `runtime_status`，必须读回 `ready=true`，且
`observedChannel=expectedChannel`。用户说
「安装剪辑环境 / 装播放器 / 检查环境」时，就绪后还要调用：

```json
{"argv":["doctor","--json"]}
```

报告 Runtime 版本与位置、doctor 每项结果。

## 机器依赖边界

用户不手工安装媒体依赖，也不需要 Node、npm 或 npx。Codex 从 GitHub Marketplace 安装
Plugin；包内预构建的原生 MCP 自动识别平台，并把 GitHub Release 当作内部 Runtime
发行库。用户不运行 `npm install`，也不需要安装 Bun、FFmpeg、FFprobe 或 Chrome。当前
公测范围是 Windows x64；Runtime 流程是：

```text
Plugin runtime_install
  -> 从固定 GitHub Release Asset API 下载 requirements 锁定 tag、精确资产名、Asset API URL 和 SHA-256 的一个平台 Runtime 安装包
  -> 原生 MCP 校验安装包 SHA-256，拒绝摘要不符或未锁定的下载
  -> 安装 Runtime 与受管媒体工具；不内嵌、下载或预检 Headless Shell
  -> Runtime 统一管理服务与媒体工具；Skill 只通过受管稳定启动器调用

实际 job start export 的 HTML 覆盖层渲染（仅当用户已确认且导出确实存在覆盖层）
  -> Product 先读取并校验自己的 Headless Shell 缓存
  -> 缓存未命中才下载锁定版本，校验归档和可执行文件后原子写入缓存
  -> 后续实际导出复用缓存；绝不搜索、借用或回退系统 Chrome / Chromium
```

用户流程不要求系统 Node、npm、npx、Bun、Git、`gh`、Chrome、Chromium、FFmpeg 或
FFprobe，也不要求它们进入 `PATH`。`runtime_status`、doctor、安装和
`--dry-run` 均不下载 Headless Shell；它只在实际导出渲染时由 Product 取得。
媒体能力缺失按 Runtime unhealthy/incompatible 停止；Headless Shell 的下载、
校验或缓存失败则实际导出 fail-closed。两种情况都不把依赖转嫁给用户，也不让
用户安装或指定系统浏览器。

正式版/公测版默认只使用 `~/.chengfeng-videocut`；本地开发版默认只使用
`~/.chengfeng-videocut-dev`。除非测试显式设置 `CHENGFENG_VIDEOCUT_HOME`，两个
通道不得共享受管根。5190 仍是 Product 托管服务的唯一端口；开发者若显式以前台
`start --port 15190` 运行隔离 Studio，不能把它冒充托管服务。doctor 已发现受管二进制但
`dependencyMode` 不匹配时，Bun/FFmpeg/FFprobe 必须报告 `blocked`，不得误报为
系统 `PATH` 缺失。

云端转录凭证通过 MCP 结构化调用配置：

```json
{"argv":["config","set","transcription.apiKey","<key>"]}
```

## 开发工具与边界

- `scripts/check-plugin-update.cjs`、provenance 脚本和对应 Node 测试只是仓库开发/
  兼容验证工具，不属于用户更新流程。
- Plugin 与 Runtime 版本相互独立；最低 Runtime 和 capability 合同只由
  `runtime-requirements.json` 控制。
- requirements 中平台 Runtime 安装包的 `runtimePackageSHA256` 为 `null` 时，安装卡只能暂停，
  `runtime_install` 必须 fail-closed。
- 更新 Plugin 只改 Codex 的 Marketplace/Plugin 状态；Runtime 安装只改受管
  Runtime 根。两者都不得改项目、媒体、EDL 或 Studio 状态。

详细 Runtime 协议见 [Runtime 与产品契约](../../references/runtime-and-product-contract.md)。
