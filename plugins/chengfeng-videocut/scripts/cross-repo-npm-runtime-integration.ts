import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeRoot = process.env.CHENGFENG_VIDEOCUT_RUNTIME_REPO;
if (!runtimeRoot) throw new Error("CHENGFENG_VIDEOCUT_RUNTIME_REPO is required");
const canonicalRuntimeRoot = resolve(runtimeRoot);
const pluginRoot = resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "videocut-cross-repo-npm-"));
const releaseDir = join(temporaryRoot, "release");
const stageDir = join(temporaryRoot, "stage");
const packDir = join(temporaryRoot, "pack");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

try {
  const runtimePackage = await import(pathToFileURL(join(canonicalRuntimeRoot, "scripts/npm-runtime-package.ts")).href);
  const version = JSON.parse(await readFile(join(canonicalRuntimeRoot, "package.json"), "utf8")).version as string;
  const toolsLock = JSON.parse(await readFile(join(canonicalRuntimeRoot, "installer/managed-tools.lock.json"), "utf8"));
  const platformKey = "darwin-arm64";
  const target = runtimePackage.NPM_RUNTIME_TARGETS[platformKey];
  await mkdir(releaseDir);
  await mkdir(packDir);
  const installerBytes = Buffer.from("#!/bin/sh\n# Runtime-owned cross-repo fixture; Plugin test intercepts invocation.\nexit 73\n");
  await writeFile(join(releaseDir, target.installerAsset), installerBytes);
  await chmod(join(releaseDir, target.installerAsset), 0o755);
  const installerDigest = sha256(installerBytes);
  const packageIds = { product: "SPDXRef-Package-Product", bun: "SPDXRef-Package-Bun", ffmpeg: "SPDXRef-Package-FFmpeg", ffprobe: "SPDXRef-Package-FFprobe" };
  const toolVersion = (name: string): string => String(toolsLock.tools[name].version);
  const sbom = {
    spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT",
    name: `chengfeng-videocut-runtime-${version}-${platformKey}`,
    documentNamespace: `urn:chengfeng-videocut:cross-repo-test:${version}:${Date.now()}`,
    creationInfo: { created: "2026-08-10T00:00:00Z", creators: ["Tool: plugin-cross-repo-test"] },
    packages: [
      { name: "chengfeng-videocut", SPDXID: packageIds.product, versionInfo: version, licenseDeclared: "NOASSERTION", downloadLocation: "NOASSERTION" },
      { name: "bun", SPDXID: packageIds.bun, versionInfo: toolVersion("bun"), licenseDeclared: "NOASSERTION", downloadLocation: "NOASSERTION" },
      { name: "ffmpeg", SPDXID: packageIds.ffmpeg, versionInfo: toolVersion("ffmpeg"), licenseDeclared: "NOASSERTION", downloadLocation: "NOASSERTION" },
      { name: "ffprobe", SPDXID: packageIds.ffprobe, versionInfo: toolVersion("ffprobe"), licenseDeclared: "NOASSERTION", downloadLocation: "NOASSERTION" },
    ],
    files: [{ fileName: `payload/${target.installerAsset}`, SPDXID: "SPDXRef-File-Installer", checksums: [{ algorithm: "SHA256", checksumValue: installerDigest }] }],
    relationships: [
      { spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: packageIds.product },
      { spdxElementId: packageIds.product, relationshipType: "CONTAINS", relatedSpdxElement: "SPDXRef-File-Installer" },
      ...[packageIds.bun, packageIds.ffmpeg, packageIds.ffprobe].map((id) => ({ spdxElementId: packageIds.product, relationshipType: "CONTAINS", relatedSpdxElement: id })),
    ],
  };
  await writeFile(join(releaseDir, `chengfeng-videocut-sbom-${version}-${platformKey}.spdx.json`), `${JSON.stringify(sbom, null, 2)}\n`);
  await writeFile(join(releaseDir, "chengfeng-videocut-install-manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    product: "chengfeng-videocut",
    productVersion: version,
    releaseTag: `v${version}`,
    distributionMode: "local-test-only",
    runtime: { asset: `fixture-runtime-${version}.tar.gz`, root: `fixture-runtime-${version}`, sha256: "e".repeat(64), size: 1 },
    platforms: {
      [platformKey]: {
        installerAsset: target.installerAsset,
        installer: { asset: target.installerAsset, sha256: installerDigest, size: installerBytes.length },
        tools: { asset: `fixture-tools-${platformKey}.tar.gz`, root: `fixture-tools-${platformKey}`, sha256: "f".repeat(64), size: 1 },
      },
    },
    licenseStatus: "UNVERIFIED",
    licenseNote: "explicit local cross-repo integration fixture; never publish",
  }, null, 2)}\n`);
  const receipts = await runtimePackage.stageNpmRuntimePackages({
    rootDir: canonicalRuntimeRoot,
    releaseDir,
    outputDir: stageDir,
    platformKeys: [platformKey],
    allowLocalFixture: true,
  });
  if (receipts.length !== 1) throw new Error(`unexpected Runtime stage receipts: ${receipts.length}`);
  const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir], {
    cwd: receipts[0].packageDir, encoding: "utf8",
  });
  if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`);
  const report = JSON.parse(packed.stdout);
  const tarballPath = join(packDir, report[0].filename);
  const goTest = spawnSync("go", ["test", "./internal/bootstrap", "-run", "^TestCrossRepoRuntimeNPMPackIntegration$", "-v"], {
    cwd: pluginRoot,
    encoding: "utf8",
    env: { ...process.env, CHENGFENG_VIDEOCUT_CROSS_REPO_TGZ: tarballPath },
  });
  process.stdout.write(goTest.stdout);
  process.stderr.write(goTest.stderr);
  if (goTest.status !== 0) throw new Error(`Plugin cross-repo Go test failed with exit ${goTest.status}`);
  console.log(JSON.stringify({ ok: true, runtimeRevision: "c5247a51284de4bcab626bbcf5e09d82d22b9188", platformKey, packageName: receipts[0].manifest.npmPackage.name, tarball: report[0].filename, integrity: report[0].integrity, files: report[0].files.map((entry: { path: string }) => entry.path).sort() }));
} finally {
  if (process.env.CHENGFENG_VIDEOCUT_KEEP_CROSS_REPO_FIXTURE !== "1") await rm(temporaryRoot, { recursive: true, force: true });
  else console.error(`cross-repo fixture retained at ${temporaryRoot}`);
}
