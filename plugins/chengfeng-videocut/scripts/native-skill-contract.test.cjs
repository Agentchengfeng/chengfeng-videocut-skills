"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const core = ["chengfeng-cut", "chengfeng-subtitle", "chengfeng-visual", "chengfeng-export"];

for (const skill of core) {
  const text = read(`skills/${skill}/SKILL.md`);
  assert.match(text, /runtime_cli/, `${skill} must use the native MCP bridge`);
  assert.match(text, /runtime_status/, `${skill} must use the native runtime gate`);
  assert.doesNotMatch(text, /check-plugin-update\.cjs/, `${skill} must not refresh Plugin updates per task`);
  assert.doesNotMatch(text, /```(?:bash|sh)[\s\S]*?\b(?:node|ffmpeg|ffprobe|gh|git)\b[\s\S]*?```/i, `${skill} must not call user system tools`);
}

const exportSkill = read("skills/chengfeng-export/SKILL.md");
assert.match(exportSkill, /"job","start","export"/, "real export must use a Product persistent job");
assert.match(exportSkill, /"job","get"/, "export must describe persistent job readback");
assert.match(exportSkill, /actualDuration[\s\S]*hasAudio[\s\S]*renderedFrames[\s\S]*problems/, "export must use Product structural verification fields");
assert.match(exportSkill, /job_output_exists[\s\S]*新的绝对 `--out`/, "existing output must fail before encoding and require a new absolute path");
assert.doesNotMatch(exportSkill, /重跑一次就覆盖/, "export must never promise to replace an existing output");
assert.doesNotMatch(exportSkill, /^ff(?:mpeg|probe)\s/m, "export must not call system media tools");
assert.doesNotMatch(exportSkill, /\{"argv":\["export","<project>","--json"/, "synchronous export bypass must not be documented");

const reportBug = read("skills/chengfeng-report-bug/SKILL.md");
assert.match(reportBug, /runtime_status/, "Bug diagnostics must use the read-only native MCP status tool");
assert.match(reportBug, /Agent (?:已经可调用的|已有) GitHub Issue/, "Bug submission must use an existing Agent capability");
assert.match(reportBug, /未提交/, "Bug submission must return a draft when the capability is unavailable");
assert.doesNotMatch(reportBug, /node\s+"?<插件根>/, "Bug reporting must not execute the repository Node helper");

const updates = read("skills/chengfeng-check-updates/SKILL.md");
assert.match(updates, /show_workflow_confirmation/);
assert.match(updates, /approvalDigest/);
assert.match(updates, /runtime_install/);
assert.match(updates, /plugin marketplace upgrade chengfeng-videocut --json/);
assert.match(updates, /plugin add chengfeng-videocut@chengfeng-videocut --json/);
assert.doesNotMatch(updates, /^codex plugin update(?:\s|$)/m, "must not document a nonexistent Codex command");

const readme = read("README.md");
assert.match(readme, /六个用户 Skill 都不要求系统 Node\/Bun\/Git/);
assert.match(readme, /持久[\s\S]*只声明 `export`/);

const mcp = JSON.parse(read(".mcp.json")).mcpServers["chengfeng-videocut"];
assert.equal(mcp.command, "./bin/chengfeng-videocut-mcp");
assert.equal(mcp.cwd, ".");
assert.equal(mcp.tool_timeout_sec, 1201);

const runtimeRequirements = JSON.parse(read("runtime-requirements.json"));
assert.equal(runtimeRequirements.schemaVersion, 3, "Runtime contract must use the single-package schema");
for (const [platform, assets] of Object.entries(runtimeRequirements.platforms)) {
  assert.deepEqual(
    Object.keys(assets).sort(),
    ["runtimeLauncher", "runtimePackageAsset", "runtimePackageSHA256"],
    `${platform} must expose exactly one Runtime package and its launcher`,
  );
  assert.equal(assets.runtimePackageSHA256, null, `${platform} must fail closed before the formal digest is published`);
}

const confirmationCard = read("public/review-confirm.html");
assert.match(confirmationCard, /runtimePackageAsset/);
assert.match(confirmationCard, /runtimePackageSHA256/);
assert.doesNotMatch(confirmationCard, /installerAsset|installManifestAsset|installManifestSHA256/);

console.log(JSON.stringify({ coreSkillsUseNativeMCP: true, persistentExportJobs: true, userSystemDependenciesRemoved: true, singleRuntimePackageContract: true }));
