import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createSubtitleDocument } from './vendor/subtitles.mjs';
import { parseTranscriptWords } from './vendor/cuts.mjs';
import { posix, win32 } from 'node:path';
import { isWithin } from './path-safety.mjs';
const script = join(dirname(fileURLToPath(import.meta.url)), 'candidate.mjs');
const hash = x => createHash('sha256').update(x).digest('hex');
const provenance = JSON.parse(await readFile(join(dirname(script), 'vendor/provenance.json')));
provenance.entrypoint = { name: 'candidate.mjs', sha256: hash(await readFile(script)) };
async function writeTestReceipt(subtitlePath, transcriptPath, edlPath, reviewedPath) {
  const transcriptBytes = await readFile(transcriptPath);
  const document = JSON.parse(await readFile(subtitlePath));
  const receipt = {
    schemaVersion: 1, kind: 'isolated-subtitle-candidate', productionCommitted: false,
    inputs: { transcriptSha256: hash(transcriptBytes), editListSha256: hash(await readFile(edlPath)), projectId: 'test', resultRevision: reviewedPath ? hash(await readFile(reviewedPath)) : 'none' },
    provenance, outputSha256: hash(await readFile(subtitlePath)),
    validation: { valid: true, cueCount: document.cues.length, wordCount: parseTranscriptWords(JSON.parse(transcriptBytes)).length }
  };
  await writeFile(join(dirname(subtitlePath), 'candidate-receipt.json'), JSON.stringify(receipt));
  return receipt;
}
test('real CLI: output equivalence, readback, no input changes, fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtitle-candidate-test-'));
  const input = join(root, 'input'); await mkdir(input);
  const transcript = { schemaVersion: 1, cues: [{ id: 'c1', words: [
    { id: 'w1', text: '你好', start: 0, end: 0.5, punctuation: '，' },
    { id: 'w2', text: '这是字幕测试', start: 0.5, end: 2, punctuation: '。' }
  ] }] };
  const raw = JSON.stringify(transcript);
  const edl = { schemaVersion: 1, projectId: 'test', sourceDuration: 3, baseCutsRevision: 'a'.repeat(64), baseTranscriptRevision: hash(raw), mode: 'manual', duration: 3, segments: [{ id: 's1', source: 'input/source.mp4', sourceStart: 0, sourceEnd: 3, timelineStart: 0, trackId: 'a-roll', playbackRate: 1 }] };
  const t = join(input, 'transcript.json'), e = join(input, 'edit-list.json');
  await writeFile(t, raw); await writeFile(e, JSON.stringify(edl));
  const initialHashes = [hash(await readFile(t)), hash(await readFile(e))];
  const out = join(root, 'candidate');
  const invoke = (command, tail) => spawnSync(process.execPath, [script, command, '--transcript', t, '--edit-list', e, '--project-id', 'test', ...tail], { encoding: 'utf8' });
  let result = invoke('generate', ['--out', out]); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'subtitles.json'))), createSubtitleDocument('test', hash(raw), parseTranscriptWords(transcript), edl));
  const receipt = JSON.parse(await readFile(join(out, 'candidate-receipt.json')));
  assert.equal(receipt.outputSha256, hash(await readFile(join(out, 'subtitles.json'))));
  await assert.rejects(access(join(out, 'INCOMPLETE')));
  assert.equal(invoke('validate', ['--subtitles', join(out, 'subtitles.json')]).status, 0);
  assert.equal(invoke('generate', ['--out', out]).status, 1);
  assert.deepEqual([hash(await readFile(t)), hash(await readFile(e))], initialHashes);
  assert.equal(spawnSync(process.execPath, [script, 'generate']).status, 1);
  assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0);
  for (const mutate of [
    d => { d.cues[0].words[0].start = 'bad'; },
    d => { d.cues[0].words[0].isGap = 'false'; },
    d => { d.cues[0].words[1].id = 'w1'; },
    d => { d.cues[0].words[0].punctuation = 1; }
  ]) {
    const bad = structuredClone(transcript); mutate(bad); const bytes = JSON.stringify(bad);
    await writeFile(t, bytes); await writeFile(e, JSON.stringify({ ...edl, baseTranscriptRevision: hash(bytes) }));
    assert.equal(invoke('generate', ['--out', join(root, 'bad')]).status, 1);
    await assert.rejects(access(join(root, 'bad')));
  }
  await writeFile(t, raw); await writeFile(e, JSON.stringify({ ...edl, projectId: 'other' }));
  assert.equal(invoke('generate', ['--out', join(root, 'bad')]).status, 1);
  await writeFile(e, JSON.stringify({ ...edl, baseTranscriptRevision: 'b'.repeat(64) }));
  assert.equal(invoke('generate', ['--out', join(root, 'bad')]).status, 1);
  await writeFile(e, JSON.stringify({ ...edl, duration: 50 }));
  assert.equal(invoke('generate', ['--out', join(root, 'bad')]).status, 1);
  console.log(`Isolated test evidence retained: ${root}`);
});
test('path isolation uses native path relationships on posix and win32', () => {
  for (const [api, root, child, sibling] of [[posix, '/input', '/input/sub', '/input-other'], [win32, 'C:\\input', 'C:\\input\\sub', 'C:\\input-other']]) {
    assert.equal(isWithin(root, root, api), true);
    assert.equal(isWithin(root, child, api), true);
    assert.equal(isWithin(root, sibling, api), false);
  }
  assert.equal(isWithin('C:\\input', 'D:\\input', win32), false);
});
test('review regressions: coverage, timeline, orphan cues and strict raw times', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtitle-review-test-'));
  const input = join(root, 'input'); await mkdir(input);
  const t = join(input, 'transcript.json'), e = join(input, 'edit-list.json');
  const s = join(root, 'validate.json'); let sequence = 0;
  const transcript = { schemaVersion: 1, cues: [{ id: 'c1', words: [
    { id: 'w1', text: '第一词', start: 0, end: 1 },
    { id: 'w2', text: '第二词', start: 1, end: 2 }
  ] }] };
  const segment = (start, end, timelineStart = 0, id = 's1') => ({ id, source: 'source.mp4', sourceStart: start, sourceEnd: end, timelineStart, trackId: 'a-roll', playbackRate: 1 });
  async function setup(doc = transcript, segments = [segment(0, 2)], duration = 2) {
    const raw = JSON.stringify(doc); await writeFile(t, raw);
    const edl = { schemaVersion: 1, projectId: 'test', sourceDuration: 2, baseCutsRevision: 'a'.repeat(64), baseTranscriptRevision: hash(raw), mode: 'manual', duration, segments };
    await writeFile(e, JSON.stringify(edl));
    return createSubtitleDocument('test', hash(raw), parseTranscriptWords(doc), edl);
  }
  async function generate(expected) {
    const out = join(root, `candidate-${sequence++}`);
    const result = spawnSync(process.execPath, [script, 'generate', '--transcript', t, '--edit-list', e, '--project-id', 'test', '--out', out], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    if (expected) await assert.rejects(access(out));
    else return JSON.parse(await readFile(join(out, 'subtitles.json')));
  }
  async function validate(doc, expected) {
    await writeFile(s, JSON.stringify(doc));
    await writeTestReceipt(s, t, e);
    const result = spawnSync(process.execPath, [script, 'validate', '--transcript', t, '--edit-list', e, '--project-id', 'test', '--subtitles', s], { encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
  }
  let subtitles = await setup();
  await validate({ ...subtitles, cues: [] }, 1);
  await validate({ ...subtitles, cues: [{ id: 'x', wordIds: ['w1'], text: '修字可以' }] }, 1);
  await validate({ ...subtitles, cues: [{ id: 'x', wordIds: ['w2', 'w1'], text: '错序' }] }, 1);
  await validate({ ...subtitles, cues: [{ id: 'x', wordIds: ['w1', 'w2'], text: '修字可以' }] }, 0);
  subtitles = await setup(transcript, [segment(0, 1)], 1);
  const deleted = await generate(0); assert.deepEqual(deleted.cues.flatMap(c => c.wordIds), ['w1']);
  await validate({ ...subtitles, cues: [{ id: 'x', wordIds: ['w1', 'w2'], text: '含已删词' }] }, 1);
  const gapDoc = { schemaVersion: 1, cues: [{ id: 'c', words: [{ id: 'w', text: '已删除', start: 0, end: 0.4 }] }] };
  await setup(gapDoc, [segment(1, 2)], 1);
  const empty = await generate(0); assert.deepEqual(empty.cues, []); await validate(empty, 0);
  await setup(transcript, [segment(1, 2), segment(0, 1, 1, 's2')]); await generate(1);
  const orphan = { schemaVersion: 1, cues: [{ id: 'c', words: [{ id: 'w', text: '被截中段', start: 0, end: 2 }] }] };
  subtitles = await setup(orphan, [segment(0.5, 1.5)], 1); await generate(1); await validate(subtitles, 1);
  const zero = structuredClone(orphan); zero.cues[0].words[0].start = 0.5; zero.cues[0].words[0].end = 0.5;
  subtitles = await setup(zero); await generate(1); await validate(subtitles, 1);
  await setup(transcript, [segment(0, 2.0008)], 2.0008); await generate(1);
  await setup(transcript, [segment(0, 1), segment(1, 2, 0.9992, 's2')]); await generate(1);
  await setup(transcript, [segment(0, 0.1), segment(0.1, 0.3, 0.1, 's2'), segment(0.3, 2, 0.1 + 0.2, 's3')]); await generate(0);
  subtitles = await setup(transcript, [segment(0, 0.1 + 0.2), segment(0.3, 2, 0.3, 's2')]);
  await generate(0); await validate(subtitles, 0);
  subtitles = await setup(transcript, [segment(0, 0.3008), segment(0.3, 2, 0.3008, 's2')], 2.0008);
  await generate(1); await validate(subtitles, 1);
  console.log(`Review regression evidence retained: ${root}`);
});

test('receipt verification binds bytes, identity, provenance, summary and completion state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtitle-receipt-test-'));
  const input = join(root, 'input'); await mkdir(input);
  const t = join(input, 'transcript.json'), e = join(input, 'edit-list.json');
  const raw = JSON.stringify({ schemaVersion: 1, cues: [{ id: 'c1', words: [{ id: 'w1', text: '测试文字', start: 0.3, end: 1.5 }] }] });
  const edl = { schemaVersion: 1, projectId: 'test', sourceDuration: 3, baseCutsRevision: 'a'.repeat(64), baseTranscriptRevision: hash(raw), mode: 'manual', duration: 3, segments: [{ id: 's1', source: 'source.mp4', sourceStart: 0, sourceEnd: 3, timelineStart: 0, trackId: 'a-roll', playbackRate: 1 }] };
  await writeFile(t, raw); await writeFile(e, JSON.stringify(edl));
  const out = join(root, 'candidate');
  const run = (command, tail) => spawnSync(process.execPath, [script, command, '--transcript', t, '--edit-list', e, '--project-id', 'test', ...tail], { encoding: 'utf8' });
  assert.equal(run('generate', ['--out', out]).status, 0);
  const s = join(out, 'subtitles.json'), r = join(out, 'candidate-receipt.json');
  const receiptBytes = await readFile(r), subtitleBytes = await readFile(s);
  const validate = (tail = []) => run('validate', ['--subtitles', s, ...tail]);
  assert.equal(validate().status, 0);
  await unlink(r); assert.equal(validate().status, 1);
  const external = join(root, 'receipt.json'); await writeFile(external, receiptBytes);
  assert.equal(validate(['--receipt', external]).status, 0);
  await writeFile(r, receiptBytes);
  await writeFile(join(out, 'INCOMPLETE'), 'unfinished');
  assert.match(validate().stderr, /INCOMPLETE/); await unlink(join(out, 'INCOMPLETE'));
  await writeFile(join(root, 'INCOMPLETE'), 'unfinished receipt');
  assert.match(validate(['--receipt', external]).stderr, /INCOMPLETE/); await unlink(join(root, 'INCOMPLETE'));
  for (const mutate of [
    d => { delete d.schemaVersion; }, d => { d.schemaVersion = 2; }, d => { d.productionCommitted = true; },
    d => { d.kind = 'something-else'; }, d => { delete d.inputs.resultRevision; },
    d => { d.inputs.projectId = 'other'; }, d => { d.inputs.transcriptSha256 = 'a'.repeat(64); },
    d => { d.inputs.editListSha256 = 'a'.repeat(64); }, d => { d.inputs.resultRevision = 'a'.repeat(64); },
    d => { d.outputSha256 = 'a'.repeat(64); }, d => { d.provenance.generator = 'changed'; },
    d => { d.provenance.bundles['subtitles.mjs'] = 'a'.repeat(64); },
    d => { d.validation.cueCount += 1; }, d => { d.validation.wordCount += 1; }, d => { d.validation.valid = false; }
  ]) {
    const changed = JSON.parse(receiptBytes); mutate(changed); await writeFile(r, JSON.stringify(changed));
    assert.equal(validate().status, 1, JSON.stringify(changed));
  }
  await writeFile(r, receiptBytes);
  const changed = JSON.parse(subtitleBytes); changed.cues[0].text = '结构合法但不是签收候选';
  await writeFile(s, JSON.stringify(changed)); assert.match(validate().stderr, /output SHA/);
  await writeFile(s, subtitleBytes);
  await writeFile(e, JSON.stringify({ ...edl, duration: 2.8, segments: [{ ...edl.segments[0], sourceStart: 0.2 }] }));
  // All anchors still play; only raw EDL timing changed, which must invalidate receipt.
  assert.match(validate().stderr, /input revision mismatch/);
  await writeFile(e, JSON.stringify(edl)); assert.equal(validate().status, 0);
  console.log(`Receipt regression evidence retained: ${root}`);
});

