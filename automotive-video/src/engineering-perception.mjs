import {
  between,
  box,
  callout,
  centered,
  fitMedia,
  linePoints,
  mix,
  palette,
  status,
} from "./engineering-drawing.mjs";
import { clamp } from "./svg-primitives.mjs";

function roadLayout(portrait) {
  const width = portrait ? 900 : 1050;
  const height = portrait ? 1120 : 440;
  const road = portrait ? box(42, 125, 816, 976) : box(278, 5, 750, 426);
  const carHeight = portrait ? 226 : 139;
  return {
    width,
    height,
    road,
    carHeight,
    ego: { x: road.x + road.w * 0.25, y: road.y + road.h * 0.77 },
    text: portrait ? [44, 38] : [5, 131],
  };
}

function drawRoad(road, phase) {
  const { x, y, w, h } = road;
  const mid = x + w / 2;
  const dash = h / 8;
  return `<g data-role="road"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${palette.road}"/><path d="M${x} ${y}h${w}v${h}H${x}Z" fill="none" stroke="${palette.subtle}" stroke-width="2"/><path d="M${x + 15} ${y}v${h}M${x + w - 15} ${y}v${h}" stroke="${palette.line}" stroke-width="2"/><path d="M${mid} ${y}v${h}" stroke="#b0b8b8" stroke-opacity=".65" stroke-width="3" stroke-dasharray="${dash * 0.58} ${dash * 0.42}" stroke-dashoffset="${-phase * dash * 2.5}"/></g>`;
}

function frontZone(layout) {
  const { ego, road, carHeight } = layout;
  const origin = [ego.x, ego.y - carHeight * 0.49];
  const top = road.y + road.h * 0.055;
  const left = ego.x - road.w * 0.19;
  const right = ego.x + road.w * 0.4;
  const points = [
    [origin[0] - 9, origin[1]],
    [left, top],
    [right, top],
    [origin[0] + 9, origin[1]],
  ];
  return {
    origin,
    points,
    depth: (x, y) => {
      const span = (origin[1] - y) / (origin[1] - top);
      if (span < 0 || span > 1) return -1;
      return Math.min(
        x - mix(origin[0] - 9, left, span),
        mix(origin[0] + 9, right, span) - x,
      );
    },
  };
}

function drawZone(points, active) {
  return `<polygon data-role="coverage" points="${linePoints(points)}" fill="${palette.info}" fill-opacity="${active ? ".13" : ".035"}" stroke="${palette.info}" stroke-opacity="${active ? ".8" : ".27"}" stroke-width="${active ? 2 : 1}" stroke-dasharray="7 5"/>`;
}

