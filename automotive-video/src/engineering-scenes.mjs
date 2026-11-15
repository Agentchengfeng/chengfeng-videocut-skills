import {
  between,
  box,
  callout,
  centered,
  fitMedia,
  linePoints,
  mix,
  palette,
  rigDrawing,
  signalPath,
  stage,
  status,
  tireContactRadius,
  type,
} from "./engineering-drawing.mjs";
import { perception } from "./engineering-perception.mjs";
import { findScenePreset, sceneSlotIds } from "./scene-presets.mjs";
import { clamp } from "./svg-primitives.mjs";

function suspension(scene, portrait, progress, slots, assets) {
  const asset = slots.rig;
  const rig = asset.rig;
  const [w, h] = rig.viewBox;
  const [[fx, fy], [rx, ry]] = rig.wheelCenters;
  const dir = Math.sign(rx - fx);
  const wheelbase = Math.abs(rx - fx);
  const travel = mix(-0.48, 1.49, progress);
  const bumpX = fx + dir * travel * wheelbase;
  const amplitude = scene.params?.amplitude ?? 53;
  const liftAt = (x) =>
    amplitude * Math.exp(-(((x - bumpX) / (wheelbase * 0.13)) ** 2));
  const frontLift = liftAt(fx),
    rearLift = liftAt(rx);
  const delay = dir * wheelbase * 0.11;
  const bodyLift = (liftAt(fx + delay) + liftAt(rx + delay)) * 0.45;
  const angle =
    ((liftAt(fx + delay) - liftAt(rx + delay)) / wheelbase) * dir * 28;
  const contact = tireContactRadius(rig, assets);
  const groundAt = (x) =>
    mix(fy, ry, (x - fx) / (rx - fx)) + contact - liftAt(x);
  const roadPoints = Array.from({ length: 101 }, (_, i) => {
    const x = mix(-w * 0.06, w * 1.06, i / 100);
    return [x, groundAt(x)];
  });
  const step =
    travel < -0.22
      ? ["01", "接近减速带", "车轮即将接触起伏"]
      : travel < 0.07
        ? ["02", "前轮压缩", "车轮沿路面上抬"]
        : travel < 0.82
          ? ["03", "车身响应", "车身随悬架产生位移"]
          : travel < 1.19
            ? ["04", "后轮通过", "后轮依次上抬"]
            : ["05", "车身回稳", "车辆驶离减速带"];
  const active = travel >= -0.22 && travel < 1.19;
  const rearActive = travel >= 0.82;
  const activeX = rearActive ? rx : fx;
  const activeY = rearActive ? ry - rearLift : fy - frontLift;
  const highlight = active ? palette.event : palette.info;
  const coilTop =
    (rearActive ? ry : fy) -
    rig.wheelRadius * 1.35 -
    bodyLift +
    Math.tan((angle * Math.PI) / 180) * (activeX - (fx + rx) / 2);
  const coilBottom = activeY - rig.wheelRadius * 0.25;
  const coil = Array.from({ length: 9 }, (_, i) => [
    activeX +
      (i === 0 || i === 8 ? 0 : i % 2 ? -1 : 1) * rig.wheelRadius * 0.22,
    mix(coilTop, coilBottom, i / 8),
  ]);
  const scale = 890 / w;
  const diagramWidth = 1050;
  const diagramHeight = portrait ? 780 : 460;
  const rigY = portrait ? 250 : 69;
  const textPosition = portrait ? [54, 110] : [36, 36];
  const noteX = activeX + (activeX < w / 2 ? -1 : 1) * rig.wheelRadius * 1.9;
  const roadFill = `M${roadPoints[0].join(" ")} L${roadPoints
    .slice(1)
    .map((point) => point.join(" "))
    .join(" ")} L${roadPoints.at(-1)[0]} ${h + 45} H${roadPoints[0][0]}Z`;
  return [
    `${status(...step, ...textPosition, { color: highlight, maxWidth: 380 })}<g transform="translate(80 ${rigY}) scale(${scale})"><path d="${roadFill}" fill="${palette.road}"/><polyline points="${linePoints(roadPoints)}" fill="none" stroke="#9aafb9" stroke-width="3.5"/><path d="M${-w * 0.06} ${h + 28}H${w * 1.06}" stroke="${palette.subtle}" stroke-width="2" stroke-dasharray="10 8"/>${rigDrawing(asset, assets, { frontLift, rearLift, bodyLift, angle, roll: (((-travel * wheelbase) / rig.wheelRadius) * 180) / Math.PI })}${active ? `<polyline data-role="spring" points="${linePoints(coil)}" stroke="${highlight}" stroke-width="5" stroke-linejoin="round" fill="none"/><circle cx="${activeX}" cy="${activeY}" r="8" fill="${highlight}"/>${callout(rearActive ? "后轮" : "前悬架", [activeX, coilTop], [noteX, coilTop - rig.wheelRadius * 0.95], { anchor: activeX < w / 2 ? "end" : "start", color: highlight, size: 23 })}` : ""}</g>`,
    diagramWidth,
    diagramHeight,
  ];
}