test('regeneration preserves reviewed text/style/grouping and binds exact reviewed bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'subtitle-regenerate-test-'));
  const input = join(root, 'input'); await mkdir(input);
  const t = join(input, 'transcript.json'), e = join(input, 'edit-list.json'), reviewedPath = join(input, 'subtitles.json');
  const transcript = { schemaVersion: 1, cues: [{ id: 'c1', words: [
    { id: 'w1', text: '坏名字', start: 0, end: 0.4, punctuation: '，' },
    { id: 'w2', text: '继续', start: 0.5, end: 0.9, punctuation: '，' },
    { id: 'w3', text: '结束', start: 1, end: 1.4, punctuation: '。' }
  ] }] };
  const raw = JSON.stringify(transcript);
  const edl = { schemaVersion: 1, projectId: 'test', sourceDuration: 3, baseCutsRevision: 'a'.repeat(64), baseTranscriptRevision: hash(raw), mode: 'manual', duration: 3, segments: [{ id: 's1', source: 'source.mp4', sourceStart: 0, sourceEnd: 3, timelineStart: 0, trackId: 'a-roll', playbackRate: 1 }] };
  await writeFile(t, raw); await writeFile(e, JSON.stringify(edl));
  const reviewed = createSubtitleDocument('test', hash(raw), parseTranscriptWords(transcript), edl);
  reviewed.cues = [{ id: 'manual-1', wordIds: ['w1', 'w2'], text: 'Grok Bot，继续。' }, { id: 'manual-2', wordIds: ['w3'], text: '人工确认的结尾' }];
  reviewed.style.color = '#ffd600'; reviewed.style.fontSize = 8.2;
  reviewed.skillResult = { schemaVersion: 1, kind: 'subtitles', review: { notes: [{ basedOnRevision: 'b'.repeat(64), text: '保持产品名大小写', createdAt: '2026-09-05T01:00:00.000Z' }] } };
  await writeFile(reviewedPath, JSON.stringify(reviewed, null, 2) + '\n');
  const initialBytes = await readFile(reviewedPath);
  let index = 0;
  const run = (command, tail) => spawnSync(process.execPath, [script, command, '--transcript', t, '--edit-list', e, '--project-id', 'test', ...tail], { encoding: 'utf8' });
  const generate = () => { const out = join(root, `candidate-${index++}`); return { out, result: run('generate', ['--reviewed-subtitles', reviewedPath, '--out', out]) }; };
  let { out, result } = generate(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).reviewFeedback, { noteCount: 1, notesApplied: false, notes: reviewed.skillResult.review.notes });
  const output = JSON.parse(await readFile(join(out, 'subtitles.json')));
  assert.deepEqual(output.cues, reviewed.cues); assert.deepEqual(output.style, reviewed.style); assert.equal(output.skillResult, undefined);
  const receipt = JSON.parse(await readFile(join(out, 'candidate-receipt.json')));
  assert.equal(receipt.inputs.resultRevision, hash(initialBytes));
  const validate = extra => run('validate', ['--subtitles', join(out, 'subtitles.json'), ...extra]);
  assert.equal(validate(['--reviewed-subtitles', reviewedPath]).status, 0);
  assert.deepEqual(JSON.parse(validate(['--reviewed-subtitles', reviewedPath]).stdout).reviewFeedback.notes, reviewed.skillResult.review.notes);
  assert.equal(validate([]).status, 1);
  for (const invalidNotes of ['not-an-array', [{ ...reviewed.skillResult.review.notes[0], text: '' }], [{ ...reviewed.skillResult.review.notes[0], basedOnRevision: 'guessed' }]]) {
    const invalidReview = structuredClone(reviewed); invalidReview.skillResult.review.notes = invalidNotes;
    await writeFile(reviewedPath, JSON.stringify(invalidReview));
    const rejected = generate(); assert.equal(rejected.result.status, 1); assert.match(rejected.result.stderr, /Invalid reviewed feedback notes/);
    await assert.rejects(access(rejected.out));
  }
  await writeFile(reviewedPath, JSON.stringify(reviewed)); // Same JSON, different exact bytes is a different revision.
  assert.match(validate(['--reviewed-subtitles', reviewedPath]).stderr, /input revision mismatch/);
  await writeFile(reviewedPath, initialBytes);
  const unpreserved = structuredClone(output); unpreserved.cues[0].text = '丢失了修正';
  await writeFile(join(out, 'subtitles.json'), JSON.stringify(unpreserved));
  await writeTestReceipt(join(out, 'subtitles.json'), t, e, reviewedPath);
  assert.match(validate(['--reviewed-subtitles', reviewedPath]).stderr, /does not preserve reviewed/);
  // New retained word outside reviewed groups is generated without overwriting either group.
  const added = structuredClone(transcript); added.cues[0].words.push({ id: 'w4', text: '新增', start: 2, end: 2.5 });
  const addedRaw = JSON.stringify(added); await writeFile(t, addedRaw); await writeFile(e, JSON.stringify({ ...edl, baseTranscriptRevision: hash(addedRaw) }));
  ({ out, result } = generate()); assert.equal(result.status, 0, result.stderr);
  const withNew = JSON.parse(await readFile(join(out, 'subtitles.json')));
  assert.deepEqual(withNew.cues.slice(0, 2), reviewed.cues);
  assert.deepEqual(withNew.cues.flatMap(cue => cue.wordIds), ['w1', 'w2', 'w3', 'w4']);
  assert.deepEqual(withNew.style, reviewed.style);
  // Insertions inside a reviewed group cannot be guessed into corrected display text.
  const interrupted = structuredClone(transcript); interrupted.cues[0].words.splice(1, 0, { id: 'wx', text: '插入', start: 0.41, end: 0.49 });
  const interruptedRaw = JSON.stringify(interrupted); await writeFile(t, interruptedRaw); await writeFile(e, JSON.stringify({ ...edl, baseTranscriptRevision: hash(interruptedRaw) }));
  ({ out, result } = generate()); assert.equal(result.status, 1); assert.match(result.stderr, /interrupted anchors/); await assert.rejects(access(out));
  await writeFile(t, raw);
  for (const sourceStart of [0.5, 1]) {
    await writeFile(e, JSON.stringify({ ...edl, duration: 3 - sourceStart, segments: [{ ...edl.segments[0], sourceStart }] }));
    ({ out, result } = generate()); assert.equal(result.status, 1); assert.match(result.stderr, /deleted\/missing words/); await assert.rejects(access(out));
  }
  assert.deepEqual(await readFile(reviewedPath), initialBytes);
  console.log(`Regeneration regression evidence retained: ${root}`);
});
