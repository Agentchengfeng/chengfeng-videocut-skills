#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'installer-manifest.json');
const MARKETPLACE_INSTALL_METADATA = '.codex-marketplace-install.json';
const HEX40 = /^[0-9a-f]{40}$/i;
const EXPECTED = {
  installerId: 'chengfeng-videocut-npm-bootstrap-v2',
  source: 'Agentchengfeng/chengfeng-videocut-skills',
  marketplace: 'chengfeng-videocut',
  plugin: 'chengfeng-videocut'
};
const ALLOWED_COMMANDS = [
  'codex plugin marketplace add',
  'codex plugin marketplace upgrade',
  'codex plugin marketplace remove',
  'codex plugin add',
  'codex plugin remove',
  'codex plugin marketplace list',
  'codex plugin list'
];

function fail(message) {
  const error = new Error(message);
  error.code = 'BOOTSTRAP_REFUSED';
  throw error;
}

function identityUnverified(detail) {
  fail(`marketplace_identity_unverified: ${detail}`);
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} did not return JSON; refusing to continue.`);
  }
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function windowsExecutableExtensions() {
  const supported = new Set(['.COM', '.EXE', '.CMD', '.BAT']);
  const extensions = [];
  const seen = new Set();
  for (const raw of (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = `${trimmed.startsWith('.') ? '' : '.'}${trimmed}`.toUpperCase();
    if (!supported.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    extensions.push(normalized);
  }
  return extensions;
}

function windowsSafeExecutable(command) {
  return /\.(cmd|bat)$/i.test(command)
    ? { command: process.env.ComSpec || 'cmd.exe', batchCommand: command }
    : { command };
}

function resolveExecutable(command) {
  if (process.platform !== 'win32') return { command };
  const extensions = windowsExecutableExtensions();
  if (command.includes('\\') || command.includes('/')) {
    const candidates = path.extname(command)
      ? [command]
      : [...extensions.map((extension) => `${command}${extension}`), command];
    return windowsSafeExecutable(candidates.find(isFile) || command);
  }
  const directories = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (isFile(candidate)) return windowsSafeExecutable(candidate);
    }
  }
  for (const directory of directories) {
    const candidate = path.join(directory, command);
    if (isFile(candidate)) return windowsSafeExecutable(candidate);
  }
  return windowsSafeExecutable(command);
}

function quoteCmdArgument(value) {
  const text = String(value);
  if (/[\0\r\n"]/.test(text)) fail('Cannot execute Codex CLI with an unsafe Windows command argument.');
  return `"${text.replaceAll('%', '%%')}"`;
}

function spawnExecutable(command, args) {
  const resolved = resolveExecutable(command);
  if (!resolved.batchCommand) {
    return childProcess.spawnSync(resolved.command, args, { encoding: 'utf8' });
  }
  const commandLine = `"${[
    quoteCmdArgument(resolved.batchCommand),
    ...args.map(quoteCmdArgument)
  ].join(' ')}"`;
  return childProcess.spawnSync(
    resolved.command,
    ['/d', '/v:off', '/s', '/c', commandLine],
    { encoding: 'utf8', windowsVerbatimArguments: true }
  );
}

function readManifest() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    fail('Installer manifest is missing or invalid; refusing to continue.');
  }
  for (const [key, value] of Object.entries(EXPECTED)) {
    if (manifest[key] !== value) fail(`Installer manifest ${key} is not the expected identity.`);
  }
  if (manifest.schemaVersion !== 1 || manifest.runtimeInstall !== false) {
    fail('Installer manifest has an unsupported scope.');
  }
  if (!Array.isArray(manifest.allowedCommands) || manifest.allowedCommands.length !== ALLOWED_COMMANDS.length ||
      !manifest.allowedCommands.every((command, index) => command === ALLOWED_COMMANDS[index])) {
    fail('Installer manifest command surface is not the expected official Codex Plugin surface.');
  }
  if (!HEX40.test(manifest.pluginRef || '')) {
    fail('No published immutable 40-hex pluginRef is configured; refusing to bootstrap an unpublished candidate.');
  }
  if (!HEX40.test(manifest.marketplaceRef || '')) {
    fail('No published immutable 40-hex marketplaceRef is configured; movable refs such as stable or main are not allowed.');
  }
  const pluginRef = manifest.pluginRef.toLowerCase();
  const marketplaceRef = manifest.marketplaceRef.toLowerCase();
  if (marketplaceRef !== pluginRef) {
    fail('Installer manifest marketplaceRef must exactly equal pluginRef.');
  }
  return { ...manifest, marketplaceRef, pluginRef };
}

