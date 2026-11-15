import { clamp, ease, esc, image } from "./svg-primitives.mjs";

export const palette = {
  background: "#11181d",
  panel: "#192329",
  road: "#232d33",
  line: "#53656e",
  subtle: "#34444d",
  ink: "#eef5f7",
  muted: "#a9bec8",
  info: "#83e5ee",
  event: "#ffcc81",
};

export const mix = (a, b, progress) => a + (b - a) * progress;
export const between = (p, start, end) => ease((p - start) / (end - start));
export function captionSafeBottom(width, height, style = {}) {
  const bottom = (style.bottom ?? 8) / 100;
  const fontPx = (width * (style.fontSize || 4.1)) / 100;
  return Math.max(0.2, bottom + (2 * 1.5 * fontPx) / height + 0.012);
}
export const linePoints = (points) =>
  points.map(([x, y]) => `${x},${y}`).join(" ");
export const box = (x, y, w, h) => ({ x, y, w, h });
export const centered = (x, y, w, h) => box(x - w / 2, y - h / 2, w, h);
const FONT = "PingFang SC,Noto Sans CJK SC,Hiragino Sans GB,sans-serif";

export function type(
  text,
  x,
  y,
  {
    size = 24,
    color = palette.ink,
    weight = 500,
    anchor = "start",
    maxWidth,
  } = {},
) {
  if (!text) return "";
  const units = [...String(text)].reduce(
    (sum, char) => sum + (/^[\x00-\x7f]$/.test(char) ? 0.59 : 1),
    0,
  );
  const available = maxWidth ? Math.min(size, maxWidth / units) : size;
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${available}" font-weight="${weight}" font-family="${FONT}" text-anchor="${anchor}">${esc(text)}</text>`;
}

export function fitMedia(
  asset,
  bounds,
  { align = "center", opacity = 1 } = {},
) {
  const { x, y, w, h } = bounds;
  return image(asset.data, x, y, w, h, `opacity="${opacity}"`).replace(
    'preserveAspectRatio="xMidYMid meet"',
    `preserveAspectRatio="xMidY${align === "bottom" ? "Max" : "Mid"} meet"`,
  );
}

export function callout(
  text,
  from,
  to,
  { color = palette.info, size = 22, anchor = "start", maxWidth } = {},
) {
  const [x, y] = to;
  const sign = anchor === "end" ? -1 : 1;
  return `<g data-role="callout"><polyline points="${linePoints([from, [x - sign * 14, y - 7], [x - sign * 4, y - 7]])}" fill="none" stroke="${color}" stroke-width="1.6"/><circle cx="${from[0]}" cy="${from[1]}" r="3" fill="${color}"/>${type(text, x, y, { size, color, weight: 600, anchor, maxWidth })}</g>`;
}

export function status(
  index,
  title,
  description,
  x,
  y,
  { color = palette.info, maxWidth = 230, scale = 1 } = {},
) {
  return `<g data-role="status" transform="translate(${x} ${y}) scale(${scale})"><path d="M0 -24h34" stroke="${color}" stroke-width="3"/>${type(index, 46, -17, { color, size: 16, weight: 650 })}${type(title, 0, 17, { size: 33, weight: 650, maxWidth: maxWidth / scale })}${type(description, 0, 48, { size: 20, color: palette.muted, maxWidth: maxWidth / scale })}</g>`;
}

