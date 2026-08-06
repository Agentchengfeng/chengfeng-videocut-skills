---
name: chengfeng-check-updates
description: 剪辑环境的唯一管理者：就绪检查（skills 是否最新 → Runtime 是否配套）、Skills 更新激活、Runtime 安装与体检。用户说检查更新、安装剪辑环境、装播放器、检查剪辑环境、剪辑环境就绪了吗、配置转录凭证时使用；业务 Skill（剪口播/字幕/画面/导出）第 0 步也引用本 Skill 的就绪检查。不用于剪辑、字幕、画面、导出本身或项目数据迁移。
user-invocable: true
---

# 检查更新（环境总管）

环境的一切逻辑只写在本 Skill：skills 版本、Runtime 安装与体检。业务 Skill 第 0 步
一行引用下面的「就绪检查」，自己不带任何环境逻辑——环境策略要变，只改这一个文件。
本 Skill 不建项目、不打开 Studio、不转录任何媒体。

## 就绪检查（业务 Skill 的第 0 步从这里执行）

三步走完，输出三态之一：**就绪 / 需新会话 / 停**。

### 一、定位当前 Plugin cache（只读）

从 host 提供的**本 Skill 实际源文件路径**定位：本文件所在目录向上两级就是
`<插件根>`。用文件读取工具确认 `<插件根>/.codex-plugin/plugin.json` 与
`<插件根>/scripts/check-plugin-update.cjs` 都存在。路径不可取得、目录层级不符或
文件不存在时，以 `installed_identity_missing` 停止更新比较；不得调用用户
`CODEX_HOME` 下的 `codex plugin list` 补猜，也不得搜索整个磁盘。

**此后所有命令里的 `<插件根>` 都代入这个字面路径**（含空格时整段引号包住）。
命令块不用 shell 变量与命令替换——bash 和 PowerShell 的赋值语法互不兼容。
检查脚本会从自己所在的 cache 直接读取 installed manifest、provenance、Marketplace
exact revision 与 bundle digest；检查阶段不依赖用户 Marketplace CLI 输出。

### 二、skills 最新吗

```bash
node "<插件根>/scripts/check-plugin-update.cjs" --marketplace chengfeng-videocut --json
```

（Marketplace 名默认 `chengfeng-videocut`；用户自己配过别的名字就用他配的。）

- `current` → 继续第三步
- `update_available_confirmation_required` → 展示 `installed`、`candidate` 与候选四项：
  version、40-hex `snapshotRevision`（B）、40-hex `contentRevision`（A）、
  `publisherChecksum`（SHA-256），停下等用户确认；确认后走下面「激活」节。
  激活成功 = **需新会话**：会话开始时 skill 文本已载入，中途更新对本会话不生效，
  请用户新开会话再继续任务
  - 若同时有 `legacyInstalledIdentity=true`，说明这是历史 0.10.5 到新证明格式的
    一次性兼容迁移；仍使用同一确认门，不要求用户预先修改 Marketplace ref
- `marketplace_not_found` / `marketplace_source_untrusted` /
  `marketplace_ref_unsafe` → 当前用户 Marketplace 缺失、来源不可信或不是 exact
  40-hex pin；不调用用户 Codex CLI 修复，报告后继续第三步
- `installed_identity_missing` / `installed_identity_untrusted` → 当前 cache 身份无法
  安全读取或证明，不猜版本、不激活；报告后继续第三步
- `installed_context_mismatch` → 当前 Skill 的真实 cache 路径、Marketplace 名或
  显式 `CODEX_HOME` 不一致；不搜索其他 cache，也不激活
- `isolated_stage_failed` / `isolated_stage_schema_invalid` /
  `isolated_cleanup_failed` → 临时候选 stage、CLI schema 或临时目录清理失败；用户
  HOME 零写入，报告后继续第三步
- `update_metadata_untrusted` → version + B + A + SHA-256 证明不成立，不激活；
  报告后继续第三步
