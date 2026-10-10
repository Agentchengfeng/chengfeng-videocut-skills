# Runtime 与产品契约

六个基础业务 Skill 共用本文件；它是普通内部 reference，不是用户可触发的 Skill。工作台操作是显式预发行入口，使用独立的 0.5.9+ 预检合同，不走本文件的旧 Runtime 准备流程。

## Plugin 入口边界

- Plugin `chengfeng-videocut` 只负责安装与 UI 群组，不是 raw Skill。
- Plugin 脚本与 MCP server 的依赖基线是 Node.js ≥ 20；Node 18 不在支持范围内。
- 默认用户入口是剪口播、字幕、画面、导出、Bug 上报和更新检查六个具体 Skill；工作台操作虽随包提供，但必须显式选择并先通过独立预检。共同规则不得建立 `SKILL.md`、router、alias 或第二个总入口。
- Product Runtime、Studio、项目、媒体、EDL、history、播放器与唯一时钟只由 Product 拥有；Skill 只做语义判断、流程编排和受约束调用。
- Plugin 首页 starter prompt、`user-invocable` metadata、静态 YAML 与 CLI 发现结果都不能单独证明 Desktop `/` 选择器已经视觉验收。

工作台使用单独的只读门禁，不复用基础六项的安装结果：

```text
workbench-preflight.cjs --json
      |
      +-- Runtime >=0.5.9 + doctor + operations 合同通过 --> 允许连接/写入
      |
      +-- 0.4.11 / 缺命令 / 健康失败 --------------------> 停止工作台，不安装旧版、不改工程
```

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

- Plugin package `0.10.12` 消费的机器可读基础 Runtime compatibility contract 是 `runtime-requirements.json`：`releaseTag=v0.4.11`、`releaseVersion=0.4.11`、最低 Runtime 为 `0.4.10`，并声明 Runtime EDL、Studio 与跨平台用户服务能力集合。该文件同时声明工作台独立要求 `>=0.5.9`、`workbench commands` 和跨平台发布状态；两份合同不能互相替代。
- 缺失时只从 `v0.4.11` 的精确 Release 下载 `install.cjs` 与 `SHA256SUMS.txt`；先校验安装器本身，并要求清单包含 stable `chengfeng-videocut-portable.tar.gz` 与版本化 `chengfeng-videocut-0.4.11-portable.tar.gz`。安装器只消费 stable portable tarball，不得下载 Desktop DMG/EXE；它收到同一个精确 Release 地址，不得访问 `latest`。
- 桌面安装是另一条受支持的 Product 分发入口：App 首启把随包 Runtime、Bun、
  FFmpeg、FFprobe 写入相同受管根并执行同一个 `service ensure`。成功后只读探测
  返回 `kind=desktop-managed`；业务合同、CLI/API 和服务身份不变。
- `v0.4.11` Release 尚不存在、缺少安装器、portable 资产校验值或哈希不符时，以 `install_failed` 停止；纯 CLI 路径不得转装公开旧版、源码 clone、npm、bunx、DMG 或 EXE。
- 本次 v0.4.11 是 CLI/portable 安装修复预发行，不生成新的 DMG/EXE。安装器自身需 Node 或已有 Bun 启动；缺 Bun 自动准备仅承诺已核验的 macOS arm64 固定官方资产及 SHA-256，写入产品私有依赖供持久启动入口复用，不修改全局 Bun 或 shell 配置。无匹配已核验资产即失败。
- 本次前台 health/首页验证不代替常驻服务、Windows、媒体依赖、宿主加载或实际业务验收；下列既有服务与业务能力仍须单独过门禁。
- 安装位置是 `CHENGFENG_VIDEOCUT_HOME` 或 `~/.chengfeng-videocut`。
- CLI 已存在但 doctor 失败时不自动覆盖或循环重装；已有 Runtime 低于 0.4.10 时也不静默覆盖，只有用户明确确认 `--upgrade` 才原子替换程序目录。
- CLI doctor 健康但版本低于 0.4.10，或缺少 EDL schema、expected revision、managed A-roll projection、move / trim / split / delete、service API、父进程独立存活或 crash restart capability 时，以 `runtime_capability_missing` 停止；不把“健康”误当“兼容”。
- 查找顺序：显式 `CHENGFENG_VIDEOCUT_BIN`、托管安装目录、PATH、显式开发目录
  `CHENGFENG_VIDEOCUT_DIR`。这确保桌面版稳定入口不会被 PATH 中的旧 CLI 遮蔽。
- Plugin 不搜索 Electron `.app`、NSIS 目录或 resources；只有桌面 App 自己能把
  随包资产安装成 Product 稳定入口。

## 常驻服务门禁

