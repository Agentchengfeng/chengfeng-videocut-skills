'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'Agentchengfeng/chengfeng-videocut-skills';
const ORIGIN = `https://github.com/${SOURCE}.git`;
const RELEASE_PLUGIN_VERSION = '0.10.8';
const RELEASE_CONTENT_REF = 'a513462f65b6f50083a20ac8da6ec3c32d2ddcde';
const RELEASE_SNAPSHOT_REF = '1487e02b1c0c39ea74d079e8ce45da56bf59bc32';

function run(command, args, options = {}) {
  const batch = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)$/i.test(command)
    ? `${command}.cmd`
    : null;
  const result = batch
    ? childProcess.spawnSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/v:off', '/s', '/c', `"${[
          `"${batch}"`,
          ...args.map((arg) => `"${String(arg).replaceAll('%', '%%').replaceAll('"', '""')}"`)
        ].join(' ')}"`],
        { encoding: 'utf8', windowsVerbatimArguments: true, ...options }
      )
    : childProcess.spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function gitAtRoot(args) {
  return run('git', ['-C', ROOT, ...args]);
}

test('checked-in bootstrap remains pinned to released 0.10.8 while the current candidate is unreleased', () => {
  const bootstrapPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(bootstrapPackage.name, '@chengfeng/videocut-skills');
  assert.equal(bootstrapPackage.private, undefined);
  assert.deepEqual(bootstrapPackage.bin, { 'chengfeng-videocut-skills': 'bin/install.cjs' });
  assert.deepEqual(bootstrapPackage.publishConfig, { access: 'public' });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'installer-manifest.json'), 'utf8'));
  assert.equal(manifest.installerId, 'chengfeng-videocut-npm-bootstrap-v2');
  assert.equal(manifest.pluginRef, RELEASE_SNAPSHOT_REF);
  assert.equal(manifest.marketplaceRef, RELEASE_SNAPSHOT_REF);

  const candidatePluginManifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'plugins/chengfeng-videocut/.codex-plugin/plugin.json'),
    'utf8'
  ));
  const candidatePackageManifest = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'plugins/chengfeng-videocut/package.json'),
    'utf8'
  ));
  const candidatePluginVersion = candidatePluginManifest.version;
  assert.match(candidatePluginVersion, /^0\.11\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  assert.equal(candidatePackageManifest.version, candidatePluginVersion);

  const pluginManifest = JSON.parse(gitAtRoot([
    'show',
    `${RELEASE_SNAPSHOT_REF}:plugins/chengfeng-videocut/.codex-plugin/plugin.json`
  ]));
  const provenance = JSON.parse(gitAtRoot([
    'show',
    `${RELEASE_SNAPSHOT_REF}:plugins/chengfeng-videocut/.codex-plugin/update-provenance.json`
  ]));
  assert.equal(pluginManifest.version, RELEASE_PLUGIN_VERSION);
  assert.equal(provenance.version, RELEASE_PLUGIN_VERSION);
  assert.equal(provenance.immutableRef, RELEASE_CONTENT_REF);
  gitAtRoot(['merge-base', '--is-ancestor', RELEASE_CONTENT_REF, RELEASE_SNAPSHOT_REF]);

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /当前公开的 0\.10\.8 快照仅是历史稳定入口/);
  assert.match(
    readme,
    new RegExp('本分支候选 Plugin 是 `' + candidatePluginVersion.replaceAll('.', '\\.') + '`')
  );
  assert.match(readme, /重新产生最终内容提交与\s*provenance 快照/);
  assert.match(readme, new RegExp(RELEASE_SNAPSHOT_REF));
  assert.doesNotMatch(readme, /当前 `main` 候选 Plugin 是 `0\.10\.7`/);
});

