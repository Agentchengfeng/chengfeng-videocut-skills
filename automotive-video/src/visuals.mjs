import { THEMES } from "./catalog-data.mjs";
import { clamp, ease, esc, image, label } from "./svg-primitives.mjs";
import { renderEngineeringScene } from "./engineering-scenes.mjs";
export { clamp, ease, esc } from "./svg-primitives.mjs";
export function random(seed, index) {
  let h = 2166136261;
  for (const c of `${seed}:${index}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function particles({
  effect = "ambient",
  time = 0,
  width = 1200,
  height = 675,
  seed = "auto",
  density = 60,
  speed = 1,
  intensity = 0.5,
  color = "#c8f76b",
  secondary = "#56d7eb",
  duration = 6,
  targetPoints = [],
}) {
  const count =
    Math.round(clamp(density, 8, 200)) * (targetPoints.length ? 2 : 1);
  const t = time * speed;
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = random(seed, i * 6),
      b = random(seed, i * 6 + 1),
      c = random(seed, i * 6 + 2),
      d = random(seed, i * 6 + 3),
      e = random(seed, i * 6 + 4);
    let x = a * width,
      y = b * height,
      r = 1 + c * 3,
      op = (0.18 + d * 0.52) * intensity;
    if (effect === "ambient") {
      x = (x + Math.sin(t * 0.25 + c * 6) * 35 + width) % width;
      y = (y - ((t * (8 + c * 15)) % height) + height) % height;
    }
    if (effect === "network") {
      x += Math.sin(t * 0.25 + c * 8) * 18;
      y += Math.cos(t * 0.3 + d * 9) * 20;
      if (i > 0) {
        const j = i - 1,
          px =
            random(seed, j * 6) * width +
            Math.sin(t * 0.25 + random(seed, j * 6 + 2) * 8) * 18,
          py =
            random(seed, j * 6 + 1) * height +
            Math.cos(t * 0.3 + random(seed, j * 6 + 3) * 9) * 20;
        if (Math.hypot(px - x, py - y) < width * 0.23)
          out += `<path d="M${px} ${py} L${x} ${y}" stroke="${color}" stroke-width="1" opacity="${op * 0.5}"/>`;
      }
    }
    if (effect === "flow") {
      x = ((a + t * 0.12) % 1) * width;
      y =
        height * 0.5 +
        Math.sin((x / width) * Math.PI * 2) * height * 0.18 +
        (b - 0.5) * height * 0.12;
      out += `<path d="M${x - 15} ${y}h15" stroke="${color}" opacity="${op}" stroke-width="${r}" stroke-linecap="round"/>`;
      continue;
    }
    if (effect === "scan") {
      const head = ((t * 0.22) % 1) * width;
      const near = Math.max(0, 1 - Math.abs(x - head) / (width * 0.18));
      op *= 0.12 + near;
      r *= 1 + near;
    }
    if (effect === "dissolve") {
      const p = 0.5 - 0.5 * Math.cos(clamp(time / duration) * Math.PI * 2);
      const point = targetPoints[Math.floor(e * targetPoints.length)];
      const size = Math.min(width * 0.55, height * 0.7);
      const tx = point
          ? width * 0.5 + (point.x - 0.5) * size
          : width * 0.5 +
            Math.cos(a * Math.PI * 2) * (width * 0.16) * (0.4 + b * 0.6),
        ty = point
          ? height * 0.5 + (point.y - 0.5) * size
          : height * 0.5 +
            Math.sin(a * Math.PI * 2) * (height * 0.25) * (0.4 + b * 0.6);
      x = x + (tx - x) * ease(p);
      y = y + (ty - y) * ease(p);
      r = 1 + c * 2;
      op *= 0.7 + p * 0.3;
      if (point) {
        out += `<circle cx="${x}" cy="${y}" r="${r * 2.8}" fill="${point.color}" opacity="${op * 0.14}"/><circle cx="${x}" cy="${y}" r="${r * 1.25}" fill="${point.color}" opacity="${clamp(op * 1.8)}"/>`;
        continue;
      }
    }
    if (effect === "sweep") {
      x = ((a + t * 0.6) % 1) * width;
      out += `<path d="M${x - 60 - c * 90} ${y + 15} L${x} ${y}" stroke="${i % 3 ? color : secondary}" stroke-width="${r * 0.6}" opacity="${op}" stroke-linecap="round"/>`;
      continue;
    }
    if (effect === "grid") {
      const cols = Math.round(Math.sqrt((count * width) / height)),
        row = Math.floor(i / cols);
      x = (((i % cols) + 0.5) * width) / cols;
      y = ((row + 0.5) * height) / (count / cols);
      y += Math.sin((x / width) * 8 + t * 0.8) * 18;
      op *= 0.45 + 0.55 * Math.sin(t * 0.6 + a * 5) ** 2;
      r = 2;
    }
    if (effect === "outline") {
      if (targetPoints.length) {
        const point = targetPoints[Math.floor(e * targetPoints.length)],
          size = Math.min(width * 0.55, height * 0.7);
        x = width * 0.5 + (point.x - 0.5) * size;
        y = height * 0.5 + (point.y - 0.5) * size;
        op *= 0.2 + 0.8 * Math.sin(t * 0.9 + c * 5) ** 2;
      } else {
        const p = (a + t * 0.07) % 1;
        const angle = p * Math.PI * 2;
        x = width * 0.5 + Math.cos(angle) * width * 0.3;
        y = height * 0.5 + Math.sin(angle) * height * 0.26;
        op *= 0.5 + 0.5 * Math.sin(t + c * 4) ** 2;
      }
    }
    out += `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${r.toFixed(3)}" fill="${i % 4 ? color : secondary}" opacity="${op.toFixed(3)}"/>`;
  }
  if (effect === "scan") {
    const x = ((t * 0.22) % 1) * width;
    out += `<path d="M${x} 0 V${height}" stroke="${color}" stroke-width="2" opacity="${intensity}"/>`;
  }
  return out;
}
function carRig(
  asset,
  assets,
  time,
  { frontLift = 0, rearLift = 0, roll = true } = {},
) {
  const rig = asset?.rig;
  if (!rig) return image(asset?.data, 0, 0, 1000, 420);
  const body = assets[rig.body],
    wheel = assets[rig.wheel];
  if (!body || !wheel) throw Error("车辆 rig 缺少依赖素材");
  const centers = rig.wheelCenters;
  const bodyLift = (frontLift + rearLift) * 0.35;
  let out = `<g transform="translate(0 ${-bodyLift})">${image(body.data, 0, 0, ...rig.viewBox)}</g>`;
  centers.forEach(([x, y], i) => {
    const lift = i === 0 ? frontLift : rearLift;
    out += `<g transform="translate(${x} ${y - lift}) rotate(${roll ? time * 120 : 0})">${image(wheel.data, -rig.wheelRadius, -rig.wheelRadius, rig.wheelRadius * 2, rig.wheelRadius * 2)}</g>`;
  });
  return out;
}

