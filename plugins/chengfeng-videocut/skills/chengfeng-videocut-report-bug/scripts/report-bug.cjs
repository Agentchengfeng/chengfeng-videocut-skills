#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const REPOSITORIES = {
  skills: "Agentchengfeng/chengfeng-videocut-skills",
  product: "Agentchengfeng/chengfeng-videocut",
};
const MAX_BODY_BYTES = 55 * 1024;
const RECEIPT_TTL_MS = 30 * 60 * 1000;

function quoteCmdArgument(value) {
  const text = String(value);
  if (/[\0\r\n"]/.test(text)) {
    throw new Error("unsafe Windows command argument");
  }
  return `"${text.replaceAll("%", "%%")}"`;
}

// Node refuses to launch .cmd/.bat files directly on current Windows releases.
// Delayed expansion stays off, percent expansion is escaped, and every argument
// remains quoted in the single command line parsed by cmd.exe.
function windowsSafeInvocation(command, args) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: [
        "/d",
        "/v:off",
        "/s",
        "/c",
        `"${[
          quoteCmdArgument(command),
          ...args.map(quoteCmdArgument),
        ].join(" ")}"`,
      ],
      windowsVerbatimArguments: true,
    };
  }
  return { command, args, windowsVerbatimArguments: false };
}

function isSensitiveKey(key) {
  const normalized = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
  return /(?:^|_)(?:api_keys?|access_key_ids?|secret_access_keys?|client_secrets?|secrets?|tokens?|passwords?|passwds?|cookies?|authorizations?|credentials?|private_keys?|session_keys?|project_ids?|video_names?|file_names?)(?:$|_)/.test(normalized);
}

function sanitizeStructured(value, key = "") {
  if (isSensitiveKey(key)) return "<redacted>";
  if (Array.isArray(value)) return value.map((item) => sanitizeStructured(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      sanitizeStructured(childValue, childKey),
    ]));
  }
  return value;
}

function diagnosticText(value, key = "") {
  if (isSensitiveKey(key)) return "<redacted>";
  return typeof value === "string" ? value : JSON.stringify(sanitizeStructured(value));
}

function redactText(value) {
  let text = String(value ?? "");
  text = text
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[opsu]_[A-Za-z0-9_]+)\b/g, "<redacted-github-token>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "<redacted-api-key>")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "<redacted-jwt>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <redacted>")
    .replace(/\bBasic\s+[A-Za-z0-9+/]+=*/gi, "Basic <redacted>")
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g, "<redacted-private-key>")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "<redacted-access-key-id>")
    .replace(/((?:https?|postgres(?:ql)?|mysql|rediss?|mongodb(?:\+srv)?):\/\/)[^/@\s]+@/gi, "$1<redacted>@")
    .replace(/(["'])(?:\/Users\/|\/Volumes\/|\/home\/)[^"'\r\n]+\1/g, (_, quote, offset, source) => {
      const match = source.slice(offset).match(/^(["'])(\/Users\/|\/Volumes\/|\/home\/)/);
      const root = match?.[2] === "/Users/"
        ? "/Users/<user>"
        : (match?.[2] === "/home/" ? "/home/<user>" : "/Volumes/<volume>");
      return `${quote}${root}/<redacted-path>${quote}`;
    })
    .replace(/\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?keys?|access[_-]?keys?(?:[_-]?ids?)?|secrets?(?:[_-]?access[_-]?keys?)?|client[_-]?secrets?|tokens?|passwords?|passwds?|cookies?|authorizations?|credentials?|private[_-]?keys?|session[_-]?keys?|project[_-]?ids?|video[_-]?names?|file[_-]?names?)(?:[_-][A-Za-z0-9]+)*|accessKeyIds?|clientSecrets?|privateKeys?|sessionKeys?|projectIds?|videoNames?|fileNames?)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|\[[^\r\n]*\]|\{[^\r\n]*\}|[^\s,;，。；}]+)/gi, "$1=<redacted>")
    .replace(/\/Users\/[^/\s]+(?:\/[^\r\n,;，。；)\]]*)?/g, "/Users/<user>/<redacted-path>")
    .replace(/\/Volumes\/[^/\s]+(?:\/[^\r\n,;，。；)\]]*)?/g, "/Volumes/<volume>/<redacted-path>")
    .replace(/\/home\/[^/\s]+(?:\/[^\r\n,;，。；)\]]*)?/g, "/home/<user>/<redacted-path>")
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s]+(?:\\[^\r\n,;，。；)\]]*)?/g, "C:\\Users\\<user>\\<redacted-path>")
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(:\d+)?[^\s)\]]*/gi, (match) => {
      try {
        const url = new URL(match);
        return `${url.protocol}//${url.host}/`;
      } catch {
        return "http://localhost/";
      }
    });
  return text;
}

