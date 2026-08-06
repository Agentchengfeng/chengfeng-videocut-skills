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
  assert.doesNotMatch(text, /node\s+"?<插件根>\/scripts\/(?:ensure-runtime|ensure-running|ensure-studio|videocut-cli)\.cjs/, `${skill} must not require system Node for the core flow`);
}

const exportSkill = read("skills/chengfeng-export/SKILL.md");
assert.match(exportSkill, /"job","start","export"/, "real export must use a Product persistent job");
assert.match(exportSkill, /"job","get"/, "export must describe persistent job readback");
assert.doesNotMatch(exportSkill, /\{"argv":\["export","<project>","--json"/, "synchronous export bypass must not be documented");

const reportBug = read("skills/chengfeng-report-bug/SKILL.md");
assert.match(reportBug, /runtime_status/, "Bug diagnostics must use the read-only native MCP status tool");
assert.doesNotMatch(reportBug, /ensure-runtime\.cjs/, "Bug diagnostics must not call the legacy Node preflight");

const updates = read("skills/chengfeng-check-updates/SKILL.md");
assert.match(updates, /show_workflow_confirmation/);
assert.match(updates, /approvalDigest/);
assert.match(updates, /runtime_install/);

const readme = read("README.md");
assert.match(readme, /残余 Node-only/);
assert.match(readme, /Bug draft\/submit/);

const mcp = JSON.parse(read(".mcp.json")).mcpServers["chengfeng-videocut"];
assert.equal(mcp.command, "./bin/chengfeng-videocut-mcp");
assert.equal(mcp.cwd, ".");

console.log(JSON.stringify({ coreSkillsUseNativeMCP: true, persistentExportJobs: true, residualNodeScopeExplicit: true }));
