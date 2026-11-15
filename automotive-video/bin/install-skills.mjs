#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ROOT } from "../src/library.mjs";
const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const installed = [];
for (const name of [
  "auto-video-edit",
  "auto-video-assets",
  "auto-video-motion",
]) {
  const source = path.join(ROOT, "skills", name),
    target = path.join(home, "skills", name);
  if (!fs.existsSync(path.join(source, "SKILL.md")))
    throw Error(`缺少 ${name}`);
  let exists = false;
  try {
    fs.lstatSync(target);
    exists = true;
  } catch {}
  if (exists) {
    if (fs.realpathSync(target) !== source)
      throw Error(`目标 ${target} 已存在，保留现有内容`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target, "dir");
  }
  installed.push({ name, path: target, source });
}
console.log(
  JSON.stringify(
    {
      installed,
      discovery: "新会话可重新发现；当前会话可按实际路径读取 SKILL.md",
    },
    null,
    2,
  ),
);