function cleanString(value, field, min = 1, max = 8000) {
  const result = redactText(value).trim();
  if (result.length < min) throw new Error(`${field} 不能为空`);
  if (result.length > max) throw new Error(`${field} 超过 ${max} 字符`);
  return result;
}

function normalizeInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("输入必须是 JSON 对象");
  if (!REPOSITORIES[raw.target]) throw new Error("target 必须明确为 product 或 skills");
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  if (steps.length === 0) throw new Error("steps 至少需要一条复现步骤");
  if (steps.length > 20) throw new Error("steps 最多 20 条");
  const environmentEntries = raw.environment && typeof raw.environment === "object" && !Array.isArray(raw.environment)
    ? Object.entries(raw.environment)
    : [];
  if (environmentEntries.length > 30) throw new Error("environment 最多 30 项");
  if (Array.isArray(raw.acceptance) && raw.acceptance.length > 20) throw new Error("acceptance 最多 20 条");
  const title = cleanString(raw.title, "title", 5, 140);
  return {
    schemaVersion: 1,
    title: /^\[Bug\]/i.test(title) ? title : `[Bug] ${title}`,
    component: cleanString(raw.component || "unknown", "component", 1, 80),
    summary: cleanString(raw.summary, "summary", 1, 4000),
    steps: steps.map((step, index) => cleanString(step, `steps[${index}]`, 1, 1000)),
    expected: cleanString(raw.expected, "expected", 1, 4000),
    actual: cleanString(raw.actual, "actual", 1, 4000),
    environment: environmentEntries.length > 0
      ? Object.fromEntries(environmentEntries.map(([key, value]) => [
        cleanString(key, "environment key", 1, 80),
        cleanString(diagnosticText(value, key), "environment value", 1, 1000),
      ]))
      : {},
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.slice(0, 20).map((item, index) => cleanString(
        diagnosticText(item),
        `evidence[${index}]`,
        1,
        2000,
      )).filter(Boolean)
      : [],
    acceptance: Array.isArray(raw.acceptance)
      ? raw.acceptance.map((item, index) => cleanString(item, `acceptance[${index}]`, 1, 2000)).filter(Boolean)
      : [],
    target: raw.target,
  };
}

function renderList(items, ordered = false) {
  if (items.length === 0) return "- 无";
  return items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
}

function issueFingerprint(input) {
  const identity = JSON.stringify({
    component: input.component.toLowerCase(),
    steps: input.steps.map((step) => step.toLowerCase()),
    actual: input.actual.toLowerCase(),
  });
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function renderIssue(input) {
  const environment = Object.keys(input.environment).length > 0
    ? Object.entries(input.environment).map(([key, value]) => `- ${key}: ${value}`).join("\n")
    : "- 未获取";
  const acceptance = input.acceptance.length > 0
    ? `\n\n## 验收标准\n\n${renderList(input.acceptance)}`
    : "";
  const body = `## 问题概述

${input.summary}

## 复现步骤

${renderList(input.steps, true)}

## 预期结果

${input.expected}

## 实际结果

${input.actual}

## 环境

- 组件: ${input.component}
${environment}

## 证据

${renderList(input.evidence)}${acceptance}

## 隐私检查

- 已自动清理本地用户名、卷名、localhost 查询参数与常见密钥格式。
- 未自动上传视频、转录正文、项目文件或完整日志。

---
由 \`chengfeng-videocut:chengfeng-videocut-report-bug\` 生成。
<!-- chengfeng-videocut-bug-fingerprint: ${issueFingerprint(input)} -->`;
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new Error(`脱敏后的 Issue 正文超过 ${MAX_BODY_BYTES} bytes`);
  }
  return body;
}

