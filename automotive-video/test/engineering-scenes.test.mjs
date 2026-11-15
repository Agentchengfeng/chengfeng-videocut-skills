import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  previewAssets,
  previewScene,
  previewSceneAssets,
  startCatalog,
} from "../src/catalog-server.mjs";
import { writeJson } from "../src/library.mjs";
import { prepareProject, validateProject } from "../src/project.mjs";
import { SCENE_PRESETS, sceneSlotIds } from "../src/scene-presets.mjs";
import { renderSceneSvg } from "../src/visuals.mjs";
import { captionSafeBottom } from "../src/engineering-drawing.mjs";

const frame = (
  scene,
  number,
  assets = previewSceneAssets(scene),
  size = [1280, 720],
) => renderSceneSvg(scene, number, 30, ...size, assets);
const forPreset = (id) =>
  previewScene("scenes", SCENE_PRESETS.find((p) => p.id === id).type, {
    preset: id,
  });
const project = (clip) => ({
  schemaVersion: 1,
  width: 1280,
  height: 720,
  fps: 30,
  duration: 6,
  clips: [clip],
  captions: [],
});

test("无 preset 的四类旧场景保留改版前固定帧", () => {
  const assets = previewAssets();
  const before = {
    sensor: "0a6f15c72cd85f225c591f15a1832327bb7e9e80fb0162c795e4db461a10a52f",
    suspension:
      "9f2e67ce74e1a82f9808281584a859366f87f97aafac91884a2536a8b27223c3",
    energy: "6021b32c5d2d740f7e80984c797033f9c185593aa6d48a9169c5c2f4078ee44d",
    compare: "be1574d3e7a3848e5ae5790dbe34e8281871fb8854c4da6cb8368e49966a2c73",
  };
  for (const [type, hash] of Object.entries(before)) {
    const scene = {
      id: type,
      type,
      title: "旧版示意",
      subtitle: "固定帧",
      theme: "ice",
      motion: "network",
      safeBottom: 0.2,
    };
    assert.equal(
      createHash("sha256")
        .update(frame(scene, 57, assets))
        .digest("hex"),
      hash,
      type,
    );
  }
});

test("七个预设可横竖渲染、随机访问和按片段时长重播", () => {
  for (const preset of SCENE_PRESETS) {
    const scene = forPreset(preset.id);
    const assets = previewSceneAssets(scene);
    for (const size of [
      [1280, 720],
      [720, 1280],
    ]) {
      const options = { ...scene, safeBottom: 0.2 };
      const middle = frame(options, 97, assets, size);
      const last = frame(options, 179, assets, size);
      const first = frame(options, 0, assets, size);
      assert.doesNotMatch(middle, /NaN|undefined|Infinity/, preset.id);
      assert.notEqual(last, first, preset.id);
      assert.equal(frame(options, 97, assets, size), middle, preset.id);
      assert.equal(
        frame({ ...options, duration: 2 }, 59, assets, size),
        last,
        preset.id,
      );
    }
  }
});

test("并线由进入覆盖区触发，识别框与目标车同一变换", () => {
  const scene = forPreset("sensor.cut-in.v1");
  const assets = previewSceneAssets(scene);
  const frames = Array.from({ length: 180 }, (_, n) => frame(scene, n, assets));
  const start = frames.findIndex((svg) =>
    svg.includes('data-role="tracking-box"'),
  );
  assert.ok(start > 60 && start < 125, start);
  assert.match(frames[start - 1], /旁车仍在区域外/);
  assert.match(frames[start], /进入感知区/);
  assert.match(frames[start + 24], /持续跟踪/);
  const target =
    /<g data-role="target" transform="([^"]+)"><image[^>]+><path data-role="tracking-box"/;
  assert.notEqual(frames[start].match(target)?.[1], undefined);
  assert.notEqual(
    frames[start].match(target)[1],
    frames[start + 24].match(target)[1],
  );
  const occlusion = forPreset("sensor.occlusion.v1");
  const blocker = previewSceneAssets(occlusion);
  assert.match(frame(occlusion, 0, blocker), /视线被遮挡/);
  assert.match(frame(occlusion, 145, blocker), /行人出现/);
});