- `candidate_older_than_installed` → 禁止降级，报告后继续第三步
- 网络不可达或其他检查错误 → 向用户说明一句，带当前 Runtime 检查继续第三步——
  **更新检查失败不阻塞干活**

正常检查只允许在临时 `CODEX_HOME` 中用官方 `stable` 发现候选；对用户
`CODEX_HOME` 不调用任何 `codex` 命令，也不写配置、Marketplace 或 cache。
当前 cache 的版本目录必须全部是 strict semver；允许残留较低版本，但只把唯一最高
semver 优先级视为 active。若最高位置存在同优先级目录，返回
`installed_identity_untrusted`，不得按目录名字面顺序挑选。

### 三、Runtime 配套吗

先调用 MCP `runtime_status`。若 `state=missing`，调用
`show_workflow_confirmation`：`{"kind":"runtime_install"}` 展示固定 release、平台资产、
目标目录、影响与 `approvalDigest`；只有用户明确确认同一张卡片后，才把该
`approvalDigest` 原样交给 `runtime_install`。不得传 `confirmed=true` 代替摘要。

- `ready` → **就绪**，业务 Skill 继续
  - 正式来源是 Plugin installer 建立的 Product 统一受管目录；历史
    `desktop-managed` / 既有安装若指向同一受管根可兼容复用，后续业务合同相同
- missing：先走上述安装确认卡；Release 的 installer 与 install manifest 摘要未锁定时
  卡片只允许暂停，`runtime_install` 必须 fail-closed，不得只信同源 checksum
- `runtime_unhealthy`、安装失败或安装后 doctor 失败 → **停**，报告结构化诊断。
  **停止就是停止：禁止用自制的审核页、播放器、时间线或任何替代界面继续流程。**
  产品不可用时做出的任何产出都不可信（真实案例：Runtime 缺失时 Agent 手搓了一个
  「审片台」网页，其审核决定与产品的账本格式完全不兼容，用户白做一遍）。
  正确动作只有一个：把结构化诊断给用户，指引安装或上报 Issue
- `runtime_capability_missing` → **停**：Runtime 健康但低于合同要求。报告两个版本号
  与差异，指引用户确认后升级（升级替换 `~/.chengfeng-videocut/app`，项目数据不动）；
  用户未确认前不动现有安装，禁止回退旧剪辑链
- 就绪检查阶段禁止启动服务、打开 Studio 或创建项目

### 机器前置依赖

支持 **macOS** 与 **Windows 10/11**；正式新装路径只有一条：

```text
Plugin runtime_install
  -> 编译 installer 按已验证 manifest 安装 Runtime 与平台 managed tools
  -> managed tools 包含 Headless Shell 及产品所需媒体工具
  -> 不要求用户把 Bun、Node、FFmpeg 加入系统 PATH
  -> Skills 只通过 ~/.chengfeng-videocut/bin 的稳定入口复用同一服务

历史 Desktop / 既有安装
  -> 仅当已经指向同一 Product 受管根时兼容复用
  -> 不再作为正式新装机入口
```

四个核心业务 Skill 与 Runtime 安装/调用不要求系统 Node.js 或 Bun；原生 MCP 直接
调用 Product 的受管启动器。导出字幕/动画仍需要 Google Chrome。当前仅“检查 Plugin
更新”以及 Bug 草稿/提交两个辅助事务仍是 Node.js ≥ 20 的兼容脚本；调用这些辅助
功能时缺 Node 必须明确停止，不能把本版宣称为所有辅助功能都零系统依赖。Windows
可用 `winget install OpenJS.NodeJS.LTS Google.Chrome`。

Skills 更新身份自证还需要 Git；Windows 可用 `winget install Git.Git`。Git 不可执行或
无法读取官方 snapshot 的 origin/HEAD/提交关系时，更新检查 fail-closed，但仍按上面
规则继续 Runtime 检查。

