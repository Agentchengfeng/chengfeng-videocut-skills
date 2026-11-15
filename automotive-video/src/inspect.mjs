import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";
import { readJson, writeJson, probe, hashFile } from "./library.mjs";
import { esc } from "./visuals.mjs";

export function inspectRender({ projectFile, video, out }) {
  const p = readJson(path.resolve(projectFile)),
    dir = path.dirname(path.resolve(projectFile));
  const receipt = fs.existsSync(path.join(dir, "verification.json"))
    ? readJson(path.join(dir, "verification.json"))
    : null;
  const file = path.resolve(video || receipt?.output || "");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    throw Error("需要实际已导出的视频文件");
  const media = probe(file);
  const outputDir = path.resolve(out || path.join(dir, "review"));
  fs.mkdirSync(outputDir, { recursive: true });
  const last = Math.max(0, media.duration - 1 / media.fps);
  const requested = [0, last];
  for (const c of p.clips || []) {
    requested.push((c.start + c.end) / 2);
    if (c.start > 0)
      requested.push(Math.max(0, c.start - 1 / media.fps), c.start);
  }
  if (!p.clips?.length)
    requested.push(media.duration * 0.33, media.duration * 0.66);
  const unique = [
    ...new Set(
      requested.map((x) => Math.floor(Math.min(last, x) * 1000) / 1000),
    ),
  ].sort((a, b) => a - b);
  const times =
    unique.length > 24
      ? Array.from(
          { length: 24 },
          (_, i) => unique[Math.round((i * (unique.length - 1)) / 23)],
        )
      : unique;
  const frames = times.map((time, i) => {
    const output = path.join(
      outputDir,
      `frame-${String(i).padStart(2, "0")}.png`,
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-ss",
      String(time),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-y",
      output,
    ]);
    return { time, file: output };
  });
  const cols = 3,
    tileW = 420,
    tileH = 280,
    rows = Math.ceil(frames.length / cols),
    width = cols * tileW + 48,
    height = rows * tileH + 110;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#09121b"/><text x="25" y="40" fill="#c8f76b" font-family="sans-serif" font-size="23">${esc(p.title || "汽车视频")} · 实际导出抽帧</text>`;
  frames.forEach((f, i) => {
    const x = 24 + (i % cols) * tileW,
      y = 70 + Math.floor(i / cols) * tileH;
    svg += `<rect x="${x}" y="${y}" width="404" height="238" fill="#0f1d29"/><image href="data:image/png;base64,${fs.readFileSync(f.file).toString("base64")}" x="${x}" y="${y}" width="404" height="238" preserveAspectRatio="xMidYMid meet"/><text x="${x + 4}" y="${y + 262}" fill="#a9c3d0" font-size="17" font-family="monospace">${f.time.toFixed(3)} s</text>`;
  });
  svg += "</svg>";
  const sheet = path.join(outputDir, "contact-sheet.png");
  fs.writeFileSync(
    sheet,
    new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng(),
  );
  const report = {
    video: file,
    sha256: hashFile(file),
    media,
    frames,
    contactSheet: sheet,
    requestedFrames: unique.length,
    sampledFrames: times.length,
    coverage:
      times.length === unique.length
        ? "all-selected-cues"
        : "sampled; additional scene checks required",
    visualVerification: "UNVERIFIED",
    humanListening: "UNVERIFIED",
  };
  writeJson(path.join(outputDir, "inspection.json"), report);
  return report;
}
