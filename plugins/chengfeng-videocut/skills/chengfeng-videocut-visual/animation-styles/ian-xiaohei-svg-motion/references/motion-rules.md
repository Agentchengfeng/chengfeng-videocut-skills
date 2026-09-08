# Motion Rules

## Spinners & Fixed-Pivot Rotation (hard rule — violations make wheels/beams orbit away)

For anything that spins in place (rollers, axles, gears) or rotates around a fixed stage point (balance beams, levers):

- Drive it with an SVG attribute transform via a proxy object, NOT with GSAP transforms:
  `timeline.to(state, { r: 600, ease: 'none', onUpdate: () => el.setAttribute('transform', `rotate(${state.r} <cx> <cy>)`) })`.
- The spinning element must NOT have `transform-box: fill-box` / `transform-origin` CSS (e.g. a shared
  `.motion-layer` class): the browser re-applies the CSS origin on top of the attribute matrix — double
  pivot — and the element orbits instead of spinning. Strip such classes from spinners.
- Do not rely on GSAP `svgOrigin`/`transformOrigin` for these: `.from()` immediateRender and origin
  caching can freeze a wrong compensation offset (verified failure modes on 2026-07-16).
- Verify by measuring `getBoundingClientRect()` centers at 2–3 playback times: drift must be 0.

## GSAP Timeline

Use one named timeline per scene:

```js
const timeline = gsap.timeline({
  repeat: -1,
  repeatDelay: 1,
  defaults: { ease: "power2.out" }
});
```

Prefer labels when mapping to narration:

```js
timeline
  .addLabel("context", 0)
  .addLabel("input", 0.8)
  .addLabel("first-break", 1.6)
  .addLabel("after-writing", 2.6)
  .addLabel("second-break", 4.2)
  .addLabel("summary", 5.2);
```

Treat labels as story beats, not just code markers. Future-stage objects and annotations should stay hidden until their beat.

## What To Animate

- Paper/card movement: `x`, `y`, `rotation`, `opacity`.
- Xiaohei body: small `y`, `rotation`, `scale`, limb rotation.
- Arrows and handwritten strokes: `strokeDasharray` + `strokeDashoffset`.
- Emphasis: brief shake, bounce, or pulse.
- Camera-like emphasis: use a wrapper group scale only when needed.
- Direction should usually be expressed by the moving object itself. Add an arrow only when the object motion is not enough.

## Progression

The animation must reveal the idea in order:

1. show context;
2. move the first object or input;
3. reveal the first breakpoint/problem;
4. reveal the next system segment;
5. move the output object;
6. reveal the second breakpoint/result;
7. draw the summary annotation.

Do not show all annotations at the start. Split annotations into stage groups such as `annBefore`, `annDry`, `annAfter`, `annNoBridge`, and reveal each one at its cue.

## Annotation Timing

- Show the object first, then show the annotation.
- Keep future-stage labels hidden until the relevant action starts.
- Do not draw all red/blue/orange handwritten labels together at the end unless the user asks for a final summary board.
- For static review, seek to a frame where all final labels are readable, but still validate playback mid-frames separately.

## No Decorative Motion Guides

Do not add translucent path arrows, ghost arrows, progress streaks, or `motionGuide` overlays just to explain movement.

Acceptable:

- the card/paper/object moves along the belt;
- a short solid arrow attached to a handwritten callout;
- a short orange arrow for a clear conceptual transition.

Not acceptable:

- a semi-transparent orange arrow behind a moving card;
- a decorative path that duplicates a visible object movement;
- guide arrows that look like timeline/progress UI.

## Avoid

- Moving decorative dots that look like extra nodes unless they mean something.
- Over-animated UI effects.
- Too many simultaneous motions.
- Annotations appearing before the object/action they explain.
- Decorative transparent guide arrows or ghost motion paths.
- Animating `top`, `left`, `width`, `height`.
- Long loops that do not align to spoken explanation.

## Cue Mapping

For spoken videos, write a `cue-map.md` when timing matters:

```text
0.0-0.8  show context
0.8-1.8  input moves
1.8-2.6  Xiaohei performs core action
2.6-3.5  result or failure appears
3.5-4.2  second object moves
4.2-5.0  second problem appears
5.0-5.5  summary annotation draws in
```

The animation should reveal the idea in the same order as the narration.
