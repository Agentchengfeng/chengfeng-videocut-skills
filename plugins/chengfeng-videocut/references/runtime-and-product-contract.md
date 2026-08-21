# Runtime 与产品契约

四个业务 Skill 共用本文件；它是普通内部 reference，不是用户可触发的 Skill。

## Plugin 入口边界

- Plugin `chengfeng-videocut` 只负责安装与 UI 群组，不是 raw Skill。
- Plugin MCP 是包内预构建的 Go 原生 STDIO server，离线启动不依赖系统 Node/Bun。
  Marketplace 更新由 Codex 原生 Plugin 管理；Bug 草稿由 Agent 生成，确认后
  只使用 Agent 已有 GitHub Issue 能力。六个用户 Skill 都无系统 CLI 依赖。
- 用户入口只有剪口播、字幕、画面、导出、Bug 上报和更新检查六个具体 Skill；共同规则不得建立 `SKILL.md`、router、alias 或第二个总入口。
- Product Runtime、Studio、项目、媒体、EDL、history、播放器与唯一时钟只由 Product 拥有；Skill 只做语义判断、流程编排和受约束调用。
- Plugin 首页 starter prompt、`user-invocable` metadata、静态 YAML 与 CLI 发现结果都不能单独证明 Desktop `/` 选择器已经视觉验收。

## 预检状态

```text
runtime_status
      |
      +-- ready ------------------------> 继续当前 Skill
      |
      +-- missing --> show confirmation --> runtime_install --> doctor --> 继续当前 Skill
      |
      +-- unhealthy / install failed ---> 停止，不打开 Studio
      |
      +-- incompatible -----------------> runtime_capability_missing
                                               |
                                               v
                                      停止，不回退旧剪辑链
```

- Plugin package 消费 `runtime-requirements.json` 的 Runtime `0.5.9` 合同；最低 Runtime 为 `0.5.9`，并声明 Runtime EDL、Studio 与跨平台用户服务能力集合。
- 缺失时只从固定 GitHub Release **Asset API** 下载**一个**平台对应的精确 Runtime 安装包。requirements 必须预先锁定 repository、release tag、资产名、Asset API URL、SHA-256、最大尺寸、目标分发模式与许可状态；任一为空或不符时，不生成可执行 `approvalDigest`。
- 下载以 `api.github.com/repos/<owner>/<repo>/releases/assets/<id>` 和 `Accept: application/octet-stream` 起始，只接受匿名 HTTPS 重定向，写入后必须以 requirements 中的 SHA-256 复核；超出最大尺寸、摘要不符、未锁定或 HTTP 状态非 200 时拒绝执行。
- 正式新装机只经唯一 Codex Plugin 的 `runtime_install`；原生 MCP 自动选择的 GitHub Release Runtime 安装包内嵌 Runtime、受管 Bun、FFmpeg
  与 FFprobe。Plugin 只下载并校验这一包，安装器只在本地解包、安装并执行同一个 `service ensure`，
  不再从上游下载这些依赖。Headless Shell 不属于安装包或预检：只有用户确认实际 export 后，
  Runtime 才按固定 platform/build/SHA-256 获取、校验、缓存和复用它；损坏、离线或锁不完整必须
  fail-closed，绝不扫描或回退系统浏览器。历史 Desktop / 既有安装若已在同一受管根可兼容复用，
  但不再是正式新装入口。
- GitHub Release 缺失、release tag / 资产名漂移、安装包摘要未锁定或哈希不符时，以 `install_failed` 停止；不得转装公开旧版、源码 clone、npx 或 bunx，也不得调用用户系统的 npm/Node。
- Runtime 冷安装的单包下载、安装器执行与最终 readback 共用 19 分钟
  内部 context；MCP host `tool_timeout_sec=1201` 留出有界终止和响应收尾窗口。
- 安装位置是 `CHENGFENG_VIDEOCUT_HOME` 或 `~/.chengfeng-videocut`。
- CLI 已存在但 doctor 失败时不自动覆盖或循环重装；已有 Runtime 低于 0.5.9 时也不静默覆盖。
- CLI doctor 健康但 semver 低于 0.5.9，或缺少合同 capability 时，以 `runtime_capability_missing` 停止；不把“健康”误当“兼容”。
- MCP 只认 `CHENGFENG_VIDEOCUT_HOME` 或默认受管根内的 stable launcher；逐级 `Lstat` 拒绝 symlink、目录与越界路径，启动器必须是单硬链普通文件。健康检查和 CLI 调用前后的指纹发生改变时以 `unhealthy / launcher_integrity_changed` 停止；不回退 PATH、源码或显式任意 binary。
- Plugin 不搜索 Electron `.app`、NSIS 目录或 resources；只有经过摘要确认的 Runtime
  installer 能建立新的 Product 稳定入口。

