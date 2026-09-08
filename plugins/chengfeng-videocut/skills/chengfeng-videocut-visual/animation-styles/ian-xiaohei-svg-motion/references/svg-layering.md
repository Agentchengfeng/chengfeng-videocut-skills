# SVG Layering

## Principle

Every animated object must be a semantic SVG group. Do not mix unrelated strokes into one path.

Good:

```html
<g id="xiaohei">...</g>
<g id="paperStack">...</g>
<g id="fallingCard">...</g>
<g id="annotations">...</g>
```

Bad:

```html
<path d="huge mixed auto-vectorized path"></path>
```

## Recommended Groups

- `background`: white scene base only.
- `mainObject`: the low-tech metaphor object or machine.
- `xiaohei`: body, eyes, limbs.
- `inputs`: papers, cards, icons, boxes, sources.
- `outputs`: result objects.
- `failure`: pit, leak, gap, stuck point, warning object.
- `arrows`: orange directional arrows.
- `annotations`: red/blue/orange handwritten labels.
- `motionGuides`: avoid by default. Use only for invisible internal calculation, not visible translucent arrows.

For annotations, prefer subgroups by beat:

```html
<g id="annotations">
  <g id="annBefore">...</g>
  <g id="annDry">...</g>
  <g id="annAfter">...</g>
  <g id="annNoBridge">...</g>
  <g id="annTitle">...</g>
</g>
```

## Text

- Keep labels short: 2-8 Chinese characters.
- Prefer 3-5 annotations per scene.
- Do not place a large title inside the SVG scene.
- Use page UI or README for explanations, not the illustration itself.
- Reserve clear space for labels before animating. Text must not overlap Xiaohei, moving cards, arrows, pits, belts, or final impact points.
- If a label points to a crowded object, place the text outside the action area and use a short arrow/callout back to the object.
- Never place a label directly on top of a moving object path. Check both final frame and playback mid-frames.
- Prefer moving the label outward and connecting it with a short callout arrow instead of squeezing text into the action area.

## Arrows

- Use arrows as semantic annotations, not decoration.
- Do not include a visible `motionGuide` path when a card, paper, or prop already moves.
- Avoid translucent arrows because they read as accidental UI/progress artifacts in screen recordings.
- Keep arrows short, solid, and attached to a specific label or transition.

## Static Review Mode

Support `?static=1` in HTML pages:

- seek timeline to a readable final or key review frame;
- pause animation;
- keep labels, arrows, and main result visible.

Static review is for layout approval. Playback review is for rhythm approval.
