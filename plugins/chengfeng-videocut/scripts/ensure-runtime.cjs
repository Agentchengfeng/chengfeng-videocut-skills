#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");

const PRODUCT = "chengfeng-videocut";
const CONTRACT_PATH = path.resolve(__dirname, "..", "runtime-requirements.json");
const RUNTIME_CONTRACT = loadRuntimeContract();
const INSTALL_NOTICE =
  `未检测到 chengfeng-videocut，正在安装 ${RUNTIME_CONTRACT.releaseTag}；完成后继续当前任务。`;

class RuntimeInstallError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeInstallError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseSemver(value) {
  const match = String(value || "").match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || null,
  };
}

function compareSemver(left, right) {
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease, "en");
}

function loadRuntimeContract(contractPath = CONTRACT_PATH) {
  let contract;
  try {
    contract = JSON.parse(readFileSync(contractPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取 Runtime 合同 ${contractPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const capabilities = contract?.capabilities;
  const studioCapabilities = contract?.studioCapabilities;
  const valid = contract?.schemaVersion === 1 &&
    contract?.product === PRODUCT &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(contract?.repository || "") &&
    /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(contract?.releaseTag || "") &&
    parseSemver(contract?.releaseVersion) !== null &&
    contract.releaseTag === `v${contract.releaseVersion}` &&
    parseSemver(contract?.minimumRuntimeVersion) !== null &&
    /^[A-Za-z0-9_.-]+$/.test(contract?.installerAsset || "") &&
    /^[A-Za-z0-9_.-]+$/.test(contract?.checksumAsset || "") &&
    isPlainObject(studioCapabilities) &&
    Array.isArray(studioCapabilities.topLevelViews) &&
    studioCapabilities.topLevelViews.length > 0 &&
    studioCapabilities.topLevelViews.every((view) => typeof view === "string" && /^[a-z0-9-]+$/.test(view)) &&
    new Set(studioCapabilities.topLevelViews).size === studioCapabilities.topLevelViews.length &&
    studioCapabilities.legacyWorkbenchPanel === false &&
    studioCapabilities.managedTimelineEditing === true &&
    Array.isArray(studioCapabilities.managedTimelineOperations) &&
    studioCapabilities.managedTimelineOperations.length > 0 &&
    studioCapabilities.managedTimelineOperations.every((operation) => typeof operation === "string") &&
    new Set(studioCapabilities.managedTimelineOperations).size === studioCapabilities.managedTimelineOperations.length &&
    isPlainObject(capabilities) &&
    Number.isInteger(capabilities.runtimeApiVersion) &&
    Number.isInteger(capabilities.editListSchemaVersion) &&
    Array.isArray(capabilities.editListOperations) &&
    capabilities.editListOperations.length > 0 &&
    capabilities.editListOperations.every((operation) => typeof operation === "string") &&
    new Set(capabilities.editListOperations).size === capabilities.editListOperations.length &&
    capabilities.managedArollProjection === true &&
    capabilities.expectedEditListRevision === true &&
    Number.isInteger(capabilities.serviceApiVersion) &&
    Array.isArray(capabilities.serviceOperations) &&
    capabilities.serviceOperations.length > 0 &&
    capabilities.serviceOperations.every((operation) => typeof operation === "string") &&
    new Set(capabilities.serviceOperations).size === capabilities.serviceOperations.length &&
    Array.isArray(capabilities.transcriptOperations) &&
    capabilities.transcriptOperations.length > 0 &&
    capabilities.transcriptOperations.every((operation) => typeof operation === "string") &&
    new Set(capabilities.transcriptOperations).size === capabilities.transcriptOperations.length &&
    capabilities.managedStudioService === true &&
    capabilities.serviceParentProcessIndependent === true &&
    capabilities.serviceCrashRestart === true;
  if (!valid) throw new Error(`Runtime 合同格式无效: ${contractPath}`);
  return contract;
}

function extractRuntimeVersion(output) {
  const match = String(output || "").match(/(?:^|\s)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=\s|$)/);
  return match ? match[1] : null;
}

function supportsRequiredVersion(version, minimum = RUNTIME_CONTRACT.minimumRuntimeVersion) {
  const actual = parseSemver(version);
  const required = parseSemver(minimum);
  return actual !== null && required !== null && compareSemver(actual, required) >= 0;
}

function supportsRequiredCapabilities(doctor, required = RUNTIME_CONTRACT.capabilities) {
  const capabilities = doctor?.data?.capabilities;
  return capabilities?.runtimeApiVersion === required.runtimeApiVersion &&
    capabilities?.editListSchemaVersion === required.editListSchemaVersion &&
    capabilities?.managedArollProjection === required.managedArollProjection &&
    capabilities?.expectedEditListRevision === required.expectedEditListRevision &&
    capabilities?.serviceApiVersion === required.serviceApiVersion &&
    capabilities?.managedStudioService === required.managedStudioService &&
    capabilities?.serviceParentProcessIndependent === required.serviceParentProcessIndependent &&
    capabilities?.serviceCrashRestart === required.serviceCrashRestart &&
    Array.isArray(capabilities?.editListOperations) &&
    required.editListOperations.every((operation) =>
      capabilities.editListOperations.includes(operation)) &&
    Array.isArray(capabilities?.serviceOperations) &&
    required.serviceOperations.every((operation) =>
      capabilities.serviceOperations.includes(operation)) &&
    Array.isArray(capabilities?.transcriptOperations) &&
    required.transcriptOperations.every((operation) =>
      capabilities.transcriptOperations.includes(operation));
}

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && (process.platform === "win32" || (stat.mode & 0o111) !== 0);
  } catch {
    return false;
  }
}

function findCommand(name) {
  const extensions = process.platform === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const directory of String(process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function managedHome() {
  return path.resolve(
    process.env.CHENGFENG_VIDEOCUT_HOME || path.join(os.homedir(), ".chengfeng-videocut"),
  );
}

function sourceInvocation(args) {
  const directory = process.env.CHENGFENG_VIDEOCUT_DIR;
  if (!directory) return null;
  const root = path.resolve(directory);
  const entry = path.join(root, "apps", "cli", "src", "cli.ts");
  if (!fs.existsSync(entry)) {
    throw new Error(`CHENGFENG_VIDEOCUT_DIR 不是产品源码目录: ${root}`);
  }
  const bun = findCommand("bun");
  if (!bun) throw new Error("本地源码模式需要 Bun；当前 PATH 中找不到 bun");
  return { command: bun, args: [entry, ...args], cwd: root, kind: "source" };
}

function resolveRuntimeInvocation(args = []) {
  const explicit = process.env.CHENGFENG_VIDEOCUT_BIN;
  if (explicit) {
    const candidate = path.resolve(explicit);
    return isExecutable(candidate)
      ? { command: candidate, args, cwd: process.cwd(), kind: "explicit" }
      : null;
  }

  const installed = findCommand(PRODUCT);
  if (installed) return { command: installed, args, cwd: process.cwd(), kind: "path" };

  const managed = path.join(managedHome(), "bin", PRODUCT);
  if (isExecutable(managed)) {
    return { command: managed, args, cwd: process.cwd(), kind: "managed" };
  }

  return sourceInvocation(args);
}

function run(invocation) {
  return spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function parseJson(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // The CLI may write a human-readable line before its JSON envelope.
    }
  }
  return null;
}

function inspectRuntime() {
  const base = resolveRuntimeInvocation([]);
  if (!base) return { state: "missing" };

  const versionResult = run({ ...base, args: base.kind === "source" ? [...base.args, "--version"] : ["--version"] });
  const doctorResult = run({ ...base, args: base.kind === "source" ? [...base.args, "doctor", "--json"] : ["doctor", "--json"] });
  const doctor = parseJson(doctorResult.stdout);
  const versionOutput = String(versionResult.stdout || versionResult.stderr || "").trim();
  const runtimeVersion = extractRuntimeVersion(versionOutput);
  const healthy = versionResult.status === 0 && doctorResult.status === 0 &&
    doctor?.ok === true && doctor?.data?.healthy === true;
  const versionCompatible = healthy && supportsRequiredVersion(runtimeVersion);
  const capabilityCompatible = healthy && supportsRequiredCapabilities(doctor);
  const compatible = versionCompatible && capabilityCompatible;

  return {
    state: healthy ? (compatible ? "ready" : "incompatible") : "unhealthy",
    kind: base.kind,
    command: base.command,
    version: versionOutput,
    runtimeVersion,
    doctor,
    compatibility: healthy ? {
      versionCompatible,
      capabilityCompatible,
      requiredReleaseTag: RUNTIME_CONTRACT.releaseTag,
      minimumRuntimeVersion: RUNTIME_CONTRACT.minimumRuntimeVersion,
    } : undefined,
    diagnostics: healthy ? undefined : {
      versionExitCode: versionResult.status,
      doctorExitCode: doctorResult.status,
      stderr: String(doctorResult.stderr || versionResult.stderr || "").trim(),
    },
  };
}

function releaseBase() {
  return process.env.CHENGFENG_VIDEOCUT_RELEASE_BASE ||
    `https://github.com/${RUNTIME_CONTRACT.repository}/releases/download/${RUNTIME_CONTRACT.releaseTag}`;
}

function downloadFile(url, destination, label) {
  const result = spawnSync("curl", [
    "-fsSL", "--retry", "3", "--connect-timeout", "15", url, "-o", destination,
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new RuntimeInstallError(
      "runtime_release_unavailable",
      `${RUNTIME_CONTRACT.releaseTag} ${label}不可用；Runtime 尚未发布或下载失败。${String(result.stderr || "").trim() ? ` ${String(result.stderr).trim()}` : ""}`,
    );
  }
}

function expectedChecksum(checksumText, assetName) {
  for (const line of String(checksumText || "").split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === assetName) return match[1].toLowerCase();
  }
  return null;
}

function verifyInstaller(installer, checksumFile) {
  const expected = expectedChecksum(readFileSync(checksumFile, "utf8"), RUNTIME_CONTRACT.installerAsset);
  if (!expected) {
    throw new RuntimeInstallError(
      "runtime_release_incomplete",
      `${RUNTIME_CONTRACT.releaseTag} 的 ${RUNTIME_CONTRACT.checksumAsset} 未声明 ${RUNTIME_CONTRACT.installerAsset}。`,
    );
  }
  const actual = createHash("sha256").update(readFileSync(installer)).digest("hex");
  if (actual !== expected) {
    throw new RuntimeInstallError(
      "installer_checksum_mismatch",
      `${RUNTIME_CONTRACT.releaseTag} 安装器 SHA-256 校验失败；安装已停止。`,
    );
  }
}

function installRuntime() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "chengfeng-videocut-installer-"));
  const installer = path.join(directory, "install.sh");
  const checksum = path.join(directory, RUNTIME_CONTRACT.checksumAsset);
  const targetReleaseBase = releaseBase();
  try {
    const localInstaller = process.env.CHENGFENG_VIDEOCUT_INSTALLER_FILE;
    if (localInstaller) {
      writeFileSync(installer, readFileSync(path.resolve(localInstaller)));
    } else {
      downloadFile(`${targetReleaseBase}/${RUNTIME_CONTRACT.installerAsset}`, installer, "安装器");
      downloadFile(`${targetReleaseBase}/${RUNTIME_CONTRACT.checksumAsset}`, checksum, "校验清单");
      verifyInstaller(installer, checksum);
    }

    const result = spawnSync("/bin/sh", [installer], {
      env: {
        ...process.env,
        // A tagged installer must consume assets from the same exact release,
        // never from the mutable `latest` alias.
        CHENGFENG_VIDEOCUT_DOWNLOAD_BASE: targetReleaseBase,
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      throw new RuntimeInstallError(
        "installer_failed",
        `${RUNTIME_CONTRACT.releaseTag} 官方安装器退出码 ${String(result.status)}`,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function output(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }
  if (payload.ok) {
    process.stdout.write(`${PRODUCT} ready: ${payload.runtime.command}\n`);
  } else {
    process.stderr.write(`${payload.error.message}\n`);
  }
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const installIfMissing = argv.includes("--install-if-missing");
  const unknown = argv.filter((arg) => !["--json", "--install-if-missing"].includes(arg));
  if (unknown.length > 0) {
    output({ ok: false, error: { code: "invalid_argument", message: `未知参数: ${unknown.join(" ")}` } }, json);
    return 2;
  }

  let runtime = inspectRuntime();
  if (runtime.state === "ready") {
    output({ ok: true, installed: false, runtime }, json);
    return 0;
  }
  if (runtime.state === "unhealthy") {
    output({
      ok: false,
      error: {
        code: "runtime_unhealthy",
        message: "chengfeng-videocut 已存在但 doctor 未通过；为避免覆盖现有安装，本次不会自动重装。",
        details: runtime,
      },
    }, json);
    return 11;
  }
  if (runtime.state === "incompatible") {
    output({
      ok: false,
      error: {
        code: "runtime_capability_missing",
        message: `当前 chengfeng-videocut Runtime 不满足 ${RUNTIME_CONTRACT.releaseTag} 合同；请升级后再继续，禁止回退旧剪辑链。`,
        details: runtime,
      },
    }, json);
    return 14;
  }
  if (!installIfMissing) {
    output({
      ok: false,
      error: { code: "runtime_missing", message: "未检测到 chengfeng-videocut。" },
    }, json);
    return 10;
  }

  process.stderr.write(`${INSTALL_NOTICE}\n`);
  try {
    installRuntime();
  } catch (error) {
    output({
      ok: false,
      error: {
        code: "install_failed",
        message: error instanceof Error ? error.message : String(error),
        details: {
          reasonCode: error instanceof RuntimeInstallError ? error.code : "installer_unknown_error",
          requiredReleaseTag: RUNTIME_CONTRACT.releaseTag,
          minimumRuntimeVersion: RUNTIME_CONTRACT.minimumRuntimeVersion,
        },
      },
    }, json);
    return 12;
  }

  runtime = inspectRuntime();
  if (runtime.state !== "ready") {
    output({
      ok: false,
      error: {
        code: runtime.state === "incompatible"
          ? "runtime_capability_missing"
          : "post_install_doctor_failed",
        message: runtime.state === "incompatible"
          ? `安装完成，但 Runtime 不满足 ${RUNTIME_CONTRACT.releaseTag} 版本与能力合同；当前任务已停止，Studio 未打开。`
          : "安装完成，但 doctor 未通过；当前任务已停止，Studio 未打开。",
        details: runtime,
      },
    }, json);
    return runtime.state === "incompatible" ? 14 : 13;
  }

  output({ ok: true, installed: true, runtime }, json);
  return 0;
}

module.exports = {
  INSTALL_NOTICE,
  RUNTIME_CONTRACT,
  expectedChecksum,
  extractRuntimeVersion,
  inspectRuntime,
  main,
  managedHome,
  parseSemver,
  resolveRuntimeInvocation,
  supportsRequiredCapabilities,
  supportsRequiredVersion,
  verifyInstaller,
};

if (require.main === module) process.exitCode = main();