function runCodex(args) {
  const result = spawnExecutable(process.env.CODEX_BIN || 'codex', args);
  if (result.error) fail(`Cannot execute Codex CLI: ${result.error.message}`);
  if (result.status !== 0) fail(`Codex CLI failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`);
  return readJson(result.stdout, `codex ${args.join(' ')}`);
}

function runCloneGit(installedRoot, args, label) {
  const result = childProcess.spawnSync('git', ['-C', installedRoot, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    identityUnverified(`${label} could not be read from the Codex marketplace clone.`);
  }
  return result.stdout.trim();
}

function readMarketplaceInstallMetadata(marketplaceRoot) {
  const metadataPath = path.join(marketplaceRoot, MARKETPLACE_INSTALL_METADATA);
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    identityUnverified(`Marketplace install metadata ${MARKETPLACE_INSTALL_METADATA} is missing or invalid.`);
  }
  return metadata;
}

function marketplaceEntries(result) {
  return Array.isArray(result && result.marketplaces) ? result.marketplaces : fail('Marketplace readback has no marketplaces array.');
}

function pluginEntries(result) {
  return Array.isArray(result && result.installed) ? result.installed : fail('Plugin readback has no installed array.');
}

function verifyFreshMarketplacePlugin(result, manifest) {
  if (!result || !Array.isArray(result.installed) || !Array.isArray(result.available)) {
    identityUnverified('Post-add plugin inventory did not contain installed and available arrays.');
  }
  const pluginId = `${manifest.plugin}@${manifest.marketplace}`;
  const isTarget = (entry) =>
    entry &&
    entry.pluginId === pluginId &&
    entry.name === manifest.plugin &&
    entry.marketplaceName === manifest.marketplace;
  const installedTargets = result.installed.filter(isTarget);
  const availableTargets = result.available.filter(isTarget);
  if (installedTargets.length > 0 ||
      availableTargets.some((entry) => entry.installed === true || entry.enabled === true)) {
    refuseRevealedOrphan(installedTargets[0] || availableTargets[0], manifest);
  }
  if (installedTargets.length !== 0 ||
      availableTargets.length !== 1 ||
      availableTargets[0].installed !== false ||
      availableTargets[0].enabled !== false) {
    identityUnverified('Post-add plugin inventory did not prove exactly one fresh disabled and uninstalled target plugin.');
  }
}

function canonicalGitHubSource(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.search || url.hash) return null;
    const pathname = url.pathname.replace(/\/$/, '').toLowerCase();
    if (!pathname.endsWith('.git')) return null;
    return `https://github.com${pathname}`;
  } catch {
    return null;
  }
}

function expectedRemote(manifest) {
  return canonicalGitHubSource(`https://github.com/${manifest.source}.git`);
}

function preflightCollisions(manifest) {
  const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
  const sameMarketplace = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  if (sameMarketplace) {
    fail(`Marketplace ${manifest.marketplace} already exists; its exact source/ref cannot be safely replaced or migrated.`);
  }
  const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
  const collision = plugins.find((entry) => entry && entry.name === manifest.plugin);
  if (collision) {
    fail(`Plugin ${manifest.plugin} is already installed from ${collision.marketplaceName || 'an unknown marketplace'}; refusing to remove or overwrite pre-existing plugin state.`);
  }
}

