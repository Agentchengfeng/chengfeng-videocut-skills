---
name: ian-xiaohei-svg-motion
description: Create Ian Xiaohei-style HTML/SVG motion illustrations for Chinese articles, scripts, storyboard scenes, workflow explanations, concept metaphors, and short video visual aids. Use when the user asks for 小黑 SVG、漫画感 HTML、分层 SVG 动效、把小黑生图做成 HTML/SVG、可编辑矢量动效、口播流程动画、手绘漫画动效、正文配图动画, or wants a Xiaohei illustration style adapted into controllable HTML/SVG/GSAP output instead of raster image generation.
---

# Ian Xiaohei SVG Motion

把 Ian 小黑正文配图的原则，改造成可控的 `HTML + SVG + GSAP timeline` 动效。目标不是复刻生图像素，而是把文章里的一个认知动作重建成分层漫画舞台，方便录视频、按字幕 cue 对齐、后续改文案和元素。

## Core Rule

Do not auto-vectorize a PNG and animate the resulting path soup. Use raster images only as composition references. Rebuild the scene as semantic SVG groups:

```text
idea -> shot plan -> SVG layer plan -> HTML/SVG template -> GSAP timeline -> static + motion review
```

## Workflow

1. Extract one cognitive anchor from the article, script, screenshot, or storyboard scene.
2. Choose one physical metaphor: sorting, carrying, bridging, leaking, catching, folding, weighing, opening, rerouting, or falling.
3. Make Xiaohei perform the core action. If removing Xiaohei does not change the meaning, redesign.
4. Design a 16:9 white canvas with one main scene, 35%+ whitespace, and 3-5 short handwritten annotations at most.
5. Build semantic SVG groups for every moving object.
6. Animate with GSAP timeline. Use `x`, `y`, `rotation`, `scale`, `opacity`, and SVG stroke drawing. Avoid layout animations.
7. Save both a playable HTML page and a static review screenshot.
8. If this is for a 口播成片 project, map timeline segments to subtitle/cue timing before final render.

## Read When Needed

- Read `references/style-rules.md` before designing a new scene or judging whether the result still feels like Ian Xiaohei.
- Read `references/svg-layering.md` before writing or editing the SVG structure.
- Read `references/motion-rules.md` before writing GSAP animation.

## Output Contract

Default output folder:

```text
output/<slug>-xiaohei-svg-motion/
```

Required files:

```text
index.html
README.md
preview.png
vendor/gsap.min.js
```

Optional files:

```text
source.png        # reference image, if provided by the user
cue-map.md        # when aligning to spoken script or subtitles
```

## Reusable Assets

AI model and interface icons live in:

```text
assets/icons/
```

Use `assets/icons/index.json` as the source of truth. Keep original SVG files in subfolders and inline their complete SVG content into scene SVGs during generation, so gradients, strokes, and brand colors are preserved.

Icon rules:

- If `index.json` already has the exact model, provider, or semantic icon, use that icon. Do not replace ChatGPT, Claude, Flash lightning, Step, DeepSeek, Qwen, bug, table, chart, database, or web icons with generic boxes, stars, sparks, or abstract marks.
- When the user provides a new SVG icon, save the raw SVG under `assets/icons/<category>/`, add an entry to `index.json`, and then reference it by id in the scene plan.
- For comparison scenes, icon choice is part of the meaning. Keep model icons visually consistent in size and placement so the viewer can identify the actors before Xiaohei starts moving objects.

## Template

Use `assets/templates/xiaohei-comic-motion/` as the starter when the request resembles a hand-drawn comic scene with moving objects, arrows, annotations, or a Xiaohei action.

Use `assets/templates/xiaohei-series-reference/` when the request asks for multiple variants, a reusable series, or a broader reference set for 口播 explanation scenes.

Copy the template into the project output folder, then edit:

- SVG group names.
- Handwritten labels.
- Object positions.
- Timeline labels and durations.
- README notes for the scene-specific metaphor.

## Quality Gate

Before final response:

- Open the HTML in a local server.
- Check console for errors.
- Capture a static screenshot with `?static=1`.
- Capture at least one playback mid-frame when the scene has multiple beats. If available, use `?frame=mid` for a deterministic review frame.
- Visually inspect that text, arrows, Xiaohei, props, belts, pits, cards, and final impact points do not overlap.
- Confirm the animation has visible progression: context first, action second, problem/result third, summary last.
- Confirm annotations appear only after the object/action they explain.
- Remove decorative or semi-transparent guide arrows if the object motion already shows direction.
- Confirm Xiaohei is part of the action.
- Confirm the page is not just a PNG in an `<img>` tag unless the user explicitly asked for PNG-only camera moves.
