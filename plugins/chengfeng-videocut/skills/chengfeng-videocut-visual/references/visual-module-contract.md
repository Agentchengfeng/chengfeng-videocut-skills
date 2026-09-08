# 模块契约

每一条都是踩过的坑，不是风格偏好。

## 文档头三行命门

```text
:root { color-scheme: dark }   工作台是深色模式。不声明，Chromium 会因深浅不匹配
                               给整个 iframe 垫一层不透明白底 —— 透明标注直接变白板。
                               这行是模块能透明的前提（2026-07-28 白了一整天才破案）
背景                           标注模块 background: transparent；
                               动画模块白底放在 #stage 上（不放 body），随整段淡入淡出
viewBox="0 0 960 720"          坐标 = 原片像素。推近以数据到达（seek 消息带 zoom），
                               模块把 viewBox 对准那块区域 —— iframe 本身绝不被 CSS 缩放
```

## 被驱动，不自播

```text
播放器按 requestAnimationFrame 每帧发 videocut:seek 消息（time/duration/cues/zoom），
模块 tl.seek 到那一帧。拖进度条、暂停、变速、导出逐帧，全都因此成立。

const tl = gsap.timeline({ paused: true });
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "videocut:seek") return;
  if (data.zoom) { /* viewBox 对准 zoom 区域 */ }
  if (!built) build(data.cues, data.duration);
  tl.seek(Number(data.time) || 0, false);
});
```

## GSAP 四禁

```text
禁 drawSVG        收费插件，免费版静默失效，画面什么都不发生。
                  画线用 strokeDasharray/strokeDashoffset
禁 .from()        seek 回 0 会留脏状态。一律 .to()/.fromTo()，初值写在 SVG 属性里
必须 lazy:false   paused 时间线首次跨过 tween 起点时 lazy 渲染被搁置，停在错误值
禁墙钟           Date.now / 自转 rAF 都不许，时间只来自 seek 消息
```

## duration 可能比词的跨度长

层间 ≤0.75 秒的空隙归前一层（产品规矩，防相邻边界闪原片）。
模块收到的 duration 是**延长后的**——按 duration 比例摆的兜底时刻会跟着挪，
写死的相对时刻要在层边界变化时复查。

## 动作钉在词上

```text
function stepAt(cues, keyword, fallback) {
  const hit = cues.find((cue) => cue.text.includes(keyword));
  return hit ? hit.start : fallback;
}
说到「调用」箭头才画，说到「一周」才圈 —— 禁止平均分时间。
但退场时刻是画面事实（滚动/操作开始前），用量出来的数字，写明出处。
```

## 小黑风格的 Avoid 清单对所有作者生效

装饰性箭头、幽灵轨迹、进度拖尾、一次全亮的批注——都不许。
动作本身就是叙事（盒子滑过去 = 交接），不需要一条线再说一遍。

**整屏动画进出场是硬切，不做淡入淡出。** 这条被反过来定过一次：
先以为白屏硬切晃眼加了渐变，用户看片后推翻——白屏淡出叠在静止画面上
看起来像播放器卡住；硬切是剪辑语言，观众认。（用户 2026-07-29 定）