function energy(preset, portrait, progress, slots) {
  const reverse = preset.id === "energy.regen.v1";
  const w = portrait ? 900 : 1050,
    h = portrait ? 950 : 460;
  const x = portrait ? 450 : 640;
  const y = portrait ? 155 : 12;
  const spacing = portrait ? 217 : 188;
  const half = portrait ? 267 : 232;
  const bottom = h - 33;
  const axle = portrait ? 390 : 159;
  const motor = [x, axle];
  const battery = [x, portrait ? 723 : 338];
  const wheels = [
    [x - spacing, axle],
    [x + spacing, axle],
  ];
  const part = progress < 0.32 ? 0 : progress < 0.65 ? 1 : 2;
  const focus = reverse ? 2 - part : part;
  const color = reverse ? palette.event : palette.info;
  const flow = (points, delay) =>
    signalPath(reverse ? points.toReversed() : points, progress - delay, color);
  const outline = `M${x - half + 68} ${y + 13}Q${x} ${y - 5} ${x + half - 68} ${y + 13}L${x + half} ${y + 65}V${bottom - 58}L${x + half - 64} ${bottom}H${x - half + 64}L${x - half} ${bottom - 58}V${y + 65}Z`;
  const nodes = [
    {
      asset: slots.battery,
      at: battery,
      size: portrait ? [330, 176] : [230, 114],
      name: "电池",
    },
    {
      asset: slots.motor,
      at: motor,
      size: portrait ? [194, 138] : [152, 103],
      name: "电机",
    },
    ...wheels.map((at) => ({
      asset: slots.wheel,
      at,
      size: portrait ? [73, 127] : [60, 94],
      name: "驱动轮",
    })),
  ];
  const parts = nodes
    .map(({ asset, at: [cx, cy], size: [nw, nh], name }, i) => {
      const selected = Math.min(i, 2) === focus;
      const labelY =
        i === 1 ? cy - nh / 2 - 16 : cy + nh / 2 + (portrait ? 35 : 25);
      return `<g data-role="energy-part" data-active="${selected}">${selected ? `<rect x="${cx - nw / 2 - 7}" y="${cy - nh / 2 - 7}" width="${nw + 14}" height="${nh + 14}" rx="12" fill="${color}" fill-opacity=".08" stroke="${color}" stroke-width="2"/>` : ""}${fitMedia(asset, centered(cx, cy, nw, nh))}${type(name, cx, labelY, { anchor: "middle", color: selected ? color : palette.muted, size: portrait ? 27 : 21, weight: 600 })}</g>`;
    })
    .join("");
  const descriptions = reverse
    ? [
        ["01", "车轮带动电机", "回收方向由轮端开始"],
        ["02", "电机发电", "能量沿底盘路径返回"],
        ["03", "能量回到电池", "电池接收回收的能量"],
      ]
    : [
        ["01", "电池输出", "能量从电池端出发"],
        ["02", "电机接力", "能量转化为驱动"],
        ["03", "驱动轮获得动力", "路径到达两侧车轮"],
      ];
  return [
    `<path d="${outline}" fill="${palette.panel}" stroke="${palette.line}" stroke-width="3"/><path d="M${x - half + 60} ${y + 56}V${bottom - 54}M${x + half - 60} ${y + 56}V${bottom - 54}M${x - half + 75} ${bottom - 34}H${x + half - 75}" stroke="${palette.subtle}" stroke-width="3"/>${flow([battery, motor], reverse ? 0.32 : 0)}${wheels.map((point) => flow([motor, point], reverse ? 0 : 0.32)).join("")}${parts}${status(...descriptions[part], ...(portrait ? [46, 43] : [15, 150]), { color, maxWidth: portrait ? 700 : 320 })}`,
    w,
    h,
  ];
}

