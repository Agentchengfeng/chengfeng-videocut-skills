"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "workbench-preflight.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-workbench-preflight-"));

function writeRuntime(name, version, commandsPayload) {
  const file = path.join(tmp, name, "chengfeng-videocut");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const doctor = JSON.stringify({
    ok: true,
    data: { healthy: true },
  });
  const body = [
    `#!${process.execPath}`,
    '"use strict";',
    'const command = process.argv.slice(2).join(" ");',
    `if (command === "--version") process.stdout.write(${JSON.stringify(`chengfeng-videocut ${version}\n`)});`,
    `else if (command === "doctor --json") process.stdout.write(${JSON.stringify(`${doctor}\n`)});`,
    `else if (command === "workbench commands --json") process.stdout.write(${JSON.stringify(`${JSON.stringify(commandsPayload)}\n`)});`,
    'else process.exitCode = 2;',
    "",
  ].join("\n");
  fs.writeFileSync(file, body, { mode: 0o755 });
  return file;
}

function run(runtime) {
  return spawnSync(process.execPath, [script, "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHENGFENG_VIDEOCUT_BIN: runtime,
      CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "managed"),
    },
  });
}

try {
  const oldRuntime = writeRuntime("old", "0.4.11", {
    ok: false,
    error: { code: "unknown_command" },
  });
  const blocked = run(oldRuntime);
  assert.equal(blocked.status, 14, blocked.stderr);
  const blockedPayload = JSON.parse(blocked.stdout);
  assert.equal(blockedPayload.error.code, "workbench_capability_missing");
  assert.equal(blockedPayload.error.details.compatibility.versionCompatible, false);
  assert.equal(blockedPayload.error.details.compatibility.releaseAvailable, false);

  const readyRuntime = writeRuntime("ready", "0.5.9", {
    ok: true,
    data: {
      operations: {
        connect: {
          mode: "read",
          fields: [],
          required: [],
          capability: "workbench",
        },
      },
    },
  });
  const ready = run(readyRuntime);
  assert.equal(ready.status, 0, ready.stderr);
  const readyPayload = JSON.parse(ready.stdout);
  assert.equal(readyPayload.ok, true);
  assert.equal(readyPayload.runtime.state, "ready");
  assert.equal(readyPayload.runtime.compatibility.commandCompatible, true);

  console.log(JSON.stringify({ oldRuntimeBlocked: true, compatibleWorkbenchAccepted: true }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