export function renderSceneSvg(
  scene,
  frame,
  fps,
  width = 1280,
  height = 720,
  assets = {},
) {
  if (scene.preset !== undefined)
    return renderEngineeringScene(scene, frame, fps, width, height, assets);
  const W = 1200,
    H = (1200 * height) / width,
    theme = THEMES[scene.theme] || THEMES.graphite,
    params = scene.params || {},
    accent = params.color || theme.accent,
    t = (frame / fps) * (params.speed ?? 1);
  const motion = scene.motion || "ambient";
  const duration = scene.duration || 6;
  let out = scene.transparent
    ? ""
    : `<rect width="${W}" height="${H}" fill="${theme.background}"/>${scene.type !== "motion" || params.frameLines === true ? `<path d="M70 74 H1130 M70 ${H - 65} H1130" stroke="${theme.muted}" opacity=".15"/>` : ""}`;
  out += particles({
    effect: motion,
    time: frame / fps,
    width: W,
    height: H,
    seed: params.seed || scene.id || "auto",
    density: params.density || 55,
    intensity: params.intensity ?? 0.3,
    speed: params.speed ?? 1,
    color: accent,
    secondary: theme.secondary,
    duration,
    targetPoints: assets[scene.assetId]?.particlePoints?.[motion] || [],
  });
  const type = scene.type || "motion";
  if (type !== "motion") {
    const title = scene.title || "";
    out += label(title, 80, 145, H > 900 ? 58 : 48, theme.ink);
    if (scene.subtitle) out += label(scene.subtitle, 82, 196, 25, theme.muted);
  }
  const diagramY = H > 900 ? H * 0.39 : 210;
  const safeBottom = clamp(scene.safeBottom || 0, 0, 0.4),
    availableBottom = H * (1 - safeBottom),
    top = diagramY - 30;
  const bottom =
    {
      suspension: diagramY - 25 + 460,
      energy: diagramY + 430,
      sensor: H > 900 ? H * 0.58 + 330 : 660,
      compare: diagramY + 380 + (H > 900 ? 400 : 0),
      asset: H > 900 ? H * 0.74 + 75 : 650,
    }[type] || H;
  const diagramScale = safeBottom
    ? Math.min(1, Math.max(0.25, (availableBottom - top - 15) / (bottom - top)))
    : 1;
  if (type !== "motion")
    out += `<g data-role="diagram" transform="translate(${(W * (1 - diagramScale)) / 2} ${top * (1 - diagramScale)}) scale(${diagramScale})">`;
  if (type === "suspension") {
    const a = assets[scene.assetId || "vehicle.sedan.side"];
    const amplitude = Number(params.amplitude ?? 40),
      bumpX = ((t * 0.18) % 1) * 1400 - 180;
    const lift = (x) => amplitude * Math.exp(-(((x - bumpX) / 85) ** 2));
    const frontLift = lift(245),
      rearLift = lift(755);
    const road = Array.from(
      { length: 71 },
      (_, i) => `${i ? "L" : "M"}${i * 15} ${395 - lift(i * 15)}`,
    ).join(" ");
    out += `<g transform="translate(90 ${diagramY - 25}) scale(1.02)"><path d="${road}" fill="none" stroke="${accent}" stroke-width="4" opacity=".55"/>${carRig(a, assets, t, { frontLift, rearLift })}<path d="M245 ${235 - (frontLift + rearLift) * 0.35} l-15 12 l30 12 l-30 12 l30 12 l-15 12" stroke="${accent}" stroke-width="4" fill="none"/>${label("车轮随路面运动", 125, 449, 25, theme.muted)}${label("车身响应", 700, 110, 25, accent)}</g>`;
  } else if (type === "energy") {
    const y = diagramY - 70,
      reverse = params.reverse === true;
    out += `<g transform="translate(0 ${y})"><path d="M360 70 Q600 30 840 70 L840 420 Q600 465 360 420 Z" fill="${theme.surface}" opacity=".7" stroke="${theme.muted}" stroke-width="2"/><path d="M600 315 V140 M300 140 H900" stroke="${accent}" stroke-width="5" opacity=".35"/>${image(assets[scene.assetId || "part.battery"]?.data, 425, 275, 350, 180)}${image(assets["part.motor"]?.data, 490, 70, 220, 150)}`;
    for (const x of [300, 900])
      out += `<g transform="translate(${x} 140) rotate(${t * (reverse ? -90 : 90)})">${image(assets["part.wheel"]?.data, -80, -80, 160, 160)}</g>`;
    for (let i = 0; i < 24; i++) {
      const u = (i / 24 + t * (reverse ? -0.23 : 0.23) + 10) % 1;
      let x, y2;
      if (u < 0.4) {
        x = 600;
        y2 = 340 - (u / 0.4) * 200;
      } else {
        const k = (u - 0.4) / 0.6;
        x = 600 + (i % 2 ? 1 : -1) * k * 300;
        y2 = 140;
      }
      out += `<circle cx="${x}" cy="${y2}" r="${i % 3 ? 4 : 6}" fill="${accent}"/>`;
    }
    out += `${label("驱动轮", 230, 255, 26, theme.ink, "middle")}${label("驱动轮", 970, 255, 26, theme.ink, "middle")}${label("电机", 600, 245, 26, theme.secondary, "middle")}${label("电池", 600, 490, 26, theme.ink, "middle")}${label(reverse ? "回收方向 · 通用原理示意" : "输出方向 · 通用原理示意", 850, 420, 24, accent, "middle")}</g>`;
  } else if (type === "sensor") {
    const cy = H > 900 ? H * 0.58 : 420;
    out += `<g transform="translate(600 ${cy}) scale(${H > 900 ? 1 : 0.72})"><circle r="250" stroke="${accent}" fill="none" opacity=".13"/><circle r="170" stroke="${accent}" fill="none" opacity=".16"/><circle r="90" stroke="${accent}" fill="none" opacity=".2"/><g transform="rotate(${t * 38})"><path d="M0 0 L-48 -255 A260 260 0 0 1 110 -235 Z" fill="${accent}" opacity=".12"/><path d="M0 0 L110 -235" stroke="${accent}" stroke-width="2" opacity=".7"/></g>${image(assets[scene.assetId || "vehicle.top"]?.data, -62, -110, 124, 220)}<rect x="-228" y="-180" width="45" height="75" rx="8" stroke="${theme.secondary}" fill="none" stroke-width="3"/><rect x="185" y="100" width="50" height="80" rx="8" stroke="${theme.secondary}" fill="none" stroke-width="3"/>${label("二维感知示意", 0, 305, 28, theme.muted, "middle")}</g>`;
  } else if (type === "compare") {
    const ids = scene.assetIds || ["vehicle.sedan.side", "vehicle.suv.side"];
    const y = diagramY + 50;
    const vertical = H > 900;
    for (let i = 0; i < 2; i++) {
      const x = vertical ? 100 : 70 + i * 570,
        yy = vertical ? y + i * 400 : y,
        w = vertical ? 1000 : 520,
        a = assets[ids[i]],
        scale = Math.min((w - 50) / 1000, (vertical ? 270 : 210) / 420);
      out += a?.rig
        ? `<g transform="translate(${x + (w - 1000 * scale) / 2} ${yy + 15}) scale(${scale})">${carRig(a, assets, t * (i ? 1 : 0.8))}</g>`
        : image(a?.data, x + 25, yy + 15, w - 50, vertical ? 270 : 210);
      out += `<path d="M${x + 50} ${yy + (vertical ? 300 : 240)} H${x + w - 50}" stroke="${i ? theme.secondary : accent}" stroke-width="2" opacity=".45"/>${label(scene.labels?.[i] || ["方案 A", "方案 B"][i], x + w / 2, yy + (vertical ? 350 : 290), 30, i ? theme.secondary : accent, "middle")}`;
    }
  } else if (type === "asset") {
    const a = assets[scene.assetId || "vehicle.sedan.side"];
    const h = H > 900 ? H * 0.36 : 330;
    const y = H > 900 ? H * 0.38 : 240;
    const appear = ease(t / 0.7);
    out += `<g opacity="${appear}" transform="translate(0 ${(1 - appear) * 25})">${a?.rig ? `<g transform="translate(130 ${y}) scale(.94)">${carRig(a, assets, t)}</g>` : image(a?.data, 130, y, 940, h)}</g>`;
    if (a?.representation === "schematic")
      out += label("通用原理示意", 600, y + h + 55, 25, theme.muted, "middle");
  }
  if (type !== "motion") out += "</g>";
  if (scene.annotation)
    out += label(
      scene.annotation,
      80,
      Math.min(H - 100, availableBottom - 20),
      27,
      theme.muted,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}">${out}</svg>`;
}