function createClone(dir, { origin = ORIGIN, metadata = {} } = {}) {
  const clone = path.join(dir, 'codex-home', '.tmp', 'marketplaces', 'chengfeng-videocut');
  fs.mkdirSync(clone, { recursive: true });
  run('git', ['init', '-q', clone]);
  run('git', ['-C', clone, 'config', 'user.email', 'test@example.invalid']);
  run('git', ['-C', clone, 'config', 'user.name', 'Bootstrap Test']);
  fs.writeFileSync(path.join(clone, 'marketplace.txt'), 'fixture\n');
  run('git', ['-C', clone, 'add', '.']);
  run('git', ['-C', clone, 'commit', '-qm', 'fixture']);
  run('git', ['-C', clone, 'remote', 'add', 'origin', origin]);
  const commit = run('git', ['-C', clone, 'rev-parse', 'HEAD']).trim();
  return {
    clone,
    commit,
    metadata: {
      source_type: 'git',
      source: ORIGIN,
      ref_name: commit,
      sparse_paths: [],
      revision: commit,
      ...metadata
    }
  };
}

function writeMarketplaceMetadata(marketplaceClone) {
  fs.writeFileSync(
    path.join(marketplaceClone.clone, '.codex-marketplace-install.json'),
    JSON.stringify(marketplaceClone.metadata, null, 2) + '\n'
  );
}

function writeMockCodex(dir) {
  const mockBin = path.join(dir, 'mock-bin');
  fs.mkdirSync(mockBin, { recursive: true });
  const driver = path.join(mockBin, 'mock-codex.cjs');
  fs.writeFileSync(driver, `
const fs=require('node:fs');
const path=require('node:path');
const a=process.argv.slice(2), log=process.env.MOCK_LOG, mode=process.env.MOCK_MODE||'';
fs.appendFileSync(log,JSON.stringify(a)+'\\n');
const marketState=process.env.MOCK_MARKET_STATE;
const pluginState=process.env.MOCK_PLUGIN_STATE;
const added=fs.existsSync(marketState);
const pluginAdded=
  fs.existsSync(pluginState)||
  Boolean(process.env.MOCK_TARGET_PLUGIN_COLLISION)||
  (Boolean(process.env.MOCK_HIDDEN_TARGET_ORPHAN)&&added);
const doctorInstalled=process.env.MOCK_DOCTOR_INSTALLED&&mode!=='doctor-missing-plugin';
const root=process.env.MOCK_ROOT;
const source=mode==='list-source-mismatch'?'https://github.com/example/other.git':'https://github.com/Agentchengfeng/chengfeng-videocut-skills.git';
if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='list'){
  const marketplaces=process.env.MOCK_MARKETPLACE_COLLISION||doctorInstalled||added?[{name:'chengfeng-videocut',root,marketplaceSource:{sourceType:'git',source}}]:[];
  console.log(JSON.stringify({marketplaces}));
}else if(a[0]==='plugin'&&a[1]==='list'){
  if(a.includes('--available')){
    const target={
      pluginId:'chengfeng-videocut@chengfeng-videocut',
      name:'chengfeng-videocut',
      marketplaceName:'chengfeng-videocut',
      version:'0.10.6',
      installed:Boolean(process.env.MOCK_HIDDEN_TARGET_ORPHAN),
      enabled:Boolean(process.env.MOCK_HIDDEN_TARGET_ORPHAN),
      installPolicy:'AVAILABLE',
      authPolicy:'ON_INSTALL'
    };
    console.log(JSON.stringify(process.env.MOCK_HIDDEN_TARGET_ORPHAN
      ?{installed:[target],available:[]}
      :{installed:[],available:[target]}));
    process.exit(0);
  }
  if(process.env.MOCK_FINAL_LIST_FAIL&&pluginAdded)process.exit(7);
  const installed=process.env.MOCK_PLUGIN_COLLISION?[{name:'chengfeng-videocut',marketplaceName:'other-marketplace',installed:true}]:doctorInstalled||pluginAdded?[{name:'chengfeng-videocut',marketplaceName:'chengfeng-videocut',installed:true}]:[];
  console.log(JSON.stringify({installed}));
}else if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='add'){
  fs.writeFileSync(marketState,'present');
  const receipt={marketplaceName:'chengfeng-videocut',alreadyAdded:mode==='already-added'};
  if(mode!=='missing-root')receipt.installedRoot=root;
  console.log(JSON.stringify(receipt));
}else if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='upgrade'){
  if(mode==='upgrade-command-failure')process.exit(8);
  fs.writeFileSync(path.join(root,'.codex-marketplace-install.json'),process.env.MOCK_METADATA);
  const receipt={
    selectedMarketplaces:mode==='upgrade-schema-selected'?['other-marketplace']:['chengfeng-videocut'],
    upgradedRoots:mode==='upgrade-schema-root'?[root+'-other']:[root],
    errors:mode==='upgrade-schema-errors'?[{marketplace:'chengfeng-videocut',message:'failed'}]:[]
  };
  console.log(JSON.stringify(receipt));
}else if(a[0]==='plugin'&&a[1]==='marketplace'&&a[2]==='remove'){
  if(process.env.MOCK_REMOVE_FAIL)process.exit(6);
  fs.rmSync(marketState,{force:true});
  fs.rmSync(path.join(root,'.codex-marketplace-install.json'),{force:true});
  console.log(JSON.stringify({
    marketplaceName:'chengfeng-videocut',
    installedRoot:process.env.MOCK_REMOVE_SCHEMA?root+'-other':root
  }));
}else if(a[0]==='plugin'&&a[1]==='remove'){
  if(process.env.MOCK_PLUGIN_REMOVE_FAIL)process.exit(4);
  fs.rmSync(pluginState,{force:true});
  console.log(JSON.stringify({
    pluginId:process.env.MOCK_PLUGIN_REMOVE_SCHEMA?'other@chengfeng-videocut':'chengfeng-videocut@chengfeng-videocut',
    name:'chengfeng-videocut',
    marketplaceName:'chengfeng-videocut'
  }));
}else if(a[0]==='plugin'&&a[1]==='add'){
  if(process.env.MOCK_PLUGIN_ADD_FAIL)process.exit(5);
  fs.writeFileSync(pluginState,'installed');
  console.log(JSON.stringify({ok:true}));
}
else process.exit(9);
`);
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(mockBin, 'codex.cmd'),
      `@echo off\r\n"${process.execPath}" "${driver}" %*\r\n`
    );
  } else {
    const mock = path.join(mockBin, 'codex');
    fs.writeFileSync(mock, `#!/usr/bin/env node\nrequire(${JSON.stringify(driver)});\n`);
    fs.chmodSync(mock, 0o755);
  }
  return mockBin;
}

