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
  const runtimeDir = path.join(tmp, name);
  const file = path.join(runtimeDir, process.platform === "win32" ? "chengfeng-videocut.cjs" : "chengfeng-videocut");
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
  if (process.platform === "win32") {
    const launcher = path.join(runtimeDir, "chengfeng-videocut.cmd");
    fs.writeFileSync(
      launcher,
      `@"${process.execPath}" "%~dp0chengfeng-videocut.cjs" %*\r\n`,
      "utf8",
    );
    return launcher;
  }
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

const requiredOperations = [
  "connect", "workflow-get", "edit-list-get", "playback", "visuals-get",
  "visuals-put", "subtitles-get", "sources-get", "media-import", "media-get",
  "edit-list-patch", "config-get", "config-set", "operation-get",
  "operation-recover", "word-cuts-plan", "word-cuts-commit",
  "segment-cuts-plan", "segment-cuts-commit",
];

function compatibleOperations() {
  return Object.fromEntries(requiredOperations.map((name) => [name, {
    mode: "read",
    fields: [],
    required: [],
    capability: "workbench",
  }]));
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
      operations: compatibleOperations(),
    },
  });
  const ready = run(readyRuntime);
  assert.equal(ready.status, 0, ready.stderr);
  const readyPayload = JSON.parse(ready.stdout);
  assert.equal(readyPayload.ok, true);
  assert.equal(readyPayload.runtime.state, "ready");
  assert.equal(readyPayload.runtime.compatibility.commandCompatible, true);

  const incompleteRuntime = writeRuntime("incomplete", "0.5.9", {
    ok: true,
    data: {
      operations: { connect: compatibleOperations().connect },
    },
  });
  const incomplete = run(incompleteRuntime);
  assert.equal(incomplete.status, 14, incomplete.stderr);
  const incompletePayload = JSON.parse(incomplete.stdout);
  assert.equal(incompletePayload.error.code, "workbench_capability_missing");
  assert.ok(incompletePayload.error.details.compatibility.missingOperations.includes("workflow-get"));

  console.log(JSON.stringify({ oldRuntimeBlocked: true, compatibleWorkbenchAccepted: true }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