function contentFingerprint(repo, title, body) {
  return crypto.createHash("sha256").update(`${repo}\n${title}\n${body}`).digest("hex");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createReceipt(file, fingerprint, now = Date.now()) {
  const receipt = path.resolve(file);
  const token = crypto.randomBytes(32).toString("hex");
  const payload = {
    schemaVersion: 1,
    contentFingerprint: fingerprint,
    tokenHash: tokenHash(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RECEIPT_TTL_MS).toISOString(),
  };
  fs.writeFileSync(receipt, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  fs.rmSync(`${receipt}.used`, { force: true });
  return { receipt, token, expiresAt: payload.expiresAt };
}

function validateReceipt(file, token, fingerprint, now = Date.now()) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch {
    return { ok: false, code: "confirmation_receipt_invalid", message: "确认凭据不存在或格式无效。" };
  }
  if (fs.existsSync(`${path.resolve(file)}.used`)) {
    return { ok: false, code: "confirmation_replayed", message: "这份确认凭据已经使用，不能重复提交。" };
  }
  if (payload.schemaVersion !== 1 || payload.contentFingerprint !== fingerprint) {
    return { ok: false, code: "confirmation_mismatch", message: "Issue 草稿在确认后发生变化。" };
  }
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAt) || now > expiresAt) {
    return { ok: false, code: "confirmation_expired", message: "确认凭据已过期，必须重新展示草稿。" };
  }
  const expected = Buffer.from(String(payload.tokenHash || ""));
  const actual = Buffer.from(tokenHash(token));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, code: "confirmation_mismatch", message: "确认令牌与草稿不匹配。" };
  }
  return { ok: true, payload };
}

