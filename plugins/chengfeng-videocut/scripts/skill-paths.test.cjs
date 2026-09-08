"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
// Documentation contract only: this does not prove host installation or API implementation.
const accessPath = path.join(root, "references/plugin-access.md");
assert.ok(fs.existsSync(accessPath), "Shared access reference must exist");
const access = fs.readFileSync(accessPath, "utf8");
for (const state of ["plugin_missing", "plugin_disabled", "tools_not_loaded", "managed_runtime_missing", "runtime_capability_missing"]) {
  assert.ok(access.includes(state), `Shared access must distinguish ${state}`);
}
for (const name of ["cut", "subtitle", "visual", "export", "report-bug", "check-updates"]) {
  const file = path.join(root, "skills", `chengfeng-videocut-${name}`, "SKILL.md");
  const doc = fs.readFileSync(file, "utf8");
  assert.ok(doc.includes("../../references/plugin-access.md"), `${name} must read shared access`);
  assert.equal(path.resolve(path.dirname(file), "../../references/plugin-access.md"), accessPath);
}
for (const name of ["runtime-and-product-contract", "business-workflow-contract", "existing-workflow", "plugin-access"]) {
  const file = path.join(root, "references", `${name}.md`);
  for (const match of fs.readFileSync(file, "utf8").matchAll(/\]\(([^)]+\.md)(?:#[^)]*)?\)/g)) {
    if (!/^[a-z]+:/i.test(match[1])) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), match[1])), `Broken reference in ${file}: ${match[1]}`);
    }
  }
}
const pluginName = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8")).name;
assert.match(pluginName, /^chengfeng-videocut(?:-local-development)?$/, "Use a known Plugin namespace");
const publicSkills = [
  "chengfeng-videocut-cut",
  "chengfeng-videocut-subtitle",
  "chengfeng-videocut-visual",
  "chengfeng-videocut-export",
  "chengfeng-videocut-report-bug",
  "chengfeng-videocut-check-updates",
];
const displayNames = {
  "chengfeng-videocut-cut": "chengfeng-videocut · 剪口播",
  "chengfeng-videocut-subtitle": "chengfeng-videocut · 字幕",
  "chengfeng-videocut-visual": "chengfeng-videocut · 画面",
  "chengfeng-videocut-export": "chengfeng-videocut · 导出",
  "chengfeng-videocut-report-bug": "chengfeng-videocut · 上报 Bug",
  "chengfeng-videocut-check-updates": "chengfeng-videocut · 检查更新",
};
const pluginManifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));

assert.equal(pluginManifest.name, pluginName, "Plugin manifest must own the root name");
assert.ok(Array.isArray(pluginManifest.interface?.defaultPrompt), "Plugin home starter prompts must be an array");
assert.ok(pluginManifest.interface.defaultPrompt.length <= 3, "Codex supports at most 3 Plugin-home starter prompts");
for (const prompt of pluginManifest.interface.defaultPrompt) {
  const target = prompt.match(/\$([a-z0-9-]+):([a-z0-9-]+)/);
  assert.ok(target && target[1] === pluginName && publicSkills.includes(target[2]), "Plugin-home prompt must resolve to one of this Plugin's six Skills");
}

for (const name of publicSkills) {
  const text = fs.readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
  assert.match(text, new RegExp(`^name: ${name}$`, "m"), `${name} must match its directory and frontmatter`);
  assert.match(name, /^chengfeng-videocut-/, `${name} must use the full product prefix`);
  assert.notEqual(name, pluginName, "a raw Skill name must not shadow the Plugin root name");
  assert.match(text, /^user-invocable: true$/m, `${name} must retain the host-compatible manual-selection metadata`);
}

for (const name of publicSkills) {
  const text = fs.readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
  assert.doesNotMatch(text, /\$SKILL_DIR|SKILL_DIR=/, `${name} must not require an injected SKILL_DIR`);
  const agent = fs.readFileSync(path.join(root, "skills", name, "agents", "openai.yaml"), "utf8");
  assert.match(agent, new RegExp(`\\$${pluginName}:${name}`), `${name} must use its full Plugin namespace in the default prompt`);
  assert.match(agent, new RegExp(`^  display_name: "${displayNames[name]}"$`, "m"), `${name} must expose the searchable chengfeng display name`);
}

const runtimeContract = fs.readFileSync(path.join(root, "references", "runtime-and-product-contract.md"), "utf8");
const readiness = fs.readFileSync(path.join(root, "skills", "chengfeng-videocut-check-updates", "SKILL.md"), "utf8");
assert.match(readiness, /Codex 0\.146\+ 的原生 GitHub Marketplace 管理能力/);
assert.match(readiness, /marketplace upgrade <marketplace-name> --json/);
assert.match(readiness, /plugin add <plugin-name>@<marketplace-name> --json/);
assert.match(readiness, /runtime_channel_mismatch/);
assert.match(readiness, /runtime_repair/);
assert.doesNotMatch(readiness, /node\s+"?<插件根>/, "the user update path must not execute Node helpers");
for (const name of ["chengfeng-videocut-cut", "chengfeng-videocut-subtitle", "chengfeng-videocut-visual", "chengfeng-videocut-export"]) {
  const text = fs.readFileSync(path.join(root, "skills", name, "SKILL.md"), "utf8");
  assert.match(text, /runtime_status/, `${name} must perform only the native Runtime gate per task`);
  assert.match(text, /runtime_channel_mismatch/, `${name} must route an installed channel mismatch explicitly`);
  assert.doesNotMatch(text, /check-plugin-update\.cjs/, `${name} must not refresh Plugin state per task`);
}
const businessContract = fs.readFileSync(path.join(root, "references", "business-workflow-contract.md"), "utf8");
assert.match(runtimeContract, /普通内部 reference/, "shared Product boundaries must be an internal reference");
assert.match(businessContract, /不是用户可调用的 Skill/, "shared business workflow must not be user-facing");
assert.doesNotMatch(
  `${runtimeContract}\n${businessContract}`,
  /^name:\s+chengfeng-videocut-basics$/m,
  "internal references must not declare the retired Skill",
);

assert.deepEqual(fs.readdirSync(path.join(root, "skills")).sort(), publicSkills.slice().sort(), "only the six task-facing Skills may be discovered");
console.log(JSON.stringify({
  sixTaskFacingSkills: true,
  pluginRootUnshadowed: true,
  pluginStarterPromptCap: true,
  namespacedDefaultPrompts: true,
  sharedRulesAreInternalReferences: true,
  hostManualSelectionMetadata: true,
  skillDirAssumptionRemoved: true,
  explicitBusinessContract: true,
  searchableChengfengDisplayNames: true,
}));
