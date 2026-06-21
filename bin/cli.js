#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const defaultRepo = "https://github.com/Agentchengfeng/chengfeng-videocut-skills.git";
const skillItems = [
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "CITATION.cff",
  ".env.example",
  "剪口播",
  "口播成片",
  "导入字幕",
  "自进化"
];

function printHelp() {
  console.log(`chengfeng-videocut-skills

Usage:
  npx chengfeng-videocut-skills install [options]

Options:
  --target all|claude|codex   Install target. Default: all
  --dir <path>                Install to a custom directory
  --repo <git-url>            Git repository to install from
  -h, --help                  Show help

Examples:
  npx chengfeng-videocut-skills install
  npx chengfeng-videocut-skills install --target codex
  npx chengfeng-videocut-skills install --dir ~/.claude/skills/chengfeng-videocut-skills
  npx chengfeng-videocut-skills install --repo https://github.com/Agentchengfeng/chengfeng-videocut-skills.git
`);
}

function parseArgs(argv) {
  const options = { command: argv[0], target: "all", dir: null, repo: defaultRepo };

  if (argv[0] === "-h" || argv[0] === "--help") {
    options.help = true;
    return options;
  }

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--target") {
      options.target = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--dir") {
      options.dir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--repo") {
      options.repo = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function copyItem(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, destination, { recursive: true, force: true });
    return;
  }
  fs.copyFileSync(source, destination);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result;
}

function downloadRepo(repoUrl) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chengfeng-videocut-skills-"));
  const destination = path.join(tempRoot, "repo");

  console.log(`Downloading latest skills from ${repoUrl}`);
  run("git", ["clone", "--depth", "1", repoUrl, destination]);

  return { sourceRoot: destination, tempRoot };
}

function installTo(sourceRoot, destination) {
  const resolved = path.resolve(expandHome(destination));
  const parent = path.dirname(resolved);
  fs.mkdirSync(parent, { recursive: true });

  if (fs.existsSync(resolved)) {
    const backup = `${resolved}.backup-${timestamp()}`;
    fs.renameSync(resolved, backup);
    console.log(`Backed up existing skills: ${backup}`);
  }

  fs.mkdirSync(resolved, { recursive: true });

  for (const item of skillItems) {
    const source = path.join(sourceRoot, item);
    if (!fs.existsSync(source)) continue;
    copyItem(source, path.join(resolved, item));
  }

  return resolved;
}

function targetsFor(options) {
  if (options.dir) return [options.dir];

  if (options.target === "claude") return ["~/.claude/skills/chengfeng-videocut-skills"];
  if (options.target === "codex") return ["~/.codex/skills/chengfeng-videocut-skills"];
  if (options.target === "all") {
    return [
      "~/.claude/skills/chengfeng-videocut-skills",
      "~/.codex/skills/chengfeng-videocut-skills"
    ];
  }

  throw new Error(`Invalid target: ${options.target}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.command) {
    printHelp();
    return;
  }

  if (options.command !== "install") {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const { sourceRoot, tempRoot } = downloadRepo(options.repo);
  const installed = targetsFor(options).map((target) => installTo(sourceRoot, target));
  fs.rmSync(tempRoot, { recursive: true, force: true });

  console.log("\nInstalled chengfeng videocut skills:");
  for (const destination of installed) {
    console.log(`- ${destination}`);
  }
  console.log("\nNext: open Claude Code or Codex and use the videocut skills.");
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error("Run `npx chengfeng-videocut-skills --help` for usage.");
  process.exitCode = 1;
}
