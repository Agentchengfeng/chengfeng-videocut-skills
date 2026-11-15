# 来源与实现边界

核对日期：2026-11-04。

- 首批车辆、车轮、弹簧、底盘、电池、电机、传感器与芯片 SVG：本项目原创通用二维示意；不对应具体厂家结构。元数据 `representation=schematic`。
- 品牌字形：`simple-icons@16.36.0`，每个图标保留包内 source 和 license 字段，见 https://github.com/simple-icons/simple-icons 。字形集合来源与品牌自身标志身份分别记录。
- 本地粒子与场景：原创 SVG / JavaScript 实现，以 frame/fps 确定时间，固定随机种子。没有引入 3D 渲染器或三维模型。
- 视觉参考：tsParticles Ambient https://particles.js.org/demos/recipes/ambient 、Links https://particles.js.org/demos/recipes/links 、Meteors https://particles.js.org/demos/recipes/meteors 。它们不是已经接入的运行依赖，在线示例的交互和墙钟不能直接用于逐帧视频。
- 渲染依据：Remotion https://www.remotion.dev/docs/renderer/render-media 、随机数规则 https://www.remotion.dev/docs/using-randomness 。所有 Remotion 包固定为 4.0.540，依赖锁在 package-lock.json。
- 云端转录：火山录音文件极速版 https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-lite-recognition-api?lang=zh 。本机没有可用凭证时不调用、不声称实测；同项目可直接使用同步 SRT。

公开网页查阅与代码接口核对不等于本机运行验证；实际运行检查在 `review/verification-summary.json` 中记录。