function verifyMarketplaceClone(market, manifest, receiptRoot) {
  if (!market || typeof market.root !== 'string' || !path.isAbsolute(market.root)) {
    identityUnverified('Marketplace readback did not contain an absolute target root.');
  }
  const marketplaceRoot = path.resolve(market.root);
  if (path.basename(marketplaceRoot) !== manifest.marketplace || path.basename(path.dirname(marketplaceRoot)) !== 'marketplaces') {
    identityUnverified('Marketplace readback root is not the target Codex marketplace clone.');
  }
  if (receiptRoot !== undefined) {
    if (typeof receiptRoot !== 'string' || !path.isAbsolute(receiptRoot)) {
      identityUnverified('Marketplace add receipt did not provide an absolute installedRoot.');
    }
    if (path.resolve(receiptRoot) !== marketplaceRoot) {
      identityUnverified('Marketplace receipt root is not the target Codex marketplace clone.');
    }
  }
  if (!fs.existsSync(marketplaceRoot)) {
    identityUnverified('Marketplace installedRoot does not exist.');
  }
  const expected = expectedRemote(manifest);
  const listed = canonicalGitHubSource(market.marketplaceSource && market.marketplaceSource.source);
  if (!market.marketplaceSource || market.marketplaceSource.sourceType !== 'git' || !expected || listed !== expected) {
    identityUnverified('Marketplace readback source is not the expected normalized GitHub source.');
  }
  const metadata = readMarketplaceInstallMetadata(marketplaceRoot);
  const metadataSource = canonicalGitHubSource(metadata && metadata.source);
  if (metadata.source_type !== 'git' || metadataSource !== expected) {
    identityUnverified('Marketplace install metadata source is not the expected normalized GitHub source.');
  }
  const metadataRef = typeof metadata.ref_name === 'string' ? metadata.ref_name.toLowerCase() : '';
  if (!HEX40.test(metadataRef) || metadataRef !== manifest.pluginRef) {
    identityUnverified('Marketplace install metadata ref_name does not equal manifest pluginRef.');
  }
  if (!Array.isArray(metadata.sparse_paths) || metadata.sparse_paths.length !== 0) {
    identityUnverified('Marketplace install metadata has an unexpected sparse checkout scope.');
  }
  const revision = typeof metadata.revision === 'string' ? metadata.revision.toLowerCase() : '';
  if (!HEX40.test(revision) || revision !== manifest.pluginRef) {
    identityUnverified('Marketplace install metadata revision does not equal manifest pluginRef.');
  }
  const head = runCloneGit(marketplaceRoot, ['rev-parse', 'HEAD'], 'Marketplace clone HEAD').toLowerCase();
  if (!HEX40.test(head) || head !== manifest.pluginRef) {
    identityUnverified('Marketplace clone HEAD does not equal manifest pluginRef.');
  }
  const origin = canonicalGitHubSource(runCloneGit(marketplaceRoot, ['remote', 'get-url', 'origin'], 'Marketplace clone origin'));
  if (origin !== expected) {
    identityUnverified('Marketplace clone origin is not the expected normalized GitHub source.');
  }
}

function verifyMarketplaceAddReceipt(receipt, manifest) {
  if (!receipt || receipt.marketplaceName !== manifest.marketplace || receipt.alreadyAdded !== false) {
    identityUnverified('Marketplace add receipt did not prove a newly-added target marketplace.');
  }
  if (typeof receipt.installedRoot !== 'string' || !path.isAbsolute(receipt.installedRoot)) {
    identityUnverified('Marketplace add receipt did not provide an absolute installedRoot.');
  }
}

function verifyMarketplaceIdentity(receipt, marketplaces, manifest) {
  verifyMarketplaceAddReceipt(receipt, manifest);
  const market = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  verifyMarketplaceClone(market, manifest, receipt.installedRoot);
}

