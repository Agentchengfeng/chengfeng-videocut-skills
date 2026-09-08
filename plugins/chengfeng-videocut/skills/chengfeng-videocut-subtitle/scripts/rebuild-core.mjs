// Development only: node scripts/rebuild-core.mjs /path/to/runtime-checkout
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Explicit Runtime source checkout required');
const target = join(dirname(fileURLToPath(import.meta.url)), 'vendor');
await mkdir(target, { recursive: true });
const sha = x => createHash('sha256').update(x).digest('hex');
const sources = {};
for (const name of ['subtitles', 'cuts', 'editList']) {
  const source = `packages/core/src/${name}.ts`;
  const result = spawnSync('bun', ['build', source, '--target=node', '--format=esm', '--outfile', join(target, `${name}.mjs`)], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr || result.error);
  sources[source] = sha(await readFile(join(root, source)));
}
for (const source of ['packages/core/src/errors.ts', 'packages/contracts/src/index.ts', 'LICENSE']) sources[source] = sha(await readFile(join(root, source)));
await copyFile(join(root, 'LICENSE'), join(target, 'LICENSE'));
const bundles = {};
for (const name of ['subtitles', 'cuts', 'editList']) bundles[`${name}.mjs`] = sha(await readFile(join(target, `${name}.mjs`)));
await writeFile(join(target, 'provenance.json'), JSON.stringify({ generator: 'subtitle-candidate-pilot-1', license: 'Apache-2.0', sourceRepository: 'chengfeng-videocut Runtime', sourceCommit: spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), bundler: spawnSync('bun', ['--version'], { encoding: 'utf8' }).stdout.trim(), sources, bundles }, null, 2) + '\n');
