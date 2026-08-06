"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "references", "business-workflow-contract.md");
const contract = fs.readFileSync(contractPath, "utf8");
const cut = fs.readFileSync(path.join(root, "skills", "chengfeng-cut", "SKILL.md"), "utf8");
const checkUpdates = fs.readFileSync(
  path.join(root, "skills", "chengfeng-check-updates", "SKILL.md"),
  "utf8",
);
const reportBug = fs.readFileSync(
  path.join(root, "skills", "chengfeng-report-bug", "SKILL.md"),
  "utf8",
);

const phases = [
  "preflight",
  "Product state readback",
  "proposal",
  "Product CAS",
  "project-level review binding",
  "user confirmation",
  "Product execution",
  "outcome verification",
];
let previous = -1;
for (const phase of phases) {
  const position = contract.indexOf(phase);
  assert.ok(position > previous, `shared contract must preserve phase order: ${phase}`);
  previous = position;
}

for (const skill of [cut]) {
  assert.match(skill, /business-workflow-contract\.md/, "business Skill must cite the shared contract");
  assert.match(skill, /project-level review binding/, "business Skill must use project-level review binding");
  assert.match(skill, /API\/readback PASS/, "business Skill must preserve evidence levels");
  assert.match(skill, /human listening UNVERIFIED/, "business Skill must not claim listening acceptance");
}

assert.match(cut, /本地真实视频.*云端逐词稿/s, "cut must accept direct local video and cloud transcript");
assert.match(cut, /project create[\s\S]*workflow get[\s\S]*cuts get/, "cut must read Product state after create before proposal");
assert.match(cut, /#project\/<projectId>/, "cut review must bind URL hash project identity");
assert.match(contract, /不产生一次性 Product receipt/, "one-time receipt must remain explicitly out of scope");
assert.match(contract, /素材库、material-library、上传会话/, "contract must explicitly prohibit asset/upload workflows");
assert.match(
  checkUpdates,
  /Plugin runtime_install[\s\S]*Headless Shell[\s\S]*不要求用户把 Bun、Node、FFmpeg 加入系统 PATH/,
  "environment manager must document the managed installer route",
);
assert.match(
  reportBug,
  /kind=desktop-managed[\s\S]*不授权本 Skill 启动/,
  "bug reporting must keep the Desktop source read-only",
);
assert.doesNotMatch(
  reportBug,
  /跑 `codex plugin list --json`/,
  "bug reporting must locate its own cache without querying another installation",
);

const skills = fs.readdirSync(path.join(root, "skills")).sort();
assert.deepEqual(skills, [
  "chengfeng-check-updates",
  "chengfeng-cut",
  "chengfeng-export",
  "chengfeng-report-bug",
  "chengfeng-subtitle",
  // 2026-07-28 加入的画面（分镜）段：剪口播 → 字幕 → 画面 → 导出。
  // 当时没进这张名单，07-29 对账补上。
  "chengfeng-visual",
], "the Plugin must expose exactly six task-facing Skills");
console.log(JSON.stringify({
  sixTaskFacingSkillsRetained: true,
  sharedBusinessContract: true,
  phaseOrder: phases,
  directProjectCreate: true,
    evidenceLevelsExplicit: true,
}));