function verifyMarketplaceUpgrade(upgrade, manifest, receipt) {
  verifyMarketplaceAddReceipt(receipt, manifest);
  const valid = upgrade &&
    typeof upgrade === 'object' &&
    !Array.isArray(upgrade) &&
    Array.isArray(upgrade.selectedMarketplaces) &&
    upgrade.selectedMarketplaces.length === 1 &&
    upgrade.selectedMarketplaces[0] === manifest.marketplace &&
    Array.isArray(upgrade.upgradedRoots) &&
    upgrade.upgradedRoots.length === 1 &&
    typeof upgrade.upgradedRoots[0] === 'string' &&
    path.isAbsolute(upgrade.upgradedRoots[0]) &&
    path.resolve(upgrade.upgradedRoots[0]) === path.resolve(receipt.installedRoot) &&
    Array.isArray(upgrade.errors) &&
    upgrade.errors.length === 0;
  if (!valid) {
    identityUnverified('Marketplace upgrade receipt did not prove the exact selected marketplace, upgraded root, and empty errors.');
  }
}

function verifyMarketplaceRemove(removal, manifest, receipt) {
  const valid = removal &&
    typeof removal === 'object' &&
    !Array.isArray(removal) &&
    removal.marketplaceName === manifest.marketplace &&
    typeof removal.installedRoot === 'string' &&
    path.isAbsolute(removal.installedRoot) &&
    path.resolve(removal.installedRoot) === path.resolve(receipt.installedRoot);
  if (!valid) {
    identityUnverified('Marketplace remove receipt did not prove removal of this invocation\'s newly-added target root.');
  }
}

function verifyPluginRemove(removal, manifest) {
  const pluginId = `${manifest.plugin}@${manifest.marketplace}`;
  const valid = removal &&
    typeof removal === 'object' &&
    !Array.isArray(removal) &&
    removal.pluginId === pluginId &&
    removal.name === manifest.plugin &&
    removal.marketplaceName === manifest.marketplace;
  if (!valid) {
    identityUnverified('Plugin remove receipt did not prove removal of this invocation\'s target plugin.');
  }
}

function verifyRollbackAbsence(marketplaces, plugins, manifest) {
  if (marketplaces.some((entry) => entry && entry.name === manifest.marketplace)) {
    identityUnverified('Rollback readback still contains this invocation\'s target marketplace.');
  }
  if (plugins.some((entry) =>
    entry &&
    entry.name === manifest.plugin &&
    entry.marketplaceName === manifest.marketplace
  )) {
    identityUnverified('Rollback readback still contains this invocation\'s target plugin.');
  }
}

function verifyMarketplaceRollbackAbsence(marketplaces, manifest) {
  if (marketplaces.some((entry) => entry && entry.name === manifest.marketplace)) {
    identityUnverified('Rollback readback still contains this invocation\'s target marketplace.');
  }
}

function refuseRevealedOrphan(plugin, manifest) {
  const error = new Error(
    `pre_existing_orphan_revealed: Plugin ${manifest.plugin} became visible from ` +
    `${plugin.marketplaceName || 'an unknown marketplace'} only after marketplace materialization; ` +
    'refusing plugin activation and preserving the pre-existing orphan state.'
  );
  error.code = 'BOOTSTRAP_REFUSED';
  error.preserveRevealedOrphan = true;
  throw error;
}