## 常驻服务门禁

Runtime 二进制兼容后，四个业务 Skill 都通过 MCP `runtime_cli` 调用同一个 Product 命令：

```text
runtime_cli argv=["service","ensure","--json"]
       |
       v
Product service ensure --json
   | healthy managed service       | conflict / identity mismatch
   v                               v
继续业务 API / 人工审核             停止并透传结构化错误
```

- Plugin 不直接调用 `launchctl`、`nohup`、PID 文件或后台进程 API；服务安装、启动、升级收敛和 crash restart 全部属于 Product。
- `service ensure` 成功必须返回 `ok=true`，且 `data` 同时满足：`healthy=true`、`runtimeMode=launchd|windows-task`、`productVersion>=0.5.9`、正整数 `pid`、`url=http://127.0.0.1:5190/`。
- 健康服务会幂等复用；页面或 Codex 父终端关闭不应结束服务。
- 返回 foreground 身份、未知端口占用、错误 URL、旧版本或不完整 JSON 时 fail-closed；Skill 不杀进程、不换 5191、不回退临时 foreground。
- `service ensure` 不创建项目、不打开 Studio；仍只在 `*_review_ready` 后执行 `open`。
- `chengfeng-cut` 在项目创建后、第一次 Cuts API 前以及每次审核恢复前 ensure。

机器可读 capability 合同除 EDL 字段外，还要求：`serviceApiVersion=1`、完整 `serviceOperations`、`managedStudioService=true`、`serviceParentProcessIndependent=true`、`serviceCrashRestart=true`、`durableJobsApiVersion=1`与 `durableJobKinds` 包含 `export`。标量必须同 JSON 类型精确相等，数组按必需子集匹配；缺少任一字段都返回 `runtime_capability_missing`。持久 job 当前只声明 `export`，不宣称转录已 durable。

## 单写者

```text
Skill proposal + expected revision
               |
               v
        Product CLI / API
               |
        validate + CAS + atomic write
               |
               v
          project artifacts
               |
               v
        Studio / Player / Timeline
```

- Skill 只写临时候选文件；规范产物必须用 `cuts set` 或 `artifact put` 发布。
- `cuts set` 的候选只含语义删词；Product 以 `semantic-overlay` 合并 natural-pause 基线。Skill 禁止手工 union `baselineCutWordIds`。
- `project.json`、Cuts、artifact revision 与 workflow 只能由 Product 写入。
- Studio 是同一项目的审核界面，不是任务启动器，也不是第二份事实源。
- 物理剪切、阶段确认和最终导出都要求用户明确确认与最新 revision。

## Studio 能力门禁

Runtime API 与 Studio 页面是两个独立能力，不能用端口或 URL 参数代替版本证明：

```text
Product open 返回项目 URL
             |
             v
 浏览器读取 capability manifest
       |             |
       | 支持顶层视图 | 缺少能力
       v             v
打开 verified URL   停止，不开旧界面
```

- 正式 Runtime 应提供 `/chengfeng-videocut-capabilities.json`，声明 `topLevelViews`、`legacyWorkbenchPanel=false`、`managedTimelineEditing=true`、`managedTimelineOperations=[move,trim,split,delete]` 与 Studio 版本。
- 正式单入口必须提供 capability manifest；构建入口 marker 只保留给仓库内开发测试，不得成为公开 Skill 的运行路径。
- `?view=koubo` 只是导航请求，不是能力证明。
- `CHENGFENG_VIDEOCUT_STUDIO_ORIGIN` 只允许显式开发覆盖；项目 hash 必须保留。
- 缺少 `koubo / storyboard / preview` 任一顶层视图、仍保留旧工作台或原生时间线没有接入 EDL 写入时，返回 `studio_capability_missing`，禁止打开旧任务面板或静默回退。

## 当前 Runtime 兼容门禁

