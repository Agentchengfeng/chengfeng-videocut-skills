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
assert.match(exportSkill, /实际 `job start export`[\s\S]*自己的缓存[\s\S]*缓存未命中才下载锁定版本[\s\S]*校验归档和可执行文件/, "only actual exports may acquire the Product-managed Headless Shell");
assert.match(exportSkill, /安装、`runtime_status`、doctor 与 `--dry-run` 都不会预下载或预检它/, "export preflight must not acquire Headless Shell");
assert.match(exportSkill, /绝不搜索、借用或回退系统 Chrome \/ Chromium/, "exports must not fall back to a system browser");
assert.doesNotMatch(exportSkill, /重跑一次就覆盖/, "export must never promise to replace an existing output");
assert.doesNotMatch(exportSkill, /^ff(?:mpeg|probe)\s/m, "export must not call system media tools");
assert.doesNotMatch(exportSkill, /\{"argv":\["export","<project>","--json"/, "synchronous export bypass must not be documented");

const subtitleSkill = read("skills/chengfeng-subtitle/SKILL.md");
const subtitleMetadata = read("skills/chengfeng-subtitle/agents/openai.yaml");
assert.match(subtitleSkill, /左栏同级的两个标签把\*\*字幕内容\*\*和\*\*字幕样式\*\*分开处理/, "subtitle review must distinguish content editing from style selection");
assert.match(subtitleSkill, /只有项目已经有字幕文档时才出现/, "subtitle style tab must require a subtitle document");
assert.match(subtitleSkill, /六个项目预设是「标准、大字、重点、胶囊、沉稳、亮条」/, "subtitle Skill must name all six current presets");
assert.doesNotMatch(subtitleSkill, /右栏「参数 → 字幕」四个预设/, "subtitle Skill must not describe the removed inspector presets");
assert.match(subtitleMetadata, /账本与逐词稿/, "subtitle metadata must describe the ledger plus transcript workflow");
assert.match(subtitleMetadata, /「字幕样式」/, "subtitle metadata must point users to the top-level style tab");
assert.doesNotMatch(subtitleMetadata, /重新转写剪后视频/, "subtitle metadata must not direct users to retranscribe the cut video");

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
assert.match(updates, /不内嵌、下载或预检 Headless Shell/, "Runtime installation must not claim to contain Headless Shell");
assert.match(updates, /实际 job start export 的 HTML 覆盖层渲染[\s\S]*自己的 Headless Shell 缓存[\s\S]*缓存未命中才下载锁定版本/, "only actual export may acquire the Headless Shell");
assert.match(updates, /`runtime_status`、doctor、安装和[\s\S]*`--dry-run` 均不下载 Headless Shell/, "Runtime preflight must not acquire Headless Shell");
assert.doesNotMatch(updates, /安装包只在本地安装 Runtime、Headless Shell/, "updates Skill must not claim Headless Shell is embedded in the Runtime installer");
assert.doesNotMatch(updates, /^codex plugin update(?:\s|$)/m, "must not document a nonexistent Codex command");

const updateMetadata = read("skills/chengfeng-check-updates/agents/openai.yaml");
assert.match(updateMetadata, /Plugin 更新与 Product Runtime 就绪/, "update metadata must describe both Plugin and Runtime checks");

const readme = read("README.md");
assert.match(readme, /六个用户 Skill 都不要求系统 Node\/Bun\/Git/);
assert.match(readme, /持久[\s\S]*只声明 `export`/);

const mcp = JSON.parse(read(".mcp.json")).mcpServers["chengfeng-videocut-local-development"];
assert.equal(mcp.command, "./bin/chengfeng-videocut-mcp");
assert.equal(mcp.cwd, ".");
assert.equal(mcp.tool_timeout_sec, 1201);

const runtimeRequirements = JSON.parse(read("runtime-requirements.json"));
assert.equal(runtimeRequirements.schemaVersion, 4, "Runtime contract must use the exact npm package schema");
assert.equal(runtimeRequirements.runtimeVersion, "0.5.3", "local candidate must require the ingest and paginated playback contract");
assert.equal(runtimeRequirements.registry, "https://registry.npmjs.org");
assert.equal(runtimeRequirements.requiredDistributionMode, "release-ready");
assert.equal(runtimeRequirements.requiredLicenseStatus, "VERIFIED");
assert.equal(runtimeRequirements.minimumRuntimeVersion, "0.5.3", "Runtime without atomic ingest and paginated playback must not pass");
for (const [platform, assets] of Object.entries(runtimeRequirements.platforms)) {
  assert.deepEqual(
    Object.keys(assets).sort(),
    ["distIntegrity", "installerPath", "installerSHA256", "npmPackage", "npmPackageVersion", "packageManifest", "runtimeLauncher", "tarballMaxBytes"],
    `${platform} must expose exactly one npm Runtime package and its launcher`,
  );
  assert.match(assets.npmPackage, /^@chengfeng\/videocut-runtime-/);
  assert.equal(assets.npmPackageVersion, "0.5.3");
  assert.equal(assets.distIntegrity, null, `${platform} must fail closed before dist.integrity is published`);
  assert.equal(assets.installerSHA256, null, `${platform} must fail closed before the inner installer digest is published`);
}

const runtimeContract = read("references/runtime-and-product-contract.md");
assert.match(runtimeContract, /内嵌 Runtime、Bun、FFmpeg 与 FFprobe/, "Runtime installer contents must stay explicit");
assert.match(runtimeContract, /Headless Shell 继续只由确认后的实际 export 受管获取/, "Headless Shell must not be described as an installer payload");

const confirmationCard = read("public/review-confirm.html");
assert.match(confirmationCard, /npmPackage/);
assert.match(confirmationCard, /distIntegrity/);
assert.match(confirmationCard, /installerSHA256/);
assert.doesNotMatch(confirmationCard, /installerAsset|installManifestAsset|installManifestSHA256/);

console.log(JSON.stringify({ coreSkillsUseNativeMCP: true, persistentExportJobs: true, userSystemDependenciesRemoved: true, singleRuntimePackageContract: true }));
