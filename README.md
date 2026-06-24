# chengfeng-videocut-skills

> 给 Codex / Claude Code 用的口播视频剪辑 Skills 包。

这个项目把我的口播视频剪辑流程做成了一组可安装的 Skills：准备口播素材、拆分镜、看预览、导出竖屏成片。

它不是一个通用剪辑软件，也不是一键生成所有类型视频的工具。它聚焦一类很具体的内容：口播教程、产品演示、知识讲解、结果展示。

核心思路是：把视频剪辑从“人在时间线上操作”，变成“Agent 可以读写的工作流”。人只需要看页面、提修改意见、确认结果。

## 官方来源

本项目由 **chengfeng / AI产品自由** 原创并维护。

```text
GitHub: Agentchengfeng
X: chengfeng240928
小红书: AI产品自由
公众号: AI产品自由
B站: AI产品自由
抖音 / 视频号: AI产品自由
```

原始仓库：

```text
https://github.com/Agentchengfeng/chengfeng-videocut-skills
```

如果你使用、转载、翻译、二次发布或改造成自己的 Skill，请保留原作者、原始仓库链接、`LICENSE` 和 `NOTICE.md`。

## 一句话安装

```bash
npx chengfeng-videocut-skills install
```

默认安装到：

```text
~/.claude/skills/chengfeng-videocut-skills
~/.codex/skills/chengfeng-videocut-skills
```

只安装到 Codex：

```bash
npx chengfeng-videocut-skills install --target codex
```

只安装到 Claude Code：

```bash
npx chengfeng-videocut-skills install --target claude
```

指定目录：

```bash
npx chengfeng-videocut-skills install --dir ~/.codex/skills/chengfeng-videocut-skills
```

这个 npm 包只是一个很小的安装器。真正的 Skills 源码在 GitHub，每次安装都会从这里拉取最新版本：

```text
https://github.com/Agentchengfeng/chengfeng-videocut-skills
```

## 最短使用方式

准备口播素材：

```text
用 chengfeng-videocut-skills:剪口播，把这条录屏处理成后面口播成片要用的基础素材包。
```

做口播成片：

```text
用 chengfeng-videocut-skills:口播成片，把这个文件夹里的视频和字幕做成 1080x1440 竖屏 MP4。
先生成分镜页面给我确认，不要直接导出。
```

## 推荐输入结构

做成片时，把文件放在同一个项目目录：

```text
project/
├── source_cut.mp4
├── subtitles.srt
└── assets/
    ├── 产品截图.png
    ├── 评论截图.png
    └── 结果页.png
```

只要有 `source_cut.mp4` 和 `subtitles.srt` 就可以先跑。截图、产品页面、评论图、结果页可以放进 `assets/`，没有素材也可以先让 Agent 生成分镜页面，再补画面。

## 工作流

```text
原始口播视频
    |
    v
剪口播
转录、识别口误/重复/静音，生成审核页，确认后剪出新视频
Agent 基于剪后视频重新转写，并校对成最终字幕
    |
    v
口播成片
按字幕拆分镜，判断每段画面来源，生成分镜页面
    |
    v
时间线预览
把原视频、截图、HTML 画面、标注动画放到同一条时间线上检查
    |
    v
最终导出
确认后合成 1080x1440 竖屏 MP4
```

这套流程的关键不是“让 AI 说自己会剪辑”，而是把中间判断做成页面：

- 分镜页面：看每句口播该配什么画面。
- 时间线预览：看整条片子的节奏和画面切换。
- 最终播放器：把已确认的素材和动画合成导出。

这些页面既方便人审核，也方便 Codex / Claude Code 继续检查和修改。

## Skill 清单

| Skill | 作用 | 常见输入 | 常见输出 |
| --- | --- | --- | --- |
| `chengfeng-videocut-skills:安装` | 准备 Node.js、FFmpeg、API Key 等环境 | 无 | 环境检查结果 |
| `chengfeng-videocut-skills:剪口播` | 准备口播基础素材包：审核确认后粗剪，剪后重转写并 AI 校对字幕 | 原始录屏 / 口播视频 | `source_cut.mp4`、`subtitles.srt`、审核页 |
| `chengfeng-videocut-skills:口播成片` | 生成分镜页面、时间线预览和最终竖屏 MP4 | 剪后视频、字幕、素材 | 分镜页、预览页、1080x1440 MP4 |
| `chengfeng-videocut-skills:自进化` | 把使用偏好沉淀回规则 | 用户反馈 | 更新后的规则 |

## 环境配置

基础依赖：

| 依赖 | 用途 |
| --- | --- |
| Node.js 18+ | 运行安装器和脚本 |
| FFmpeg | 音视频处理 |
| curl | API 请求 |
| 火山引擎语音识别 API Key | 口播转录 |

安装后复制环境变量模板：

```bash
cd ~/.claude/skills/chengfeng-videocut-skills
cp .env.example .env
```

然后在 `.env` 里填写：

```text
VOLCENGINE_API_KEY=your_volcengine_api_key_here
# 可选，默认使用豆包录音文件识别模型2.0
VOLCENGINE_RESOURCE_ID=volc.seedasr.auc
```

如果只安装到 Codex，对应目录是：

```bash
cd ~/.codex/skills/chengfeng-videocut-skills
cp .env.example .env
```

## 仓库结构

```text
chengfeng-videocut-skills/
├── README.md
├── package.json
├── bin/
│   └── cli.js
├── 剪口播/
│   ├── SKILL.md
│   ├── scripts/
│   └── 用户习惯/
├── 口播成片/
│   ├── SKILL.md
│   ├── templates/
│   │   ├── storyboard-audit.html
│   │   └── timeline-preview.html
│   ├── references/
│   └── scripts/
└── 自进化/
    ├── SKILL.md
    └── README.md
```

`剪口播/scripts/` 里的关键脚本：

| 文件 | 作用 |
| --- | --- |
| `review_server.js` | 启动审核页服务；用户点击后只剪出新视频，并写入 `cut_done.json` |
| `watch_cut_done.js` | 监听 `cut_done.json`，确认剪后视频生成且文件大小稳定 |
| `generate_srt_for_video.sh` | 基于剪后视频重新转写，只输出 `video.raw.srt` 初稿 |

不会上传的本地运行产物包括：

```text
.env
log/
memory/
output/
口播成片/agents/
*.mp4 / *.mov / *.m4a / *.wav / *.zip
```

这些是本地依赖、日志、视频素材或导出结果，不应该放进 GitHub。

## 适合什么

适合：

- 中文口播视频
- 教程、产品演示、知识讲解、结果展示
- 已有口播视频和字幕，素材可以后补
- 原视频、截图、网页画面、HTML 解释画面混合成片

不优先解决：

- 复杂真人多机位剪辑
- 重度调色、混音和精细剪辑工程
- 没有口播视频，只凭一句话生成完整大片
- 把 Skill 包装成替代所有剪辑软件的通用工具

## npm 和 GitHub 的关系

npm 包只负责提供安装命令：

```bash
npx chengfeng-videocut-skills install
```

GitHub 才是源码和文档的真相源。更新 Skill 内容时，通常只需要推 GitHub；只有安装器本身变了，才需要重新发布 npm。

## 协议

本项目使用 Apache License 2.0。

你可以学习、复制、修改、分发和商用；重新分发或发布派生版本时，需要保留本仓库的 `LICENSE` 和 `NOTICE.md` 来源信息。

如果发现有人删除来源、换名二次发布，可以先保存对方页面、截图、发布时间、下载包或 fork 记录，再要求对方补回来源。对方拒绝时，可以向对应平台提交版权或开源协议违规投诉。
