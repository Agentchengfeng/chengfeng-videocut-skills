"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "references", "business-workflow-contract.md");
const contract = fs.readFileSync(contractPath, "utf8");
const cut = fs.readFileSync(path.join(root, "skills", "chengfeng-videocut-cut", "SKILL.md"), "utf8");
const checkUpdates = fs.readFileSync(
  path.join(root, "skills", "chengfeng-videocut-check-updates", "SKILL.md"),
  "utf8",
);
const reportBug = fs.readFileSync(
  path.join(root, "skills", "chengfeng-videocut-report-bug", "SKILL.md"),
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

assert.match(cut, /project","ingest","<任务目录>.*--video","<任务目录内的相对视频路径>/, "cut must enter through atomic Product ingest with a task-relative video");
assert.doesNotMatch(cut, /"project","create"/, "cut must not use legacy project create");
assert.match(cut, /不得调用裸 `transcribe`[\s\S]*不得传 `--output`[\s\S]*不得读写或猜测[\s\S]*`transcript\.json`/, "cut must not orchestrate raw transcription outputs");
assert.match(cut, /transcript","playback"[\s\S]*--limit","64"[\s\S]*page\.nextCursor[\s\S]*--cursor <page\.nextCursor>/, "cut must read long playback serially by cursor");
assert.match(cut, /revision_conflict \/ playback_cursor_stale[\s\S]*丢弃本轮[\s\S]*从第一页重扫/, "cut must restart the complete playback on stale revision or cursor");
assert.match(cut, /子 Agent 只能返回候选行[\s\S]*每个稳定版本只有协调者能执行\*\*一次\*\* `cuts set` CAS/, "parallel workers must remain read-only and one coordinator must own the single CAS");
assert.match(cut, /project","ingest"[\s\S]*workflow","get"[\s\S]*cuts","get"/, "cut must read Product state after ingest before proposal");
assert.match(cut, /#project\/<projectId>/, "cut review must bind URL hash project identity");
assert.match(contract, /不产生一次性 Product receipt/, "one-time receipt must remain explicitly out of scope");
assert.match(contract, /素材库、material-library、上传会话/, "contract must explicitly prohibit asset/upload workflows");
assert.match(contract, /project ingest <task-dir> --video <task-relative> --json/, "shared contract must name the atomic ingest boundary");
assert.match(contract, /transcript playback --limit 64 --json[\s\S]*page\.nextCursor[\s\S]*串行读完/, "shared contract must require serial paginated playback");
assert.match(contract, /子 Agent 只返回候选行[\s\S]*每个稳定版本只调用一次 `cuts set` CAS/, "shared contract must preserve the single-writer CAS boundary");
assert.doesNotMatch(contract, /直接传给 `project create`/, "shared contract must not preserve the legacy create-plus-transcript route");
assert.match(
  checkUpdates,
  /Plugin runtime_install[\s\S]*Headless Shell[\s\S]*用户流程不要求系统 Node/,
  "environment manager must document the managed installer route",
);
assert.match(
  reportBug,
  /不得安装 Runtime、启动 Studio、改项目/,
  "bug reporting must keep Product state read-only",
);
assert.doesNotMatch(
  reportBug,
  /node\s+"?<插件根>/,
  "bug reporting must not invoke a repository Node helper",
);

const skills = fs.readdirSync(path.join(root, "skills")).sort();
assert.deepEqual(skills, [
  "chengfeng-videocut-check-updates",
  "chengfeng-videocut-cut",
  "chengfeng-videocut-export",
  "chengfeng-videocut-report-bug",
  "chengfeng-videocut-subtitle",
  // 2026-07-28 加入的画面（分镜）段：剪口播 → 字幕 → 画面 → 导出。
  // 当时没进这张名单，07-29 对账补上。
  "chengfeng-videocut-visual",
], "the Plugin must expose exactly six task-facing Skills");
console.log(JSON.stringify({
  sixTaskFacingSkillsRetained: true,
  sharedBusinessContract: true,
  phaseOrder: phases,
  atomicProjectIngest: true,
  cursorPaginatedPlayback: true,
  singleCoordinatorCAS: true,
    evidenceLevelsExplicit: true,
}));
