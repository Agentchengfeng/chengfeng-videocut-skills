#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  ROOT,
  LIBRARY,
  writeJson,
  readJson,
  hashFile,
  importAsset,
} from "../src/library.mjs";
import { initProject, prepareProject } from "../src/project.mjs";
import { renderProject } from "./auto-video.mjs";
import { transcribeProject } from "../src/transcribe.mjs";

const dir = fs.mkdtempSync(path.join(ROOT, "review/integration-"));
const id = `fixture.${path.basename(dir).toLowerCase()}`;
const source = path.join(dir, "synthetic-master.mp4");
const call = (cmd, args) =>
  execFileSync(cmd, args, { stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
const facts = [];
try {
  call("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=12",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=sin(2*PI*(440+440*floor(t/6))*t)*0.1:s=48000:d=12",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    source,
  ]);
  const originalHash = hashFile(source);
  const srt = path.join(dir, "captions.srt");
  fs.writeFileSync(
    srt,
    "1\n00:00:00,000 --> 00:00:03,000\n这是合成验证用的测试视频\n\n2\n00:00:03,000 --> 00:00:06,000\n原有音轨与主轨时长保持\n\n3\n00:00:06,000 --> 00:00:09,000\n字幕与二维画面按时间对齐\n\n4\n00:00:09,000 --> 00:00:12,000\n最后检查原视频与覆盖边界\n",
  );
  const videoAsset = await importAsset({
    file: source,
    id,
    name: "仅用于合成验证的生成测试视频",
    category: "test-fixture",
    representation: "test-fixture",
    tags: ["测试", "fixture"],
    source: "ffmpeg-generated",
    usage: "verification-only",
  });
  const result = initProject({
    video: source,
    srt,
    out: path.join(dir, "project"),
  });
  const p = readJson(result.project);
  p.clips = [
    {
      id: "energy",
      kind: "scene",
      type: "energy",
      start: 1,
      end: 4,
      title: "能量怎样传递",
      theme: "ice",
      motion: "grid",
      transition: "fade",
    },
    {
      id: "changed-vehicle",
      kind: "scene",
      type: "suspension",
      assetId: "vehicle.suv.side",
      start: 3.7,
      end: 7.5,
      title: "同一场景替换为 SUV",
      transition: "wipe",
    },
    {
      id: "image",
      kind: "image",
      assetId: "logo.tesla",
      start: 7.5,
      end: 9,
      fit: "contain",
      transition: "cut",
    },
    {
      id: "broll",
      kind: "video",
      assetId: id,
      start: 9,
      end: 11,
      sourceIn: 2,
      sourceOut: 4,
      fit: "cover",
      transition: "cut",
    },
  ];
  writeJson(result.project, p);
  prepareProject(result.project);
  // Remove only this test's own public entry and files. The project must render from its snapshot.
  const indexFile = path.join(LIBRARY, "user/index.json");
  const index = readJson(indexFile);
  index.assets = index.assets.filter((a) => a.id !== id);
  writeJson(indexFile, index);
  fs.rmSync(path.join(LIBRARY, "user", id), { recursive: true, force: true });
  const prepared = prepareProject(result.project);
  assert.ok(prepared.props.assets[id].snapshot);
  facts.push({
    check: "render-input-from-project-snapshot-after-public-asset-removal",
    status: "PASS",
  });
  const rendered = await renderProject(result.project, {
    out: path.join(dir, "finished.mp4"),
  });
  assert.equal(hashFile(source), originalHash);
  assert.equal(
    hashFile(path.join(dir, "project/media", p.master.file)),
    originalHash,
  );
  assert.equal(rendered.media.duration, 12);
  assert.equal(rendered.media.hasAudio, true);
  facts.push({
    check: "master-hash-duration-audio-track-preserved",
    status: "PASS",
  });
  function crossings(file, start) {
    const data = call("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(start),
      "-t",
      "0.5",
      "-i",
      file,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      "-",
    ]);
    let count = 0;
    for (let i = 4; i < data.length; i += 4)
      if (data.readFloatLE(i - 4) <= 0 && data.readFloatLE(i) > 0) count++;
    return count * 2;
  }
  const before = crossings(source, 2),
    after = crossings(path.join(dir, "finished.mp4"), 2),
    before2 = crossings(source, 8),
    after2 = crossings(path.join(dir, "finished.mp4"), 8);
  assert.ok(Math.abs(before - after) < 6);
  assert.ok(Math.abs(before2 - after2) < 6);
  facts.push({
    check: "two-tone-audio-continuity-through-visual-overlays",
    status: "PASS",
    frequencies: { source: [before, before2], output: [after, after2] },
  });
  for (const [i, t] of [0, 2, 5, 8, 10, 11.7].entries())
    call("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      path.join(dir, "finished.mp4"),
      "-frames:v",
      "1",
      "-y",
      path.join(dir, `frame-${i}.png`),
    ]);
  const asr = initProject({
    video: source,
    out: path.join(dir, "asr-contract"),
  });
  const old = process.env.VOLCENGINE_API_KEY;
  process.env.VOLCENGINE_API_KEY = "offline-test-key";
  try {
    let calls = 0;
    await transcribeProject(asr.project, {
      fetcher: async (url, req) => {
        calls++;
        assert.equal(req.headers["X-Api-Key"], "offline-test-key");
        const body = JSON.parse(req.body);
        assert.ok(body.audio.data.length > 100);
        return new Response(
          JSON.stringify({
            result: {
              utterances: [
                {
                  start_time: 0,
                  end_time: 1000,
                  text: "测试转录",
                  words: [{ start_time: 0, end_time: 500, text: "测试" }],
                },
              ],
            },
          }),
          { status: 200, headers: { "x-api-status-code": "20000000" } },
        );
      },
    });
    assert.equal(calls, 1);
    facts.push({
      check: "cloud-asr-request-and-response-contract-offline",
      status: "PASS",
      liveProvider: "NOT_RUN",
    });
  } finally {
    if (old === undefined) delete process.env.VOLCENGINE_API_KEY;
    else process.env.VOLCENGINE_API_KEY = old;
  }
  const report = {
    fixture: "synthetic; no user footage used",
    directory: dir,
    checks: facts,
    render: rendered,
    visualInspection: "PENDING",
    humanListening: "UNVERIFIED",
  };
  writeJson(path.join(ROOT, "review/integration-latest.json"), report);
  console.log(JSON.stringify(report, null, 2));
} finally {
  const indexFile = path.join(LIBRARY, "user/index.json");
  if (fs.existsSync(indexFile)) {
    const index = readJson(indexFile);
    index.assets = index.assets.filter((a) => a.id !== id);
    writeJson(indexFile, index);
  }
  fs.rmSync(path.join(LIBRARY, "user", id), { recursive: true, force: true });
}