test("悬架前后轮依次抬起，电驱与回收沿相反方向点亮", () => {
  const bump = forPreset("suspension.bump.v1");
  const assets = previewSceneAssets(bump);
  const wheelY = (svg, wheel) =>
    Number(
      svg.match(
        new RegExp(
          `data-role="${wheel}-wheel" transform="translate\\(\\d+ ([\\d.]+)\\)`,
        ),
      )[1],
    );
  const front = frame(bump, 44, assets);
  const rear = frame(bump, 134, assets);
  assert.ok(wheelY(front, "front") < wheelY(front, "rear") - 30);
  assert.ok(wheelY(rear, "rear") < wheelY(rear, "front") - 30);
  assert.match(frame(bump, 179, assets), /车身回稳/);
  const drive = forPreset("energy.drive.v1");
  const regen = forPreset("energy.regen.v1");
  assert.match(frame(drive, 0), /电池输出/);
  assert.match(frame(drive, 179), /驱动轮获得动力/);
  assert.match(frame(regen, 0), /车轮带动电机/);
  assert.match(frame(regen, 179), /能量回到电池/);
  assert.match(frame(drive, 90), /points="640,338 640,159"/);
  assert.match(frame(regen, 90), /points="640,159 640,338"/);
});

test("预览与项目共用素材校验，复制配置能进入项目并锁定替换后的素材", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-documentary-"));
  const server = startCatalog(0);
  try {
    if (!server.listening)
      await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const clip = {
      id: "sensor.occlusion.v1",
      kind: "scene",
      type: "sensor",
      preset: "sensor.occlusion.v1",
      start: 0,
      end: 6,
      assetSlots: {
        ego: "vehicle.documentary.top",
        targetVehicle: "vehicle.top",
      },
    };
    const file = path.join(dir, "project.json");
    writeJson(file, project(clip));
    const { props } = prepareProject(file);
    assert.equal(props.assets["vehicle.top"].view, "top");
    assert.equal(
      sceneSlotIds({ ...clip, assetId: "vehicle.top" }).ego,
      "vehicle.documentary.top",
    );
    assert.equal(
      sceneSlotIds({ ...clip, assetSlots: undefined, assetId: "vehicle.top" })
        .ego,
      "vehicle.top",
    );
    const request = new URLSearchParams({
      kind: "scenes",
      id: "sensor",
      preset: clip.preset,
      assetSlots: JSON.stringify(clip.assetSlots),
      time: "4.4",
      width: "1280",
      height: "720",
    });
    const valid = await fetch(`${origin}/api/preview?${request}`);
    assert.equal(valid.status, 200);
    assert.equal(
      await valid.text(),
      frame({ ...clip, duration: 6 }, 132, props.assets),
    );
    request.set("safeBottom", "true");
    const withCaptions = await fetch(`${origin}/api/preview?${request}`);
    const safeBottom = captionSafeBottom(1280, 720);
    assert.ok(safeBottom > 0.3);
    assert.equal(captionSafeBottom(720, 1280), 0.2);
    assert.equal(
      await withCaptions.text(),
      frame({ ...clip, duration: 6, safeBottom }, 132, props.assets),
    );
    for (const [id, error] of [
      ["vehicle.sedan.side", /俯视车辆/],
      ["test.absent", /找不到素材/],
    ]) {
      clip.assetSlots.ego = id;
      writeJson(file, project(clip));
      assert.throws(() => prepareProject(file), error);
      request.set("assetSlots", JSON.stringify(clip.assetSlots));
      const invalid = await fetch(`${origin}/api/preview?${request}`);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, error);
    }
    assert.match(
      validateProject(
        project({ ...clip, preset: "sensor.fake.v1" }),
      ).errors.join(),
      /未知或不匹配/,
    );
    assert.match(
      validateProject(
        project({ ...clip, assetSlots: { wheel: "part.wheel" } }),
      ).errors.join(),
      /没有素材位/,
    );
    assert.match(
      validateProject(
        project({ ...clip, preset: "energy.drive.v1" }),
      ).errors.join(),
      /未知或不匹配/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
