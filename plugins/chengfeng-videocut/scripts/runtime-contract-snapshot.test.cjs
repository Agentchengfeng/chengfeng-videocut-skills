"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertSafeSnapshotPath(value) {
  assert.equal(typeof value, "string", "runtimeContract.snapshot must be a string");
  assert.ok(value.endsWith(".json"), "runtimeContract.snapshot must be a JSON file");
  assert.equal(path.isAbsolute(value), false, "runtimeContract.snapshot must be relative");
  assert.equal(value.includes("\\"), false, "runtimeContract.snapshot must use POSIX-style relative paths");
  assert.equal(value.includes("/"), false, "runtimeContract.snapshot must stay in the Plugin root");
  assert.equal(path.posix.normalize(value), value, "runtimeContract.snapshot must be normalized");
}

function assertSubset(actual, required, label) {
  if (Array.isArray(required)) {
    assert.ok(Array.isArray(actual), `${label} must be an array`);
    for (const item of required) {
      assert.ok(
        actual.some((candidate) => assertSubsetValue(candidate, item)),
        `${label} is missing ${JSON.stringify(item)}`,
      );
    }
    return;
  }
  if (required && typeof required === "object") {
    assert.ok(actual && typeof actual === "object" && !Array.isArray(actual), `${label} must be an object`);
    for (const [key, value] of Object.entries(required)) {
      assertSubset(actual[key], value, `${label}.${key}`);
    }
    return;
  }
  assert.equal(actual, required, `${label} must match exactly`);
}

function assertSubsetValue(actual, required) {
  try {
    assertSubset(actual, required, "array item");
    return true;
  } catch {
    return false;
  }
}

function assertFeature(command, feature, label) {
  assert.ok(command, `${label} command is missing`);
  assert.ok(Array.isArray(command.features), `${label} command has no feature list`);
  assert.ok(
    command.features.some((candidate) => isDeepStrictEqual(candidate, feature)),
    `${label} command is missing feature ${JSON.stringify(feature)}`,
  );
}

const requirements = readJson("runtime-requirements.json");
assert.equal(requirements.schemaVersion, 5, "Plugin requirements schema must remain v5");
assert.equal(requirements.delivery, "github-release", "Runtime delivery must use GitHub Release");
assert.equal(requirements.repository, "Agentchengfeng/chengfeng-videocut", "Runtime release repository is not exact");
assert.match(requirements.releaseTag, /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Runtime release tag is invalid");
assert.match(requirements.releaseVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Runtime release version is invalid");
for (const [platform, asset] of Object.entries(requirements.platforms)) {
  assert.match(asset.runtimePackageAsset, /^[A-Za-z0-9._-]+$/, `${platform} release asset name is invalid`);
  assert.ok(Number.isSafeInteger(asset.runtimePackageMaxBytes) && asset.runtimePackageMaxBytes > 0, `${platform} release asset size limit is invalid`);
}
assert.ok(requirements.runtimeContract, "Plugin requirements must bind a Runtime contract snapshot");
assertSafeSnapshotPath(requirements.runtimeContract.snapshot);
assert.match(requirements.runtimeContract.sha256, /^[a-f0-9]{64}$/, "Runtime contract sha256 is invalid");
assert.equal(requirements.runtimeContract.repository, "https://github.com/Agentchengfeng/chengfeng-videocut.git", "Runtime contract repository is not exact");
assert.match(requirements.runtimeContract.revision, /^[a-f0-9]{40}$/, "Runtime contract revision is invalid");

const snapshotPath = path.join(root, requirements.runtimeContract.snapshot);
const snapshotBytes = fs.readFileSync(snapshotPath);
const snapshotDigest = sha256(snapshotBytes);
assert.equal(snapshotDigest, requirements.runtimeContract.sha256, "Runtime contract snapshot sha256 drifted");
assert.equal(
  fs.readFileSync(`${snapshotPath}.sha256`, "utf8").trim(),
  `${snapshotDigest}  ${path.basename(snapshotPath)}`,
  "Runtime contract sidecar sha256 drifted",
);

const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
assert.equal(snapshot.schemaVersion, 1, "Runtime contract snapshot schema must be v1");
assert.equal(snapshot.product, requirements.product, "Runtime contract product drifted");
assert.equal(snapshot.runtimeVersion, requirements.runtimeVersion, "Runtime contract version drifted");
assert.equal(
  snapshot.minimumRuntimeVersion,
  requirements.minimumRuntimeVersion,
  "Runtime contract minimum version drifted",
);
assertSubset(snapshot.capabilities, requirements.capabilities, "capabilities");
assertSubset(snapshot.studioCapabilities, requirements.studioCapabilities, "studioCapabilities");

const commands = snapshot.cli?.commands;
assert.ok(commands && typeof commands === "object", "Runtime CLI command snapshot is missing");
assertFeature(commands["project.ingest"], {
  kind: "capability",
  capability: "projectIngestVersion",
}, "project.ingest");
for (const command of ["project.ingest", "cuts.set", "export", "job.start"]) {
  assertFeature(commands[command], {
    kind: "capability",
    capability: "operationAdmissionVersion",
  }, command);
  assertFeature(commands[command], {
    kind: "capability",
    capability: "operationAuditVersion",
  }, command);
  assertFeature(commands[command], {
    kind: "capability",
    capability: "operationIdempotencyVersion",
  }, command);
}
assertFeature(commands["transcript.playback"], {
  kind: "capability",
  capability: "transcriptPlaybackPagingVersion",
}, "transcript.playback");
assertFeature(commands.export, {
  kind: "durable-job",
  jobKind: "export",
}, "export");
assertFeature(commands["job.start"], {
  kind: "capability",
  capability: "durableJobsApiVersion",
}, "job.start");
for (const operation of requirements.capabilities.serviceOperations) {
  assertFeature(commands[`service.${operation}`], {
    kind: "service",
    operation,
  }, `service.${operation}`);
}

console.log(JSON.stringify({
  runtimeContractSnapshot: true,
  snapshotDigest,
  requirementsSubsetOfRuntime: true,
  commandFeaturesBound: true,
}));
