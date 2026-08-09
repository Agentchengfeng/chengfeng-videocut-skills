---
name: chengfeng-check-updates
description: 检查并管理 chengfeng-videocut 的 Codex Plugin 版本和 Product Runtime 就绪状态。用户说检查更新、更新剪辑 Skills、安装剪辑环境、装播放器、检查剪辑环境、剪辑环境就绪了吗、配置转录凭证时使用。不用于剪辑、字幕、画面、导出本身或项目数据迁移。
user-invocable: true
---

# 检查更新（环境总管）

本 Skill 只管两件事：Codex Plugin 更新与 Product Runtime 就绪。业务
Skill 每次启动只走原生 MCP 的 Runtime 门禁，**不会把 Plugin 联网更新
检查当成每个剪辑任务的第 0 步**。

本 Skill 不建项目、不打开 Studio、不转录媒体。

## 一、检查 Plugin 版本

只使用 Codex 0.146+ 的原生 Plugin 管理能力。不运行包内 Node 更新器，
不要求用户安装 Node、Git 或其他系统 CLI。

### 1. 读当前状态

调用 Codex 原生命令：

```text
codex plugin list --marketplace chengfeng-videocut --json
```

记录 installed 项的 `pluginId / version / enabled / marketplaceName`。若同名
Marketplace 不存在，报告 `marketplace_missing`；检查请求不自动新增安装源。

### 2. 用户明确要求「检查更新」时刷新 Marketplace

```text
codex plugin marketplace upgrade chengfeng-videocut --json
codex plugin list --marketplace chengfeng-videocut --available --json
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
codex plugin add chengfeng-videocut@chengfeng-videocut --json
codex plugin list --marketplace chengfeng-videocut --json
```

只有 `plugin add` 返回候选版本的 `installedPath`，且紧接着的 list 读回
显示同版本 `installed=true / enabled=true`，才报告 `activated`。激活成功后
状态是**需新会话**：当前会话已加载的 Skill 文本不会中途替换。

原生命令失败或读回版本不匹配时，只能报告 `activation_unverified`；
不得声称已更新，不得手工复制、删除或改名 Plugin cache。

### 首次安装源缺失

用户明确要求「安装 Plugin」时，才能使用 Codex 原生安装流程：

```text
codex plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref stable --json
codex plugin add chengfeng-videocut@chengfeng-videocut --json
```

然后必须 `plugin list --marketplace chengfeng-videocut --json` 读回。Marketplace 的
远程来源、快照刷新、cache 与启用状态由 Codex 原生管理；Skill 不再
自行实现 Git provenance 或回滚器。

## 二、检查 Runtime 就绪

调用 MCP `runtime_status`：

- `state=ready` 且 `ready=true`：报告**就绪**。
- `state=missing`：调用 `show_workflow_confirmation`，参数
  `{"kind":"runtime_install"}`。只有用户明确确认同一张卡片后，才把返回的
  `approvalDigest` 原样交给 `runtime_install`。
- `state=unhealthy`：停止，报告结构化 `reason`。禁止自制审核页、播放器、
  时间线或任何替代界面。
- `state=incompatible`：停止，报告当前版本、最低版本和 capability
  差异；不回退旧剪辑链。

Runtime 安装后再调用一次 `runtime_status`，必须读回 `ready=true`。用户说
「安装剪辑环境 / 装播放器 / 检查环境」时，就绪后还要调用：

```json
{"argv":["doctor","--json"]}
```

报告 Runtime 版本与位置、doctor 每项结果。

## 机器依赖边界

用户只需支持的 macOS 或 Windows 10/11 上的 Codex：

```text
Plugin runtime_install
  -> 下载并校验一个 Runtime 安装包
  -> 安装 Runtime 与受管媒体工具；不内嵌、下载或预检 Headless Shell
  -> Runtime 统一管理服务与媒体工具；Skill 只通过受管稳定启动器调用

实际 job start export 的 HTML 覆盖层渲染
  -> Product 先读取并校验自己的 Headless Shell 缓存
  -> 缓存未命中才下载锁定版本，校验归档和可执行文件后原子写入缓存
  -> 后续实际导出复用缓存；绝不搜索、借用或回退系统 Chrome / Chromium
```

用户流程不要求系统 Node、Bun、Git、`gh`、Chrome、Chromium、FFmpeg 或
FFprobe，也不要求它们进入 `PATH`。`runtime_status`、doctor、安装和
`--dry-run` 均不下载 Headless Shell；它只在实际导出渲染时由 Product 取得。
媒体能力缺失按 Runtime unhealthy/incompatible 停止；Headless Shell 的下载、
校验或缓存失败则实际导出 fail-closed。两种情况都不把依赖转嫁给用户，也不让
用户安装或指定系统浏览器。

云端转录凭证通过 MCP 结构化调用配置：

```json
{"argv":["config","set","transcription.apiKey","<key>"]}
```

## 开发工具与边界

- `scripts/check-plugin-update.cjs`、provenance 脚本和对应 Node 测试只是仓库开发/
  兼容验证工具，不属于用户更新流程。
- Plugin 与 Runtime 版本相互独立；最低 Runtime 和 capability 合同只由
  `runtime-requirements.json` 控制。
- requirements 中平台 Runtime 安装包摘要为 `null` 时，安装卡只能暂停，
  `runtime_install` 必须 fail-closed。
- 更新 Plugin 只改 Codex 的 Marketplace/Plugin 状态；Runtime 安装只改受管
  Runtime 根。两者都不得改项目、媒体、EDL 或 Studio 状态。

详细 Runtime 协议见 [Runtime 与产品契约](../../references/runtime-and-product-contract.md)。
