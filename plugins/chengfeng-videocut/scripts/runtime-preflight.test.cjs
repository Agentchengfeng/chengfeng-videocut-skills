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
  transcriptOperations: ["playback", "retranscribe", "align", "dictionary", "regroup", "correct"],
};

function writeExecutable(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function fakeRuntime(file, healthy = true, runtimeCapabilities = capabilities, version = "0.2.1") {
  writeExecutable(file, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "chengfeng-videocut ${version}"; exit 0; fi
if [ "$1" = "doctor" ]; then echo '${JSON.stringify({ schemaVersion: 1, product: "chengfeng-videocut", command: "doctor", ok: true, data: { healthy, ...(runtimeCapabilities ? { capabilities: runtimeCapabilities } : {}) } })}'; exit 0; fi
exit 2
`);
}

function writeRelease(directory, installerBody, checksum = true) {
  fs.mkdirSync(directory, { recursive: true });
  const installer = path.join(directory, "install.sh");
  writeExecutable(installer, installerBody);
  const actual = createHash("sha256").update(fs.readFileSync(installer)).digest("hex");
  fs.writeFileSync(
    path.join(directory, "SHA256SUMS.txt"),
    `${checksum === true ? actual : String(checksum)}  install.sh\n`,
  );
  return installer;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [ensure, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHENGFENG_VIDEOCUT_DIR: "",
      CHENGFENG_VIDEOCUT_HOME: path.join(tmp, "managed-default"),
      ...env,
    },
  });
}

try {
  assert.equal(pluginManifest.version, packageManifest.version);
  assert.equal(runtimeContract.releaseTag, `v${runtimeContract.releaseVersion}`);
  assert.notEqual(pluginManifest.version, runtimeContract.releaseVersion, "Plugin package version is independent from Product Runtime release version");
  assert.equal(runtimeContract.minimumRuntimeVersion, runtimeContract.releaseVersion, "the independent Plugin still declares its minimum compatible Runtime");

  const readyBin = path.join(tmp, "ready", "chengfeng-videocut");
  fakeRuntime(readyBin, true);
  const ready = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: readyBin });
  assert.equal(ready.status, 0);
  assert.equal(JSON.parse(ready.stdout).runtime.state, "ready");

  const missing = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: path.join(tmp, "missing") });
  assert.equal(missing.status, 10);
  assert.equal(JSON.parse(missing.stdout).error.code, "runtime_missing");

  const unhealthyBin = path.join(tmp, "unhealthy", "chengfeng-videocut");
  fakeRuntime(unhealthyBin, false);
  const unhealthy = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: unhealthyBin });
  assert.equal(unhealthy.status, 11);
  assert.equal(JSON.parse(unhealthy.stdout).error.code, "runtime_unhealthy");

  const incompatibleBin = path.join(tmp, "incompatible", "chengfeng-videocut");
  fakeRuntime(incompatibleBin, true, null);
  const incompatible = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: incompatibleBin });
  assert.equal(incompatible.status, 14);
  assert.equal(JSON.parse(incompatible.stdout).error.code, "runtime_capability_missing");

  const missingTranscriptOperationsBin = path.join(tmp, "missing-transcript-operations", "chengfeng-videocut");
  fakeRuntime(missingTranscriptOperationsBin, true, {
    ...capabilities,
    transcriptOperations: undefined,
  });
  const missingTranscriptOperations = run(["--json"], {
    CHENGFENG_VIDEOCUT_BIN: missingTranscriptOperationsBin,
  });
  assert.equal(missingTranscriptOperations.status, 14);
  assert.equal(
    JSON.parse(missingTranscriptOperations.stdout).error.code,
    "runtime_capability_missing",
  );

  const oldCapableBin = path.join(tmp, "old-capable", "chengfeng-videocut");
  fakeRuntime(oldCapableBin, true, capabilities, "0.1.1");
  const oldCapable = run(["--json"], { CHENGFENG_VIDEOCUT_BIN: oldCapableBin });
  assert.equal(oldCapable.status, 14);
  const oldCapablePayload = JSON.parse(oldCapable.stdout);
  assert.equal(oldCapablePayload.error.code, "runtime_capability_missing");
  assert.equal(oldCapablePayload.error.details.compatibility.versionCompatible, false);

  const foregroundOnlyBin = path.join(tmp, "foreground-only", "chengfeng-videocut");
  fakeRuntime(foregroundOnlyBin, true, {
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
  const overwriteInstaller = path.join(tmp, "overwrite-installer.sh");
  writeExecutable(overwriteInstaller, `#!/bin/sh\ntouch "${mustNotRun}"\n`);
  const incompatibleInstall = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: oldCapableBin,
    CHENGFENG_VIDEOCUT_INSTALLER_FILE: overwriteInstaller,
  });
  assert.equal(incompatibleInstall.status, 14);
  assert.equal(fs.existsSync(mustNotRun), false, "an existing incompatible Runtime must never be overwritten");

  const installHome = path.join(tmp, "installed-home");
  const releaseDirectory = path.join(tmp, "release-v0.2.1");
  const observedReleaseBase = path.join(tmp, "observed-release-base");
  writeRelease(releaseDirectory, `#!/bin/sh
set -eu
printf '%s' "$CHENGFENG_VIDEOCUT_DOWNLOAD_BASE" > "${observedReleaseBase}"
target="$CHENGFENG_VIDEOCUT_HOME/bin/chengfeng-videocut"
mkdir -p "$(dirname "$target")"
cat > "$target" <<'EOF'
#!/bin/sh
if [ "$1" = "--version" ]; then echo "chengfeng-videocut 0.2.1"; exit 0; fi
if [ "$1" = "doctor" ]; then echo '${JSON.stringify({ schemaVersion: 1, product: "chengfeng-videocut", command: "doctor", ok: true, data: { healthy: true, capabilities } })}'; exit 0; fi
exit 2
EOF
chmod +x "$target"
`);
  const installed = run(["--install-if-missing", "--json"], {
    CHENGFENG_VIDEOCUT_BIN: "",
    CHENGFENG_VIDEOCUT_HOME: installHome,
    CHENGFENG_VIDEOCUT_RELEASE_BASE: `file://${releaseDirectory}`,
  });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).installed, true);
  assert.match(installed.stderr, /v0\.2\.1/);
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
    `#!/bin/sh\ntouch "${checksumMarker}"\n`,
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

  const failedInstaller = path.join(tmp, "failed-installer.sh");
  writeExecutable(failedInstaller, "#!/bin/sh\nexit 9\n");
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
    transcriptOperationsRequired: true,
    oldVersionRejected: true,
    foregroundOnlyRejected: true,
    incompatibleNotOverwritten: true,
    installedFromExactRelease: true,
    unavailableReleaseFailedClosed: true,
    badChecksumFailedClosed: true,
    installFailed: 12,
  }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
