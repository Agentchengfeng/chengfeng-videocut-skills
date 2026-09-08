import { readFile, realpath, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertSubtitleDocument } from './vendor/subtitles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const revision = value => typeof value === 'string' && /^(none|[a-f0-9]{64})$/.test(value);
const fail = message => { throw new Error(message); };
const keys = ['schemaVersion', 'projectId', 'baseTranscriptRevision', 'style', 'cues'];
const content = document => Object.fromEntries(keys.map(key => [key, document[key]]));
let postAttempted = false;
let acceptedRevision = null;

async function complete(directory) {
  try { await lstat(join(directory, 'INCOMPLETE')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail('INCOMPLETE candidate cannot be submitted');
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  let resource;
  try { resource = await response.json(); }
  catch { fail(`Service returned non-JSON response (${response.status})`); }
  if (!response.ok) fail(`Service rejected candidate (${response.status} ${resource?.error?.code || 'unknown'}): ${resource?.error?.message || 'inspect the workbench before retrying'}`);
  if (!object(resource) || resource.schemaVersion !== 1 || !resource.exists || !revision(resource.revision) || resource.revision === 'none' || !object(resource.document)) fail('Invalid subtitle service readback');
  if (response.headers.get('etag') !== `"${resource.revision}"`) fail('Service ETag/revision mismatch');
  return resource;
}
async function run() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === '--help') {
    console.log('Node >=18. submit.mjs --service-url http://127.0.0.1:PORT --project-id ID --candidate DIRECTORY --expected-revision none|SHA256\nExplicit existing loopback service only. No startup, installation, automatic retry, force overwrite or production-file copy. Run candidate.mjs validate first.'); return;
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!['--service-url', '--project-id', '--candidate', '--expected-revision'].includes(name) || options[name] || !args[index + 1]) fail(`Invalid argument ${name}`);
    options[name] = args[index + 1];
  }
  for (const key of ['--service-url', '--project-id', '--candidate', '--expected-revision']) if (!options[key]) fail(`Missing ${key}`);
  const service = new URL(options['--service-url']);
  if (service.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(service.hostname) || service.username || service.password || service.pathname !== '/' || service.search || service.hash) fail('Service URL must be an explicit HTTP loopback IP origin (127.0.0.1 or [::1])');
  const projectId = options['--project-id'];
  if (!projectId.trim() || projectId.trim() !== projectId || ['.', '..'].includes(projectId) || /[\\/\0]/.test(projectId)) fail('Invalid project ID');
  if (!revision(options['--expected-revision'])) fail('Expected revision must be none or a SHA-256 value; reread explicitly, never guess');
  const candidate = await realpath(options['--candidate']);
  await complete(candidate);
  const rawDocument = await readFile(join(candidate, 'subtitles.json'));
  const rawReceipt = await readFile(join(candidate, 'candidate-receipt.json'));
  const document = JSON.parse(rawDocument);
  const receipt = JSON.parse(rawReceipt);
  assertSubtitleDocument(document);
  if (Object.keys(document).some(key => !keys.includes(key))) fail('Candidate must omit Runtime-owned metadata and unsupported fields');
  if (!object(receipt) || receipt.schemaVersion !== 1 || receipt.kind !== 'isolated-subtitle-candidate' || receipt.productionCommitted !== false || !object(receipt.inputs)) fail('Invalid candidate receipt schema/state');
  if (document.projectId !== projectId || receipt.inputs.projectId !== projectId || receipt.inputs.resultRevision !== options['--expected-revision']) fail('Project/expected revision does not match candidate receipt; regenerate against the reviewed result');
  if (!/^[a-f0-9]{64}$/.test(receipt.inputs.transcriptSha256) || !/^[a-f0-9]{64}$/.test(receipt.inputs.editListSha256) || document.baseTranscriptRevision !== receipt.inputs.transcriptSha256) fail('Invalid candidate source revisions');
  if (hash(rawDocument) !== receipt.outputSha256) fail('Candidate output SHA mismatch');
  const provenance = JSON.parse(await readFile(join(here, 'vendor/provenance.json')));
  for (const [name, expected] of Object.entries(provenance.bundles)) if (hash(await readFile(join(here, 'vendor', name))) !== expected) fail('Bundled core hash mismatch');
  provenance.entrypoint = { name: 'candidate.mjs', sha256: hash(await readFile(join(here, 'candidate.mjs'))) };
  if (!isDeepStrictEqual(receipt.provenance, provenance)) fail('Candidate provenance mismatch; validate/regenerate using the matching Skill version');
  if (!object(receipt.validation) || receipt.validation.valid !== true || receipt.validation.cueCount !== document.cues.length || !Number.isInteger(receipt.validation.wordCount) || receipt.validation.wordCount < 0) fail('Invalid candidate validation summary');
  if (hash(await readFile(join(candidate, 'subtitles.json'))) !== hash(rawDocument) || hash(await readFile(join(candidate, 'candidate-receipt.json'))) !== hash(rawReceipt)) fail('Candidate changed before submission');
  await complete(candidate);
  const url = new URL(`/api/v1/projects/${encodeURIComponent(projectId)}/subtitles`, service).href;
  // One POST only. Runtime rechecks live source/result revisions inside its project lock.
  postAttempted = true;
  const accepted = await request(`${url}/candidate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ expectedRevision: options['--expected-revision'], documentContent: rawDocument.toString('utf8'), receipt }),
  });
  acceptedRevision = accepted.revision;
  const current = await request(url, { headers: { Accept: 'application/json' } });
  if (accepted.projectId !== projectId || current.projectId !== projectId || accepted.revision !== current.revision || !isDeepStrictEqual(accepted.document, current.document) || !isDeepStrictEqual(content(current.document), document)) fail('Accepted result changed or content differs on GET readback; inspect the workbench, do not resubmit');
  const metadata = current.document.skillResult;
  if (!object(metadata) || metadata.schemaVersion !== 1 || metadata.kind !== 'subtitles' || metadata.outputSha256 !== receipt.outputSha256 || metadata.previousResultRevision !== (options['--expected-revision'] === 'none' ? null : options['--expected-revision']) || !isDeepStrictEqual(metadata.sources, { transcriptSha256: receipt.inputs.transcriptSha256, editListSha256: receipt.inputs.editListSha256 }) || !isDeepStrictEqual(metadata.provenance, receipt.provenance)) fail('Accepted result provenance/source/previous revision readback mismatch');
  if (current.resultState?.status !== 'current' || current.resultState?.sourceStale !== false || current.resultState?.revision !== current.revision) fail('Accepted result is not current on GET readback; inspect source changes before continuing');
  console.log(JSON.stringify({ submitted: true, committedToWorkbench: true, apiReadbackVerified: true, projectId, revision: current.revision, previousRevision: options['--expected-revision'] }));
}
run().catch(error => {
  console.error(`submit_error: ${error.message}${postAttempted ? `\nA POST was attempted${acceptedRevision ? `; accepted revision ${acceptedRevision}` : ''}. No retry was made. Inspect current workbench state before another submission.` : '\nNo POST was attempted.'}`);
  process.exitCode = 1;
});