Runtime 二进制兼容后，六个基础业务 Skill 都调用同一个 `scripts/ensure-running.cjs`：

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
- `service ensure` 成功必须返回 `ok=true`，且 `data` 同时满足：`healthy=true`、`runtimeMode=launchd|windows-task`、`productVersion>=0.4.10`、正整数 `pid`、`url=http://127.0.0.1:5190/`。
- 健康服务会幂等复用；页面或 Codex 父终端关闭不应结束服务。
- 返回 foreground 身份、未知端口占用、错误 URL、旧版本或不完整 JSON 时 fail-closed；Skill 不杀进程、不换 5191、不回退临时 foreground。
- `service ensure` 不创建项目、不打开 Studio；仍只在 `*_review_ready` 后执行 `open`。
- `chengfeng-cut` 在项目创建后、第一次 Cuts API 前以及每次审核恢复前 ensure。

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

- 低于 0.4.10 的 Runtime 不具备本 Plugin 发布所绑定的完整更新事务与当前 EDL / Studio compatibility contract，必须被版本门禁拒绝，直到用户明确确认升级。
- Runtime `v0.4.11` Release 必须先于 Plugin package `0.10.12` 发布，并至少包含 `install.cjs`、stable `chengfeng-videocut-portable.tar.gz`、版本化 `chengfeng-videocut-0.4.11-portable.tar.gz`、版本化/稳定名 tgz，以及覆盖这些资产和安装器的 `SHA256SUMS.txt`；桌面 DMG/EXE 不是 Skills 安装输入。工作台的 v0.5.9 发行另行验收，不得用本条资产冒充。
- `v0.4.11` 必须提供正式原视频云端转录命令；缺少时以 `missing_cloud_transcription_adapter` 停止，禁止回退本地 ASR。
- `v0.4.11` 必须内置可用 renderer；新版 Skill 不得把旧 renderer 重新打包。
- 没有 HyperFrames 顶层 `koubo` 视图或 capability manifest 的历史 Studio 必须被能力门禁拒绝，不能再作为审核界面回退。
- 这些缺口不允许通过旧 8898/8899 页面、直接文件写入、旧任务面板或 Skill 私有导出器绕过。

## Plugin 更新事务

Plugin 更新有两个互不混用的信任域：

```text
当前 Skill 的 cache（只读）             临时 CODEX_HOME
  |                                       |
  +-- 选唯一最高 strict semver             +-- 官方 stable
  +-- 读取 installed version              +-- add + upgrade materialize
  +-- 读取 exact snapshotRevision(old B)   +-- 解析成 exact snapshotRevision(new B)
  +-- 绑定 pinned source/Git/cache          +-- 读取 provenance: contentRevision(A)
  +-- 重算 content digest                  +-- 验证 A/B Git 关系
                                          +-- 重算 publisherChecksum
```

- `stable` 只用于临时环境发现发布候选。用户 `CODEX_HOME` 中的 Marketplace 永久固定
  到当前已确认的 40-hex `snapshotRevision`；检查更新不把用户安装改成浮动引用。
- 检查阶段从当前 Plugin cache 直接读取 installed 身份，不以用户 `CODEX_HOME`
  运行任何 `codex` 命令，不写 Marketplace、配置或 cache。需要联网时，只允许在
  新建的临时 `CODEX_HOME` 中调用官方 Marketplace 命令，结束后删除临时目录。
- Windows 上解析 `codex` / `git` 时，先按 `PATHEXT` 查找 `.exe`、`.cmd`、`.bat`
  等可执行扩展名，再回退无扩展名文件；`.cmd` / `.bat` 必须通过 `ComSpec` 执行。
  因此 pnpm 同目录的 Unix 无扩展名 shim 不得遮蔽可执行的 `codex.cmd`。
- active cache 的选择与 Codex 当前规则一致：所有子目录名都必须是 strict semver，
  允许残留更低版本，但只接受唯一的最高 semver 优先级。若最高位置存在
  `0.10.6` / `0.10.6+build` 这类同优先级目录，返回
  `installed_identity_untrusted`，不得用目录名排序猜测。
- 所选 installed cache 必须与 exact pinned Marketplace 的 Plugin source 字节一致。
  Marketplace metadata 必须证明完整的官方 Git snapshot；其 Git root、origin、
  HEAD 与 Plugin 子树清洁度也必须通过验证。带 provenance 的安装还必须满足
  `contentRevision`（A）存在、A 是 pinned `snapshotRevision`（B）的祖先，且 A 到
  B 的 Plugin 子树除 provenance 外无差异。历史 0.10.5 没有 A 时，仍要求官方
  origin、HEAD=B、干净子树及 cache/source digest 一致。
- 一个候选身份必须同时绑定 strict semver version、发布快照
  `snapshotRevision`（B）、包内 provenance 的 `contentRevision`（A）与
  `publisherChecksum`（SHA-256）。B、A 都必须是 40-hex，包清单必须可重算且与
  checksum 相同；临时 Git snapshot 还必须满足官方 origin、HEAD=B、A 可达、
  A 是 B 的祖先、工作树干净，且 A→B 的 Plugin 子树只改变 provenance。任一字段
  缺失、冲突或 stage 前后漂移都不得激活。
