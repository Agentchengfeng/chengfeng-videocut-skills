#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  ROOT,
  LIBRARY,
  allAssets,
  searchAssets,
  importAsset,
  verifyLibrary,
  readJson,
  writeJson,
  probe,
  hashFile,
  findAsset,
  libraryPath,
  createRig,
} from "../src/library.mjs";
import {
  initProject,
  prepareProject,
  demoProject,
  validateProject,
  parseSrt,
} from "../src/project.mjs";
import {
  startCatalog,
  previewScene,
  previewSceneAssets,
} from "../src/catalog-server.mjs";
import { renderSceneSvg } from "../src/visuals.mjs";
import { SCENES, MOTIONS } from "../src/catalog-data.mjs";
import { SCENE_PRESETS, presetSlots } from "../src/scene-presets.mjs";
import { asrCredential, transcribeProject } from "../src/transcribe.mjs";
import { inspectRender } from "../src/inspect.mjs";

function args(argv) {
  const positional = [],
    options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      options[k] =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else positional.push(argv[i]);
  }
  return { positional, options };
}
const output = (value) => console.log(JSON.stringify(value, null, 2));
function fileOption(o, key) {
  if (!o[key] || o[key] === true) throw Error(`需要 --${key}`);
  return String(o[key]);
}

export async function renderProject(
  file,
  { out, transparent = false, still, scale = 1, allowOverwrite = false } = {},
) {
  const prepared = prepareProject(file),
    { props, dir } = prepared;
  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, renderMedia, renderStill } = await import(
    "@remotion/renderer"
  );
  const outputFile = path.resolve(
    out ||
      path.join(
        dir,
        "output",
        still !== undefined
          ? "frame.png"
          : transparent
            ? "final.webm"
            : "final.mp4",
      ),
  );
  if (fs.existsSync(outputFile) && !allowOverwrite)
    throw Error("输出已存在；使用新路径或显式 --overwrite");
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "src/index.jsx"),
    publicDir: path.join(dir, "media"),
  });
  const browserExecutable =
    process.env.AUTO_VIDEO_CHROME ||
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((f) => fs.existsSync(f)) ||
    null;
  const composition = await selectComposition({
    serveUrl,
    id: "AutoVideo",
    inputProps: props,
    browserExecutable,
  });
  if (still !== undefined) {
    await renderStill({
      serveUrl,
      composition,
      inputProps: props,
      output: outputFile,
      frame: Number(still),
      imageFormat: "png",
      browserExecutable,
      scale: Number(scale),
    });
    return { output: outputFile, frame: Number(still) };
  }
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: outputFile,
    browserExecutable,
    codec: transparent ? "vp9" : "h264",
    pixelFormat: transparent ? "yuva420p" : "yuv420p",
    imageFormat: transparent ? "png" : "jpeg",
    // The shared-memory path can tile the first captured frame during Chrome startup.
    disableSharedMemoryCapture: true,
    concurrency: 2,
    scale: Number(scale),
    onProgress: ({ progress }) => {
      const step = Math.floor(progress * 10);
      if (step !== last) {
        last = step;
        console.error(`render ${step * 10}%`);
      }
    },
  });
  const media = probe(outputFile);
  const p = props.project;
  if (
    Math.abs(media.duration - p.duration) > Math.max(1 / p.fps, 0.05) ||
    media.width !== Math.round(p.width * Number(scale)) ||
    media.height !== Math.round(p.height * Number(scale))
  )
    throw Error("输出与计划的尺寸或时长不一致");
  if (p.master?.hasAudio && !media.hasAudio) throw Error("输出缺少母版音轨");
  let alphaVerification;
  if (transparent) {
    const pixels = execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-c:v",
        "libvpx-vp9",
        "-i",
        outputFile,
        "-vf",
        "alphaextract",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
      ],
      { maxBuffer: media.width * media.height + 65536 },
    );
    let min = 255,
      max = 0;
    for (const n of pixels) {
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    if (min === 255) throw Error("输出没有透明区域，请同时设置项目与场景透明");
    alphaVerification = { status: "PASS", firstFrameAlphaRange: [min, max] };
  }
  const report = {
    output: outputFile,
    sha256: hashFile(outputFile),
    media,
    planned: {
      duration: p.duration,
      fps: p.fps,
      width: p.width,
      height: p.height,
    },
    masterPreserved: !!p.master,
    ...(alphaVerification ? { alphaVerification } : {}),
    technicalVerification: "PASS",
    visualVerification: "UNVERIFIED",
    humanListening: "UNVERIFIED",
    soundEffects: p.soundEffects?.length ? "planned-not-rendered" : "not-added",
    warnings: prepared.check.warnings,
  };
  writeJson(path.join(dir, "verification.json"), report);
  return report;
}
async function main() {
  const {
    positional: [command, ...rest],
    options: o,
  } = args(process.argv.slice(2));
  if (o.help || command === "help") {
    output(readJson(path.join(ROOT, "references/cli-help.json")));
    return;
  }
  if (command === "search") {
    output({
      assets: searchAssets(rest.join(" "), {
        category: o.category,
        brand: o.brand,
        view: o.view,
        representation: o.representation,
      }),
    });
    return;
  }
  if (command === "list") {
    output({
      assets: allAssets(),
      motions: MOTIONS,
      scenes: SCENES,
      presets: SCENE_PRESETS.map((preset) => ({
        ...preset,
        slots: Object.keys(presetSlots(preset.id)),
      })),
    });
    return;
  }
  if (command === "validate") {
    const report = o.project
      ? validateProject(readJson(o.project))
      : verifyLibrary();
    output(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === "import") {
    const file = rest[0] || fileOption(o, "file");
    output(
      await importAsset({
        ...o,
        file,
        id: fileOption(o, "id"),
        tags: o.tags ? String(o.tags).split(",") : ["待标注"],
        representation: o.representation || "unknown",
        source: o.source || "",
      }),
    );
    return;
  }
  if (command === "batch-import") {
    const dir = path.resolve(rest[0] || fileOption(o, "dir"));
    const imported = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        !item.isFile() ||
        !/\.(svg|png|jpe?g|webp|mp4|mov|webm)$/i.test(item.name)
      )
        continue;
      const file = path.join(dir, item.name);
      const sidecar = `${file}.asset.json`;
      const meta = fs.existsSync(sidecar) ? readJson(sidecar) : {};
      const fallback = `user.${hashFile(file).slice(0, 16)}`;
      imported.push(
        await importAsset({
          file,
          id: meta.id || fallback,
          name: meta.name || path.parse(item.name).name,
          tags: meta.tags || [path.parse(item.name).name, "待标注"],
          ...meta,
        }),
      );
    }
    output({ imported });
    return;
  }
  if (command === "fetch") {
    const url = new URL(rest[0] || fileOption(o, "url"));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("需要无凭据的 HTTP(S) 素材地址");
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`下载失败 HTTP ${response.status}`);
    const mime = response.headers.get("content-type")?.split(";")[0] || "";
    const extensions = {
      "image/svg+xml": ".svg",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm",
    };
    const ext = extensions[mime] || path.extname(url.pathname).toLowerCase();
    if (
      ![
        ".svg",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".mp4",
        ".mov",
        ".webm",
      ].includes(ext) ||
      mime === "text/html"
    )
      throw Error(
        "该链接不是支持的原始素材文件；网页/平台视频页面需先获取实际素材地址",
      );
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-video-fetch-"));
    try {
      const file = path.join(temp, `download${ext}`);
      const fd = fs.openSync(file, "wx");
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > 512 * 1024 * 1024)
            throw Error("素材超过 512 MB，请使用本地文件入库");
          fs.writeSync(fd, chunk);
        }
      } finally {
        fs.closeSync(fd);
      }
      output(
        await importAsset({
          ...o,
          file,
          id: fileOption(o, "id"),
          tags: o.tags ? String(o.tags).split(",") : ["待标注"],
          source: url.href,
          sourceType: "external-download",
          representation: o.representation || "unknown",
        }),
      );
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
    return;
  }
  if (command === "init") {
    output(
      initProject({
        video: fileOption(o, "video"),
        srt: o.srt,
        out: fileOption(o, "out"),
        title: o.title,
        width: o.width ? Number(o.width) : undefined,
        height: o.height ? Number(o.height) : undefined,
      }),
    );
    return;
  }
  if (command === "captions") {
    const file = path.resolve(rest[0] || fileOption(o, "project"));
    const p = readJson(file);
    p.captions = parseSrt(fs.readFileSync(fileOption(o, "srt"), "utf8"));
    p.status = "ready-for-scenes";
    const check = validateProject(p);
    if (!check.ok) throw Error(check.errors.join("\n"));
    writeJson(file, p);
    output(check);
    return;
  }
  if (command === "transcribe") {
    output(await transcribeProject(rest[0] || fileOption(o, "project")));
    return;
  }
  if (command === "rig-create") {
    output(
      await createRig({
        id: fileOption(o, "id"),
        name: o.name,
        body: fileOption(o, "body"),
        wheel: fileOption(o, "wheel"),
        front: fileOption(o, "front").split(",").map(Number),
        rear: fileOption(o, "rear").split(",").map(Number),
        radius: Number(fileOption(o, "radius")),
        version: o.version || "1.0.0",
        brand: o.brand || "",
        model: o.model || "",
      }),
    );
    return;
  }
  if (command === "prepare") {
    const r = prepareProject(rest[0] || fileOption(o, "project"), {
      refreshLock: o["refresh-lock"] === true,
    });
    output({ resolved: path.join(r.dir, "resolved-props.json"), ...r.check });
    return;
  }
  if (command === "render") {
    output(
      await renderProject(rest[0] || fileOption(o, "project"), {
        out: o.out,
        transparent: o.transparent === true,
        still: o.frame,
        scale: o.scale || 1,
        allowOverwrite: o.overwrite === true,
      }),
    );
    return;
  }
  if (command === "inspect-render") {
    output(
      inspectRender({
        projectFile: rest[0] || fileOption(o, "project"),
        video: o.video,
        out: o.out,
      }),
    );
    return;
  }
  if (command === "demo") {
    const file = demoProject(o.out || path.join(ROOT, "examples/documentary"));
    const r = prepareProject(file);
    output({
      project: file,
      resolved: path.join(r.dir, "resolved-props.json"),
      next: `node bin/auto-video.mjs render "${file}"`,
    });
    return;
  }
  if (command === "motion-project") {
    const id = rest[0] || "ambient";
    if (!MOTIONS.some((x) => x.id === id)) throw Error("动效 ID 不存在");
    const dir = path.resolve(fileOption(o, "out"));
    const duration = Number(o.duration || 6);
    const p = {
      schemaVersion: 1,
      id: `motion-${id}`,
      width: Number(o.width || 1280),
      height: Number(o.height || 720),
      fps: Number(o.fps || 30),
      duration,
      transparent: o.transparent === true,
      captions: [],
      clips: [
        {
          id,
          kind: "scene",
          type: "motion",
          motion: id,
          ...(o["asset-id"] ? { assetId: o["asset-id"] } : {}),
          start: 0,
          end: duration,
          transparent: o.transparent === true,
          theme: o.theme || "graphite",
          params: {
            density: Number(o.density || 80),
            speed: Number(o.speed || 1),
            intensity: Number(o.intensity || 0.6),
            ...(o.color ? { color: o.color } : {}),
            seed: String(o.seed || "auto"),
          },
        },
      ],
      soundEffects: [],
    };
    const check = validateProject(p);
    if (!check.ok) throw Error(check.errors.join("\n"));
    writeJson(path.join(dir, "project.json"), p);
    prepareProject(path.join(dir, "project.json"));
    output({ project: path.join(dir, "project.json") });
    return;
  }
  if (command === "previews") {
    const { Resvg } = await import("@resvg/resvg-js");
    const outputs = [];
    for (const [kind, entries] of [
      ["scenes", SCENES],
      ["motions", MOTIONS],
    ])
      for (const item of entries) {
        const scene = previewScene(kind, item.id);
        const time =
          SCENE_PRESETS.find(({ id }) => id === scene.preset)?.previewTime ?? 2;
        const svg = renderSceneSvg(
          scene,
          Math.round(time * 30),
          30,
          960,
          540,
          previewSceneAssets(scene),
        );
        const dest = path.join(LIBRARY, `previews/${kind}-${item.id}.png`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(
          dest,
          new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
        );
        outputs.push(dest);
      }
    output({ previews: outputs });
    return;
  }
  if (command === "catalog") {
    startCatalog(Number(o.port || 3211));
    return;
  }
  if (command === "doctor") {
    const checks = {
      node: process.version,
      library: verifyLibrary(),
      ffmpeg: false,
      ffprobe: false,
      chrome: fs.existsSync(
        process.env.AUTO_VIDEO_CHROME ||
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ),
      cloudTranscriptionConfigured: !!asrCredential(),
    };
    for (const bin of ["ffmpeg", "ffprobe"])
      try {
        execFileSync(bin, ["-version"], { stdio: "ignore" });
        checks[bin] = true;
      } catch {}
    output(checks);
    if (!checks.ffmpeg || !checks.ffprobe || !checks.library.ok)
      process.exitCode = 1;
    return;
  }
  output(readJson(path.join(ROOT, "references/cli-help.json")));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exitCode = 1;
  });
