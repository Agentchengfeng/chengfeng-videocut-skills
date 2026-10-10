"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const ensure = path.join(root, "scripts", "ensure-runtime.cjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "videocut-preflight-test-"));
const isolatedPath = String(process.env.PATH || "")
  .split(path.delimiter)
  .filter((entry) => !entry.includes("chengfeng-videocut") && !entry.endsWith(`${path.sep}.local${path.sep}bin`))
  .join(path.delimiter);
const pluginManifest = JSON.parse(fs.readFileSync(path.join(root, ".codex-plugin", "plugin.json"), "utf8"));
const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const runtimeContract = JSON.parse(fs.readFileSync(path.join(root, "runtime-requirements.json"), "utf8"));
const capabilities = {
  runtimeApiVersion: 1,
  editListSchemaVersion: 1,
  editListOperations: ["move", "trim", "split", "delete"],
  managedArollProjection: true,
  expectedEditListRevision: true,
  serviceApiVersion: 1,
  serviceOperations: ["install", "start", "stop", "restart", "status", "logs", "ensure"],
  managedStudioService: true,
  serviceParentProcessIndependent: true,
  serviceCrashRestart: true,
};

function writeExecutable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function writeNodeExecutable(file, body) {
  if (process.platform === "win32") {
    const driver = `${file}.cjs`;
    const wrapper = `${file}.cmd`;
    writeExecutable(driver, body);
    writeExecutable(
      wrapper,
      `@echo off\r\n"${process.execPath}" "%~dp0${path.basename(driver)}" %*\r\n`,
    );
    return wrapper;
  }
  writeExecutable(file, `#!${process.execPath}\n${body}`);
  return file;
}

function fakeRuntime(file, healthy = true, runtimeCapabilities = capabilities, version = "0.4.10") {
  const doctor = JSON.stringify({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    command: "doctor",
    ok: true,
    data: {
      healthy,
      ...(runtimeCapabilities ? { capabilities: runtimeCapabilities } : {}),
    },
  });
  return writeNodeExecutable(file, `"use strict";
const command = process.argv[2];
if (command === "--version") {
  process.stdout.write(${JSON.stringify(`chengfeng-videocut ${version}\n`)});
  process.exit(0);
}
if (command === "doctor") {
  process.stdout.write(${JSON.stringify(`${doctor}\n`)});
  process.exit(0);
}
process.exit(2);
`);
}

function writeRelease(directory, installerBody, checksum = true, portableChecksums = true) {
  fs.mkdirSync(directory, { recursive: true });
  const installer = path.join(directory, "install.cjs");
  writeExecutable(installer, installerBody);
  const actual = createHash("sha256").update(fs.readFileSync(installer)).digest("hex");
  const lines = [`${checksum === true ? actual : String(checksum)}  install.cjs`];
  if (portableChecksums) {
    lines.push(
      `${"1".repeat(64)}  ${runtimeContract.portableAsset}`,
      `${"2".repeat(64)}  ${runtimeContract.versionedPortableAsset}`,
    );
  }
  fs.writeFileSync(path.join(directory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
  return installer;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [ensure, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHENGFENG_VIDEOCUT_DIR: "",
      CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "managed-default"),
      PATH: isolatedPath,
      ...env,
    },
  });
}

