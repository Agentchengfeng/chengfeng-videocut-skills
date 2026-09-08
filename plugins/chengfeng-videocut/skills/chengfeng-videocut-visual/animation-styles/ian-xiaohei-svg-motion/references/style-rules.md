# Style Rules

## Must Have

- 16:9 horizontal canvas.
- Pure white scene background.
- Black hand-drawn linework with light wobble.
- Lots of whitespace; subject usually uses 40%-60% of canvas.
- Xiaohei appears and performs the core action.
- One image explains one action, structure, state, or metaphor.
- Red, orange, and blue annotations are sparse and short.

## Color Roles

- Black: linework, Xiaohei, objects, main Chinese text.
- Orange: main path, flow direction, motion arrows.
- Red: problems, breakpoints, warnings, results.
- Blue: side notes, before/after context, system status.

## Avoid

- PPT-like diagrams, formal flowcharts, grid dashboards.
- Cute mascot styling.
- Complex architecture.
- Tech UI chrome.
- Dense labels or long explanations.
- Text overlapping moving objects, Xiaohei, arrows, pits, belts, or final impact points.
- Decorative transparent arrows, ghost paths, progress streaks, or guide overlays.
- Showing all annotations at once without narrative progression.
- Beige paper textures, gradients, shadows, or decorative backgrounds.
- Copying old example compositions unless the user explicitly asks to reproduce a reference.

## Xiaohei

Xiaohei should look like a black solid odd worker:

- black filled body;
- white dot eyes;
- thin arms or legs;
- blank serious expression;
- simple, slightly awkward posture.

Xiaohei must not be a sticker, mascot, or bystander. Make it carry, hold, catch, pull, sort, bridge, fall, repair, block, or operate something.

## Xiaohei Arms (hard rules; violations read as "sticks through the face")

- Anchor each arm on the body silhouette at 55%-70% of body height — always BELOW the eye line, never at or above it.
- Arms are curved paths with an elbow bend (one `C` curve whose control points are NOT collinear); straight lines read as wires.
- Arm length ≤ 0.8× body height. Long reaches come from rotating a short arm, not from drawing a longer one.
- An arm must never cross the body outline, the eyes, or the other arm — check at rest pose AND at every animated pose (end and mid frames).
- Pose changes use `rotation` around the shoulder anchor (`svgOrigin` at the path's body-side end). For a LEFT-pointing arm in SVG (y-down), positive rotation swings the tip UP, negative swings it DOWN — verify direction per arm before writing keyframe values.