function failAfterRollback(primaryError, manifest, receipt, pluginAddStarted) {
  const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
  const preserveRevealedOrphan = Boolean(primaryError && primaryError.preserveRevealedOrphan);
  const rollbackErrors = [];
  const attempt = (label, action) => {
    try {
      return action();
    } catch (error) {
      rollbackErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  if (pluginAddStarted) {
    attempt('plugin_remove', () => {
      const removal = runCodex([
        'plugin', 'remove', `${manifest.plugin}@${manifest.marketplace}`, '--json'
      ]);
      verifyPluginRemove(removal, manifest);
    });
  }
  attempt('marketplace_remove', () => {
    const removal = runCodex(['plugin', 'marketplace', 'remove', manifest.marketplace, '--json']);
    verifyMarketplaceRemove(removal, manifest, receipt);
  });
  const marketplaces = attempt(
    'marketplace_absence_readback',
    () => marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']))
  );
  const plugins = attempt(
    'plugin_absence_readback',
    () => pluginEntries(runCodex(['plugin', 'list', '--json']))
  );
  if (marketplaces && plugins) {
    if (preserveRevealedOrphan) {
      attempt('rollback_marketplace_absence_verification', () =>
        verifyMarketplaceRollbackAbsence(marketplaces, manifest));
    } else {
      attempt('rollback_absence_verification', () =>
        verifyRollbackAbsence(marketplaces, plugins, manifest));
    }
  } else {
    rollbackErrors.push('rollback_absence_verification: both read-only absence checks are required');
  }
  const rollbackSucceeded = rollbackErrors.length === 0;
  const rollbackSuccessMessage = preserveRevealedOrphan
    ? 'removed and verified only this invocation\'s newly-added marketplace; ' +
      'pre_existing_orphan_preserved: plugin removal was intentionally skipped, and post-removal plugin-list visibility is not treated as proof of deletion.'
    : pluginAddStarted
      ? 'removed and verified this invocation\'s newly-added plugin/marketplace state.'
      : 'removed and verified this invocation\'s newly-added marketplace and confirmed no target plugin is visible.';
  const error = new Error(
    rollbackSucceeded
      ? `primary_failure: ${primaryMessage}; rollback_succeeded: ${rollbackSuccessMessage}`
      : `primary_failure: ${primaryMessage}; rollback_failed: ${rollbackErrors.join(' | ')}`
  );
  error.code = primaryError && primaryError.code ? primaryError.code : 'BOOTSTRAP_REFUSED';
  error.cause = primaryError;
  error.rollbackSucceeded = rollbackSucceeded;
  throw error;
}

function verifyInstalledPlugin(plugins, manifest) {
  const collision = plugins.find((entry) => entry && entry.name === manifest.plugin && entry.marketplaceName !== manifest.marketplace);
  if (collision) {
    identityUnverified(`Plugin ${manifest.plugin} is installed from ${collision.marketplaceName || 'an unknown marketplace'}.`);
  }
  if (!plugins.some((entry) => entry && entry.name === manifest.plugin && entry.marketplaceName === manifest.marketplace && entry.installed)) {
    identityUnverified(`Plugin ${manifest.plugin} is not installed from ${manifest.marketplace}.`);
  }
}

function install(manifest) {
  preflightCollisions(manifest);
  const receipt = runCodex(['plugin', 'marketplace', 'add', manifest.source, '--ref', manifest.pluginRef, '--json']);
  verifyMarketplaceAddReceipt(receipt, manifest);
  let pluginAddStarted = false;
  try {
    const postAddInventory = runCodex([
      'plugin', 'list',
      '--marketplace', manifest.marketplace,
      '--available',
      '--json'
    ]);
    verifyFreshMarketplacePlugin(postAddInventory, manifest);
    const upgrade = runCodex(['plugin', 'marketplace', 'upgrade', manifest.marketplace, '--json']);
    verifyMarketplaceUpgrade(upgrade, manifest, receipt);
    const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
    verifyMarketplaceIdentity(receipt, marketplaces, manifest);
    pluginAddStarted = true;
    runCodex(['plugin', 'add', `${manifest.plugin}@${manifest.marketplace}`, '--json']);
    const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
    verifyInstalledPlugin(plugins, manifest);
    process.stdout.write('INSTALLED_OK runtime_unchanged\n');
  } catch (error) {
    failAfterRollback(error, manifest, receipt, pluginAddStarted);
  }
}

function doctor(manifest) {
  const marketplaces = marketplaceEntries(runCodex(['plugin', 'marketplace', 'list', '--json']));
  const plugins = pluginEntries(runCodex(['plugin', 'list', '--json']));
  const market = marketplaces.find((entry) => entry && entry.name === manifest.marketplace);
  verifyMarketplaceClone(market, manifest);
  verifyInstalledPlugin(plugins, manifest);
  process.stdout.write('DOCTOR_OK no_install_attempted\n');
}

function plan(command, manifest) {
  const commands = command === 'install'
    ? [
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['codex', 'plugin', 'list', '--json'],
        ['codex', 'plugin', 'marketplace', 'add', manifest.source, '--ref', manifest.pluginRef, '--json'],
        ['codex', 'plugin', 'list', '--marketplace', manifest.marketplace, '--available', '--json'],
        ['codex', 'plugin', 'marketplace', 'upgrade', manifest.marketplace, '--json'],
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['git', '-C', '<codex-installedRoot>', 'rev-parse', 'HEAD'],
        ['git', '-C', '<codex-installedRoot>', 'remote', 'get-url', 'origin'],
        ['codex', 'plugin', 'add', `${manifest.plugin}@${manifest.marketplace}`, '--json'],
        ['codex', 'plugin', 'list', '--json']
      ]
    : [
        ['codex', 'plugin', 'marketplace', 'list', '--json'],
        ['codex', 'plugin', 'list', '--json']
      ];
  commands.forEach((argv) => process.stdout.write(`DRY_RUN ${JSON.stringify(argv)}\n`));
  if (command === 'install') {
    process.stdout.write(`DRY_RUN_ROLLBACK_AFTER_PLUGIN_ADD_ON_FAILURE ${JSON.stringify([
      'codex', 'plugin', 'remove', `${manifest.plugin}@${manifest.marketplace}`, '--json'
    ])}\n`);
    process.stdout.write(`DRY_RUN_ROLLBACK_ON_FAILURE ${JSON.stringify([
      'codex', 'plugin', 'marketplace', 'remove', manifest.marketplace, '--json'
    ])}\n`);
    process.stdout.write('DRY_RUN_ROLLBACK_VERIFY_ABSENT ["codex","plugin","marketplace","list","--json"] ["codex","plugin","list","--json"]\n');
  }
  process.stdout.write(`DRY_RUN_VERIFY ${JSON.stringify({ marketplaceRef: manifest.marketplaceRef, pluginRef: manifest.pluginRef })}\n`);
  process.stdout.write(command === 'install' ? 'DRY_RUN_OK runtime_unchanged\n' : 'DRY_RUN_DOCTOR_OK runtime_unchanged\n');
}

function usage() {
  process.stdout.write([
    'chengfeng-videocut-skills bootstrap',
    '',
    'Usage:',
    '  npx --yes @chengfeng/videocut-skills install',
    '  npx --yes @chengfeng/videocut-skills doctor',
    '  npx --yes @chengfeng/videocut-skills install --dry-run',
    '',
    'This bootstrap adds and materializes the Codex marketplace at the manifest-pinned exact 40-hex commit, then adds the plugin.',
    'Immediately after marketplace add and before upgrade, it checks for an orphan plugin that Codex may reveal only while the marketplace exists; such state is preserved and refused.',
    'If a later step fails after plugin activation starts, it removes that target plugin first, then removes this invocation\'s receipt-proven newly-added marketplace, and verifies both are absent.',
    'It never follows stable/main and never installs, upgrades, starts, or edits the Product Runtime.'
  ].join('\n') + '\n');
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const dryRun = argv.includes('--dry-run');
  if (command === 'help' || command === '--help' || command === '-h') return usage();
  if (!['install', 'doctor'].includes(command) || argv.some((arg) => !['install', 'doctor', '--dry-run'].includes(arg))) {
    fail('Unsupported command. Use install, doctor, or help.');
  }
  const manifest = readManifest();
  if (dryRun) return plan(command, manifest);
  if (command === 'install') return install(manifest);
  return doctor(manifest);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`REFUSED ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, readManifest, verifyMarketplaceIdentity };
