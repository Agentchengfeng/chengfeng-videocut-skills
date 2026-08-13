"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const requirements = JSON.parse(fs.readFileSync(path.join(root, "runtime-requirements.json"), "utf8"));
const snapshotPath = path.join(root, requirements.runtimeContract.snapshot);
const snapshotBytes = fs.readFileSync(snapshotPath);
const snapshotDigest = crypto.createHash("sha256").update(snapshotBytes).digest("hex");
const strictGate = process.env.CI === "true" ||
  process.env.CHENGFENG_RELEASE_GATE === "1" ||
  process.env.CHENGFENG_VIDEOCUT_RUNTIME_CONTRACT_STRICT === "1";

assert.equal(requirements.runtimeContract.repository, "https://github.com/Agentchengfeng/chengfeng-videocut.git");
assert.match(requirements.runtimeContract.revision, /^[a-f0-9]{40}$/);
assert.equal(snapshotDigest, requirements.runtimeContract.sha256);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

const runtimeRoot = process.env.CHENGFENG_VIDEOCUT_RUNTIME_REPO;
if (!runtimeRoot) {
  if (strictGate) {
    throw new Error("CHENGFENG_VIDEOCUT_RUNTIME_REPO is required for the Runtime contract gate in CI/release");
  }
  console.log(JSON.stringify({
    runtimeContractCrossRepo: true,
    mode: "fixture",
    crossRepoRequired: false,
    referencedRuntimeRevision: requirements.runtimeContract.revision,
    snapshotDigest,
  }));
  process.exit(0);
}

const canonicalRuntimeRoot = fs.realpathSync(path.resolve(runtimeRoot));
const runtimePackage = JSON.parse(fs.readFileSync(path.join(canonicalRuntimeRoot, "package.json"), "utf8"));
assert.deepEqual(
  runtimePackage.repository,
  { type: "git", url: requirements.runtimeContract.repository },
  "Runtime checkout repository does not match runtimeContract.repository",
);
const head = run("git", ["rev-parse", "HEAD"], { cwd: canonicalRuntimeRoot }).toLowerCase();
assert.equal(
  head,
  requirements.runtimeContract.revision,
  "Runtime checkout HEAD must equal runtimeContract.revision",
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-runtime-contract-"));
try {
  const exportedPath = path.join(tmp, "runtime-contract.snapshot.json");
  run("bun", ["scripts/export-runtime-plugin-contract.ts", exportedPath], { cwd: canonicalRuntimeRoot });
  const exportedBytes = fs.readFileSync(exportedPath);
  const exportedDigest = crypto.createHash("sha256").update(exportedBytes).digest("hex");
  assert.equal(exportedDigest, requirements.runtimeContract.sha256, "Runtime-exported snapshot sha256 drifted");
  assert.equal(
    exportedBytes.toString("utf8"),
    snapshotBytes.toString("utf8"),
    "Plugin snapshot must match the referenced Runtime checkout byte-for-byte",
  );
  assert.equal(
    fs.readFileSync(`${exportedPath}.sha256`, "utf8").trim(),
    `${exportedDigest}  ${path.basename(exportedPath)}`,
    "Runtime-exported snapshot sidecar drifted",
  );
  console.log(JSON.stringify({
    runtimeContractCrossRepo: true,
    mode: "checkout",
    crossRepoRequired: strictGate,
    runtimeRevision: head,
    snapshotDigest: exportedDigest,
  }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