function fixture({ packageRoot = ROOT, manifest = {}, clone = {}, preinstalled = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'videocut-bootstrap-'));
  const packageDir = path.join(dir, 'package');
  fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'bin', 'install.cjs'), path.join(packageDir, 'bin', 'install.cjs'));
  const configured = { ...JSON.parse(fs.readFileSync(path.join(packageRoot, 'installer-manifest.json'), 'utf8')), ...manifest };
  const marketplaceClone = createClone(dir, clone);
  if (preinstalled) writeMarketplaceMetadata(marketplaceClone);
  if (!Object.prototype.hasOwnProperty.call(manifest, 'pluginRef')) configured.pluginRef = marketplaceClone.commit;
  if (!Object.prototype.hasOwnProperty.call(manifest, 'marketplaceRef')) configured.marketplaceRef = configured.pluginRef;
  fs.writeFileSync(path.join(packageDir, 'installer-manifest.json'), JSON.stringify(configured, null, 2) + '\n');
  const mockBin = writeMockCodex(dir);
  return {
    dir,
    packageDir,
    clone: marketplaceClone.clone,
    cloneCommit: marketplaceClone.commit,
    metadata: marketplaceClone.metadata,
    pluginRef: configured.pluginRef,
    log: path.join(dir, 'calls.jsonl'),
    marketState: path.join(dir, 'market-state'),
    pluginState: path.join(dir, 'plugin-state'),
    mockBin
  };
}