export function stage(scene, preset, width, height) {
  const W = 1200;
  const H = (W * height) / width;
  const portrait = height > width;
  const contentBottom = H * (1 - clamp(scene.safeBottom ?? 0, 0, 0.6));
  const top = H * (portrait ? 0.172 : 0.224);
  const foot = H * (portrait ? 0.036 : 0.055);
  const area = box(
    64,
    top,
    W - 128,
    Math.max(1, contentBottom - top - foot - 11),
  );
  const titles = {
    sensor: "01 / 辅助驾驶",
    suspension: "02 / 底盘与悬架",
    energy: "03 / 电驱与能量",
    compare: "04 / 同构图对比",
  };
  const header = `<path d="M64 ${H * 0.046}H1136" stroke="${palette.subtle}" stroke-width="2"/>${type(titles[preset.type], 65, H * (portrait ? 0.08 : 0.078), { size: portrait ? 34 : 17, color: palette.info, weight: 600 })}${type(scene.title ?? preset.title, 63, H * (scene.subtitle ? 0.145 : 0.163), { size: portrait ? 74 : scene.subtitle ? 43 : 51, weight: 650, maxWidth: 1070 })}${type(scene.subtitle, 65, H * (portrait ? 0.169 : 0.194), { size: portrait ? 34 : 22, color: palette.muted, maxWidth: 1070 })}`;
  const footerY = contentBottom - foot * 0.22;
  const footer = `<path d="M64 ${contentBottom - foot}H1136" stroke="${palette.subtle}"/>${type(scene.annotation, 65, footerY, { size: portrait ? 27 : 15, color: palette.muted, maxWidth: 780 })}${type("原理示意", 1135, footerY, { size: portrait ? 27 : 17, color: palette.muted, anchor: "end" })}`;
  return {
    portrait,
    wrap: (diagram, worldWidth, worldHeight) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="stage-bg" x2="0" y2="1"><stop stop-color="${palette.background}"/><stop offset="1" stop-color="#0d1419"/></linearGradient><filter id="neutral-factory-rig" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values=".25"/></filter></defs><rect width="${W}" height="${H}" fill="url(#stage-bg)"/>${header}<svg data-role="diagram" x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" viewBox="0 0 ${worldWidth} ${worldHeight}" preserveAspectRatio="xMidYMid meet">${diagram}</svg>${footer}</svg>`,
  };
}

export function tireContactRadius(rig, assets) {
  const wheel = assets[rig.wheel];
  // The original wheel's outer stroke extends to 86.5% of its SVG half-width.
  return (
    rig.wheelRadius *
    (wheel.id === "part.wheel" && wheel.source?.type === "original" ? 0.865 : 1)
  );
}

export function rigDrawing(
  asset,
  assets,
  { frontLift = 0, rearLift = 0, bodyLift = 0, angle = 0, roll = 0 } = {},
) {
  const rig = asset.rig;
  const [w, h] = rig.viewBox;
  const [[fx, fy], [rx, ry]] = rig.wheelCenters;
  const radius = rig.wheelRadius;
  const bodyTransform = `translate(0 ${-bodyLift}) rotate(${angle} ${(fx + rx) / 2} ${(fy + ry) / 2})`;
  const wheels = rig.wheelCenters
    .map(([x, y], index) => {
      const lift = index === 0 ? frontLift : rearLift;
      return `<g data-role="${index === 0 ? "front-wheel" : "rear-wheel"}" transform="translate(${x} ${y - lift}) rotate(${roll})">${fitMedia(assets[rig.wheel], centered(0, 0, radius * 2, radius * 2))}</g>`;
    })
    .join("");
  const factoryRig =
    asset.source?.type === "original" &&
    ["vehicle.sedan.side", "vehicle.suv.side"].includes(asset.id);
  const drawing = `<g data-role="rig-body" transform="${bodyTransform}">${fitMedia(assets[rig.body], box(0, 0, w, h))}</g>${wheels}`;
  return factoryRig
    ? `<g filter="url(#neutral-factory-rig)">${drawing}</g>`
    : drawing;
}

export function signalPath(points, phase, color = palette.info) {
  const segments = points.slice(1).map((point, i) => {
    const from = points[i];
    return {
      from,
      point,
      length: Math.hypot(point[0] - from[0], point[1] - from[1]),
    };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  function pointAt(progress) {
    let distance = clamp(progress) * total;
    for (const { from, point, length } of segments) {
      if (distance <= length) {
        const f = length ? distance / length : 0;
        return [
          mix(from[0], point[0], f),
          mix(from[1], point[1], f),
          (Math.atan2(point[1] - from[1], point[0] - from[0]) * 180) / Math.PI,
        ];
      }
      distance -= length;
    }
    return [...points.at(-1), 0];
  }
  const live = phase >= 0;
  const dots = live
    ? Array.from({ length: 5 }, (_, i) => {
        const at = phase * 3.125 - i * 0.17;
        if (at < 0) return "";
        const [x, y] = pointAt(at % 1);
        return `<circle cx="${x}" cy="${y}" r="${i === 0 ? 5 : 3}" fill="${color}" opacity="${1 - i * 0.13}"/>`;
      }).join("")
    : "";
  const [x, y, rotation] = pointAt(0.55);
  return `<g data-role="signal"><polyline points="${linePoints(points)}" fill="none" stroke="${live ? color : palette.line}" stroke-opacity="${live ? 0.53 : 0.8}" stroke-width="3" stroke-linejoin="round"/><path d="M-6 -5 1 0-6 5" transform="translate(${x} ${y}) rotate(${rotation})" fill="none" stroke="${live ? color : palette.muted}" stroke-width="2"/>${dots}</g>`;
}