function consumeReceipt(file, token, fingerprint) {
  const validation = validateReceipt(file, token, fingerprint);
  if (!validation.ok) return validation;
  const used = `${path.resolve(file)}.used`;
  try {
    const descriptor = fs.openSync(used, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify({ usedAt: new Date().toISOString(), contentFingerprint: fingerprint })}\n`);
    fs.closeSync(descriptor);
  } catch {
    return { ok: false, code: "confirmation_replayed", message: "这份确认凭据已经使用，不能重复提交。" };
  }
  return { ok: true };
}

function parseArgs(argv) {
  const command = argv[0];
  if (!["draft", "submit"].includes(command)) throw new Error("命令必须是 draft 或 submit");
  const options = { command, json: false, confirmed: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--confirmed") options.confirmed = true;
    else if (["--input", "--output", "--target", "--confirm-token", "--receipt"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else throw new Error(`未知参数: ${arg}`);
  }
  if (!options.input) throw new Error("必须提供 --input");
  if (options.target && !REPOSITORIES[options.target]) throw new Error("--target 只允许 skills 或 product");
  return options;
}

function runGh(args, options = {}) {
  const command = process.env.CHENGFENG_VIDEOCUT_GH_BIN || "gh";
  const invocation = windowsSafeInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    input: options.input,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

function findDuplicate(repo, fingerprint) {
  const result = runGh([
    "issue", "list", "--repo", repo, "--state", "open",
    "--search", `${fingerprint} in:body`, "--limit", "20", "--json", "number,title,url,body",
  ]);
  if (result.status !== 0) {
    return { ok: false, error: redactText(result.stderr || result.stdout || "Issue 查重失败") };
  }
  try {
    const issues = JSON.parse(result.stdout);
    return {
      ok: true,
      issue: issues.find((issue) => String(issue.body || "").includes(`chengfeng-videocut-bug-fingerprint: ${fingerprint}`)) || null,
    };
  } catch {
    return { ok: false, error: "GitHub Issue 查重结果不是有效 JSON" };
  }
}

function emit(payload, json) {
  const stream = payload.ok || json ? process.stdout : process.stderr;
  if (json) stream.write(`${JSON.stringify(payload)}\n`);
  else if (payload.ok) stream.write(`${payload.issue?.url || payload.draft?.body || "ok"}\n`);
  else stream.write(`${payload.error.message}\n`);
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    emit({ ok: false, error: { code: "invalid_argument", message: error.message } }, argv.includes("--json"));
    return 2;
  }

  let input;
  try {
    input = normalizeInput(JSON.parse(fs.readFileSync(path.resolve(options.input), "utf8")));
    if (options.target && options.target !== input.target) throw new Error("--target 必须与草稿 input.target 一致");
  } catch (error) {
    emit({ ok: false, error: { code: "invalid_bug_report", message: error.message } }, options.json);
    return 3;
  }

  const repo = REPOSITORIES[input.target];
  let body;
  try {
    body = renderIssue(input);
  } catch (error) {
    emit({ ok: false, error: { code: "invalid_bug_report", message: error.message } }, options.json);
    return 3;
  }
  const fingerprint = contentFingerprint(repo, input.title, body);
  if (options.output) fs.writeFileSync(path.resolve(options.output), `${body}\n`, { mode: 0o600 });

  if (options.command === "draft") {
    const receiptFile = options.receipt || `${path.resolve(options.output || options.input)}.confirmation.json`;
    const confirmation = createReceipt(receiptFile, fingerprint);
    emit({
      ok: true,
      draft: {
        repo,
        label: "bug",
        title: input.title,
        body,
        confirmationToken: confirmation.token,
        confirmationReceipt: confirmation.receipt,
        confirmationExpiresAt: confirmation.expiresAt,
        output: options.output ? path.resolve(options.output) : null,
      },
    }, options.json);
    return 0;
  }

  if (!options.confirmed || !options.confirmToken || !options.receipt) {
    emit({
      ok: false,
      error: {
        code: "confirmation_required",
        message: "提交 GitHub Issue 前必须展示仓库、标题和草稿，并在用户明确确认后传入 --confirmed。",
      },
    }, options.json);
    return 4;
  }
  const confirmation = validateReceipt(options.receipt, options.confirmToken, fingerprint);
  if (!confirmation.ok) {
    emit({
      ok: false,
      error: {
        code: confirmation.code,
        message: `${confirmation.message} 必须重新展示草稿并取得新的确认令牌。`,
      },
    }, options.json);
    return confirmation.code === "confirmation_replayed"
      ? 9
      : (confirmation.code === "confirmation_expired" ? 10 : 7);
  }

  const auth = runGh(["auth", "status", "-h", "github.com"]);
  if (auth.status !== 0) {
    emit({
      ok: false,
      error: {
        code: "github_auth_required",
        message: "GitHub CLI 尚未登录或认证已失效；草稿已保留，未声称上报成功。",
        details: redactText(auth.stderr || auth.stdout),
        newIssueUrl: `https://github.com/${repo}/issues/new`,
      },
    }, options.json);
    return 5;
  }

  const repoCheck = runGh(["repo", "view", repo, "--json", "hasIssuesEnabled"]);
  let repoState;
  try {
    repoState = JSON.parse(repoCheck.stdout || "{}");
  } catch {
    repoState = null;
  }
  if (repoCheck.status !== 0 || repoState?.hasIssuesEnabled !== true) {
    emit({
      ok: false,
      error: {
        code: "github_preflight_failed",
        message: "目标仓库不可访问或未启用 Issues；草稿未提交。",
        details: redactText(repoCheck.stderr || repoCheck.stdout),
      },
    }, options.json);
    return 8;
  }

  const labelCheck = runGh(["label", "list", "--repo", repo, "--search", "bug", "--limit", "20", "--json", "name"]);
  let labels;
  try {
    labels = JSON.parse(labelCheck.stdout || "[]");
  } catch {
    labels = null;
  }
  if (labelCheck.status !== 0 || !Array.isArray(labels) || !labels.some((label) => label.name === "bug")) {
    emit({
      ok: false,
      error: {
        code: "github_preflight_failed",
        message: "目标仓库缺少 bug 标签或标签无法读取；草稿未提交。",
        details: redactText(labelCheck.stderr || labelCheck.stdout),
      },
    }, options.json);
    return 8;
  }

  const duplicateCheck = findDuplicate(repo, issueFingerprint(input));
  if (!duplicateCheck.ok) {
    emit({
      ok: false,
      error: {
        code: "github_preflight_failed",
        message: "无法完成重复 Issue 检查；为避免重复上报，本次未提交。",
        details: duplicateCheck.error,
      },
    }, options.json);
    return 8;
  }
  const consumed = consumeReceipt(options.receipt, options.confirmToken, fingerprint);
  if (!consumed.ok) {
    emit({ ok: false, error: { code: consumed.code, message: consumed.message } }, options.json);
    return 9;
  }

  if (duplicateCheck.issue) {
    emit({ ok: true, duplicate: true, issue: duplicateCheck.issue, repo }, options.json);
    return 0;
  }

  const created = runGh([
    "issue", "create", "--repo", repo, "--title", input.title, "--body-file", "-", "--label", "bug",
  ], { input: body });
  const issueUrl = String(created.stdout || "").trim().split(/\r?\n/).find((line) => /^https:\/\/github\.com\//.test(line));
  if (created.status !== 0 || !issueUrl) {
    emit({
      ok: false,
      error: {
        code: "github_issue_create_failed",
        message: "GitHub Issue 创建失败；草稿仍可用于手工上报。",
        details: redactText(created.stderr || created.stdout),
        newIssueUrl: `https://github.com/${repo}/issues/new`,
        mayHaveCreated: created.status === 0,
      },
    }, options.json);
    return 6;
  }

  emit({ ok: true, duplicate: false, repo, issue: { title: input.title, url: issueUrl } }, options.json);
  return 0;
}

module.exports = {
  REPOSITORIES,
  consumeReceipt,
  contentFingerprint,
  createReceipt,
  findDuplicate,
  diagnosticText,
  isSensitiveKey,
  issueFingerprint,
  main,
  normalizeInput,
  redactText,
  renderIssue,
  sanitizeStructured,
  validateReceipt,
};

if (require.main === module) process.exitCode = main();
