#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "../src/library.mjs";

const url = "http://127.0.0.1:3211";
async function ready() {
  try {
    const response = await fetch(`${url}/api/catalog`, {
      signal: AbortSignal.timeout(700),
    });
    const body = await response.json();
    if (body.product !== "automotive-video-kit")
      throw Error("3211 端口被其他服务使用，请为组件库选择其他端口");
    return true;
  } catch (e) {
    if (e.message.includes("其他服务")) throw e;
    if (e instanceof SyntaxError) throw Error("3211 端口被其他服务使用");
    return false;
  }
}
try {
  if (!(await ready())) {
    fs.mkdirSync(path.join(ROOT, "review"), { recursive: true });
    const fd = fs.openSync(path.join(ROOT, "review/catalog.log"), "a");
    const child = spawn(
      process.execPath,
      [path.join(ROOT, "bin/auto-video.mjs"), "catalog"],
      { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] },
    );
    child.unref();
    fs.closeSync(fd);
    let found = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (await ready()) {
        found = true;
        break;
      }
    }
    if (!found) throw Error("组件目录未能启动，查看 review/catalog.log");
  }
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  const opener = spawn(command, [url], { stdio: "ignore" });
  opener.on("error", () => console.log(`请打开 ${url}`));
  console.log(`汽车视觉组件库 ${url}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