function invoke(f, args = ['install'], env = {}) {
  return childProcess.spawnSync('node', [path.join(f.packageDir, 'bin', 'install.cjs'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(f.dir, 'home'),
      CODEX_HOME: path.join(f.dir, 'codex-home'),
      PATH: `${f.mockBin}${path.delimiter}${process.env.PATH}`,
      MOCK_LOG: f.log,
      MOCK_ROOT: f.clone,
      MOCK_METADATA: JSON.stringify(f.metadata),
      MOCK_MARKET_STATE: f.marketState,
      MOCK_PLUGIN_STATE: f.pluginState,
      ...env
    }
  });
}

function calls(f) {
  return fs.readFileSync(f.log, 'utf8').trim().split('\n').map(JSON.parse);
}

function expectedInstallCalls(f) {
  return [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
    ['plugin', 'list', '--marketplace', 'chengfeng-videocut', '--available', '--json'],
    ['plugin', 'marketplace', 'upgrade', 'chengfeng-videocut', '--json'],
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'add', 'chengfeng-videocut@chengfeng-videocut', '--json'],
    ['plugin', 'list', '--json']
  ];
}

function expectedRollbackCalls({ pluginAddStarted = false } = {}) {
  return [
    ...(pluginAddStarted
      ? [['plugin', 'remove', 'chengfeng-videocut@chengfeng-videocut', '--json']]
      : []),
    ['plugin', 'marketplace', 'remove', 'chengfeng-videocut', '--json'],
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ];
}

test('unpublished or malformed pluginRef refuses before Codex calls', () => {
  const f = fixture({ manifest: { pluginRef: 'UNPUBLISHED_REPLACE_WITH_40_HEX_COMMIT' } });
  const result = invoke(f);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No published immutable 40-hex pluginRef/);
  assert.equal(fs.existsSync(f.log), false);
});

test('malformed, movable, or mismatched marketplaceRef refuses before Codex calls', () => {
  const scenarios = [
    {
      name: 'malformed',
      manifest: { marketplaceRef: 'not-a-commit' },
      message: /immutable 40-hex marketplaceRef/
    },
    {
      name: 'movable',
      manifest: { marketplaceRef: 'stable' },
      message: /movable refs such as stable or main are not allowed/
    },
    {
      name: 'mismatch',
      manifest: {
        marketplaceRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pluginRef: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      message: /marketplaceRef must exactly equal pluginRef/
    }
  ];
  for (const scenario of scenarios) {
    const f = fixture({ manifest: scenario.manifest });
    const result = invoke(f);
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, scenario.message, scenario.name);
    assert.equal(fs.existsSync(f.log), false, scenario.name);
  }
});

test('source identity mutation refuses before Codex calls', () => {
  const f = fixture({ manifest: { source: 'example/other' } });
  const result = invoke(f);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /source is not the expected identity/);
  assert.equal(fs.existsSync(f.log), false);
});

test('tarball-shaped package installs add -> upgrade -> verify -> plugin add at the pinned snapshot', () => {
  const f = fixture();
  assert.equal(fs.existsSync(path.join(f.packageDir, '.git')), false);
  assert.equal(
    fs.existsSync(path.join(f.clone, '.codex-marketplace-install.json')),
    false,
    'marketplace add fixture must not pre-materialize install metadata'
  );
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /INSTALLED_OK runtime_unchanged/);
  const observedCalls = calls(f);
  assert.deepEqual(observedCalls, expectedInstallCalls(f));
  const marketplaceAddIndex = observedCalls.findIndex((argv) => argv[2] === 'add');
  const marketplaceUpgradeIndex = observedCalls.findIndex((argv) => argv[2] === 'upgrade');
  const identityReadbackIndex = observedCalls.findIndex(
    (argv, index) =>
      index > marketplaceUpgradeIndex &&
      argv[0] === 'plugin' &&
      argv[1] === 'marketplace' &&
      argv[2] === 'list'
  );
  const pluginAddIndex = observedCalls.findIndex(
    (argv) => argv[0] === 'plugin' && argv[1] === 'add'
  );
  assert.ok(
    marketplaceAddIndex < marketplaceUpgradeIndex &&
      marketplaceUpgradeIndex < identityReadbackIndex &&
      identityReadbackIndex < pluginAddIndex,
    'activation order must be marketplace add -> upgrade -> identity readback -> plugin add'
  );
  assert.equal(
    fs.existsSync(path.join(f.clone, '.codex-marketplace-install.json')),
    true,
    'marketplace upgrade must materialize install metadata before verification'
  );
});

