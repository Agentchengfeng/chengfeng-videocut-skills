"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const channel = process.argv[2];
if (!["release", "local-development"].includes(channel)) {
  throw new Error("Usage: node scripts/native-mcp-ldflags.cjs <release|local-development>");
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (typeof pkg.version !== "string" || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(pkg.version)) {
  throw new Error(`package.json version is not an exact semver: ${pkg.version}`);
}

const modulePath = "github.com/Agentchengfeng/chengfeng-videocut-skills/plugins/chengfeng-videocut/internal/bootstrap";
process.stdout.write([
  "-s",
  "-w",
  "-buildid=",
  "-X",
  `${modulePath}.Version=${pkg.version}`,
  "-X",
  `${modulePath}.BuildChannel=${channel}`,
].join(" "));
