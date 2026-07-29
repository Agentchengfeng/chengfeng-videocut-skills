"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dictionary = fs.readFileSync(
  path.resolve(__dirname, "..", "references", "ai-term-dictionary.md"),
  "utf8",
);
const rows = dictionary
  .split(/\r?\n/)
  .filter((line) => /^\|[^-].*\|$/.test(line))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
  .filter(([canonical]) => canonical && canonical !== "正确写法");

const aliases = new Set(
  rows.flatMap(([, variants = ""]) =>
    variants.split("/").map((variant) => variant.trim()).filter(Boolean)),
);
for (const spokenChinese of [
  "代理",
  "智能体",
  "命令行",
  "提示词",
  "令牌",
  "大模型",
  "技能",
  "工作流",
  "叉",
  "推特",
  "副驾驶",
  "光标",
]) {
  assert.equal(
    aliases.has(spokenChinese),
    false,
    `dictionary must preserve spoken Chinese instead of translating ${spokenChinese}`,
  );
}

const canonicalTerms = new Set(rows.map(([canonical]) => canonical));
for (const term of [
  "Agent",
  "Codex",
  "Obsidian",
  "HyperFrames",
  "Chengfeng",
  "TikHub",
  "TTS",
  "ASR",
]) {
  assert.equal(canonicalTerms.has(term), true, `dictionary must include ${term}`);
}

console.log(JSON.stringify({
  spokenChinesePreserved: true,
  obsidianAiVocabularyIncluded: true,
}));