function bracket(w, h, color) {
  const x = -w / 2,
    y = -h / 2;
  const c = Math.min(15, w * 0.23);
  return `<path data-role="tracking-box" d="M${x} ${y + c}v${-c}h${c} M${-x - c} ${y}h${c}v${c} M${-x} ${-y - c}v${c}h${-c} M${x + c} ${-y}h${-c}v${-c}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function drawCar(asset, { x, y, h, angle = 0, color, role, opacity = 1 }) {
  const w = h * 0.57;
  return `<g data-role="${role}" transform="translate(${x} ${y}) rotate(${angle})">${fitMedia(asset, centered(0, 0, w, h), { opacity })}${color ? bracket(w + 10, h + 8, color) : ""}</g>`;
}

function trackLink(origin, destination, color) {
  return `<path data-role="track-link" d="M${origin.join(" ")}L${destination.join(" ")}" stroke="${color}" stroke-opacity=".72" stroke-width="2" stroke-dasharray="4 6"/>`;
}

function acquisition(x, y, depth) {
  const phase = clamp(depth / 38);
  if (phase >= 1) return "";
  return `<circle cx="${x}" cy="${y}" r="${13 + 27 * phase}" fill="none" stroke="${palette.event}" stroke-width="2" opacity="${1 - phase}"/>${[0, 1, 2, 3].map((i) => `<circle cx="${x + Math.cos((i * Math.PI) / 2) * (22 + 28 * phase)}" cy="${y + Math.sin((i * Math.PI) / 2) * (22 + 28 * phase)}" r="2.5" fill="${palette.event}" opacity="${1 - phase}"/>`).join("")}`;
}

function drawEgo(asset, layout, zone) {
  const { ego, carHeight, road } = layout;
  const y = Math.min(ego.y + carHeight * 0.61, road.y + road.h - 13);
  return `${drawCar(asset, { ...ego, h: carHeight, role: "ego" })}<circle cx="${zone.origin[0]}" cy="${zone.origin[1]}" r="4.5" fill="${palette.info}" stroke="${palette.background}" stroke-width="2"/>${callout("自车", [ego.x - carHeight * 0.23, ego.y + carHeight * 0.25], [ego.x - carHeight * 0.64, y], { anchor: "end", size: 21 })}`;
}

function cutIn(layout, zone, targetAsset, progress) {
  const { road, carHeight } = layout;
  const movement = between(progress, 0.12, 0.76);
  const x = mix(
    road.x + road.w * 0.75,
    layout.ego.x + road.w * 0.023,
    movement,
  );
  const y = road.y + road.h * mix(0.43, 0.31, movement);
  const h = carHeight * 0.89;
  const depth = zone.depth(x, y);
  const tracked = depth >= 0;
  const acquired = tracked && depth < 38;
  const color = acquired ? palette.event : palette.info;
  const labelX = x + h * 0.49;
  const car = drawCar(targetAsset, {
    x,
    y,
    h,
    angle: -18 * Math.sin(movement * Math.PI),
    color: tracked ? color : undefined,
    role: "target",
    opacity: tracked ? 1 : 0.79,
  });
  return {
    diagram: `${drawZone(zone.points, true)}${tracked ? trackLink(zone.origin, [x, y + h * 0.51], color) : ""}${car}${acquired ? acquisition(x, y, depth) : ""}${callout("并线车辆", [x + h * 0.24, y - h * 0.26], [labelX, y - h * 0.5], { color: tracked ? color : palette.muted, size: 22 })}`,
    step: tracked
      ? acquired
        ? ["02", "进入感知区", "识别框出现", color]
        : ["03", "持续跟踪", "识别框跟随旁车", color]
      : ["01", "邻车靠近", "旁车仍在区域外", palette.muted],
  };
}

function blockedRay(origin, target, { x, y, w, h }) {
  const [ox, oy] = origin;
  const [tx, ty] = target;
  const t1 = clamp((oy - (y + h)) / (oy - ty));
  const t2 = clamp((oy - y) / (oy - ty));
  const a = mix(ox, tx, t1),
    b = mix(ox, tx, t2);
  return ty < y + h && oy > y && Math.max(a, b) >= x && Math.min(a, b) <= x + w;
}

function pedestrian(x, y, progress, visible, color) {
  const stride = Math.sin(progress * Math.PI * 11) * 9;
  return `<g data-role="pedestrian" opacity="${visible ? 1 : 0}" transform="translate(${x} ${y})"><circle cy="-13" r="7" fill="${palette.ink}"/><path d="M0-5V8M-10 3 0-3 10 3M${-stride} 21 0 7 ${stride} 21" fill="none" stroke="${palette.ink}" stroke-width="5" stroke-linecap="round"/>${bracket(32, 53, color)}</g>`;
}

function occlusion(layout, zone, targetAsset, progress) {
  const { road, carHeight } = layout;
  const motion = between(progress, 0.19, 0.83);
  const coverX = layout.ego.x + road.w * 0.13;
  const coverY = road.y + road.h * 0.47;
  const coverH = carHeight * 1.04;
  const cover = centered(coverX, coverY, coverH * 0.48, coverH * 0.95);
  const x = mix(coverX + cover.w * 0.46, layout.ego.x - road.w * 0.087, motion);
  const y = cover.y - carHeight * 0.16;
  const visible =
    !blockedRay(zone.origin, [x, y], cover) && zone.depth(x, y) >= 0;
  const color = visible ? palette.event : palette.muted;
  const stripes = Array.from(
    { length: 7 },
    (_, index) =>
      `<rect x="${road.x + road.w * 0.04 + index * road.w * 0.132}" y="${y - 19}" width="${road.w * 0.073}" height="38" rx="2"/>`,
  ).join("");
  return {
    diagram: `<g fill="#98a7ab" opacity=".22">${stripes}</g>${drawZone(zone.points, true)}${visible ? trackLink(zone.origin, [x, y], color) : ""}${pedestrian(x, y, progress, visible, color)}${drawCar(targetAsset, { x: coverX, y: coverY, h: coverH, role: "occluder", opacity: 0.79 })}${callout("遮挡车辆", [coverX + cover.w / 2, coverY], [coverX + cover.w * 1.5, coverY + 29], { color: palette.muted })}${visible ? callout("行人", [x - 15, y - 6], [x - 39, y - 30], { color, anchor: "end" }) : ""}`,
    step: visible
      ? ["02", "行人出现", "视线穿过空出的区域", color]
      : ["01", "视线被遮挡", "前方车辆挡住行人", color],
  };
}

function coverage(layout, zone, targetAsset, progress) {
  const { ego, road, carHeight } = layout;
  const side = progress >= 0.49;
  const front = { x: ego.x, y: road.y + road.h * 0.26, h: carHeight * 0.72 };
  const adjacent = {
    x: road.x + road.w * 0.76,
    y: ego.y - carHeight * 0.16,
    h: carHeight * 0.8,
  };
  const sideOrigin = [ego.x + carHeight * 0.22, ego.y - carHeight * 0.13];
  const sideZone = [
    sideOrigin,
    [road.x + road.w * 0.96, adjacent.y - carHeight * 0.62],
    [road.x + road.w * 0.96, adjacent.y + carHeight * 0.52],
    [sideOrigin[0], sideOrigin[1] + 13],
  ];
  return {
    diagram: `${drawZone(zone.points, !side)}${drawZone(sideZone, side)}${drawCar(targetAsset, { ...front, role: "front-target", color: side ? undefined : palette.info, opacity: side ? 0.72 : 1 })}${drawCar(targetAsset, { ...adjacent, role: "side-target", color: side ? palette.info : undefined, opacity: side ? 1 : 0.72 })}${side ? callout("侧向覆盖", [adjacent.x + carHeight * 0.26, adjacent.y - 15], [road.x + road.w - 31, adjacent.y - carHeight * 0.63], { anchor: "end" }) : callout("前向覆盖", [front.x + carHeight * 0.22, front.y], [front.x + carHeight * 0.62, front.y - carHeight * 0.42])}`,
    step: side
      ? ["02", "侧向覆盖", "关注相邻车道", palette.info]
      : ["01", "前向覆盖", "关注行驶方向", palette.info],
  };
}

export function perception(preset, portrait, progress, assets) {
  const layout = roadLayout(portrait);
  const { width, height, road, text } = layout;
  const zone = frontZone(layout);
  const draw = {
    "sensor.cut-in.v1": cutIn,
    "sensor.occlusion.v1": occlusion,
    "sensor.coverage.v1": coverage,
  }[preset.id];
  const {
    diagram,
    step: [index, title, description, color],
  } = draw(layout, zone, assets.targetVehicle, progress);
  return [
    `${drawRoad(road, progress)}${diagram}${drawEgo(assets.ego, layout, zone)}${status(index, title, description, ...text, { color, maxWidth: portrait ? 780 : 247, scale: portrait ? 1.35 : 1 })}`,
    width,
    height,
  ];
}
