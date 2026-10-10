# chengfeng-videocut-skills

chengfeng-videocut 的公开 **Codex Plugin 安装入口**。软件本体 Runtime / Studio 的源码与发行产物在 [chengfeng-videocut](https://github.com/Agentchengfeng/chengfeng-videocut)。

Plugin 提供给 Agent 的方法和确认工具；Runtime 执行工程操作并提供工作台。安装 Plugin、准备 Runtime、完成视频是三件不同的事。本仓不是已经停用的链接页，也不是新的独立 Skills 全套下载器。

## 本次默认 Skill 预发行

Plugin **0.10.11** / bootstrap **0.5.3** 随包提供「工作台操作」Skill：定位词句、覆盖或移除画面、删除明确片段、拆分裁剪移动已有片段、画布适配及回读。它是受能力门禁的预发行入口，首次使用必须先通过只读预检；方法来自[独立仓库](https://github.com/Agentchengfeng/chengfeng-videocut-workbench)的固定版本，不在 Plugin 中另写一套。

**兼容提醒：新 Skill 要求 Runtime >=0.5.9 且实际 workbench 能力匹配。当前公开下载仍是 v0.4.11，不满足新命令要求。** 使用工作台前运行 `node "<Plugin 根目录>/scripts/workbench-preflight.cjs" --json` 做只读预检；缺能力时只报告并停止，不自动安装、升级或修改工程。此次发布的是方法和默认入口，不是新的 Runtime 发行。

### 本次固定身份

| 对象 | 固定身份 |
|---|---|
| Plugin | 0.10.11 |
| Plugin 内容提交 | `d4580d8a0cef4fa34558b068945575d03e4c63ee` |
| 带来源回执的安装快照 | `6d798efb9940946c994d1f3e59f8ff2ea7446c31` |
| 工作台操作方法 | `v0.1.0-beta.1` / `e9e78e0f3aefca1c38a1157817cc411e9757bb12` |
| 配套 Runtime | [v0.4.11](https://github.com/Agentchengfeng/chengfeng-videocut/releases/tag/v0.4.11) |

`installer-manifest.json` 同时固定 marketplaceRef 和 pluginRef；bootstrap 自己的提交与 Plugin 快照不是同一个概念。安装时不跟随 main/stable 漂移，也不重写已发布标签或同版本内容。

本次 bootstrap 修订单独形成发布提交；对应完整 SHA 由 [v0.10.11 预发行回执](https://github.com/Agentchengfeng/chengfeng-videocut-skills/releases/tag/v0.10.11) 提供，不把 Plugin 安装快照误当成 bootstrap 提交。`stable` 是可变发现入口，不能代替上表安装身份。**本轮不推进 stable**，不移动旧标签，也不替换用户已安装的 Plugin 或 Runtime。

随包的七个入口分为六项默认基础入口（剪口播、字幕、画面、导出、上报 Bug、检查更新）和一个受能力门禁的工作台预发行入口。工作台操作可由 `$chengfeng-videocut:chengfeng-videocut-workbench` 选择；安装、预检和新任务发现仍分别验证，随包不保证现有桌面会话热加载。

## 安装与检查

前提：Node.js 18+、Git，以及已登录且支持 `codex plugin` 命令的 Codex CLI。先审阅取得的固定源码，再在该目录运行：

```sh
node bin/install.cjs install --dry-run
node bin/install.cjs install
node bin/install.cjs doctor
```

GitHub npx 的具体可用命令以该次 Release 回执中的实测结果为准。npm 10.9.2 在按完整提交进行 Git 打包时可能报 `GitFetcher requires an Arborist constructor`；这是引导获取失败，尚未安装 Plugin。可按 Release 给定的完整提交取得源码、核对 HEAD 后执行上面的 Node 命令；不要改用未锁定的 main/stable，也不要把上表 Plugin 快照当成本次 bootstrap 修复的提交。

安装器只调用宿主支持的 Plugin 命令，并回读来源、克隆提交与安装状态。已存在同名或来源不明的安装会拒绝覆盖；不要先删除安装目录来绕过检查。它不准备或启动 Runtime。新任务能否发现 Skill 与 MCP，仍须分别验收，已有会话可能需要重新打开。

既有六个入口加载后，需要工作台时按包内 `references/runtime-and-product-contract.md` 和 `scripts/ensure-runtime.cjs` 准备固定配套 Runtime；以实际输出确认版本、能力和缺少的依赖。缺失 Runtime 的下载仍固定到 v0.4.11；该 CLI 安装器仍需 Node 或已有 Bun 启动，随后可在 macOS arm64 从固定官方资产及 SHA-256 准备产品私有 Bun，并供持久启动入口复用，不修改全局 Bun 或 shell 配置。既有健康且能力满足要求的 0.4.10+ Runtime 可继续复用；不因此自动覆盖升级。**新工作台操作不走这条旧版本准备路径**，只按自身 >=0.5.9 和实际能力预检，缺少时停止。媒体依赖、宿主加载、常驻服务与实际剪辑应分别验收；本次不提供新的 Runtime、DMG 或 EXE。

## 独立小黑 Skill 的兼容边界

[chengfeng-videocut-xiaohei](https://github.com/Agentchengfeng/chengfeng-videocut-xiaohei) 独立维护动画方法及 ChatCut 适配；它不等于本 Plugin 内的历史画面方法。

独立小黑的新 Runtime 路线要求 >=0.5.9 以及 `workbench commands/connect`、`module publish/get`、`workbench visuals-put` 等实际接口。**Runtime 0.4.10 与本次 0.4.11 安装修复均不满足此合同。** 仅安装本 Plugin 不能宣称接通独立小黑，也不能反复重装或降低版本门槛绕过检查。

已有 ChatCut 等合格工作台时沿用其可验证适配；需要新版 Runtime 路线时等待经过验证的配套发行或明确适配。用户明确只要独立动画时，可交付 HTML/SVG，不冒称已进入剪辑工程。

## 仓库分工

- 本仓：当前公开 Codex Plugin、固定安装入口、包内使用方法及来源回执。
- [Runtime 主仓](https://github.com/Agentchengfeng/chengfeng-videocut)：软件源码、Studio、Runtime 安装与发行。
- [安装与接入 Skill](https://github.com/Agentchengfeng/chengfeng-videocut-install)：独立安装方法与本地文件包工具；不是已经实现的远端全套安装事务。
- 其他独立 Skills：各自维护和发布，兼容性逐项验证；不以本 Plugin 已启用代替全部独立包可用。

## 历史与来源

旧版本从 [Releases](https://github.com/Agentchengfeng/chengfeng-videocut-skills/releases) 或固定提交查看。历史说明、迁移规划与当前已验证的发行范围分开，不自动迁移用户工程或安装。

保留 [LICENSE](LICENSE)、[NOTICE.md](NOTICE.md) 与 [CITATION.cff](CITATION.cff)。维护者：**成峰 / AI产品自由**。[GitHub](https://github.com/Agentchengfeng) · [X](https://x.com/chengfeng240928)。关注不是安装条件。