test('same-name marketplace collision stops without add, plugin add, remove, or cache migration', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_MARKETPLACE_COLLISION: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /already exists/);
  assert.deepEqual(calls(f), [['plugin', 'marketplace', 'list', '--json']]);
});

test('non-target plugin collision stops before marketplace add', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_PLUGIN_COLLISION: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to remove or overwrite/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
});

test('stale target plugin collision stops before marketplace add so rollback cannot remove pre-existing plugin state', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_TARGET_PLUGIN_COLLISION: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /refusing to remove or overwrite pre-existing plugin state/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
});

test('target orphan hidden before marketplace add is revealed after materialization and preserved', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_HIDDEN_TARGET_ORPHAN: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pre_existing_orphan_revealed/);
  assert.match(result.stderr, /rollback_succeeded/);
  assert.match(result.stderr, /pre_existing_orphan_preserved/);
  assert.doesNotMatch(result.stderr, /newly-added plugin\/marketplace state/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
    ['plugin', 'list', '--marketplace', 'chengfeng-videocut', '--available', '--json'],
    ['plugin', 'marketplace', 'remove', 'chengfeng-videocut', '--json'],
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
  assert.equal(
    calls(f).some((argv) => argv[0] === 'plugin' && ['add', 'remove'].includes(argv[1])),
    false,
    'orphan preservation must never call plugin add/remove'
  );
  assert.equal(fs.existsSync(f.marketState), false);
});

test('receipt without installedRoot stops before marketplace upgrade or plugin activation', () => {
  const f = fixture();
  const result = invoke(f, ['install'], { MOCK_MODE: 'missing-root' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /marketplace_identity_unverified/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json']
  ]);
});