function comparison(scene, portrait, progress, slots, assets) {
  const w = 1040,
    h = portrait ? 1160 : 440;
  const layout = portrait
    ? [box(58, 10, 924, 532), box(58, 576, 924, 532)]
    : [box(10, 20, 493, 392), box(537, 20, 493, 392)];
  const items = [slots.left, slots.right];
  const diagram = layout
    .map(({ x, y, w: panelWidth, h: panelHeight }, i) => {
      const asset = items[i];
      const local = between(
        progress,
        i === 0 ? 0 : 0.38,
        i === 0 ? 0.28 : 0.68,
      );
      const active = i === Number(progress >= 0.46);
      const color = active ? palette.info : palette.muted;
      const ground = y + panelHeight * 0.76;
      const center = x + panelWidth / 2;
      const height = panelHeight * 0.71;
      const offset = (1 - local) * 14;
      let art;
      if (asset.rig) {
        const [rw, rh] = asset.rig.viewBox;
        const baseline =
          Math.max(...asset.rig.wheelCenters.map(([, cy]) => cy)) +
          tireContactRadius(asset.rig, assets);
        const scale = Math.min((panelWidth - 36) / rw, height / rh);
        art = `<g transform="translate(${center - (rw * scale) / 2} ${ground - baseline * scale - offset}) scale(${scale})">${rigDrawing(asset, assets)}</g>`;
      } else {
        art = fitMedia(
          asset,
          box(x + 18, ground - height - offset, panelWidth - 36, height),
          { align: "bottom" },
        );
      }
      const name = scene.labels?.[i] ?? [slots.left.name, slots.right.name][i];
      const accentWidth = panelWidth * (0.2 + local * 0.8);
      const emphasis = active ? ' filter="url(#subject-edge)"' : "";
      return `<g data-role="compare-object" data-active="${active}"><path d="M${x} ${ground}H${x + panelWidth}" stroke="${palette.line}" stroke-width="2"/><path d="M${x} ${ground}h${accentWidth}" stroke="${color}" stroke-opacity="${active ? 0.9 : 0.43}" stroke-width="3"/><path d="M${x} ${ground - 10}v20 M${x + panelWidth} ${ground - 10}v20" stroke="${palette.muted}" stroke-width="2"/><g opacity="${mix(0.62, 1, local)}"${emphasis}>${art}</g>${type(i === 0 ? "A" : "B", x + 4, y + 36, { color, size: portrait ? 37 : 31, weight: 700 })}${type(name, center, ground + (portrait ? 63 : 47), { color, anchor: "middle", size: portrait ? 38 : 28, maxWidth: panelWidth - 32, weight: 600 })}</g>`;
    })
    .join("");
  const split = portrait ? "M58 558H982" : "M520 30V405";
  return [
    `<defs><filter id="subject-edge" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="2.4" result="expanded"/><feFlood flood-color="${palette.info}" flood-opacity=".62" result="ink"/><feComposite in="ink" in2="expanded" operator="in" result="edge"/><feMerge><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="${split}" stroke="${palette.subtle}" stroke-width="1.5"/>${diagram}`,
    w,
    h,
  ];
}

export function renderEngineeringScene(
  scene,
  frame,
  fps,
  width,
  height,
  assets,
) {
  const preset = findScenePreset(scene.preset);
  const slots = Object.fromEntries(
    Object.entries(sceneSlotIds(scene)).map(([name, id]) => [name, assets[id]]),
  );
  const layout = stage(scene, preset, width, height);
  const endFrame = Math.max(1, Math.round((scene.duration ?? 6) * fps) - 1);
  const progress = clamp(frame / endFrame);
  const draw = {
    sensor: () => perception(preset, layout.portrait, progress, slots),
    suspension: () =>
      suspension(scene, layout.portrait, progress, slots, assets),
    energy: () => energy(preset, layout.portrait, progress, slots),
    compare: () => comparison(scene, layout.portrait, progress, slots, assets),
  }[preset.type];
  return layout.wrap(...draw());
}
