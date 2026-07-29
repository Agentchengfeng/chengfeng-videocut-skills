# Runtime 与产品契约

四个业务 Skill 共用本文件；它是普通内部 reference，不是用户可触发的 Skill。

## Plugin 入口边界

- Plugin `chengfeng-videocut` 只负责安装与 UI 群组，不是 raw Skill。
- 用户入口只有剪口播、导出、字幕、口播成片、Bug 上报和更新检查六个具体 Skill；共同规则不得建立 `SKILL.md`、router、alias 或第二个总入口。
- Product Runtime、Studio、项目、媒体、EDL、history、播放器与唯一时钟只由 Product 拥有；Skill 只做语义判断、流程编排和受约束调用。
- Plugin 首页 starter prompt、`user-invocable` metadata、静态 YAML 与 CLI 发现结果都不能单独证明 Desktop `/` 选择器已经视觉验收。

## 预检状态

```text
ensure-runtime
      |
      +-- ready ------------------------> 继续当前 Skill
      |
      +-- missing --一句提示--> install --> doctor --> 继续当前 Skill
      |
      +-- unhealthy / install failed ---> 停止，不打开 Studio
      |
      +-- incompatible -----------------> runtime_capability_missing
                                               |
                                               v
                                      停止，不回退旧剪辑链
```

- Plugin package `0.5.2` 消费的机器可读 Runtime compatibility contract 是 `runtime-requirements.json`：`releaseTag=v0.2.1`、`releaseVersion=0.2.1`、最低 Runtime 为 `0.2.1`，并声明 Runtime EDL 与 Studio 能力集合。
- 缺失时只从 `v0.2.1` 的精确 Release 下载 `install.sh` 与 `SHA256SUMS.txt`；先校验安装器本身，再执行安装器。安装器收到同一个精确 Release 地址，不得访问 `latest`。
- `v0.2.1` Release 尚不存在、缺少安装器、缺少安装器校验值或哈希不符时，以 `install_failed` 停止；不得转装公开旧版、源码 clone、npm、bunx 或 DMG。
- 安装位置是 `CHENGFENG_VIDEOCUT_HOME` 或 `~/.chengfeng-videocut`。
- CLI 已存在但 doctor 失败时不自动覆盖或循环重装；已有 Runtime 低于 0.2.1 时也不静默覆盖。
- CLI doctor 健康但版本低于 0.2.1，或缺少 EDL schema、expected revision、managed A-roll projection、move / trim / split / delete、service API、父进程独立存活、crash restart，以及 `playback / retranscribe / align / dictionary / regroup / correct` 任一逐词稿操作 capability 时，以 `runtime_capability_missing` 停止；不把“健康”误当“兼容”。
- 查找顺序：显式 `CHENGFENG_VIDEOCUT_BIN`、PATH、托管安装目录、显式开发目录 `CHENGFENG_VIDEOCUT_DIR`。
- 不使用 npm、bunx、DMG 或源码 clone 作为普通用户安装流程。

## 常驻服务门禁

Runtime 二进制兼容后，四个业务 Skill 都调用同一个 `scripts/ensure-running.cjs`：

```text
ensure-running.cjs
       |
       v
Product service ensure --json
   | healthy managed service       | conflict / identity mismatch
   v                               v
继续业务 API / 人工审核             停止并透传结构化错误
```

- Plugin 不直接调用 `launchctl`、`nohup`、PID 文件或后台进程 API；服务安装、启动、升级收敛和 crash restart 全部属于 Product。
- `service ensure` 成功必须返回 `ok=true`，且 `data` 同时满足：`healthy=true`、`runtimeMode=launchd`、`productVersion>=0.2.1`、正整数 `pid`、`url=http://127.0.0.1:5190/`。
- 健康服务会幂等复用；页面或 Codex 父终端关闭不应结束服务。
- 返回 foreground 身份、未知端口占用、错误 URL、旧版本或不完整 JSON 时 fail-closed；Skill 不杀进程、不换 5191、不回退临时 foreground。
- `service ensure` 不创建项目、不打开 Studio；仍只在 `*_review_ready` 后执行 `open`。
- `chengfeng-cut-talking-head` 在项目创建后、第一次 Cuts API 前以及每次审核恢复前 ensure；`chengfeng-finish-talking-head` 在 Runtime 预检后、第一次 workflow API 前以及每次审核恢复前 ensure。

机器可读 capability 合同除 EDL 字段外，还要求：`serviceApiVersion=1`、完整 `serviceOperations`、`managedStudioService=true`、`serviceParentProcessIndependent=true`、`serviceCrashRestart=true`。缺少任一字段都返回 `runtime_capability_missing`。

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
      ensure-studio.cjs
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

- 公开 Runtime v0.1.1 不具备 Plugin package `0.5.2` 所消费的完整 EDL / Studio compatibility contract，必须被版本与能力门禁拒绝。
- Runtime `v0.2.1` Release 必须先于 Plugin package `0.5.2` 发布，并至少包含 `install.sh`、`chengfeng-videocut-portable.tar.gz` 与覆盖两者的 `SHA256SUMS.txt`。
- `doctor` 必须显式返回 `transcriptOperations`。不能只检查 Runtime 版本：早期 `v0.2.0` Release 与同版本主分支内容不同，曾导致缺少逐词稿命令的 Release 被 Plugin 误判为兼容。
- `v0.2.1` 必须提供正式原视频云端转录命令；缺少时以 `missing_cloud_transcription_adapter` 停止，禁止回退本地 ASR。
- `v0.2.1` 必须内置可用 renderer；新版 Skill 不得把旧 renderer 重新打包。
- 没有 HyperFrames 顶层 `koubo` 视图或 capability manifest 的历史 Studio 必须被能力门禁拒绝，不能再作为审核界面回退。
- 这些缺口不允许通过旧 8898/8899 页面、直接文件写入、旧任务面板或 Skill 私有导出器绕过。

## 发布顺序

```text
Product 0.2.1 tag
      |
      v
Release assets + SHA256SUMS（含 install.sh）
      |
      v
隔离环境首次安装 + doctor + Studio capability 验收
      |
      v
发布 Plugin package 0.5.2
```

Plugin package 0.5.2 可以先合并代码，但在 Product Runtime v0.2.1 Release 通过验收之前不得公开发布；这段空窗期的预期行为是安全失败，而不是安装 v0.1.1。
