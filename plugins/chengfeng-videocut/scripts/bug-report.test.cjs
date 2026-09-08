"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const report = path.join(root, "skills", "chengfeng-videocut-report-bug", "scripts", "report-bug.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-bug-report-test-"));
const input = path.join(tmp, "report.json");
const ghDriver = path.join(tmp, "fake-gh-driver.cjs");
const gh = path.join(tmp, process.platform === "win32" ? "fake-gh.cmd" : "fake-gh");
const ghCalled = path.join(tmp, "gh-called");
const ghBody = path.join(tmp, "gh-body");
const injectionMarker = path.join(tmp, "injected");

function run(args, env = {}) {
  return spawnSync(process.execPath, [report, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

try {
  fs.writeFileSync(input, JSON.stringify({
    schemaVersion: 1,
    target: "product",
    component: "Studio",
    title: `旧界面被打开 $(touch ${injectionMarker})`,
    summary: "在 '/Users/alice/My Client/secret video.mp4' 和 /Volumes/Example/客户 项目/素材.mp4 复现，token=gho_abcdefghijklmnopqrstuvwxyz123456",
    steps: ["打开 http://127.0.0.1:5190/?view=koubo#project/customer-name"],
    expected: "显示顶层剪口播视图",
    actual: "显示旧工作区，Bearer secret-token-value，Basic dXNlcjpwYXNz，password=hunter2，jwt=eyJabc.def.ghi，https://admin:plain-password@example.test/path",
    environment: {
      Runtime: "0.1.1",
      Secrets: { OPENAI_API_KEY: "plain-openai-key", AWS_SECRET_ACCESS_KEY: "plain-aws-key" },
      cookies: [{ name: "session", value: "structured-cookie-secret" }],
      tokens: ["structured-token-secret"],
      apiKeys: ["structured-api-key-secret"],
      databaseUrl: "postgres://db-user:structured-db-password@db.internal/app",
    },
    evidence: [
      "sk-abcdefghijklmnopqrstuvwxyz",
      { cookie: "session-secret", token: "plain-token", password: "object-password", projectId: "customer-42" },
      "raw json: {\"cookie\":\"raw-session-secret\"}",
      'cookies=[{"name":"session","value":"raw-cookie-secret"}]',
      'tokens=["raw-token-secret"]',
      'apiKeys=["raw-api-key-secret"]',
      "postgres://pg-user:pg-password@postgres.internal/app",
      "mysql://mysql-user:mysql-password@mysql.internal/app",
      "redis://:redis-password@redis.internal/0",
      "mongodb://mongo-user:mongo-password@mongo.internal/app",
    ],
  }));

  fs.writeFileSync(ghDriver, `"use strict";
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.GH_CALLED_FILE, \`\${args.join(" ")}\\n\`);
if (args[0] === "auth") {
  process.exit(process.env.FAKE_GH_MODE === "auth-fail" ? 1 : 0);
}
if (args[0] === "repo" && args[1] === "view") {
  process.stdout.write('{"hasIssuesEnabled":true}\\n');
  process.exit(0);
}
if (args[0] === "label" && args[1] === "list") {
  process.stdout.write('[{"name":"bug"}]\\n');
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "list") {
  if (process.env.FAKE_GH_MODE === "duplicate") {
    const searchIndex = args.indexOf("--search");
    const search = searchIndex >= 0 ? String(args[searchIndex + 1] || "") : "";
    const fingerprint = search.replace(/ in:body$/, "");
    process.stdout.write(JSON.stringify([{
      number: 9,
      title: "existing",
      url: "https://github.com/Agentchengfeng/chengfeng-videocut/issues/9",
      body: \`<!-- chengfeng-videocut-bug-fingerprint: \${fingerprint} -->\`,
    }]) + "\\n");
    process.exit(0);
  }
  process.stdout.write("[]\\n");
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "create") {
  const body = fs.readFileSync(0, "utf8").split(/\\r?\\n/).slice(0, 240).join("\\n");
  fs.writeFileSync(process.env.GH_BODY_FILE, body);
  process.stdout.write("https://github.com/Agentchengfeng/chengfeng-videocut/issues/123\\n");
  process.exit(0);
}
process.exit(2);
`, "utf8");
  if (process.platform === "win32") {
    fs.writeFileSync(
      gh,
      `@echo off\r\n"${process.execPath}" "${ghDriver}" %*\r\n`,
      "utf8",
    );
  } else {
    fs.writeFileSync(
      gh,
      `#!/bin/sh\nexec "${process.execPath}" "${ghDriver}" "$@"\n`,
      { encoding: "utf8", mode: 0o755 },
    );
  }

  const draft = run(["draft", "--input", input, "--json"]);
  assert.equal(draft.status, 0, draft.stderr);
  const draftPayload = JSON.parse(draft.stdout);
  assert.equal(draftPayload.ok, true);
  assert.equal(draftPayload.draft.repo, "Agentchengfeng/chengfeng-videocut");
  assert.equal(draftPayload.draft.confirmationToken.length, 64);
  assert.equal(fs.existsSync(draftPayload.draft.confirmationReceipt), true);
  assert.doesNotMatch(draftPayload.draft.body, /\/Users\/alice|\/Volumes\/Example|My Client|secret video|客户 项目|素材\.mp4|customer-name|gho_|sk-abcdefghijklmnopqrstuvwxyz|secret-token-value|dXNlcj|plain-password|hunter2|eyJabc|plain-openai|plain-aws|session-secret|plain-token|object-password|customer-42|raw-session-secret|structured-cookie-secret|structured-token-secret|structured-api-key-secret|structured-db-password|raw-cookie-secret|raw-token-secret|raw-api-key-secret|pg-password|mysql-password|redis-password|mongo-password/);
  assert.match(draftPayload.draft.body, /\/Users\/<user>/);
  assert.match(draftPayload.draft.body, /http:\/\/127\.0\.0\.1:5190\//);
  assert.match(draftPayload.draft.body, /postgres:\/\/<redacted>@postgres\.internal\/app/);
  assert.match(draftPayload.draft.body, /mysql:\/\/<redacted>@mysql\.internal\/app/);
  assert.match(draftPayload.draft.body, /redis:\/\/<redacted>@redis\.internal\/0/);
  assert.match(draftPayload.draft.body, /mongodb:\/\/<redacted>@mongo\.internal\/app/);
  assert.equal(fs.existsSync(ghCalled), false, "draft must not invoke gh");

  const missingConfirmation = run(["submit", "--input", input, "--json"], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
  });
  assert.equal(missingConfirmation.status, 4);
  assert.equal(JSON.parse(missingConfirmation.stdout).error.code, "confirmation_required");
  assert.equal(fs.existsSync(ghCalled), false, "unconfirmed submit must not invoke gh");

  const mismatch = run([
    "submit", "--input", input, "--confirmed", "--confirm-token", "wrong",
    "--receipt", draftPayload.draft.confirmationReceipt, "--json",
  ], { CHENGFENG_VIDEOCUT_GH_BIN: gh, GH_CALLED_FILE: ghCalled });
  assert.equal(mismatch.status, 7);
  assert.equal(JSON.parse(mismatch.stdout).error.code, "confirmation_mismatch");
  assert.equal(fs.existsSync(ghCalled), false, "mismatched draft must not invoke gh");

  const authFailed = run([
    "submit", "--input", input, "--confirmed", "--confirm-token",
    draftPayload.draft.confirmationToken, "--receipt", draftPayload.draft.confirmationReceipt, "--json",
  ], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
    FAKE_GH_MODE: "auth-fail",
  });
  assert.equal(authFailed.status, 5);
  assert.equal(JSON.parse(authFailed.stdout).error.code, "github_auth_required");
  fs.rmSync(ghCalled, { force: true });

  const submitted = run([
    "submit", "--input", input, "--confirmed", "--confirm-token",
    draftPayload.draft.confirmationToken, "--receipt", draftPayload.draft.confirmationReceipt, "--json",
  ], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
    GH_BODY_FILE: ghBody,
    FAKE_GH_MODE: "ok",
  });
  assert.equal(submitted.status, 0, submitted.stderr);
  assert.equal(JSON.parse(submitted.stdout).issue.url, "https://github.com/Agentchengfeng/chengfeng-videocut/issues/123");
  assert.equal(fs.existsSync(injectionMarker), false, "title must never execute through a shell");
  assert.match(fs.readFileSync(ghCalled, "utf8"), /issue create --repo Agentchengfeng\/chengfeng-videocut/);
  assert.match(fs.readFileSync(ghBody, "utf8"), /## 问题概述/);

  const replayed = run([
    "submit", "--input", input, "--confirmed", "--confirm-token",
    draftPayload.draft.confirmationToken, "--receipt", draftPayload.draft.confirmationReceipt, "--json",
  ], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
    GH_BODY_FILE: ghBody,
  });
  assert.equal(JSON.parse(replayed.stdout).error.code, "confirmation_replayed");

  const duplicateDraft = run(["draft", "--input", input, "--json"]);
  const duplicatePayload = JSON.parse(duplicateDraft.stdout).draft;
  const duplicate = run([
    "submit", "--input", input, "--confirmed", "--confirm-token", duplicatePayload.confirmationToken,
    "--receipt", duplicatePayload.confirmationReceipt, "--json",
  ], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
    FAKE_GH_MODE: "duplicate",
  });
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
  assert.equal(JSON.parse(duplicate.stdout).issue.url, "https://github.com/Agentchengfeng/chengfeng-videocut/issues/9");
  assert.equal(fs.existsSync(`${duplicatePayload.confirmationReceipt}.used`), true, "duplicate result must consume confirmation receipt");

  const duplicateReplayed = run([
    "submit", "--input", input, "--confirmed", "--confirm-token", duplicatePayload.confirmationToken,
    "--receipt", duplicatePayload.confirmationReceipt, "--json",
  ], {
    CHENGFENG_VIDEOCUT_GH_BIN: gh,
    GH_CALLED_FILE: ghCalled,
    FAKE_GH_MODE: "duplicate",
  });
  assert.equal(duplicateReplayed.status, 9);
  assert.equal(JSON.parse(duplicateReplayed.stdout).error.code, "confirmation_replayed");

  const oversizedInput = path.join(tmp, "oversized.json");
  fs.writeFileSync(oversizedInput, JSON.stringify({
    target: "product",
    component: "Studio",
    title: "oversized public report",
    summary: "summary",
    steps: ["step"],
    expected: "expected",
    actual: "actual",
    evidence: Array.from({ length: 20 }, () => "证".repeat(2000)),
    acceptance: Array.from({ length: 20 }, () => "验".repeat(2000)),
  }));
  const oversized = run(["draft", "--input", oversizedInput, "--json"]);
  assert.equal(oversized.status, 3);
  assert.equal(JSON.parse(oversized.stdout).error.code, "invalid_bug_report");

  console.log(JSON.stringify({ draftSafe: true, confirmationBound: true, authFailClosed: true, submitSafe: true }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