云端转录另需火山引擎凭证：调用 MCP `runtime_cli`，参数
`{"argv":["config","set","transcription.apiKey","<key>"]}`。

详细协议见 [Runtime 与产品契约](../../references/runtime-and-product-contract.md)。

## Skills 更新：inspect 与激活

纯查看只读当前 Plugin cache：不联网、不调用 `codex`，也不写用户
`CODEX_HOME`：

```bash
node "<插件根>/scripts/check-plugin-update.cjs" --marketplace "<市场名>" --inspect --json
```

成功返回 `inspected_no_refresh`，只含当前 pinned Marketplace 与 cache 身份，不生成
远端候选。

联网隔离检查（用户明确说「检查更新」，或就绪检查第二步）：

```bash
node "<插件根>/scripts/check-plugin-update.cjs" --marketplace "<市场名>" --json
```

- `current`：报告 installed 与临时环境发现的最新发布身份。
- `update_available_confirmation_required`：展示 installed 与候选四项 version、
  `snapshotRevision`（B）、`contentRevision`（A）、`publisherChecksum`；停止等用户确认。
- `legacyInstalledIdentity=true`：当前是兼容的历史 0.10.5 cache。它可以进入上一条
  正常确认流程；旧身份由 Marketplace exact revision、cache 目录版本、manifest
  version 与 inventory digest 共同绑定。不要让用户先改 ref，也不要另造一个
  “迁移成功”状态。
- `marketplace_not_found` / `marketplace_source_untrusted` /
  `marketplace_ref_unsafe`：当前用户 Marketplace 缺失、不可信或没有固定到自身 exact
  40-hex revision；不自动改 ref。
- `installed_identity_missing` / `installed_identity_untrusted`：当前 cache 不可识别或
  不可信，不猜 installed 版本。
- `installed_context_mismatch`：脚本执行位置不是当前 Marketplace 的唯一最高 active
  cache，或显式 `CODEX_HOME` 与该 cache 所属 HOME 不一致；不跨目录补猜。
- `isolated_stage_failed` / `isolated_stage_schema_invalid` /
  `isolated_cleanup_failed`：只说明临时 stage、CLI JSON schema 或清理失败，不暗示
  用户安装已刷新。
- `update_metadata_untrusted`：临时 snapshot 缺 B、A、SHA-256/清单复算证明，或
  manifest、Marketplace revision 与 provenance 的身份互相矛盾。
- `candidate_older_than_installed`：禁止从较新本地版本降级。
- 任何 snapshot/parse/version 错误：保留结构化 JSON；用户 HOME
  `userMutationPerformed=false`。

脚本只在新建的临时 `CODEX_HOME` 中执行官方 Marketplace CLI：先用
`marketplace add Agentchengfeng/chengfeng-videocut-skills --ref stable` 建立发现源，
再在同一临时 HOME 内用 `marketplace upgrade` materialize snapshot，并以
`plugin list` 取得候选。`stable` 解析得到的 40-hex B、provenance 中的 40-hex A、
manifest version 和可重算 SHA-256 共同构成候选。Git 还必须证明临时 Marketplace
origin 是官方仓库、HEAD=B、A 是 B 的祖先、Plugin 工作树干净，且 A→B 的 Plugin
子树只改变 provenance。临时目录使用后删除。用户 HOME 的 Marketplace 必须保持在
之前确认的 exact B；检查阶段对它连只读 `codex` 命令也不调用。

Windows 上解析 `codex` / `git` 时先按 `PATHEXT` 查找可执行扩展名，再尝试无扩展名
文件；`.cmd` / `.bat` 经 `ComSpec` 包装。因此 pnpm 同目录的 Unix `codex` shim
不会遮蔽 `codex.cmd`。

### 用户明确确认后才激活

确认必须发生在用户已看见 exact candidate version、B、A 与 checksum 之后：

```bash
node "<插件根>/scripts/check-plugin-update.cjs" --marketplace "<市场名>" --activate --confirmed --expected-version "<展示过的版本>" --expected-snapshot-revision "<展示过的B>" --expected-content-revision "<展示过的A>" --expected-sha256 "<展示过的包SHA256>" --json
```

