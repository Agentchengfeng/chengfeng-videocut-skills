---
name: chengfeng-report-bug
description: 整理、脱敏并上报 chengfeng-videocut 的 GitHub Bug。用户说上报 Bug、反馈剪口播问题、提交 GitHub Issue、这个问题告诉开发者，或要求继续提交已预览的 Bug 草稿时使用。不要用于功能建议、普通排错、代码提交或未获用户确认的自动上报。
user-invocable: true
---

# 上报 Bug

这是 `chengfeng-videocut` 的支持入口，不是第三条剪辑流程。默认只生成公开 Issue 草稿；外部写入必须经过脱敏预览与用户确认。

```text
问题描述
   |
   v
最小只读诊断 -> 脱敏 -> 展示仓库 / 标题 / 正文
                                  |
                           用户明确确认
                                  |
                                  v
                     认证 + 标签检查 + 查重
                                  |
                                  v
                         创建 GitHub Issue
```

## 1. 确认这是可复现 Bug

先区分：

- Bug：实际行为偏离已有契约、界面、版本能力或确定性结果。
- 功能建议：产品从未承诺该能力；不要伪装成 Bug。
- 使用疑问：先回答或诊断，不自动上报。

只收集复现所需的最小事实。不得安装 Runtime、启动 Studio、改项目、重新剪片或上传媒体来“补证据”。调用 MCP `runtime_status` 做只读探测，只保留 `state / runtimeVersion / ready / reason`；不要附完整 doctor 输出。状态只描述 Product 受管入口；即使历史诊断中出现 `kind=desktop-managed`，也不授权本 Skill 启动服务或重新安装。不存在就写“未检测到”。

## 2. 选择固定仓库

工作区根目录不一定是 Git 仓库，禁止从当前目录猜 remote：

| 问题组件 | target | GitHub 仓库 |
|---|---|---|
| Runtime、Studio、UI、CLI、API、时间线、渲染 | `product` | `Agentchengfeng/chengfeng-videocut` |
| Skill、Marketplace、安装编排、MCP App、工作流说明 | `skills` | `Agentchengfeng/chengfeng-videocut-skills` |

跨组件问题优先报最先违反契约的仓库，并在正文说明另一个组件；无法判断时先问用户。

## 3. 生成结构化输入

以 `umask 077` 把候选写入当前任务临时目录的 JSON，不写产品规范文件；提交结束后删除临时 JSON 与 Markdown：

```json
{
  "schemaVersion": 1,
  "target": "product",
  "component": "Studio",
  "title": "Runtime 0.1.1 无法打开 HyperFrames 顶层剪口播视图",
  "summary": "一句话说明影响",
  "steps": ["第一步", "第二步"],
  "expected": "预期行为",
  "actual": "实际行为",
  "environment": {
    "Runtime": "0.1.1",
    "OS": "macOS"
  },
  "evidence": ["只放最小、可公开的诊断"],
  "acceptance": ["可验证的修复条件"]
}
```

禁止放入：

- API Key、Token、Cookie、`.env`；
- 视频、音频、截图、完整日志或转录正文；
- 客户名、原视频名、真实 `projectId`、用户绝对路径；
- 未经用户允许的私人仓库内容。

## 4. 先生成并展示脱敏草稿

从当前 `SKILL.md` 定位脚本：

先按[检查更新](../chengfeng-check-updates/SKILL.md)「就绪检查」第一步定位**插件根**
（从本 Skill 的实际源文件路径向上两级；不得跑 `codex plugin list` 或搜索其他
cache；下述 `<插件根>` 都代入该字面路径）。本 Skill 只用它定位脚本，
不装 Runtime、不起服务：

```bash
node "<插件根>/skills/chengfeng-report-bug/scripts/report-bug.cjs" draft --input "<报告JSON文件>" --output "<草稿输出文件>" --json
```

`target` 必须明确为 `product` 或 `skills`，缺失和拼错都应停止，不能静默改报另一仓库。脚本会清理常见密钥、本地用户名、卷名、路径余段和 localhost 查询参数；自动脱敏不能识别任意客户名，仍必须人工通读。向用户展示：

```text
repo
label=bug
title
完整脱敏正文
```

同时保存返回的 `confirmationReceipt`，并向用户展示 `confirmationToken` 与过期时间。用户没有明确确认这份公开内容时停止；仅仅检测到错误不等于同意上报。令牌只绑定草稿内容，并不自行证明用户同意；Agent 仍必须等待明确回复。确认只对当前任务中紧接着的一次提交有效，30 分钟过期，不能跨任务或重复使用。

## 5. 确认后提交

只对刚刚展示、内容未变化的草稿提交：

```bash
node "<插件根>/skills/chengfeng-report-bug/scripts/report-bug.cjs" submit --input "<报告JSON文件>" --target "<目标仓库>" --confirmed --confirm-token "<确认token>" --receipt "<确认回执文件>" --json
```

固定规则：

- 提交前脚本检查 `gh auth status`、目标仓库 Issues 与 `bug` 标签；失败时保留草稿。
- 相同组件、复现步骤与实际结果的指纹已存在时返回原 Issue URL，不用宽泛标题冒充重复。
- 确认后正文发生变化时返回 `confirmation_mismatch`，必须重新预览。
- 确认凭据过期或已使用时返回 `confirmation_expired / confirmation_replayed`，必须重新预览。
- 创建结果没有明确 Issue URL 时，不自动重试；它可能已经创建。
- 只有拿到 GitHub Issue URL，才能说“已经上报”。

## 失败处理

- `github_auth_required`：说明草稿已完成但未提交，禁止声称成功。
- `github_issue_create_failed`：保留草稿和手工入口，不循环重试。
- `confirmation_required` / `confirmation_mismatch`：重新展示精确公开内容。
- 目标仓库无权限或不可见：不要改报任意仓库；让用户决定是否改报公开 Skills 仓。
