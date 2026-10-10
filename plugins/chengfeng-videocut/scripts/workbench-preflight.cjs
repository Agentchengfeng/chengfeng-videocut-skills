#!/usr/bin/env node

"use strict";

// Workbench is a read-only capability gate. It must never install the legacy
// Runtime contract as a substitute for the newer workbench contract.
const {
  RUNTIME_CONTRACT,
  extractRuntimeVersion,
  parseJson,
  resolveRuntimeInvocation,
  run,
  supportsRequiredVersion,
} = require("./ensure-runtime.cjs");

const WORKBENCH = RUNTIME_CONTRACT.workbenchRequirements;

function output(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  if (payload.ok) {
    process.stdout.write(`chengfeng-videocut workbench ready: ${payload.runtime.command}\n`);
  } else {
    process.stderr.write(`${payload.error.message}\n`);
  }
}

function commandArgs(base, args) {
  return base.kind === "source" ? [...base.args, ...args] : args;
}

function inspectWorkbench() {
  const base = resolveRuntimeInvocation([]);
  if (!base) return { state: "missing" };

  const versionResult = run({ ...base, args: commandArgs(base, ["--version"]) });
  const doctorResult = run({ ...base, args: commandArgs(base, ["doctor", "--json"]) });
  const commandsResult = run({
    ...base,
    args: commandArgs(base, ["workbench", "commands", "--json"]),
  });
  const doctor = parseJson(doctorResult.stdout);
  const commands = parseJson(commandsResult.stdout);
  const versionOutput = String(versionResult.stdout || versionResult.stderr || "").trim();
  const runtimeVersion = extractRuntimeVersion(versionOutput);
  const healthy = versionResult.status === 0 && doctorResult.status === 0 &&
    doctor?.ok === true && doctor?.data?.healthy === true;
  const versionCompatible = healthy && supportsRequiredVersion(
    runtimeVersion,
    WORKBENCH.minimumRuntimeVersion,
  );
  const operationSpecs = Object.values(commands?.data?.operations || {});
  const commandCompatible = commandsResult.status === 0 &&
    commands?.ok === true &&
    commands?.data &&
    WORKBENCH.requiredResponseFields.every((field) =>
      Object.prototype.hasOwnProperty.call(commands.data, field)) &&
    operationSpecs.length > 0 &&
    operationSpecs.every((operation) =>
      WORKBENCH.requiredOperationFields.every((field) =>
        Object.prototype.hasOwnProperty.call(operation, field)));
  const compatible = healthy && versionCompatible && commandCompatible;

  return {
    state: healthy ? (compatible ? "ready" : "incompatible") : "unhealthy",
    kind: base.kind,
    command: base.command,
    version: versionOutput,
    runtimeVersion,
    doctor,
    commands,
    compatibility: {
      versionCompatible,
      commandCompatible,
      requiredMinimumRuntimeVersion: WORKBENCH.minimumRuntimeVersion,
      requiredCommand: WORKBENCH.requiredCommand,
      releaseAvailable: WORKBENCH.releaseAvailable,
    },
    diagnostics: {
      versionExitCode: versionResult.status,
      doctorExitCode: doctorResult.status,
      commandsExitCode: commandsResult.status,
      stderr: String(
        commandsResult.stderr || doctorResult.stderr || versionResult.stderr || "",
      ).trim(),
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const unknown = argv.filter((arg) => arg !== "--json");
  if (unknown.length > 0) {
    output({
      ok: false,
      error: { code: "invalid_argument", message: `未知参数: ${unknown.join(" ")}` },
    }, json);
    return 2;
  }

  if (!WORKBENCH.supportedPlatforms.includes(process.platform)) {
    output({
      ok: false,
      error: {
        code: "platform_unsupported",
        message: `工作台操作目前支持 macOS 与 Windows，当前系统为 ${process.platform}。`,
        details: { platform: process.platform, supported: WORKBENCH.supportedPlatforms },
      },
    }, json);
    return 15;
  }

  const runtime = inspectWorkbench();
  if (runtime.state === "ready") {
    output({ ok: true, runtime }, json);
    return 0;
  }
  if (runtime.state === "missing") {
    output({
      ok: false,
      error: {
        code: "workbench_runtime_missing",
        message: `未检测到满足工作台要求的 Runtime（需要 >=${WORKBENCH.minimumRuntimeVersion}）。本预检不会安装旧版 ${RUNTIME_CONTRACT.releaseVersion}。`,
        details: { requiredMinimumRuntimeVersion: WORKBENCH.minimumRuntimeVersion, releaseAvailable: WORKBENCH.releaseAvailable },
      },
    }, json);
    return 10;
  }
  if (runtime.state === "unhealthy") {
    output({
      ok: false,
      error: {
        code: "workbench_runtime_unhealthy",
        message: "检测到 Runtime，但 doctor 未通过；工作台操作已停止。",
        details: runtime,
      },
    }, json);
    return 11;
  }
  output({
    ok: false,
    error: {
      code: "workbench_capability_missing",
      message: `当前 Runtime 不满足工作台合同（需要 >=${WORKBENCH.minimumRuntimeVersion} 且支持 workbench commands）；不会回退到旧版 Runtime。`,
      details: runtime,
    },
  }, json);
  return 14;
}

module.exports = { inspectWorkbench, main };

if (require.main === module) process.exitCode = main();