脚本必须重新创建临时 `CODEX_HOME`，再次从 `stable` stage 候选，并把四项与
`--expected-*` 全部比较。stage 前后候选漂移或参数不符返回
`confirmation_mismatch`，用户 HOME 零写入。通过后记录更新前的 exact
snapshot revision 与 cache 身份，再只用官方命令对用户 HOME 执行：

```text
plugin marketplace remove <市场名>
plugin marketplace add Agentchengfeng/chengfeng-videocut-skills --ref <B>
plugin marketplace upgrade <市场名>
```

`<B>` 必须是刚刚重新 stage 并与用户确认一致的 40-hex
`snapshotRevision`；`stable`、其他分支、tag、短 SHA 或任意不同 ref 都返回
`marketplace_ref_unsafe`。upgrade 后脚本直接从 cache 复读并验证 version + B + A +
SHA-256，完全一致才返回 `activated`。激活成功后告知用户重启 Codex 或新开会话。
缺少 `--confirmed` 时返回 `confirmation_required`；任一 expected 字段缺失、不同或
重新 stage 后漂移时返回 `confirmation_mismatch`，两者都保持用户 HOME 零写入。

进入第一条写命令前，脚本以 CAS 再复读用户 Marketplace 与 active cache。若与
stage 前保存的旧身份不同，返回 `activation_state_changed`，激活不开始且用户 HOME
零写入。写事务任一步失败时，脚本先检查 Marketplace 与 cache 的后置状态：

- `activation_failed_no_change`：失败后仍完整等于旧身份；无需回滚，
  `userMutationPerformed=false`
- `activation_failed_rolled_back`：候选激活失败，但旧 exact revision 与旧 cache
  已完整恢复
- `activation_cache_locked_rolled_back`：失败被识别为 cache/文件句柄占用，且旧状态
  已完整恢复
- `activation_failed_rollback_incomplete`：回滚失败，或无法证明 Marketplace 与
  cache 都回到旧身份；报告实际后置状态并停止

只有后置状态已变化时，才用保存的 old exact revision 执行官方 remove → add
`--ref <old B>` → upgrade 回滚，并再次直接复读 cache。以上失败状态都不能说
“已更新”。不得手工复制或删除 cache 来伪造成功；不得触碰
Runtime、项目、媒体、EDL 或 Studio 状态。

## 用户说「安装剪辑环境 / 装播放器 / 检查环境」

直接跑完整就绪检查；拿到「就绪」后再跑完整自检并原样报告：

调用 MCP `runtime_cli`：`{"argv":["doctor","--json"]}`。

报告：Runtime 版本与位置、doctor 每项检查结果、缺失项的修法（机器依赖指引安装；
转录凭证指引 `runtime_cli {"argv":["config","set","transcription.apiKey","<key>"]}`）。
若复用了历史 `desktop-managed` 安装，明确说明这是兼容路径而非当前新装入口。
装好后告诉用户：直接说「剪口播」就能开始。

## 边界

- Plugin 版本与 Runtime 版本相互独立；Runtime 的最低兼容与 Release 目标由
  `runtime-requirements.json` 合同控制，不在本文硬编码任何版本号
- `stable` 只用于临时发现；不把它写成用户安装的持久 ref，也不把临时 staging、
  legacy cache 或本地目录说成已激活版本
- 检查更新阶段对用户 HOME 零 Codex 调用、零写入；只有看见并确认 version + B + A +
  SHA-256 后才能开始可回滚激活
- 不发布、不改项目数据或媒体；用户确认后的官方 Codex activation 与 Runtime
  安装是仅有的写入例外
- 不搜索 Electron `.app`、NSIS 安装目录或把 Electron 资源路径交给业务 Skill；
  新的稳定 Product 入口只由已确认并校验的 Runtime installer 写入
