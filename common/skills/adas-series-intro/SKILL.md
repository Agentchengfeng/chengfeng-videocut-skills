---
name: adas-series-intro
description: 复用辅助驾驶系列标准开头1，先收集每期四辆车与方案档位，再制作四图开场、两年进化分化、论文、四维和S/A/B/C/D五档的竖屏二维动画。
---

# 辅助驾驶系列标准开头 1

这是 common 的独立动画资源 Skill，可供配画面任务引用；不创建剪辑工程或替代 Studio。适用于标准开头的十句语义。默认 V2 为 1080×1920 / 60fps / 16.333秒；V1 配置仍可重渲染。

## 每期先收集内容

用户明确要求每次使用前询问以下信息。先核对本轮已提供的内容，只问缺失项；已有明确答案不重复确认。用户只要公共空模板时，可明确保留空位，不要求凑出四张图片。

- 本期四辆车的名称、左上→右上→左下→右下顺序、已有图片；图片暂缺时询问是否保留空槽。
- 已讲过的辅助驾驶方案名称、S/A/B/C/D 档位，以及同一档的上沿／中部／下沿；同位置最多并排两个名称。
- 方案默认采用芯片图片样式：核对芯片家族和单／双颗数量，优先复用 assets/chips 的官方素材；不得用另一款芯片图冒充。已明确的内容不重复询问。
- 本期方案名称、是否揭晓；未揭晓时不在任何档位放占位标记，揭晓时还需用户指定档位和档内位置。

这些位置是用户指定的系列评价，不是硬件的固定客观评级。不得把上期数据或参考示例自动沿用到新一期。2026-11-10 的 V2 示例是 A 上沿双图灵、中部 Thor、下沿图灵，B 中部 Orin X 与双 Orin X；它只属于该次实例，公共 config 的已讲方案保持空数组。本轮用户已明确“四个空槽、本期留空”时直接执行。

## 复用与配置

以本文件目录为 `<模板>`。先复制 `assets/` 到本次项目，依据实际字幕校准本次 `config.json`，不覆盖公共模板来保存某期内容。

- [配置与图片规则](references/configuration.md)：styleVersion、四个车型槽、方案落档、本期揭晓及图片路径。
- [逐段动作与依据](references/storyboard.md)：四图顺序、俯视进化、红色报错、论文示意及五档版式。
- `assets/scene.js` 的 `render(relativeSeconds, config)` 是浏览器与导出共用的纯帧 SVG；保持二维、固定时间输入、任意顺序 seek 一致。

```sh
node "<模板>/scripts/check.cjs"
node "<模板>/scripts/render.mjs" --config "<本次目录>/config.json" --out "<本次目录>/output"
```

依赖为同仓 automotive-video/node_modules 的 @resvg/resvg-js 及 PATH 中的 FFmpeg/FFprobe；缺少时说明，不改变插件安装。`--width 540 --fps 30` 可快速预览，默认输出高清静音 MP4、实际解码抽帧、联系表与 verification.json。MP4 不带透明通道。导出会核对参数和全片解码；还需实际查看开场各入场时刻、升级／报错、论文与五档文字。没有音频就不声称音画同步或听感通过。

`index.html` 是被动模块，接收 videocut:seek 的相对 time（秒），暴露 window.ready / window.seekTo(time)，不自播。复制后的目录经 HTTP 提供即可用宿主驱动。Node 与浏览器都先 prepareImages，将图片嵌为 data URI 后再绘制；配置了不存在的图片必须报告错误，不静默替换为空槽。

五档右侧通过 tierPresentation: chips 显示图片，tierEntries 的 image 指向相对本期配置的图片，chipCount 为1或2；双颗复用两枚同款图片。已有文字版可用 tierPresentation: labels。内置 Orin、Thor、图灵宣传图的出处、原文件哈希及二维裁切坐标见 [素材记录](assets/chips/sources.json)，裁切脚本 scripts/prepare-chip-images.cjs 可从保留的原图复现。它们是官方产品宣传图，不是实物拆机或测试证据。无图片时的通用引脚图只作示意，不能宣称该型号的真实封装。

## 接入与内容边界

真实剪辑工程接入仍使用当前已安装 chengfeng-visual / 工作台 Skill 的就绪检查、Product readback、cue 绑定与审核合同。剪辑、字幕或层时长改变后重新校准本次 config；不根据 duration 自动拉伸，不猜逐词时点。没有真实项目时仅交付独立动画，不伪造 visuals.json、revision 或确认。

保持“可能受限”的条件表述；进化场景以感知与规划能力逐级激活表现，已有传感器从开始就存在，不表现 OTA 新增硬件。论文是标注过的文献示意，五档是系列评价框架。具体车型图片须来自用户提供或核验过的素材；不复刻截图中的平台界面、评论或人物。不使用三维、透视或静态图片推拉代替本模板的连续动作。