try {
  assert.equal(pluginManifest.version, packageManifest.version);
  assert.equal(runtimeContract.releaseTag, `v${runtimeContract.releaseVersion}`);
  assert.notEqual(pluginManifest.version, runtimeContract.releaseVersion, "Plugin package version is independent from Product Runtime release version");
  assert.equal(runtimeContract.minimumRuntimeVersion, "0.4.10", "an installation-only release preserves the healthy Runtime compatibility floor");
  assert.equal(runtimeContract.releaseVersion, "0.4.11", "missing Runtime installs use the fixed installer repair release");
  assert.equal(runtimeContract.portableAsset, "chengfeng-videocut-portable.tar.gz");
  assert.equal(
    runtimeContract.versionedPortableAsset,
    `chengfeng-videocut-${runtimeContract.releaseVersion}-portable.tar.gz`,
  );
  assert.equal(runtimeContract.workbenchRequirements.minimumRuntimeVersion, "0.5.9");
  assert.deepEqual(runtimeContract.workbenchRequirements.requiredCommand, ["workbench", "commands"]);
  assert.deepEqual(runtimeContract.workbenchRequirements.requiredResponseFields, ["operations"]);
  assert.deepEqual(runtimeContract.workbenchRequirements.requiredOperationFields, ["mode", "fields", "required", "capability"]);
  assert.equal(runtimeContract.workbenchRequirements.requiredOperations.length, 19);
  assert.equal(new Set(runtimeContract.workbenchRequirements.requiredOperations).size, 19);
  assert.equal(runtimeContract.workbenchRequirements.releaseAvailable, false);
  assert.doesNotMatch(runtimeContract.portableAsset, /\.(dmg|exe)$/i);
  assert.doesNotMatch(runtimeContract.versionedPortableAsset, /\.(dmg|exe)$/i);

  const readyBin = fakeRuntime(path.join(tmp, "ready", "chengfeng-videocut"), true);
  const ready = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: readyBin });
  assert.equal(ready.status, 0);
  assert.equal(JSON.parse(ready.stdout).runtime.state, "ready");

  const desktopHome = path.join(tmp, "desktop-managed-home");
  const desktopBin = fakeRuntime(
    path.join(desktopHome, "bin", "chengfeng-videocut"),
    true,
  );
  fs.mkdirSync(path.join(desktopHome, "app", "current"), { recursive: true });
  fs.writeFileSync(path.join(desktopHome, "app", "current", "VERSION"), "0.4.10\n");
  fs.writeFileSync(
    path.join(desktopHome, "desktop-installation.json"),
    JSON.stringify({
      schemaVersion: 1,
      product: "chengfeng-videocut",
      source: "desktop",
      productVersion: "0.4.10",
    }),
  );
  const pathRuntimeDir = path.join(tmp, "path-runtime");
  fakeRuntime(path.join(pathRuntimeDir, "chengfeng-videocut"), true, capabilities, "9.9.9");
  const desktopManaged = run(["--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: desktopHome,
    PATH: pathRuntimeDir,
  });
  assert.equal(desktopManaged.status, 0, desktopManaged.stderr);
  const desktopPayload = JSON.parse(desktopManaged.stdout);
  assert.equal(desktopPayload.runtime.kind, "desktop-managed");
  assert.equal(desktopPayload.runtime.command, desktopBin);
  assert.equal(desktopPayload.runtime.runtimeVersion, "0.4.10");

  const missing = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: path.join(tmp, "missing") });
  assert.equal(missing.status, 10);
  assert.equal(JSON.parse(missing.stdout).error.code, "runtime_missing");

  const unhealthyBin = fakeRuntime(path.join(tmp, "unhealthy", "chengfeng-videocut"), false);
  const unhealthy = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: unhealthyBin });
  assert.equal(unhealthy.status, 11);
  assert.equal(JSON.parse(unhealthy.stdout).error.code, "runtime_unhealthy");

  const incompatibleBin = fakeRuntime(path.join(tmp, "incompatible", "chengfeng-videocut"), true, null);
  const incompatible = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: incompatibleBin });
  assert.equal(incompatible.status, 14);
  assert.equal(JSON.parse(incompatible.stdout).error.code, "runtime_capability_missing");

  const oldCapableBin = fakeRuntime(
    path.join(tmp, "old-capable", "chengfeng-videocut"),
    true,
    capabilities,
    "0.1.1",
  );
  const oldCapable = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: oldCapableBin });
  assert.equal(oldCapable.status, 14);
  const oldCapablePayload = JSON.parse(oldCapable.stdout);
  assert.equal(oldCapablePayload.error.code, "runtime_capability_missing");
  assert.equal(oldCapablePayload.error.details.compatibility.versionCompatible, false);

  const foregroundOnlyBin = fakeRuntime(path.join(tmp, "foreground-only", "chengfeng-videocut"), true, {
    runtimeApiVersion: 1,
    editListSchemaVersion: 1,
    editListOperations: ["move", "trim", "split", "delete"],
    managedArollProjection: true,
    expectedEditListRevision: true,
  });
  const foregroundOnly = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: foregroundOnlyBin });
  assert.equal(foregroundOnly.status, 14);
  assert.equal(JSON.parse(foregroundOnly.stdout).error.code, "runtime_capability_missing");

  const mustNotRun = path.join(tmp, "must-not-run");
  const overwriteInstaller = path.join(tmp, "overwrite-installer.cjs");
  writeExecutable(overwriteInstaller, `require("node:fs").writeFileSync(${JSON.stringify(mustNotRun)}, "");\n`);
  const incompatibleInstall = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: oldCapableBin,
    CHENGFENG_VIDEOCUT_INSTALLER_FILE: overwriteInstaller,
  });
  assert.equal(incompatibleInstall.status, 14);
  assert.equal(fs.existsSync(mustNotRun), false, "an existing incompatible Runtime must never be overwritten");

  const installHome = path.join(tmp, "installed-home");
  const releaseDirectory = path.join(tmp, `release-${runtimeContract.releaseTag}`);
  const observedReleaseBase = path.join(tmp, "observed-release-base");
  const releaseRuntimeDirectory = path.join(tmp, "release-runtime");
  fakeRuntime(
    path.join(releaseRuntimeDirectory, "chengfeng-videocut"),
    true,
    capabilities,
    runtimeContract.releaseVersion,
  );
  writeRelease(releaseDirectory, `
const nodeFs = require("node:fs");
const nodePath = require("node:path");
nodeFs.writeFileSync(${JSON.stringify(observedReleaseBase)}, process.env.CHENGFENG_VIDEOCUT_DOWNLOAD_BASE || "");
const target = nodePath.join(process.env.CHENGFENG_VIDEOCUT_HOME, "bin");
nodeFs.cpSync(${JSON.stringify(releaseRuntimeDirectory)}, target, { recursive: true });
`);
  const installed = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: installHome,
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${releaseDirectory}`,
    PATH: isolatedPath,
  });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).installed, true);
  assert.match(installed.stderr, new RegExp(runtimeContract.releaseTag.replace(".", "\\.")));
  assert.equal(fs.readFileSync(observedReleaseBase, "utf8"), `file://${releaseDirectory}`);

  const unavailableHome = path.join(tmp, "unavailable-home");
  fs.mkdirSync(unavailableHome, { recursive: true });
  const sentinel = path.join(unavailableHome, "keep-me");
  fs.writeFileSync(sentinel, "unchanged");
  const unavailable = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: path.join(tmp, "missing-release-bin"),
    CHENGFENG_VIDEOCUT_HOME: unavailableHome,
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${path.join(tmp, "release-does-not-exist")}`,
  });
  assert.equal(unavailable.status, 12);
  const unavailablePayload = JSON.parse(unavailable.stdout);
  assert.equal(unavailablePayload.error.code, "install_failed");
  assert.equal(unavailablePayload.error.details.reasonCode, "runtime_release_unavailable");
  assert.equal(fs.readFileSync(sentinel, "utf8"), "unchanged");
  assert.equal(fs.existsSync(path.join(unavailableHome, "bin", "chengfeng-videocut")), false);

  const badChecksumRelease = path.join(tmp, "release-bad-checksum");
  const checksumMarker = path.join(tmp, "checksum-installer-ran");
  writeRelease(
    badChecksumRelease,
    `require("node:fs").writeFileSync(${JSON.stringify(checksumMarker)}, "");\n`,
    "0".repeat(64),
  );
  const badChecksum = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: path.join(tmp, "missing-checksum-bin"),
    CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "bad-checksum-home"),
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${badChecksumRelease}`,
  });
  assert.equal(badChecksum.status, 12);
  assert.equal(JSON.parse(badChecksum.stdout).error.details.reasonCode, "installer_checksum_mismatch");
  assert.equal(fs.existsSync(checksumMarker), false, "an unverified installer must never execute");

  const incompletePortableRelease = path.join(tmp, "release-missing-portable-checksum");
  const incompletePortableMarker = path.join(tmp, "portable-checksum-installer-ran");
  writeRelease(
    incompletePortableRelease,
    `require("node:fs").writeFileSync(${JSON.stringify(incompletePortableMarker)}, "");\n`,
    true,
    false,
  );
  const incompletePortable = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: path.join(tmp, "missing-portable-checksum-bin"),
    CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "incomplete-portable-home"),
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${incompletePortableRelease}`,
  });
  assert.equal(incompletePortable.status, 12);
  assert.equal(JSON.parse(incompletePortable.stdout).error.details.reasonCode, "runtime_release_incomplete");
  assert.equal(fs.existsSync(incompletePortableMarker), false, "a release without portable SHA-256 entries must not execute its installer");

  // 用户确认后的原子升级：托管位置有旧版（能力齐但版本旧）→ --upgrade 放行安装器。
  const upgradeHome = path.join(tmp, "upgrade-home");
  fakeRuntime(path.join(upgradeHome, "bin", "chengfeng-videocut"), true, capabilities, "0.1.1");
  const upgraded = run(["--install-if-missing", "--upgrade", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: upgradeHome,
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${releaseDirectory}`,
  });
  assert.equal(upgraded.status, 0, upgraded.stdout);
  assert.equal(JSON.parse(upgraded.stdout).installed, true);
  // 没有 --upgrade 时仍然拒绝覆盖（防线不因新旗标而松动）。
  const refusedHome = path.join(tmp, "refused-home");
  fakeRuntime(path.join(refusedHome, "bin", "chengfeng-videocut"), true, capabilities, "0.1.1");
  const refused = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: refusedHome,
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${releaseDirectory}`,
  });
  assert.equal(refused.status, 14);

  const failedInstaller = path.join(tmp, "failed-installer.cjs");
  writeExecutable(failedInstaller, "process.exit(9);\n");
  const failed = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "failed-home"),
    CHENGFENG_VIDEOCUT_INSTALLER_FILE: failedInstaller,
  });
  assert.equal(failed.status, 12);
  assert.equal(JSON.parse(failed.stdout).error.code, "install_failed");

  console.log(JSON.stringify({
    ready: 0,
    missing: 10,
    unhealthy: 11,
    incompatible: 14,
    oldVersionRejected: true,
    desktopManagedPreferredOverPath: true,
    foregroundOnlyRejected: true,
    incompatibleNotOverwritten: true,
    installedFromExactRelease: true,
    unavailableReleaseFailedClosed: true,
    badChecksumFailedClosed: true,
    portableChecksumRequiredBeforeInstallerRuns: true,
    installFailed: 12,
  }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