test('receipt alreadyAdded or marketplace list source mismatch stops before plugin activation', () => {
  const alreadyAdded = fixture();
  const alreadyAddedResult = invoke(alreadyAdded, ['install'], { MOCK_MODE: 'already-added' });
  assert.equal(alreadyAddedResult.status, 2);
  assert.match(alreadyAddedResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(alreadyAdded).some((argv) => argv[2] === 'upgrade'), false);
  assert.equal(calls(alreadyAdded).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const sourceMismatch = fixture();
  const sourceMismatchResult = invoke(sourceMismatch, ['install'], { MOCK_MODE: 'list-source-mismatch' });
  assert.equal(sourceMismatchResult.status, 2);
  assert.match(sourceMismatchResult.stderr, /marketplace_identity_unverified/);
  assert.match(sourceMismatchResult.stderr, /rollback_succeeded/);
  assert.deepEqual(calls(sourceMismatch).slice(-3), expectedRollbackCalls());
  assert.equal(calls(sourceMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);
});

test('marketplace upgrade failure rolls back the new marketplace and a retry succeeds', () => {
  const f = fixture();
  const metadataPath = path.join(f.clone, '.codex-marketplace-install.json');
  assert.equal(fs.existsSync(metadataPath), false);
  const result = invoke(f, ['install'], { MOCK_MODE: 'upgrade-command-failure' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /primary_failure: Codex CLI failed \(8\)/);
  assert.match(result.stderr, /rollback_succeeded/);
  const failedCalls = calls(f);
  assert.deepEqual(failedCalls, [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json'],
    ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
    ['plugin', 'list', '--marketplace', 'chengfeng-videocut', '--available', '--json'],
    ['plugin', 'marketplace', 'upgrade', 'chengfeng-videocut', '--json'],
    ...expectedRollbackCalls()
  ]);
  assert.equal(fs.existsSync(metadataPath), false);
  assert.equal(fs.existsSync(f.marketState), false);
  assert.equal(failedCalls.some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const retry = invoke(f);
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /INSTALLED_OK runtime_unchanged/);
  assert.deepEqual(calls(f).slice(failedCalls.length), expectedInstallCalls(f));
});

test('marketplace upgrade schema mismatches fail closed before identity readback or plugin add', () => {
  for (const mode of [
    'upgrade-schema-selected',
    'upgrade-schema-root',
    'upgrade-schema-errors'
  ]) {
    const f = fixture();
    const result = invoke(f, ['install'], { MOCK_MODE: mode });
    assert.equal(result.status, 2, mode);
    assert.match(result.stderr, /Marketplace upgrade receipt did not prove/, mode);
    assert.match(result.stderr, /rollback_succeeded/, mode);
    assert.deepEqual(calls(f), [
      ['plugin', 'marketplace', 'list', '--json'],
      ['plugin', 'list', '--json'],
      ['plugin', 'marketplace', 'add', SOURCE, '--ref', f.pluginRef, '--json'],
      ['plugin', 'list', '--marketplace', 'chengfeng-videocut', '--available', '--json'],
      ['plugin', 'marketplace', 'upgrade', 'chengfeng-videocut', '--json'],
      ...expectedRollbackCalls()
    ], mode);
    assert.equal(
      fs.existsSync(path.join(f.clone, '.codex-marketplace-install.json')),
      false,
      `${mode} rollback must remove upgrade-materialized metadata`
    );
    assert.equal(calls(f).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false, mode);
  }
});

test('rollback command or receipt failure is distinguished without hiding the primary failure', () => {
  for (const scenario of [
    {
      name: 'remove command failure',
      env: { MOCK_REMOVE_FAIL: '1' },
      rollbackMessage: /rollback_failed: marketplace_remove: Codex CLI failed \(6\)/,
      marketStillPresent: true
    },
    {
      name: 'remove receipt mismatch',
      env: { MOCK_REMOVE_SCHEMA: '1' },
      rollbackMessage: /rollback_failed: marketplace_remove: marketplace_identity_unverified: Marketplace remove receipt/,
      marketStillPresent: false
    }
  ]) {
    const f = fixture();
    const result = invoke(f, ['install'], {
      MOCK_MODE: 'upgrade-command-failure',
      ...scenario.env
    });
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, /primary_failure: Codex CLI failed \(8\)/, scenario.name);
    assert.match(result.stderr, scenario.rollbackMessage, scenario.name);
    assert.deepEqual(calls(f).slice(-3), expectedRollbackCalls(), scenario.name);
    assert.equal(fs.existsSync(f.marketState), scenario.marketStillPresent, scenario.name);
  }
});

test('Codex clone HEAD or origin mismatch stops before plugin activation', () => {
  const mismatchedRef = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const headMismatch = fixture({
    manifest: { pluginRef: mismatchedRef },
    clone: { metadata: { ref_name: mismatchedRef, revision: mismatchedRef } }
  });
  const headResult = invoke(headMismatch);
  assert.equal(headResult.status, 2);
  assert.match(headResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(headMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const originMismatch = fixture({ clone: { origin: 'https://github.com/example/other.git' } });
  const originResult = invoke(originMismatch);
  assert.equal(originResult.status, 2);
  assert.match(originResult.stderr, /marketplace_identity_unverified/);
  assert.equal(calls(originMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);
});

test('marketplace install metadata ref or revision mismatch stops before plugin activation', () => {
  const refMismatch = fixture({ clone: { metadata: { ref_name: 'stable' } } });
  const refResult = invoke(refMismatch);
  assert.equal(refResult.status, 2);
  assert.match(refResult.stderr, /metadata ref_name does not equal manifest pluginRef/);
  assert.equal(calls(refMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);

  const revisionMismatch = fixture({ clone: { metadata: { revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } });
  const revisionResult = invoke(revisionMismatch);
  assert.equal(revisionResult.status, 2);
  assert.match(revisionResult.stderr, /metadata revision does not equal manifest pluginRef/);
  assert.equal(calls(revisionMismatch).some((argv) => argv[0] === 'plugin' && argv[1] === 'add'), false);
});

test('plugin add or final installed readback failure removes plugin before marketplace and proves both absent', () => {
  for (const scenario of [
    {
      name: 'plugin add failure',
      env: { MOCK_PLUGIN_ADD_FAIL: '1' },
      primary: /primary_failure: Codex CLI failed \(5\)/,
      callsBeforeRollback: (f) => [
        ...expectedInstallCalls(f).slice(0, -1)
      ]
    },
    {
      name: 'final plugin list failure',
      env: { MOCK_FINAL_LIST_FAIL: '1' },
      primary: /primary_failure: Codex CLI failed \(7\)/,
      callsBeforeRollback: (f) => expectedInstallCalls(f)
    }
  ]) {
    const f = fixture();
    const result = invoke(f, ['install'], scenario.env);
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, scenario.primary, scenario.name);
    assert.match(result.stderr, /rollback_succeeded/, scenario.name);
    assert.deepEqual(calls(f), [
      ...scenario.callsBeforeRollback(f),
      ...expectedRollbackCalls({ pluginAddStarted: true })
    ], scenario.name);
    assert.equal(fs.existsSync(f.marketState), false, scenario.name);
    assert.equal(fs.existsSync(f.pluginState), false, scenario.name);
  }
});

test('plugin rollback command or receipt failure is distinguished and still performs marketplace cleanup and double readback', () => {
  for (const scenario of [
    {
      name: 'plugin remove command failure',
      env: { MOCK_PLUGIN_REMOVE_FAIL: '1' },
      rollbackMessage: /rollback_failed: plugin_remove: Codex CLI failed \(4\)/
    },
    {
      name: 'plugin remove receipt mismatch',
      env: { MOCK_PLUGIN_REMOVE_SCHEMA: '1' },
      rollbackMessage: /rollback_failed: plugin_remove: marketplace_identity_unverified: Plugin remove receipt/
    }
  ]) {
    const f = fixture();
    const result = invoke(f, ['install'], {
      MOCK_PLUGIN_ADD_FAIL: '1',
      ...scenario.env
    });
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, /primary_failure: Codex CLI failed \(5\)/, scenario.name);
    assert.match(result.stderr, scenario.rollbackMessage, scenario.name);
    assert.deepEqual(calls(f), [
      ...expectedInstallCalls(f).slice(0, -1),
      ...expectedRollbackCalls({ pluginAddStarted: true })
    ], scenario.name);
    assert.equal(fs.existsSync(f.marketState), false, scenario.name);
    assert.equal(fs.existsSync(f.pluginState), false, scenario.name);
  }
});

test('dry-run makes no Codex or Git calls', () => {
  const f = fixture();
  const result = invoke(f, ['install', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY_RUN_OK runtime_unchanged/);
  assert.match(result.stdout, new RegExp(`DRY_RUN \\["codex","plugin","marketplace","add","Agentchengfeng/chengfeng-videocut-skills","--ref","${f.pluginRef}","--json"\\]`));
  assert.match(result.stdout, /DRY_RUN \["codex","plugin","marketplace","upgrade","chengfeng-videocut","--json"\]/);
  assert.equal(
    result.stdout.match(/DRY_RUN \["codex","plugin","list","--json"\]/g).length,
    2,
    'plan includes preflight and final installed readback'
  );
  assert.match(result.stdout, /DRY_RUN \["codex","plugin","list","--marketplace","chengfeng-videocut","--available","--json"\]/);
  assert.match(result.stdout, /DRY_RUN_ROLLBACK_AFTER_PLUGIN_ADD_ON_FAILURE \["codex","plugin","remove","chengfeng-videocut@chengfeng-videocut","--json"\]/);
  assert.match(result.stdout, /DRY_RUN_ROLLBACK_ON_FAILURE \["codex","plugin","marketplace","remove","chengfeng-videocut","--json"\]/);
  assert.match(result.stdout, /DRY_RUN_ROLLBACK_VERIFY_ABSENT \["codex","plugin","marketplace","list","--json"\] \["codex","plugin","list","--json"\]/);
  assert.match(result.stdout, /DRY_RUN \["git","-C","<codex-installedRoot>","rev-parse","HEAD"\]/);
  assert.match(result.stdout, new RegExp(`DRY_RUN_VERIFY .*"marketplaceRef":"${f.pluginRef}".*"pluginRef":"${f.pluginRef}"`));
  assert.doesNotMatch(result.stdout, /\["codex","git"/);
  assert.equal(fs.existsSync(f.log), false);
});

test('doctor validates an installed marketplace and plugin through read-only commands', () => {
  const f = fixture({ preinstalled: true });
  const result = invoke(f, ['doctor'], { MOCK_DOCTOR_INSTALLED: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DOCTOR_OK no_install_attempted/);
  assert.deepEqual(calls(f), [
    ['plugin', 'marketplace', 'list', '--json'],
    ['plugin', 'list', '--json']
  ]);
});

test('doctor fails closed for missing marketplace/plugin or source/clone identity mismatch', () => {
  const scenarios = [
    { name: 'missing marketplace', env: {} },
    { name: 'missing plugin', env: { MOCK_DOCTOR_INSTALLED: '1', MOCK_MODE: 'doctor-missing-plugin' } },
    { name: 'list source mismatch', env: { MOCK_DOCTOR_INSTALLED: '1', MOCK_MODE: 'list-source-mismatch' } },
    { name: 'metadata ref mismatch', clone: { metadata: { ref_name: 'main' } }, env: { MOCK_DOCTOR_INSTALLED: '1' } },
    { name: 'metadata revision mismatch', clone: { metadata: { revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }, env: { MOCK_DOCTOR_INSTALLED: '1' } },
    {
      name: 'clone HEAD mismatch',
      manifest: { pluginRef: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      clone: {
        metadata: {
          ref_name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }
      },
      env: { MOCK_DOCTOR_INSTALLED: '1' }
    },
    { name: 'clone origin mismatch', clone: { origin: 'https://github.com/example/other.git' }, env: { MOCK_DOCTOR_INSTALLED: '1' } }
  ];
  for (const scenario of scenarios) {
    const f = fixture({
      manifest: scenario.manifest,
      clone: scenario.clone,
      preinstalled: true
    });
    const result = invoke(f, ['doctor'], scenario.env);
    assert.equal(result.status, 2, scenario.name);
    assert.match(result.stderr, /marketplace_identity_unverified/, scenario.name);
    assert.deepEqual(calls(f), [
      ['plugin', 'marketplace', 'list', '--json'],
      ['plugin', 'list', '--json']
    ], scenario.name);
  }
});

test('real npm pack extraction has no .git and can complete the same mocked install', () => {
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'videocut-bootstrap-pack-'));
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', packDir], { cwd: ROOT });
  const archive = fs.readdirSync(packDir).find((name) => name.endsWith('.tgz'));
  assert.ok(archive, 'npm pack should create a tarball');
  const unpack = path.join(packDir, 'unpack');
  fs.mkdirSync(unpack);
  run('tar', ['-xzf', path.join(packDir, archive), '-C', unpack]);
  const f = fixture({ packageRoot: path.join(unpack, 'package') });
  assert.equal(fs.existsSync(path.join(f.packageDir, '.git')), false);
  const result = invoke(f);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls(f), expectedInstallCalls(f));
});
