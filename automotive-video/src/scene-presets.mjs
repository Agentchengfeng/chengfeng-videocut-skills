export const SCENE_PRESETS = [
  {
    id: "sensor.cut-in.v1",
    type: "sensor",
    name: "相邻车辆并线",
    title: "旁车并线，感知如何跟上？",
    description: "旁车进入示意感知区，识别框出现并随目标移动。",
    previewTime: 3.5,
  },
  {
    id: "sensor.occlusion.v1",
    type: "sensor",
    name: "行人从遮挡后出现",
    title: "行人何时出现在视野里？",
    description: "路侧车辆遮挡视线，行人离开遮挡后进入观察范围。",
    previewTime: 4.4,
  },
  {
    id: "sensor.coverage.v1",
    type: "sensor",
    name: "前向与侧向覆盖",
    title: "前方与侧方看哪里？",
    description: "在同一俯视路况中，依次突出前向和侧向示意区域。",
    previewTime: 4.1,
  },
  {
    id: "suspension.bump.v1",
    type: "suspension",
    name: "驶过减速带",
    title: "车轮上抬，车身怎样响应？",
    description: "前轮压缩、车身响应、后轮通过、车身回稳。",
    previewTime: 1.65,
  },
  {
    id: "energy.drive.v1",
    type: "energy",
    name: "驱动能量流",
    title: "电能怎样驱动车轮？",
    description: "从电池经过电机，沿底盘路径到达驱动轮。",
    previewTime: 3.4,
  },
  {
    id: "energy.regen.v1",
    type: "energy",
    name: "回收能量流",
    title: "减速时，能量流向哪里？",
    description: "从车轮经电机回到电池，方向与亮起顺序同步反转。",
    previewTime: 3.4,
  },
  {
    id: "compare.baseline.v1",
    type: "compare",
    name: "同基线对比",
    title: "同一基线，看清轮廓差异",
    description: "同构图依次突出两张素材，竖版上下排列。",
    previewTime: 4.5,
  },
];

const topCar = "vehicle.documentary.top";
const sensorSlots = {
  ego: [topCar, "topVehicle", "自车"],
  targetVehicle: [topCar, "topVehicle", "目标车"],
};
const slotDefinitions = {
  "sensor.cut-in.v1": sensorSlots,
  "sensor.occlusion.v1": {
    ego: sensorSlots.ego,
    targetVehicle: [topCar, "topVehicle", "遮挡车辆"],
  },
  "sensor.coverage.v1": sensorSlots,
  "suspension.bump.v1": { rig: ["vehicle.sedan.side", "rig", "分层车辆"] },
  "energy.drive.v1": {
    battery: ["part.battery.documentary", "part", "电池"],
    motor: ["part.motor", "part", "电机"],
    wheel: ["part.wheel.documentary", "part", "驱动轮"],
  },
  "compare.baseline.v1": {
    left: ["vehicle.sedan.side", "object", "方案 A"],
    right: ["vehicle.suv.side", "object", "方案 B"],
  },
};
slotDefinitions["energy.regen.v1"] = slotDefinitions["energy.drive.v1"];

export function findScenePreset(id) {
  return SCENE_PRESETS.find((preset) => preset.id === id);
}

export function presetSlots(id) {
  return slotDefinitions[id];
}

export function validatePresetConfig(scene) {
  const preset = findScenePreset(scene.preset);
  if (!preset || scene.kind !== "scene" || preset.type !== scene.type)
    throw Error(`未知或不匹配的场景预设 ${scene.preset}`);
  if (
    scene.assetSlots !== undefined &&
    (!scene.assetSlots ||
      typeof scene.assetSlots !== "object" ||
      Array.isArray(scene.assetSlots))
  )
    throw Error("assetSlots 需要是命名素材对象");
  for (const slot of Object.keys(scene.assetSlots ?? {})) {
    if (!Object.hasOwn(presetSlots(preset.id), slot))
      throw Error(`预设 ${preset.id} 没有素材位 ${slot}`);
  }
  if (
    preset.type === "compare" &&
    scene.assetIds !== undefined &&
    !Array.isArray(scene.assetIds)
  )
    throw Error("对比场景的 assetIds 需要是数组");
  for (const [slot, id] of Object.entries(sceneSlotIds(scene))) {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,100}$/.test(id))
      throw Error(`素材位 ${slot} 需要有效的素材 ID`);
  }
}

export function sceneSlotIds(scene) {
  const slots = presetSlots(scene.preset);
  const shorthand = scene.type === "compare" ? scene.assetIds : [scene.assetId];
  return Object.fromEntries(
    Object.entries(slots).map(([name, [fallback]], index) => [
      name,
      scene.assetSlots?.[name] ?? shorthand?.[index] ?? fallback,
    ]),
  );
}

export const slotTypes = {
  topVehicle: "标为 top 视角的俯视车辆 SVG 或图片",
  rig: "由车身、车轮和轮心组成的车辆 rig",
  part: "归入 parts 的零件 SVG 或图片",
  object: "SVG、图片或车辆 rig",
};

export function acceptsSceneAsset(type, asset) {
  const image = asset?.kind === "svg" || asset?.kind === "image";
  if (type === "topVehicle")
    return (
      image &&
      !asset.rig &&
      asset.view === "top" &&
      asset.category === "vehicles"
    );
  if (type === "rig") {
    const centers = asset?.rig?.wheelCenters;
    return Boolean(centers && centers[0][0] !== centers[1][0]);
  }
  if (type === "object") return image;
  return type === "part" && image && !asset.rig && asset.category === "parts";
}

export function validateSceneAssets(scene, assets) {
  for (const [name, id] of Object.entries(sceneSlotIds(scene))) {
    const [, type, label] = presetSlots(scene.preset)[name];
    if (!Object.hasOwn(assets, id))
      throw Error(`素材位 ${label}（${name}）找不到素材 ${id}`);
    if (!acceptsSceneAsset(type, assets[id]))
      throw Error(
        `素材位 ${label}（${name}）需要${slotTypes[type]}，收到 ${id}`,
      );
  }
}
