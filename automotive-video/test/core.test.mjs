import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  importAsset,
  searchAssets,
  verifyLibrary,
  svgInfo,
  writeJson,
  readJson,
  findAsset,
  particlePoints,
} from "../src/library.mjs";
import {
  parseSrt,
  validateProject,
  demoProject,
  prepareProject,
} from "../src/project.mjs";
import { particles, renderSceneSvg, random } from "../src/visuals.mjs";
import { MOTIONS, SCENES } from "../src/catalog-data.mjs";
import { previewAssets, previewScene } from "../src/catalog-server.mjs";
import { parseAsrResult } from "../src/transcribe.mjs";

test("内置素材存在且摘要、身份元数据完整", () => {
  const r = verifyLibrary();
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.ok(r.count >= 19);
  assert.ok(searchAssets("车轮").some((a) => a.id === "part.wheel"));
  assert.ok(searchAssets("Tesla", { category: "logos" }).length);
  assert.equal(
    searchAssets("Tesla", { representation: "schematic" }).length,
    0,
  );
});
test("素材复制、版本冲突和原始文件保持", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-assets-"));
  try {
    const file = path.join(dir, "source.svg");
    const original =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>';
    fs.writeFileSync(file, original);
    const a = await importAsset({
      file,
      id: "test.wheel",
      tags: ["车轮"],
      representation: "schematic",
      libraryRoot: dir,
    });
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.equal(fs.readFileSync(path.join(dir, a.file), "utf8"), original);
    assert.deepEqual(
      await importAsset({
        file,
        id: "test.wheel",
        tags: ["车轮"],
        libraryRoot: dir,
      }),
      a,
    );
    fs.writeFileSync(file, original.replace('r="30"', 'r="31"'));
    await assert.rejects(
      importAsset({ file, id: "test.wheel", tags: ["车轮"], libraryRoot: dir }),
      /提升版本/,
    );
    const b = await importAsset({
      file,
      id: "test.wheel",
      version: "1.0.1",
      tags: ["车轮"],
      libraryRoot: dir,
    });
    assert.notEqual(a.sha256, b.sha256);
    assert.equal(fs.readFileSync(path.join(dir, a.file), "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("SVG 拒绝外部资源和脚本，避免预览依赖丢失", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-svg-"));
  try {
    const file = path.join(dir, "x.svg");
    for (const bad of [
      "<script>1</script>",
      '<image href="x.png"/>',
      '<style>@import "https://x";</style>',
    ]) {
      fs.writeFileSync(file, `<svg viewBox="0 0 100 100">${bad}</svg>`);
      assert.throws(() => svgInfo(file));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("SRT 解析保留真实时间，拒绝反向时间", () => {
  const c = parseSrt(
    "1\n00:00:01,250 --> 00:00:03,500\n汽车电池\n\n2\n00:00:03,500 --> 00:00:05,000\n驱动车轮",
  );
  assert.equal(c[0].start, 1.25);
  assert.equal(c[1].end, 5);
  assert.throws(() => parseSrt("1\n00:00:03,000 --> 00:00:01,000\n错误"));
});
test("每种动效可随机 seek，重复帧完全一致，跨帧有连续动作", () => {
  for (const { id } of MOTIONS) {
    const opts = {
      effect: id,
      width: 600,
      height: 340,
      density: 90,
      seed: "fixed",
    };
    const start = particles({ ...opts, time: 0 });
    const mid = particles({ ...opts, time: 2 });
    particles({ ...opts, time: 5 });
    assert.equal(particles({ ...opts, time: 2 }), mid, id);
    assert.notEqual(start, mid, id);
    assert.doesNotMatch(mid, /NaN|undefined/);
  }
  assert.notEqual(random("a", 1), random("b", 1));
});
test("所有场景横竖版均能渲染且不产生无效值", () => {
  const assets = previewAssets();
  for (const { id } of SCENES)
    for (const [w, h] of [
      [1280, 720],
      [720, 1280],
    ]) {
      const s = previewScene("scenes", id);
      const a = renderSceneSvg(s, 30, 30, w, h, assets);
      assert.match(a, /^<svg/);
      assert.doesNotMatch(a, /NaN|undefined/);
      assert.equal(renderSceneSvg(s, 30, 30, w, h, assets), a);
    }
});
test("时间线拒绝越界与短素材，不静默循环或改变母版", () => {
  const p = {
    schemaVersion: 1,
    width: 1280,
    height: 720,
    fps: 30,
    duration: 10,
    preserveMaster: true,
    master: {},
    clips: [],
    captions: [],
  };
  assert.equal(validateProject(p).ok, true);
  assert.equal(validateProject({ ...p, preserveMaster: false }).ok, false);
  assert.equal(
    validateProject({
      ...p,
      clips: [
        {
          id: "bad",
          kind: "video",
          start: 1,
          end: 5,
          sourceIn: 0,
          sourceOut: 2,
        },
      ],
    }).ok,
    false,
  );
  assert.equal(
    validateProject({
      ...p,
      captions: [{ id: "bad", start: 9, end: 12, text: "越界" }],
    }).ok,
    false,
  );
});
test("项目快照重复准备一致，损坏快照会被拒绝", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-lock-"));
  try {
    const file = demoProject(dir);
    const a = prepareProject(file);
    const lock = readJson(path.join(dir, "assets.lock.json"));
    assert.ok(lock.assets.length >= 5);
    assert.ok(
      lock.assets.every((x) => fs.existsSync(path.join(dir, x.snapshot))),
    );
    const b = prepareProject(file);
    assert.deepEqual(a.props, b.props);
    const first = lock.assets[0];
    fs.appendFileSync(path.join(dir, first.snapshot), "modified");
    assert.throws(() => prepareProject(file), /快照损坏/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("云端响应按毫秒转秒，不编造词级时间", () => {
  const result = parseAsrResult({
    result: {
      utterances: [
        {
          start_time: 100,
          end_time: 900,
          text: "电机",
          words: [{ start_time: 100, end_time: 400, text: "电" }],
        },
      ],
    },
  });
  assert.equal(result[0].start, 0.1);
  assert.equal(result[0].words[0].end, 0.4);
  assert.throws(() => parseAsrResult({}));
});
test("Logo 填充与轮廓采样可分别复用，聚合目标确定", () => {
  const a = findAsset("logo.tesla"),
    fill = particlePoints(a),
    edge = particlePoints(a, { edge: true });
  assert.ok(fill.length > edge.length);
  assert.ok(edge.length > 20);
  assert.deepEqual(fill, particlePoints(a));
  const svg = particles({
    effect: "dissolve",
    time: 3,
    duration: 6,
    targetPoints: fill,
    density: 200,
    intensity: 1,
  });
  assert.doesNotMatch(svg, /NaN|undefined/);
  assert.equal(
    svg,
    particles({
      effect: "dissolve",
      time: 3,
      duration: 6,
      targetPoints: fill,
      density: 200,
      intensity: 1,
    }),
  );
});
