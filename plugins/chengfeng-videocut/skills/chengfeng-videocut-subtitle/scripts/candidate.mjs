import { readFile, writeFile, mkdir, realpath, unlink, lstat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseTranscriptWords } from './vendor/cuts.mjs';
import { parseEditListDocument } from './vendor/editList.mjs';
import { createSubtitleDocument, assertSubtitleDocument, DEFAULT_SUBTITLE_STYLE, subtitleCueTimings, wordPlays, orderedSegments } from './vendor/subtitles.mjs';
import { isWithin } from './path-safety.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
const fail = message => { throw Error(message); };
const obj = x => x && typeof x === 'object' && !Array.isArray(x);
const id = x => typeof x === 'string' && x.trim() === x && x.length > 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const here = dirname(fileURLToPath(import.meta.url));
const canonicalKeys = ['schemaVersion', 'projectId', 'baseTranscriptRevision', 'style', 'cues'];
function validateStyle(style) {
  for (const key of Object.keys(DEFAULT_SUBTITLE_STYLE)) if (!(key in style)) fail(`Missing style ${key}`);
  for (const [key, value] of Object.entries(style)) {
    if (!(key in DEFAULT_SUBTITLE_STYLE) || typeof value !== typeof DEFAULT_SUBTITLE_STYLE[key] || (typeof value === 'number' && !finite(value))) fail(`Invalid style ${key}`);
  }
  if (!['bottom', 'middle', 'top'].includes(style.anchor)) fail('Invalid style anchor');
}
function reviewFeedback(reviewed) {
  const notes = reviewed?.skillResult?.review?.notes ?? [];
  if (!Array.isArray(notes) || notes.length > 50 || notes.some(note => !obj(note)
    || typeof note.basedOnRevision !== 'string' || !/^(none|[a-f0-9]{64})$/.test(note.basedOnRevision)
    || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 2000
    || typeof note.createdAt !== 'string')) fail('Invalid reviewed feedback notes; inspect the stored result before regenerating');
  // Display feedback as data for the next reviewer; never execute natural-language notes.
  return { noteCount: notes.length, notesApplied: false,
    notes: notes.map(({ basedOnRevision, text, createdAt }) => ({ basedOnRevision, text, createdAt })) };
}
function preserveReviewed(generated, reviewed, retained, edl) {
  assertSubtitleDocument(reviewed);
  if (reviewed.projectId !== generated.projectId) fail('Reviewed subtitle project identity mismatch');
  if (typeof reviewed.baseTranscriptRevision !== 'string' || !/^[a-f0-9]{64}$/.test(reviewed.baseTranscriptRevision)) fail('Reviewed subtitle requires a valid baseTranscriptRevision');
  if (Object.keys(reviewed).some(key => ![...canonicalKeys, 'skillResult'].includes(key))) fail('Unsupported reviewed subtitle fields; resolve explicitly before regeneration');
  validateStyle(reviewed.style);
  const position = new Map(retained.map((word, index) => [word.id, index]));
  const cues = [];
  let cursor = 0;
  const appendNew = (start, end) => {
    if (start === end) return;
    const fresh = createSubtitleDocument(generated.projectId, generated.baseTranscriptRevision, retained.slice(start, end), edl);
    cues.push(...fresh.cues);
  };
  for (const cue of reviewed.cues) {
    if (Object.keys(cue).some(key => !['id', 'wordIds', 'text'].includes(key)) || !cue.wordIds.length) fail(`Reviewed cue ${cue.id} has unsupported fields or empty anchors`);
    const indexes = cue.wordIds.map(wordId => position.get(wordId));
    if (indexes.some(index => index === undefined)) fail(`Reviewed cue ${cue.id} references deleted/missing words. Resolve its correction/grouping in the workbench before regenerating; no reviewed text was discarded.`);
    if (indexes[0] < cursor || indexes.some((index, offset) => index !== indexes[0] + offset)) fail(`Reviewed cue ${cue.id} has reordered or interrupted anchors. Resolve the grouping explicitly before regenerating; no reviewed text was discarded.`);
    appendNew(cursor, indexes[0]);
    cues.push(structuredClone(cue));
    cursor = indexes.at(-1) + 1;
  }
  appendNew(cursor, retained.length);
  // Generated gaps can reuse core cue ids. Preserve reviewed ids and rename only new collisions.
  const reviewedIds = new Set(reviewed.cues.map(cue => cue.id));
  const reserved = new Set(reviewedIds);
  const reviewedByFirstWord = new Map(reviewed.cues.map(cue => [cue.wordIds[0], cue]));
  for (const cue of cues) {
    if (reviewedByFirstWord.get(cue.wordIds[0])?.id === cue.id) continue;
    let candidate = cue.id;
    let suffix = 1;
    while (reserved.has(candidate)) candidate = `${cue.id}-new-${suffix++}`;
    cue.id = candidate;
    reserved.add(candidate);
  }
  return { ...generated, style: structuredClone(reviewed.style), cues };
}
async function assertComplete(directory) {
  try { await lstat(join(directory, 'INCOMPLETE')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail('INCOMPLETE candidate cannot be validated or submitted; regenerate into a new directory');
}
function validateReceipt(receipt, inputs, provenance, output, summary) {
  if (!obj(receipt) || receipt.schemaVersion !== 1 || receipt.kind !== 'isolated-subtitle-candidate' || receipt.productionCommitted !== false) fail('Unsupported candidate receipt schema/state; regenerate the candidate');
  if (!isDeepStrictEqual(receipt.inputs, inputs)) fail('Candidate receipt input revision mismatch (transcript, edit-list, project or reviewed result); regenerate from current inputs');
  if (!isDeepStrictEqual(receipt.provenance, provenance)) fail('Candidate receipt provenance mismatch');
  if (receipt.outputSha256 !== sha(output)) fail('Candidate receipt output SHA mismatch; do not edit candidate files after generation');
  if (!isDeepStrictEqual(receipt.validation, summary)) fail('Candidate receipt validation summary mismatch');
}
async function run() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    console.log('Node >=18. generate|validate --transcript FILE --edit-list FILE --project-id ID [--reviewed-subtitles FILE] [--out NEW_DIRECTORY (generate) | --subtitles FILE [--receipt FILE] (validate)]\nValidate requires candidate-receipt.json beside subtitles unless --receipt is explicit. Reviewed results must be supplied again for validation. Isolated candidate only. No installation, Runtime service, or production commit.'); return;
  }
  if (!['generate', 'validate'].includes(command)) fail('Unknown command');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--transcript', '--edit-list', '--project-id', '--reviewed-subtitles', ...(command === 'generate' ? ['--out'] : ['--subtitles', '--receipt'])].includes(key) || options[key] || !args[i + 1]) fail(`Invalid argument ${key}`);
    options[key] = args[i + 1];
  }
  for (const key of ['--transcript', '--edit-list', '--project-id', command === 'generate' ? '--out' : '--subtitles']) if (!options[key]) fail(`Missing ${key}`);
  const transcriptPath = await realpath(options['--transcript']);
  const edlPath = await realpath(options['--edit-list']);
  const rawTranscript = await readFile(transcriptPath);
  const rawEdl = await readFile(edlPath);
  const reviewedPath = options['--reviewed-subtitles'] ? await realpath(options['--reviewed-subtitles']) : null;
  const rawReviewed = reviewedPath ? await readFile(reviewedPath) : null;
  const reviewed = rawReviewed ? JSON.parse(rawReviewed) : null;
  const feedback = reviewFeedback(reviewed);
  const transcript = JSON.parse(rawTranscript);
  const edl = JSON.parse(rawEdl);
  if (!obj(transcript) || transcript.schemaVersion !== 1 || !Array.isArray(transcript.cues)) fail('Unsupported transcript structure');
  if (!id(options['--project-id']) || edl.projectId !== options['--project-id']) fail('Project identity mismatch');
  if ('projectId' in transcript && transcript.projectId !== edl.projectId) fail('Transcript project identity mismatch');
  if (edl.baseTranscriptRevision !== sha(rawTranscript)) fail('Transcript revision mismatch');
  const cueIds = new Set();
  for (const cue of transcript.cues) {
    if (!obj(cue) || !id(cue.id) || cueIds.has(cue.id) || !Array.isArray(cue.words)) fail('Invalid or duplicate transcript cue');
    cueIds.add(cue.id);
    for (const word of cue.words) {
      if (!obj(word) || !id(word.id) || typeof word.text !== 'string' || !finite(word.start) || !finite(word.end) || word.start < 0 || word.end < word.start || word.end > edl.sourceDuration) fail('Invalid transcript word');
      if ('isGap' in word && typeof word.isGap !== 'boolean') fail('Invalid isGap');
      if ('punctuation' in word && typeof word.punctuation !== 'string') fail('Invalid punctuation');
    }
  }
  const words = parseTranscriptWords(transcript);
  parseEditListDocument(edl); // Validate with the existing core, but do not replace/round input times.
  // Only ordinary floating-point accumulation error is tolerated, not the core parser's millisecond normalization.
  const close = (a, b) => Math.abs(a - b) <= Number.EPSILON * 32 * Math.max(1, Math.abs(a), Math.abs(b));
  let cursor = 0;
  let previousSourceEnd = 0;
  for (const segment of edl.segments) {
    if (segment.sourceEnd > edl.sourceDuration && !close(segment.sourceEnd, edl.sourceDuration)) fail('Raw source boundary exceeds duration');
    if (!close(segment.timelineStart, cursor)) fail('Raw timeline must be continuous');
    if (segment.sourceStart < previousSourceEnd && !close(segment.sourceStart, previousSourceEnd)) fail('Source reordering/overlap unsupported');
    cursor += segment.sourceEnd - segment.sourceStart;
    previousSourceEnd = segment.sourceEnd;
  }
  if (!close(cursor, edl.duration)) fail('Raw duration mismatch');
  const ranges = [...edl.segments].sort((a, b) => a.sourceStart - b.sourceStart);
  for (let i = 0; i < ranges.length; i++) {
    if (!id(ranges[i].id) || !id(ranges[i].source)) fail('Invalid segment identity');
    if (ranges[i].source !== ranges[0].source) fail('Multiple media sources unsupported');
    if (i && ranges[i].sourceStart < ranges[i - 1].sourceEnd && !close(ranges[i].sourceStart, ranges[i - 1].sourceEnd)) fail('Overlapping source intervals unsupported');
  }
  const provenance = JSON.parse(await readFile(join(here, 'vendor/provenance.json')));
  for (const [name, hash] of Object.entries(provenance.bundles)) if (sha(await readFile(join(here, 'vendor', name))) !== hash) fail('Bundled core hash mismatch');
  provenance.entrypoint = { name: 'candidate.mjs', sha256: sha(await readFile(fileURLToPath(import.meta.url))) };
  const retained = [...words].sort((a, b) => a.start - b.start)
    .filter(w => !w.isGap && w.text.trim() && wordPlays(orderedSegments(edl), w));
  const subtitlesPath = command === 'validate' ? await realpath(options['--subtitles']) : null;
  const receiptPath = command === 'validate' ? await realpath(options['--receipt'] || join(dirname(subtitlesPath), 'candidate-receipt.json')) : null;
  if (command === 'validate') {
    await assertComplete(dirname(subtitlesPath));
    await assertComplete(dirname(receiptPath));
  }
  const rawSubtitles = subtitlesPath ? await readFile(subtitlesPath) : null;
  const rawReceipt = receiptPath ? await readFile(receiptPath) : null;
  let subtitles = command === 'generate' ? createSubtitleDocument(edl.projectId, sha(rawTranscript), words, edl) : JSON.parse(rawSubtitles);
  if (command === 'generate' && rawReviewed) subtitles = preserveReviewed(subtitles, reviewed, retained, edl);
  assertSubtitleDocument(subtitles);
  if (Object.keys(subtitles).some(key => !canonicalKeys.includes(key))) fail('Candidate contains unsupported fields; skillResult metadata belongs to Runtime');
  if (subtitles.projectId !== edl.projectId || subtitles.baseTranscriptRevision !== sha(rawTranscript)) fail('Subtitle identity/revision mismatch');
  const wordIds = new Set(words.map(w => w.id));
  for (const cue of subtitles.cues) {
    if (Object.keys(cue).some(k => !['id', 'wordIds', 'text'].includes(k)) || !cue.wordIds.length || cue.wordIds.some(w => !wordIds.has(w))) fail('Invalid subtitle anchors/fields');
  }
  const anchors = subtitles.cues.flatMap(cue => cue.wordIds);
  if (anchors.length !== retained.length || anchors.some((value, index) => value !== retained[index].id)) fail('Subtitle retained-word coverage/order mismatch');
  if (retained.some(w => w.end <= w.start)) fail('Retained word must have positive duration');
  if (subtitleCueTimings(subtitles, words, edl).some(t => t.orphaned || !finite(t.duration) || t.duration <= 0)) fail('Subtitle cue is orphaned or has no positive display duration');
  validateStyle(subtitles.style);
  const summary = { valid: true, cueCount: subtitles.cues.length, wordCount: words.length };
  const inputs = { transcriptSha256: sha(rawTranscript), editListSha256: sha(rawEdl), projectId: edl.projectId, resultRevision: rawReviewed ? sha(rawReviewed) : 'none' };
  const verifyInputsUnchanged = async () => {
    if (sha(await readFile(transcriptPath)) !== sha(rawTranscript) || sha(await readFile(edlPath)) !== sha(rawEdl) || (reviewedPath && sha(await readFile(reviewedPath)) !== sha(rawReviewed))) fail('Input changed during candidate operation');
  };
  if (command === 'validate') {
    validateReceipt(JSON.parse(rawReceipt), inputs, provenance, rawSubtitles, summary);
    if (rawReviewed) {
      const preserved = preserveReviewed(createSubtitleDocument(edl.projectId, sha(rawTranscript), words, edl), reviewed, retained, edl);
      if (!isDeepStrictEqual(subtitles, preserved)) fail('Regenerated candidate does not preserve reviewed text/style/grouping');
    }
    await verifyInputsUnchanged();
    if (sha(await readFile(subtitlesPath)) !== sha(rawSubtitles) || sha(await readFile(receiptPath)) !== sha(rawReceipt)) fail('Candidate changed during validation');
    await assertComplete(dirname(subtitlesPath));
    await assertComplete(dirname(receiptPath));
    console.log(JSON.stringify({ ...summary, receiptVerified: true, resultRevision: inputs.resultRevision, reviewFeedback: feedback })); return;
  }
  const out = resolve(options['--out']);
  const parent = await realpath(dirname(out));
  for (const input of [transcriptPath, edlPath, reviewedPath].filter(Boolean)) if (isWithin(dirname(input), parent)) fail('Candidate must be outside input directories');
  await mkdir(out); // Exclusive: EEXIST (including symlinks) fails. Never overwrite.
  await writeFile(join(out, 'INCOMPLETE'), 'Candidate generation not completed. Not a production result.\n', { flag: 'wx' });
  const output = JSON.stringify(subtitles, null, 2) + '\n';
  await writeFile(join(out, 'subtitles.json'), output, { flag: 'wx' });
  await verifyInputsUnchanged();
  if (sha(await readFile(join(out, 'subtitles.json'))) !== sha(output)) fail('Output readback mismatch');
  const receipt = { schemaVersion: 1, kind: 'isolated-subtitle-candidate', productionCommitted: false, inputs, provenance, outputSha256: sha(output), validation: summary };
  await writeFile(join(out, 'candidate-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  validateReceipt(JSON.parse(await readFile(join(out, 'candidate-receipt.json'))), inputs, provenance, await readFile(join(out, 'subtitles.json')), summary);
  await verifyInputsUnchanged();
  await unlink(join(out, 'INCOMPLETE'));
  console.log(JSON.stringify({ candidateDirectory: out, ...summary, productionCommitted: false, reviewFeedback: feedback }));
}
run().catch(error => { console.error(`candidate_error: ${error.message}`); process.exitCode = 1; });
