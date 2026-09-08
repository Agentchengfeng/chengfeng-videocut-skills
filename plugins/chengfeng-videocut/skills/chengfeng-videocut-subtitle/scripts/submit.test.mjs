import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const cli = (script, args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(here, script), ...args]);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  child.on('error', reject);
  child.on('close', status => resolve({ status, stdout, stderr }));
});

test('submit uses one explicit CAS POST then verified GET; conflicts and tampering fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtitle-submit-test-'));
  const input = join(root, 'input'); await mkdir(input);
  const transcript = JSON.stringify({ schemaVersion: 1, cues: [{ id: 'c1', words: [{ id: 'w1', text: '你好世界', start: 0, end: 1 }] }] });
  const edl = { schemaVersion: 1, projectId: 'test', sourceDuration: 2, baseCutsRevision: 'a'.repeat(64), baseTranscriptRevision: sha(transcript), mode: 'manual', duration: 2, segments: [{ id: 's1', source: 'source.mp4', sourceStart: 0, sourceEnd: 2, timelineStart: 0, trackId: 'a-roll', playbackRate: 1 }] };
  const transcriptPath = join(input, 'transcript.json'), edlPath = join(input, 'edit-list.json'), candidate = join(root, 'candidate');
  await writeFile(transcriptPath, transcript); await writeFile(edlPath, JSON.stringify(edl));
  const generated = await cli('candidate.mjs', ['generate', '--transcript', transcriptPath, '--edit-list', edlPath, '--project-id', 'test', '--out', candidate]);
  assert.equal(generated.status, 0, generated.stderr);
  const documentBytes = await readFile(join(candidate, 'subtitles.json'));
  const receiptBytes = await readFile(join(candidate, 'candidate-receipt.json'));
  let mode = 'success', stored, postCount = 0, getCount = 0;
  const server = createServer(async (req, res) => {
    if (req.method === 'POST') {
      postCount++;
      assert.equal(req.url, '/api/v1/projects/test/subtitles/candidate');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      assert.equal(body.expectedRevision, 'none');
      assert.equal(body.documentContent, documentBytes.toString());
      assert.deepEqual(body.receipt, JSON.parse(receiptBytes));
      if (mode === 'conflict') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'revision_conflict', message: 'current result changed' } })); return; }
      if (mode === 'redirect') { res.writeHead(307, { Location: '/redirected' }); res.end(); return; }
      const document = JSON.parse(body.documentContent);
      document.skillResult = { schemaVersion: 1, kind: 'subtitles', sources: { transcriptSha256: body.receipt.inputs.transcriptSha256, editListSha256: body.receipt.inputs.editListSha256 }, outputSha256: body.receipt.outputSha256, provenance: body.receipt.provenance, previousResultRevision: null, acceptedAt: new Date().toISOString() };
      const revision = sha(JSON.stringify(document, null, 2) + '\n');
      stored = { schemaVersion: 1, projectId: 'test', exists: true, revision, document, resultState: { status: 'current', sourceStale: false, revision } };
    } else {
      getCount++;
      assert.equal(req.method, 'GET'); assert.equal(req.url, '/api/v1/projects/test/subtitles');
    }
    const resource = structuredClone(stored);
    if (req.method === 'GET' && mode === 'changed') resource.revision = 'c'.repeat(64);
    if (req.method === 'GET' && mode === 'wrong-content') resource.document.cues[0].text = '被替换';
    if (req.method === 'GET' && mode === 'stale') resource.resultState.sourceStale = true;
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: `"${resource.revision}"` }); res.end(JSON.stringify(resource));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const args = ['--service-url', url, '--project-id', 'test', '--candidate', candidate, '--expected-revision', 'none'];
  try {
    let result = await cli('submit.mjs', args); assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).apiReadbackVerified, true);
    assert.equal(JSON.parse(result.stdout).committedToWorkbench, true);
    assert.equal(JSON.parse(result.stdout).productionCommitted, undefined, 'a loopback test service is not proof of production deployment');
    assert.equal(postCount, 1); assert.equal(getCount, 1);
    for (const nextMode of ['conflict', 'redirect', 'changed', 'wrong-content', 'stale']) {
      mode = nextMode; const beforePosts = postCount, beforeGets = getCount;
      result = await cli('submit.mjs', args); assert.equal(result.status, 1, nextMode);
      assert.match(result.stderr, /No retry was made/);
      assert.equal(postCount, beforePosts + 1, `${nextMode} sends exactly one POST`);
      assert.equal(getCount, beforeGets + (['conflict', 'redirect'].includes(nextMode) ? 0 : 1));
    }
    const before = postCount;
    result = await cli('submit.mjs', [...args.slice(0, -1), 'a'.repeat(64)]); assert.equal(result.status, 1);
    await writeFile(join(candidate, 'INCOMPLETE'), 'unfinished');
    result = await cli('submit.mjs', args); assert.equal(result.status, 1); await unlink(join(candidate, 'INCOMPLETE'));
    const changed = JSON.parse(documentBytes); changed.cues[0].text = '文件篡改'; await writeFile(join(candidate, 'subtitles.json'), JSON.stringify(changed));
    result = await cli('submit.mjs', args); assert.equal(result.status, 1); await writeFile(join(candidate, 'subtitles.json'), documentBytes);
    for (const badUrl of ['https://127.0.0.1:8000', 'http://example.com', `${url}/other`, `${url}?query=x`, `http://user:pass@127.0.0.1:${server.address().port}`]) {
      result = await cli('submit.mjs', ['--service-url', badUrl, ...args.slice(2)]); assert.equal(result.status, 1);
    }
    assert.equal(postCount, before, 'invalid local state sends no POST');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log(`Submit helper evidence retained: ${root}`);
});
