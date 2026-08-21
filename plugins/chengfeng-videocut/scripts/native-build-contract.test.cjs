"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const pluginManifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
const publicBetaMarker = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "update-provenance.json"), "utf8"));

assert.equal(publicBetaMarker.name, pluginManifest.name, "public beta marker name must match plugin.json");
assert.equal(publicBetaMarker.version, pluginManifest.version, "public beta marker version must match plugin.json");
assert.equal(publicBetaMarker.publicBeta, true, "marker must identify a public beta build");
assert.equal(publicBetaMarker.releaseReady, false, "public beta must not identify as a release-ready build");
assert.equal(Object.prototype.hasOwnProperty.call(publicBetaMarker, "localDevelopment"), false, "public beta must not be labelled as local development");
assert.equal(Object.prototype.hasOwnProperty.call(publicBetaMarker, "immutableRef"), false, "pre-publication marker must not claim a nonexistent immutableRef");
assert.equal(Object.prototype.hasOwnProperty.call(publicBetaMarker, "publisherChecksum"), false, "pre-publication marker must not claim a nonexistent publisher checksum");

function runHelper(channel) {
  const result = spawnSync(process.execPath, ["scripts/native-mcp-ldflags.cjs", channel], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

for (const channel of ["release", "local-development"]) {
  const flags = runHelper(channel);
  assert.match(flags, /-buildid=/, `${channel} build must clear the build id for reproducibility`);
  assert.match(flags, new RegExp(`\\.Version=${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`), `${channel} build must derive Version from package.json`);
  assert.match(flags, new RegExp(`\\.BuildChannel=${channel}(?:\\s|$)`), `${channel} build must set the expected BuildChannel`);
}

for (const script of ["scripts/build-native-mcp.sh", "scripts/build-native-mcp-local-development.sh"]) {
  const text = fs.readFileSync(path.join(root, script), "utf8");
  assert.match(text, /native-mcp-ldflags\.cjs/, `${script} must use the shared ldflags helper`);
  assert.doesNotMatch(text, /Version=0\.11\./, `${script} must not hardcode the Plugin version in ldflags`);
  assert.match(text, /-trimpath/, `${script} must preserve reproducible Go build flags`);
  assert.match(text, /-buildvcs=false/, `${script} must preserve reproducible Go build flags`);
}

const windowsWorkflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/windows-smoke.yml"), "utf8");
assert.doesNotMatch(windowsWorkflow, /Version=0\.11\.0/, "Windows workflow must not hardcode an old Plugin version");
assert.match(windowsWorkflow, /native-mcp-ldflags\.cjs local-development/, "Windows workflow must use shared ldflags");
assert.match(windowsWorkflow, /Get-FileHash[\s\S]*committedHash[\s\S]*rebuiltHash[\s\S]*not byte-for-byte reproducible/, "Windows workflow must keep source rebuild versus checked-in binary exact compare");
assert.match(windowsWorkflow, /Get-AuthenticodeSignature[\s\S]*CHENGFENG_RELEASE_GATE/, "Windows release signing gate must remain fail-closed");
assert.match(windowsWorkflow, /verify-native-release-signing\.sh[\s\S]*CHENGFENG_RELEASE_GATE/, "macOS release signing gate must remain fail-closed");

console.log(JSON.stringify({
  nativeBuildContract: true,
  publicBetaProvenanceContract: true,
  sharedLdflags: true,
  windowsExactComparePreserved: true,
  releaseSigningGatesPreserved: true,
}));
