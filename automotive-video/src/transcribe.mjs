import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readJson, writeJson, hashFile } from "./library.mjs";

export const ASR_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
export function asrCredential() {
  if (process.env.VOLCENGINE_API_KEY)
    return { key: process.env.VOLCENGINE_API_KEY, source: "environment" };
  const file =
    process.env.AUTO_VIDEO_ENV_FILE ||
    path.join(os.homedir(), ".config/auto-video/env");
  if (fs.existsSync(file)) {
    const match = fs
      .readFileSync(file, "utf8")
      .match(/^\s*VOLCENGINE_API_KEY\s*=\s*(.*?)\s*$/m);
    if (match) {
      const key = match[1].replace(/^['"]|['"]$/g, "");
      if (key) return { key, source: "local-config" };
    }
  }
  return null;
}
export function parseAsrResult(body) {
  const utterances = body?.result?.utterances;
  if (!Array.isArray(utterances) || !utterances.length)
    throw Error("转录结果缺少带时间的 utterances");
  return utterances.map((u, i) => ({
    id: `cue-${String(i + 1).padStart(4, "0")}`,
    start: Number(u.start_time) / 1000,
    end: Number(u.end_time) / 1000,
    text: u.text,
    words: (u.words || []).map((w, j) => ({
      id: `word-${i + 1}-${j + 1}`,
      start: Number(w.start_time) / 1000,
      end: Number(w.end_time) / 1000,
      text: w.text,
    })),
  }));
}
export async function transcribeProject(file, { fetcher = fetch } = {}) {
  const credential = asrCredential();
  if (!credential)
    throw Error(
      "未配置云端转录：可提供同步 SRT，或设置 VOLCENGINE_API_KEY / ~/.config/auto-video/env",
    );
  const absolute = path.resolve(file),
    dir = path.dirname(absolute),
    p = readJson(absolute);
  if (!p.master?.file) throw Error("转录只用于真实粗剪母版");
  const master = path.join(dir, "media", p.master.file);
  if (hashFile(master) !== p.master.sha256) throw Error("母版摘要已变化");
  if (p.captions?.length) throw Error("已有字幕，不自动重转录或覆盖人工校对");
  if (p.duration > 7200) throw Error("当前极速转录适配仅支持两小时内素材");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "auto-video-asr-"));
  try {
    const audio = path.join(temp, "audio.mp3");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      master,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "48k",
      "-y",
      audio,
    ]);
    const bytes = fs.readFileSync(audio);
    if (bytes.length > 100 * 1024 * 1024) throw Error("转录音频超过 100 MB");
    const requestId = randomUUID();
    const response = await fetcher(ASR_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(180000),
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": credential.key,
        "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1",
      },
      body: JSON.stringify({
        user: { uid: "auto-video-kit" },
        audio: { data: bytes.toString("base64") },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
        },
      }),
    });
    const status = response.headers.get("x-api-status-code");
    if (!response.ok || status !== "20000000")
      throw Error(
        `云端转录失败：HTTP ${response.status}，业务码 ${status || "missing"}；请核对极速识别资源权限，不自动重试`,
      );
    const body = await response.json();
    const captions = parseAsrResult(body);
    if (
      captions.some(
        (c) =>
          !Number.isFinite(c.start) ||
          !Number.isFinite(c.end) ||
          c.end <= c.start ||
          c.end > p.duration + 0.2,
      )
    )
      throw Error("转录时间与母版不一致");
    writeJson(path.join(dir, "transcript.raw.json"), body);
    writeJson(path.join(dir, "transcript.json"), {
      sourceSha256: p.master.sha256,
      provider: "volcengine-flash",
      captions,
    });
    p.captions = captions.map(({ words, ...c }) => c);
    p.status = "needs-caption-review";
    writeJson(absolute, p);
    return {
      project: absolute,
      captions: captions.length,
      status: p.status,
      requestId,
      sourceUnchanged: true,
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
