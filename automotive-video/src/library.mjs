import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const LIBRARY = path.join(ROOT, "library");
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
};
export const hashFile = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const safeId = (value) => {
  if (!/^[a-z0-9][a-z0-9._-]{1,100}$/.test(value))
    throw Error("ID 只能包含小写字母、数字、点、下划线和短横线");
  return value;
};
export const libraryPath = (relative) => {
  const p = path.resolve(LIBRARY, relative);
  if (!p.startsWith(LIBRARY + path.sep)) throw Error("素材路径越出素材库");
  return p;
};
export function allAssets() {
  const built = fs.existsSync(path.join(LIBRARY, "index.json"))
    ? readJson(path.join(LIBRARY, "index.json")).assets
    : [];
  const user = fs.existsSync(path.join(LIBRARY, "user/index.json"))
    ? readJson(path.join(LIBRARY, "user/index.json")).assets
    : [];
  return [...built, ...user];
}
export function findAsset(id, version) {
  const matches = allAssets().filter(
    (a) => a.id === id && (!version || a.version === version),
  );
  if (!matches.length)
    throw Error(`找不到素材 ${id}${version ? "@" + version : ""}`);
  return matches.sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  )[0];
}
export function probe(file) {
  const p = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  const v = p.streams.find((s) => s.codec_type === "video");
  if (!v) throw Error("未找到画面流");
  const [n, d] = (v.avg_frame_rate || v.r_frame_rate || "30/1")
    .split("/")
    .map(Number);
  const fps = d && n ? n / d : 30;
  const duration = Number(v.duration || p.format.duration || 0);
  return {
    width: v.width,
    height: v.height,
    fps,
    duration,
    containerDuration: Number(p.format.duration || duration),
    frames: Number(v.nb_frames) || Math.round(duration * fps),
    hasAudio: p.streams.some((s) => s.codec_type === "audio"),
    codec: v.codec_name,
  };
}
export function svgInfo(file) {
  const svg = fs.readFileSync(file, "utf8");
  if (
    /<script\b|<foreignObject\b|\bon\w+\s*=|<!ENTITY|<!DOCTYPE|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(
      svg,
    )
  )
    throw Error("SVG 含脚本、外部引用或不支持的内容，请先转成自包含的静态 SVG");
  for (const match of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)/gi))
    if (!match[1].startsWith("#") && !match[1].startsWith("data:image/"))
      throw Error("SVG 引用外部文件，请先嵌入图片");
  if (/@import|url\(\s*['"]?(?:https?:|file:|\/)/i.test(svg))
    throw Error("SVG 样式引用外部资源");
  const vb = svg
    .match(/viewBox\s*=\s*["']([^"']+)/i)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = vb?.[2] || Number(svg.match(/\bwidth=["']([\d.]+)/)?.[1]);
  const height = vb?.[3] || Number(svg.match(/\bheight=["']([\d.]+)/)?.[1]);
  if (!width || !height) throw Error("SVG 需要有效 viewBox 或尺寸");
  return {
    width,
    height,
    groups: [...svg.matchAll(/<g\b[^>]*\bid=["']([^"']+)/g)].map((x) => x[1]),
  };
}
export function searchAssets(query = "", filters = {}) {
  const terms = query
    .toLowerCase()
    .trim()
    .split(/[\s,，]+/)
    .filter(Boolean);
  return allAssets()
    .filter((a) =>
      Object.entries(filters).every(
        ([k, v]) =>
          !v || String(a[k] ?? "").toLowerCase() === String(v).toLowerCase(),
      ),
    )
    .map((a) => {
      const hay = [
        a.id,
        a.name,
        a.category,
        a.brand,
        a.model,
        a.view,
        a.representation,
        ...a.tags,
        ...(a.aliases || []),
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { ...a, score };
    })
    .filter((a) => !terms.length || a.score === terms.length)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
}
export async function importAsset({
  file,
  id,
  name,
  category = "parts",
  tags = [],
  brand = "",
  model = "",
  year = "",
  view = "",
  representation = "unknown",
  source = "",
  sourceType = "user-import",
  usage = "unspecified",
  version = "1.0.0",
  libraryRoot = LIBRARY,
}) {
  safeId(id);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("version 必须是 x.y.z");
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
    throw Error("素材文件不存在");
  const ext = path.extname(file).toLowerCase();
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
    ].includes(ext)
  )
    throw Error("支持 SVG、PNG、JPEG、WebP、MP4、MOV、WebM");
  const video = [".mp4", ".mov", ".webm"].includes(ext);
  const metadata = ext === ".svg" ? svgInfo(absolute) : probe(absolute);
  const sha256 = hashFile(absolute);
  const indexFile = path.join(libraryRoot, "user/index.json");
  const index = fs.existsSync(indexFile)
    ? readJson(indexFile)
    : { schemaVersion: 1, assets: [] };
  const old = index.assets.find((a) => a.id === id && a.version === version);
  if (old) {
    if (old.sha256 === sha256) return old;
    throw Error("同 ID 和版本已有不同内容，请提升版本；不会覆盖旧项目素材");
  }
  const rel = `user/${id}/${version}/${sha256.slice(0, 12)}${ext}`;
  const dest = path.join(libraryRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(absolute, dest, fs.constants.COPYFILE_EXCL);
  const asset = {
    id,
    name: name || id,
    version,
    category,
    kind: video ? "video" : ext === ".svg" ? "svg" : "image",
    file: rel,
    sha256,
    brand,
    model,
    year,
    view,
    representation,
    source: { url: source, type: sourceType, usage },
    tags: Array.isArray(tags) ? tags : String(tags).split(","),
    ...metadata,
    capabilities: video
      ? ["trim", "cover", "contain"]
      : ["display", "translate", "scale", "fade"],
    colorPolicy: category === "logos" ? "locked" : "preserve",
  };
  if (video) {
    const preview = path.join(libraryRoot, `user/${id}/${version}/preview.jpg`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(Math.min(1, metadata.duration / 2)),
      "-i",
      dest,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-y",
      preview,
    ]);
    asset.preview = path.relative(libraryRoot, preview);
    asset.segments = [
      {
        in: 0,
        out: metadata.duration,
        description: "整段入库；需按实际画面进一步标注镜头",
      },
    ];
  }
  index.assets.push(asset);
  writeJson(indexFile, index);
  return asset;
}
export function verifyLibrary() {
  const errors = [];
  const seen = new Set();
  for (const a of allAssets()) {
    const key = `${a.id}@${a.version}`;
    if (seen.has(key)) errors.push(`重复 ${key}`);
    seen.add(key);
    try {
      safeId(a.id);
      if (hashFile(libraryPath(a.file)) !== a.sha256)
        errors.push(`摘要不一致 ${key}`);
      if (a.kind === "svg") svgInfo(libraryPath(a.file));
      if (!a.representation || !a.tags?.length)
        errors.push(`缺少用途信息 ${key}`);
    } catch (e) {
      errors.push(`${key}: ${e.message}`);
    }
  }
  return { ok: errors.length === 0, count: seen.size, errors };
}
export function assetData(a) {
  const file = libraryPath(a.file);
  if (hashFile(file) !== a.sha256)
    throw Error(`素材已变化：${a.id}@${a.version}`);
  const ext = path.extname(file).slice(1);
  const mime =
    a.kind === "svg"
      ? "image/svg+xml"
      : `image/${ext === "jpg" ? "jpeg" : ext}`;
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}
export async function createRig({
  id,
  name,
  body,
  wheel,
  front,
  rear,
  radius,
  version = "1.0.0",
  brand = "",
  model = "",
}) {
  safeId(id);
  if (id === body || id === wheel) throw Error("rig ID 与部件 ID 需要不同");
  const bodyAsset = findAsset(body),
    wheelAsset = findAsset(wheel);
  if (bodyAsset.kind === "video" || wheelAsset.kind === "video")
    throw Error("rig 部件需要图片或 SVG");
  if (
    ![front, rear].every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        p[0] >= 0 &&
        p[0] <= 1000 &&
        p[1] >= 0 &&
        p[1] <= 420,
    ) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 210
  )
    throw Error("锚点使用 1000×420 布局坐标；半径需要在 0–210 内");
  const rig = {
    body,
    wheel,
    bodyVersion: bodyAsset.version,
    wheelVersion: wheelAsset.version,
    viewBox: [1000, 420],
    wheelCenters: [front, rear],
    wheelRadius: radius,
  };
  const indexFile = path.join(LIBRARY, "user/index.json");
  const old = allAssets().find((a) => a.id === id && a.version === version);
  if (old) {
    if (JSON.stringify(old.rig) === JSON.stringify(rig)) return old;
    throw Error("相同 rig ID/版本已存在，请提升版本");
  }
  await importAsset({
    file: libraryPath(bodyAsset.file),
    id,
    name: name || id,
    version,
    category: "vehicles",
    tags: ["汽车", "分层", "侧视", "rig", brand, model].filter(Boolean),
    brand,
    model,
    view: "side",
    representation: bodyAsset.representation,
    source: bodyAsset.source.url || "user-composed",
    usage: bodyAsset.source.usage,
  });
  const index = readJson(indexFile);
  const entry = index.assets.find((a) => a.id === id && a.version === version);
  entry.rig = rig;
  entry.capabilities = ["display", "drive", "suspension", "wheel-rotate"];
  writeJson(indexFile, index);
  return entry;
}
const pointCache = new Map();
export function particlePoints(a, { edge = false } = {}) {
  const cacheKey = `${a.sha256}:${edge}`;
  if (pointCache.has(cacheKey)) return pointCache.get(cacheKey);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><image href="${a.data || assetData(a)}" width="160" height="160" preserveAspectRatio="xMidYMid meet"/></svg>`;
  const rendered = new Resvg(svg).render();
  const { pixels, width, height } = rendered;
  const points = [];
  const alpha = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height
      ? 0
      : pixels[(y * width + x) * 4 + 3];
  for (let y = 1; y < height - 1; y += 2)
    for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4;
      if (alpha(x, y) < 100) continue;
      if (
        edge &&
        [
          [-2, 0],
          [2, 0],
          [0, -2],
          [0, 2],
        ].every(([dx, dy]) => alpha(x + dx, y + dy) > 100)
      )
        continue;
      points.push({
        x: x / width,
        y: y / height,
        color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`,
      });
    }
  pointCache.set(cacheKey, points);
  return points;
}
