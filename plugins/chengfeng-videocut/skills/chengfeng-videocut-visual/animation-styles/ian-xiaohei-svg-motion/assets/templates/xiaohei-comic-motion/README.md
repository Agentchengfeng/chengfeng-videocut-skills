<!--
架构守护者：一旦本文件夹有任何变化，请更新此文件
-->

# xiaohei-svg-motion

小黑漫画感 SVG 动效样张。目标是验证：类似生图漫画配图，如何重建为可控制、可录屏、可按口播 cue 对齐的 HTML/SVG 动画。

## 文件清单

| 文件 | 地位 | 功能 |
|------|------|------|
| `index.html` | 核心 | 分层 SVG + GSAP 动画样张 |
| `preview.png` | 预览 | 静态审核截图 |
| `preview-mid.png` | 预览 | 播放中段截图，用于检查递进节奏 |
| `vendor/gsap.min.js` | 依赖 | 本地 GSAP runtime |
| `vendor/rough.js` | 依赖 | 预留给后续 Rough.js 手绘形状生成 |

## 做法

不要把整张生图一键转 SVG 后直接动。那种 SVG 是一堆无语义路径，很难控制动画。

推荐流程：

1. 用生图或截图做构图参考。
2. 人工重建成语义化 SVG 层。
3. 每个可动对象单独成组：传送带、纸张、小黑、箱子、断点、批注、箭头。
4. 用 GSAP timeline 按口播 cue 编排动作。
5. 静态审核检查构图，播放态检查节奏。

## 分层标准

- `beltLeft` / `beltRight`：传送带和滚轮。
- `paperStack` / `flyingPapers`：素材纸张。
- `xiaohei`：小黑主体、手、脚。
- `box`：小黑举起的素材箱。
- `contentCard` / `fallingCard`：内容卡片的承接与掉落。
- `pit`：没有承接的结果。
- `annotations`：红蓝橙手写批注和箭头；内部继续拆成 `annBefore`、`annDry`、`annAfter`、`annNoBridge`、`annTitle` 等阶段组。

## 维护规则

- 动画对象必须按语义分组，不能把所有线条混成一个 SVG path。
- 需要画出来的线条使用 `strokeDasharray` / `strokeDashoffset`。
- 物体移动使用 GSAP `x` / `y` / `rotation`，避免改布局属性。
- 中文批注保持少量，最多表达关键断点，不解释整套逻辑。
- 批注必须避让角色、物体运动路径和最终落点，不能压住小黑、坑、传送带或纸张。
- 动画必须按阶段递进：先上下文，再第一个动作/断点，再第二个动作/断点，最后总结批注。
- 每个阶段的批注单独成组，不能把全部文字在同一时间一起显示。
- 不要使用透明动线、ghost path、进度感箭头或 `motionGuide` 叠在画面中间；流向优先由物体本身移动表达。
- 中段截图必须检查是否提前露出未来批注，以及是否有多余辅助箭头。
- 最终用于成片时，按字幕时间把 timeline 拆成 cue。
