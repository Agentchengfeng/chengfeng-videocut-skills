import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  allAssets,
  findAsset,
  libraryPath,
  assetData,
  particlePoints,
} from "./library.mjs";
import { SCENES, MOTIONS, THEMES } from "./catalog-data.mjs";
import { renderSceneSvg } from "./visuals.mjs";
import { captionSafeBottom } from "./engineering-drawing.mjs";
import {
  SCENE_PRESETS,
  acceptsSceneAsset,
  presetSlots,
  sceneSlotIds,
  validatePresetConfig,
  validateSceneAssets,
} from "./scene-presets.mjs";

export function previewAssets() {
  const map = {};
  for (const a of allAssets())
    if (a.kind !== "video") map[a.id] = { ...a, data: assetData(a) };
  return map;
}
export function previewScene(kind, id, extra = {}) {
  if (kind === "motions")
    return {
      id,
      type: "motion",
      motion: id,
      duration: 6,
      params: { density: 100, intensity: 0.7 },
      ...extra,
    };
  if (kind === "scenes") {
    const s = SCENES.find((s) => s.id === id);
    if (!s) throw Error("场景不存在");
    const preset = extra.preset ?? SCENE_PRESETS.find((p) => p.type === id)?.id;
    if (preset !== undefined) {
      const scene = {
        id,
        kind: "scene",
        type: id,
        duration: 6,
        ...extra,
        preset,
      };
      validatePresetConfig(scene);
      return scene;
    }
    return {
      id,
      type: id,
      title: s.name,
      subtitle: s.description,
      duration: 6,
      motion: "ambient",
      ...extra,
    };
  }
  const a = findAsset(id);
  return {
    id,
    type: "asset",
    assetId: id,
    title: a.name,
    subtitle:
      a.representation === "schematic"
        ? "通用二维原理示意"
        : a.brand || a.category,
    duration: 6,
    motion: "ambient",
    ...extra,
  };
}
export function previewSceneAssets(scene) {
  if (scene.preset === undefined) return previewAssets();
  const assets = Object.create(null);
  function load(id, version) {
    if (assets[id]) {
      if (version && assets[id].version !== version)
        throw Error(`同一场景的 rig 部件版本冲突 ${id}`);
      return;
    }
    const asset = findAsset(id, version);
    assets[id] = {
      ...asset,
      data: asset.kind === "video" ? "" : assetData(asset),
    };
    if (asset.rig) {
      load(asset.rig.body, asset.rig.bodyVersion);
      load(asset.rig.wheel, asset.rig.wheelVersion);
    }
  }
  for (const id of Object.values(sceneSlotIds(scene))) load(id);
  validateSceneAssets(scene, assets);
  return assets;
}
function serveFile(req, res, file, type) {
  const stat = fs.statSync(file);
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]),
      end = Math.min(
        range[2] ? Number(range[2]) : stat.size - 1,
        stat.size - 1,
      );
    if (start >= stat.size || end < start) {
      res.writeHead(416);
      res.end();
      return;
    }
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(file).pipe(res);
  }
}
export function startCatalog(port = 3211) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      if (url.pathname === "/") {
        serveFile(
          req,
          res,
          path.join(ROOT, "src/catalog.html"),
          "text/html; charset=utf-8",
        );
        return;
      }
      if (url.pathname === "/api/catalog") {
        const assets = allAssets();
        const latest = new Map();
        for (const asset of assets) {
          const existing = latest.get(asset.id);
          if (
            !existing ||
            asset.version.localeCompare(existing.version, undefined, {
              numeric: true,
            }) > 0
          )
            latest.set(asset.id, asset);
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            product: "automotive-video-kit",
            assets,
            motions: MOTIONS,
            scenes: SCENES,
            themes: THEMES,
            presets: SCENE_PRESETS.map((preset) => ({
              ...preset,
              slots: Object.entries(presetSlots(preset.id)).map(
                ([name, [defaultId, type, label]]) => ({
                  name,
                  defaultId,
                  label,
                  choices: [...latest.values()]
                    .filter((asset) => acceptsSceneAsset(type, asset))
                    .map(({ id, name }) => ({ id, name })),
                }),
              ),
            })),
          }),
        );
        return;
      }
      if (url.pathname === "/api/preview") {
        const kind = url.searchParams.get("kind") || "scenes",
          id = url.searchParams.get("id") || "suspension";
        const time = Number(url.searchParams.get("time") || 2);
        const width = Number(url.searchParams.get("width") || 960),
          height = Number(url.searchParams.get("height") || 540);
        if (
          !Number.isFinite(time) ||
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 64 ||
          width > 1920 ||
          height < 64 ||
          height > 1920
        )
          throw Error("预览参数无效");
        const color = url.searchParams.get("color");
        if (color && !/^#[a-f\d]{6}$/i.test(color)) throw Error("颜色格式错误");
        const preset = url.searchParams.get("preset");
        const slotJson = url.searchParams.get("assetSlots");
        if ((preset || slotJson) && kind !== "scenes")
          throw Error("场景预设只用于场景预览");
        const scene = previewScene(kind, id, {
          ...(preset !== null ? { preset } : {}),
          ...(slotJson !== null ? { assetSlots: JSON.parse(slotJson) } : {}),
          theme: url.searchParams.get("theme") || "graphite",
          params: {
            density: Number(url.searchParams.get("density") || 80),
            intensity: Number(url.searchParams.get("intensity") || 0.5),
            speed: Number(url.searchParams.get("speed") || 1),
            ...(color ? { color } : {}),
            seed: "catalog-fixed",
          },
          transparent: url.searchParams.get("transparent") === "true",
        });
        if (url.searchParams.get("safeBottom") === "true")
          scene.safeBottom = scene.preset
            ? captionSafeBottom(width, height)
            : 0.2;
        if (slotJson !== null && scene.preset === undefined)
          throw Error("assetSlots 需要场景预设");
        const assets = previewSceneAssets(scene),
          target = url.searchParams.get("assetId");
        if (
          target &&
          kind === "motions" &&
          ["dissolve", "outline"].includes(id)
        ) {
          if (!assets[target]) throw Error("目标图形不存在或不是图片");
          scene.assetId = target;
          assets[target].particlePoints = {
            [id]: particlePoints(assets[target], { edge: id === "outline" }),
          };
        }
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "no-store");
        res.end(
          renderSceneSvg(
            scene,
            Math.round(time * 30),
            30,
            width,
            height,
            assets,
          ),
        );
        return;
      }
      if (url.pathname === "/thumbnail") {
        const a = findAsset(url.searchParams.get("id"));
        if (!a.preview) throw Error("没有独立缩略图");
        serveFile(req, res, libraryPath(a.preview), "image/jpeg");
        return;
      }
      if (url.pathname === "/asset") {
        const a = findAsset(
          url.searchParams.get("id"),
          url.searchParams.get("version") || undefined,
        );
        const file = libraryPath(a.file);
        const ext = path.extname(file).toLowerCase();
        const mime = {
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".mov": "video/quicktime",
        }[ext];
        serveFile(req, res, file, mime || "application/octet-stream");
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`汽车视觉组件库 http://127.0.0.1:${server.address().port}`),
  );
  return server;
}
