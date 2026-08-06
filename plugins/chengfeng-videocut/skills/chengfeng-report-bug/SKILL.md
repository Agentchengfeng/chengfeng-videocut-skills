---
name: chengfeng-report-bug
description: 整理、脱敏并上报 chengfeng-videocut 的 GitHub Bug。用户说上报 Bug、反馈剪口播问题、提交 GitHub Issue、这个问题告诉开发者，或要求继续提交已预览的 Bug 草稿时使用。不要用于功能建议、普通排错、代码提交或未获用户确认的自动上报。
user-invocable: true
---

# 上报 Bug

这是 `chengfeng-videocut` 的支持入口，不是剪辑流程。默认只生成可公开的
Issue 草稿；外部写入必须经过完整预览和用户明确确认。

```text
问题描述
   |
   v
最小只读诊断 -> Agent 脱敏 -> 展示仓库 / 标题 / 完整正文
                                             |
                                      用户明确确认
                                             |
                                             v
                            使用 Agent 现有 GitHub 能力创建
```

## 1. 确认是可复现 Bug

- Bug：实际行为偏离已有契约、界面、版本能力或确定性结果。
- 功能建议：产品从未承诺该能力；不要伪装成 Bug。
- 使用疑问：先回答或诊断，不自动上报。

只收集复现所需的最小事实。不得安装 Runtime、启动 Studio、改项目、
重新剪片或上传媒体来「补证据」。调用 MCP `runtime_status` 做只读探测，只保留
`state / runtimeVersion / requiredVersion / ready / reason`；不附完整 doctor
输出。检测不到就写「未检测到」。

## 2. 选择固定仓库

禁止从当前目录或本地 Git remote 猜仓库：

| 问题组件 | target | GitHub 仓库 |
|---|---|---|
| Runtime、Studio、UI、CLI、API、时间线、渲染 | `product` | `Agentchengfeng/chengfeng-videocut` |
| Skill、Marketplace、安装编排、MCP App、工作流说明 | `skills` | `Agentchengfeng/chengfeng-videocut-skills` |

跨组件问题优先报最先违反契约的仓库，并在正文说明另一个组件；
无法判断时先问用户。

## 3. Agent 直接生成脱敏草稿

不运行包内 Node 脚本，不要求用户安装 Node、Git 或 `gh`。Agent 在当前任务内
按以下固定结构生成 Markdown：

```markdown
## Summary
<一句话影响>

## Steps to reproduce
1. <第一步>
2. <第二步>

## Expected
<预期行为>

## Actual
<实际行为>

## Environment
- Runtime: <版本或未检测到>
- OS: <macOS/Windows>

## Minimal evidence
- <只放可公开的最小证据>

## Acceptance criteria
- <可验证修复条件>
```

生成时删除或替换：

- API Key、Token、Cookie、Authorization、密码、`.env` 值；
- 用户名、卷名、绝对路径、localhost 查询参数；
- 客户名、原视频名、真实 `projectId`、私人仓库内容；
- 视频、音频、未经同意的截图、完整日志或转录正文。

自动脱敏不可能识别所有客户名，Agent 必须再人工通读一次。然后向用户
完整展示：

```text
repo
label=bug
title
完整脱敏正文
```

用户未明确确认这份**精确公开内容**时停止。检测到错误、说「看看」或仅
确认问题存在，都不等于同意上报。

## 4. 确认后用 Agent 现有能力提交

只提交刚刚展示且内容未变的 repo/title/body：

1. 优先使用当前 Agent 已经可调用的 GitHub Issue 搜索/创建能力，查看相同
   组件、复现步骤和实际结果是否已有 Issue。
2. 有精确重复项时返回它的 URL，不再创建。
3. 无重复项时，以 `bug` 标签创建 Issue，紧接着读回 repo/title/body/URL。
4. 只有拿到目标仓库的明确 GitHub Issue URL，才能说「已经上报」。

若当前 Agent 没有 GitHub Issue 搜索/创建能力、未认证、无权限或返回结果
没有明确 URL：

- 返回已完成的 repo/title/body 草稿；
- 明确写「未提交」和具体原因；
- 不回退系统 `gh`、浏览器宏、Node 脚本或未授权的其他仓库；
- 不自动重试，因为首次请求可能已经创建。

## 确认与失败边界

- 确认只对当前任务中紧接着的一次提交有效，不跨任务、不重放。
- 确认后任何 repo、title 或 body 变化，都必须重新展示并再次确认。
- 目标仓库无权限或不可见时，不改报任意仓库；保留草稿让用户决定。
- 仓库内保留的 `scripts/report-bug.cjs` 与对应 Node 测试只是开发回归工具，
  不属于用户上报路径。
