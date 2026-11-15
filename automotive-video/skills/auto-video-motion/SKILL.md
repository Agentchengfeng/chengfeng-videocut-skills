---
name: auto-video-motion
description: 复用汽车视频二维场景和粒子组件，制作背景动效、扫描描边、能量流、聚散转场、悬架与感知解释动画。用户要求粒子效果、背景动画、汽车 SVG 动画、转场或复用固定组件时使用。
---

# 汽车二维动效

解析本 Skill 真实路径后向上两级得到 `<工具包>`。读取 [组件与参数](../../references/components.md)，实际可调用组件由 `list` 返回。

- 背景：ambient、network、grid，控制强度并给正文和字幕留清楚空间。
- 揭示与过渡：scan、outline、dissolve、sweep。普通镜头允许干净硬切；根据内容切换选择 cut/fade/wipe，不把某一种风格的切换规则扩展到全片。
- 原理场景：悬架、电驱、感知、对比使用 `list` 的版本化 `presets`。例如并线跟踪用 `sensor.cut-in.v1`，回收用 `energy.regen.v1`。用 `assetSlots` 替换对象，画面仍沿预设的同一时间轴运行。真实品牌素材先核对资料卡，通用构图保留原理示意标记。

独立动效：

```sh
node "<工具包>/bin/auto-video.mjs" motion-project ambient --out "<输出项目>" --width 1280 --height 720 --fps 30 --theme ice --color "#59dbff" --density 100 --intensity 0.3 --speed 1 --duration 6
node "<工具包>/bin/auto-video.mjs" render "<输出项目>/project.json" --out "<动效.mp4>"
```

透明层在创建与导出两步都加 `--transparent`，输出 WebM；不要承诺普通 H.264 MP4 保存透明。独立二维素材也可生成 PNG 帧。需要进入整片时将配置写成现有项目 `clips` 的一个 scene，而非建立另一条总时钟。

`--width/--height` 是像素，`--fps` 是帧率，`--duration` 是秒；`--intensity` 取 0–1，`--density` 取 8–200，`--speed` 为速度倍率，`--seed` 固定随机布局。`--theme` 可用 graphite / ice / paper。聚散和轮廓效果可用 `--asset-id logo.tesla` 选择已入库的目标图形。完整参数见组件参考，无须为这些常用参数重新阅读实现代码。

用户要求新增效果时保留纯帧驱动的渲染接口，随机行为固定种子；同一帧、任意顺序渲染必须一致。新网页动效或 Lottie 资源先检查时间轴兼容，再注册和验收。当前首批粒子是本地原创二维实现，在线预设作为参考留档，不冒称直接运行了未适配库。

至少核对一个开始、中间、结束时刻以及连续播放。调整颜色、密度、速度或对象时优先参数化；只有表达目的改变才修改场景结构。交付可播放预览、配置和素材引用；原声/音效按用户当次要求处理。