- 历史 0.10.5 cache 允许缺少新 provenance；脚本只接受由 Marketplace exact
  revision、cache 目录版本、manifest version 与 inventory digest 共同绑定的旧身份，
  并在候选输出中标记 `legacyInstalledIdentity=true`。任一矛盾返回
  `installed_identity_untrusted`。可信旧身份仍走正常的
  `update_available_confirmation_required` 和四项确认门；确认激活前继续保持原
  exact pin，也不静默迁移。

用户确认后才允许写用户安装：

```text
重新在临时 HOME stage stable
          |
          +-- 四项与用户所见不同 --> confirmation_mismatch（用户 HOME 零写入）
          |
          v
记录 old exact revision 与旧 cache 身份
          |
          v
CAS 复读用户 Marketplace + active cache
          |
          +-- 与 old 身份不同 --> activation_state_changed（零写入）
          |
          v
官方 marketplace remove
          |
          v
官方 marketplace add --ref <new B>
          |
          v
官方 marketplace upgrade
          |
          v
直接复读 cache，验证 version + B + A + SHA-256
          |
          +-- PASS --> activated
          |
          +-- FAIL --> 检查后置状态 --> 用 old exact revision 回滚 --> 再复读
```

- 写事务前必须验证目标 ref 是刚刚重新 stage 的 exact B；tag、分支名和
  `stable` 均不得进入用户安装命令。
- 写入前的 CAS 必须证明用户 Marketplace 与 active cache 仍等于检查开始时保存的
  old 身份；并发会话或用户操作造成任何差异都返回 `activation_state_changed`，
  `userMutationPerformed=false`。
- 官方命令失败后若复读证明 Marketplace 与 cache 仍完整等于 old 身份，返回
  `activation_failed_no_change`，不执行回滚，且
  `userMutationPerformed=false`。
- 激活失败但旧 exact revision 与旧 cache 已完整恢复时返回
  `activation_failed_rolled_back`；确认为 cache/文件句柄占用且完整恢复时返回
  `activation_cache_locked_rolled_back`；无法证明完整恢复时返回
  `activation_failed_rollback_incomplete`，并报告已观察到的后置状态，绝不把它
  表述为成功。
- 更新事务只允许改变 Codex Marketplace 与该 Plugin cache；失败、回滚及历史
  0.10.5 迁移都不得安装或替换 Runtime，不得写项目、媒体、EDL 或 Studio 状态。

## Plugin 首次安装事务

GitHub npm bootstrap 只负责首次安装 Plugin，不安装 Runtime，也不复用更新事务：

```text
预检：无同名 Marketplace / Plugin
          |
          v
marketplace add --ref <exact 40-hex B>
          |
          v
立即读取 available inventory
          |
          +-- 暴露历史 orphan --> 拒绝激活
          |                       只移除本次 Marketplace
          |                       保留 orphan，不调用 plugin remove
          |
          v
marketplace upgrade
          |
          v
复读 metadata + 官方 Git origin + HEAD=B
          |
          v
plugin add
          |
          v
复读 installed identity
```

- orphan 门禁必须位于 Marketplace add 之后、upgrade 之前，因为同名 orphan 可能在
  Marketplace 不存在时被 `plugin list` 隐藏，只在 add 后重新可见。
- add receipt 必须证明本次创建了目标 Marketplace 及其绝对 installed root；
  upgrade receipt、Marketplace metadata、官方 Git origin 和 HEAD 必须共同证明
  manifest 固定的 exact B，才能执行 Plugin add。
- orphan 路径只回收本次新加的 Marketplace，并复读 Marketplace 不存在；不得删除
  或覆盖此前隐藏的 Plugin 状态。Plugin add 已开始后的后续失败才执行目标 Plugin
  remove → Marketplace remove，并同时复读两者不存在。回滚命令或回执不能证明
  成功时必须把 rollback failure 与原始错误一起报告。
- Windows bootstrap 与更新检查使用同一类扩展名优先、`ComSpec` 包装规则，不把
  pnpm Unix shim 当作 Windows 原生进程启动。

## 发布顺序

以下为进入 stable 的完整门禁；本次安装修复只发行固定 A/B 快照与 bootstrap pin，不推进 stable。固定候选安装的前台验收不得写成已通过完整共用服务门禁。

```text
Product 0.4.11 tag
      |
      v
Release assets + SHA256SUMS（含 install.cjs）
      |
      v
隔离环境首次安装 + doctor + Studio capability 验收
      |
      v
Plugin 0.10.12 内容提交
      |
      +------------------------------> contentRevision A
      |
      v
写入绑定 A 与包清单 SHA-256 的 provenance
      |
      +------------------------------> 发布 snapshotRevision B
      |
      v
把 stable 移到 B（仅用于临时候选发现）
      |
      v
用户确认后固定安装 --ref B
```

Plugin package 0.10.12 可以先形成候选，但在 Product Runtime v0.4.11 Release 的 portable 资产通过公开下载、安装和基础 Skills 共用服务验收之前不得推进 `stable`；工作台还必须等待 v0.5.9 的 macOS/Windows 正式或 portable 发行与 capability 验收。这段空窗期的预期行为是基础能力按旧合同运行、工作台显式预检安全失败，而不是安装旧 Runtime 或桌面安装包。