- 低于 0.5.9 的 Runtime 不具备本 Plugin 发布所绑定的完整受管工具与当前 EDL / Studio compatibility contract，必须被版本门禁拒绝。
- Runtime `0.5.9` Windows GitHub Release 安装包必须先于 Plugin `0.11.7-beta.2` 激活；该包内嵌 Runtime、Bun、FFmpeg 与 FFprobe。精确 release tag、资产名和 SHA-256 必须预先写入 Plugin requirements。Headless Shell 继续只由确认后的实际 export 受管获取，不属于该安装包。
- `v0.5.9` 必须提供正式原视频云端转录命令；缺少时以 `missing_cloud_transcription_adapter` 停止，禁止回退本地 ASR。
- `v0.5.9` 必须提供可用 renderer manager；它仅在用户确认的实际 export 中确保固定锁定的
  Headless Shell，且新版 Skill 不得把旧 renderer 或系统浏览器重新打包、扫描或回退。
- 没有 HyperFrames 顶层 `koubo` 视图或 capability manifest 的历史 Studio 必须被能力门禁拒绝，不能再作为审核界面回退。
- 这些缺口不允许通过旧 8898/8899 页面、直接文件写入、旧任务面板或 Skill 私有导出器绕过。

## Plugin 更新与首次安装

用户路径完全委托给 Codex 0.146+ 原生 Plugin 管理，不再由 Plugin 内脚本自行管理
Marketplace、Git snapshot、cache 或回滚：

```text
检查更新
  -> codex plugin list --marketplace chengfeng-videocut --json
  -> codex plugin marketplace upgrade chengfeng-videocut --json
  -> codex plugin list --marketplace chengfeng-videocut --available --json
  -> 展示 installed / candidate，等待用户确认
  -> codex plugin add chengfeng-videocut@chengfeng-videocut --json
  -> codex plugin list --marketplace chengfeng-videocut --json
```

- `marketplace upgrade` 只刷新 Codex 管理的 Git Marketplace snapshot；不等于激活
  新 Plugin。只有用户确认 candidate 后才调用 `plugin add`。
- `plugin add` 与紧接着的 list readback 必须显示同一 candidate version、
  `installed=true`、`enabled=true`，才可报告 `activated`；然后要求新开会话。
- Codex 0.146 没有 `codex plugin update` 子命令，不得编造或文档化这个命令。
- Marketplace 不存在时，检查请求只报告 `marketplace_missing`。用户明确要求首次安装
  Plugin 后，才可执行（`<immutable-plugin-commit>` 必须来自发布说明，不能使用分支名）：

```text
codex plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref <immutable-plugin-commit> --json
codex plugin add chengfeng-videocut@chengfeng-videocut --json
codex plugin list --marketplace chengfeng-videocut --json
```

- Codex 原生命令失败、候选漂移或读回不一致时报告 `activation_unverified`；Skill
  不手工复制、改名或删除 cache，也不自行实现 Git provenance 或回滚。
- 更新事务只允许改变 Codex Marketplace 与 Plugin 状态；不得安装或替换 Runtime，
  不得写项目、媒体、EDL 或 Studio。
- 仓库内 `check-plugin-update.cjs`、provenance、bootstrap 及其 Node 测试只保留为
  开发/兼容回归工具，不属于用户更新或首次安装路径。

六个用户 Skill 都不要求系统 Node、Bun、Git、`gh`、Chrome、Chromium、FFmpeg 或
FFprobe。Runtime 安装包负责 Bun/FFmpeg/FFprobe；Product Runtime 的 renderer manager 只在确认的
实际 export 中负责 managed Headless Shell；
Bug 草稿由 Agent 直接生成，确认后只使用 Agent 已有 GitHub Issue 能力。该能力不可用
时返回草稿并明确“未提交”，不回退系统 CLI。
## 发布顺序

```text
Product 0.5.9 Windows GitHub Release installer
      |
      v
GitHub Release 预发布资产
      |
      v
每个已支持平台一个内嵌依赖的 Runtime 包 + SHA-256
      |
      v
隔离环境首次安装 + doctor + Studio capability 验收
      |
      v
Plugin 0.11.7-beta.2 内容提交
      |
      +------------------------------> contentRevision A
      |
      v
写入绑定 A 与 GitHub Release 资产摘要的 provenance
      |
      +------------------------------> 发布 snapshotRevision B
      |
      v
从固定 commit 安装 Git Marketplace 候选
      |
      v
用户确认后 plugin add 并复读版本
```

GitHub 是源码、构建与 Runtime 发布来源；Plugin 只读取 requirements 固定的 GitHub Release
资产，不读取 npm Registry。Plugin 可以先形成候选，但在目标平台 Runtime 安装包通过公开
GitHub Release 下载、SHA-256 校验、安装和 Skills 共用服务验收，并把精确 release tag 与
installer SHA-256 回填 requirements 之前不得推进 `stable`；这段空窗期的预期行为是安装卡
只允许暂停、`runtime_install` 安全失败。
