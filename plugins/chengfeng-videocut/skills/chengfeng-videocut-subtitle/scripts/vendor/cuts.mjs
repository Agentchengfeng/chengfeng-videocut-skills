// packages/core/src/errors.ts
class VideocutError extends Error {
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "VideocutError";
    this.code = code;
    this.details = details;
  }
}

// packages/core/src/cuts.ts
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requireFiniteNumber(value, field) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new VideocutError("invalid_transcript", `${field} must be a finite number`);
  }
  return number;
}
function parseTranscriptWords(payload) {
  if (!isObject(payload) || !Array.isArray(payload.cues)) {
    throw new VideocutError("invalid_transcript", "transcript.json must contain a cues array");
  }
  const words = [];
  const seenIds = new Set;
  payload.cues.forEach((cue, cueIndex) => {
    if (!isObject(cue) || !Array.isArray(cue.words)) {
      throw new VideocutError("invalid_transcript", `cues[${cueIndex}] must contain a words array`);
    }
    cue.words.forEach((word, wordIndex) => {
      if (!isObject(word)) {
        throw new VideocutError("invalid_transcript", `cues[${cueIndex}].words[${wordIndex}] must be an object`);
      }
      const id = typeof word.id === "string" ? word.id.trim() : "";
      if (!id) {
        throw new VideocutError("invalid_transcript", `cues[${cueIndex}].words[${wordIndex}].id is required`);
      }
      if (seenIds.has(id)) {
        throw new VideocutError("invalid_transcript", `Transcript word id is not unique: ${id}`, { wordId: id });
      }
      const start = requireFiniteNumber(word.start, `cues[${cueIndex}].words[${wordIndex}].start`);
      const end = requireFiniteNumber(word.end, `cues[${cueIndex}].words[${wordIndex}].end`);
      if (start < 0 || end < start) {
        throw new VideocutError("invalid_transcript", `Invalid word time range for ${id}: ${start} - ${end}`, { wordId: id, start, end });
      }
      seenIds.add(id);
      const cueId = typeof cue.id === "string" ? cue.id.trim() : "";
      words.push({
        id,
        start,
        end,
        isGap: word.isGap === true,
        ...typeof word.text === "string" ? { text: word.text } : {},
        ...typeof word.punctuation === "string" && word.punctuation ? { punctuation: word.punctuation } : {},
        ...cueId ? { cueId } : {}
      });
    });
  });
  if (words.length === 0) {
    throw new VideocutError("invalid_transcript", "transcript.json has no words");
  }
  return words;
}
function expandCutWordIdsAcrossEnclosedGaps(words, cutWordIds) {
  const expanded = new Set(cutWordIds);
  let index = 0;
  while (index < words.length) {
    if (words[index]?.isGap !== true) {
      index += 1;
      continue;
    }
    const gapStart = index;
    while (index < words.length && words[index]?.isGap === true)
      index += 1;
    const leftWord = words[gapStart - 1];
    const rightWord = words[index];
    if (!leftWord || !rightWord)
      continue;
    if (!expanded.has(leftWord.id) || !expanded.has(rightWord.id))
      continue;
    for (let gapIndex = gapStart;gapIndex < index; gapIndex += 1) {
      const gapWord = words[gapIndex];
      if (gapWord)
        expanded.add(gapWord.id);
    }
  }
  return expanded;
}
var KEEP_MARGIN_SECONDS = 0.1;
function buildCutTimeRanges(words, cutWordIds) {
  const spans = [];
  let current = null;
  for (const [index, word] of words.entries()) {
    if (!cutWordIds.has(word.id)) {
      if (current)
        spans.push(current);
      current = null;
      continue;
    }
    if (!current)
      current = { from: index, to: index };
    else
      current.to = index;
  }
  if (current)
    spans.push(current);
  const ranges = [];
  for (const span of spans) {
    const first = words[span.from];
    const last = words[span.to];
    let start = first.start;
    let end = start;
    for (let index = span.from;index <= span.to; index += 1) {
      end = Math.max(end, words[index].end);
    }
    const previousKept = span.from > 0 && !cutWordIds.has(words[span.from - 1].id);
    const nextKept = span.to + 1 < words.length && !cutWordIds.has(words[span.to + 1].id);
    const borrow = (available) => Math.min(KEEP_MARGIN_SECONDS, Math.max(0, available) / 4);
    if (previousKept && first.isGap === true)
      start += borrow(first.end - first.start);
    if (nextKept && last.isGap === true)
      end -= borrow(last.end - last.start);
    const round = (value) => Math.round(value * 1e6) / 1e6;
    if (end > start)
      ranges.push({ start: round(start), end: round(end) });
  }
  return ranges;
}
function parseCutWordIds(value) {
  if (!Array.isArray(value)) {
    throw new VideocutError("invalid_cut_selection", "cut-selection input must contain cutWordIds as an array");
  }
  const ids = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new VideocutError("invalid_cut_selection", `cutWordIds[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
  if (new Set(ids).size !== ids.length) {
    throw new VideocutError("invalid_cut_selection", "cutWordIds must not contain duplicates");
  }
  return ids;
}
function buildCutSelectionReasons(declared, cutWordIds) {
  if (declared === undefined || declared === null)
    return [];
  if (!Array.isArray(declared)) {
    throw new VideocutError("invalid_cut_selection", "reasons must be an array when present");
  }
  const reasons = [];
  declared.forEach((entry, index) => {
    if (!isObject(entry)) {
      throw new VideocutError("invalid_cut_selection", `reasons[${index}] must be an object`);
    }
    const kind = typeof entry.kind === "string" ? entry.kind.trim() : "";
    if (!kind) {
      throw new VideocutError("invalid_cut_selection", `reasons[${index}].kind must be a non-empty string`);
    }
    if (entry.risk !== "low" && entry.risk !== "high") {
      throw new VideocutError("invalid_cut_selection", `reasons[${index}].risk must be "low" or "high"`);
    }
    if (!Array.isArray(entry.wordIds)) {
      throw new VideocutError("invalid_cut_selection", `reasons[${index}].wordIds must be an array`);
    }
    const ids = parseCutWordIds(entry.wordIds);
    const kept = ids.filter((id) => cutWordIds.has(id));
    if (kept.length === 0)
      return;
    reasons.push({ wordIds: kept, kind, risk: entry.risk });
  });
  return reasons;
}
function buildCutSelectionDocument(options) {
  const previous = isObject(options.previous) ? options.previous : {};
  const overlay = isObject(options.overlay) ? options.overlay : {};
  const ids = parseCutWordIds([...options.cutWordIds]);
  const cutWordIds = new Set(ids);
  const knownIds = new Set(options.words.map((word) => word.id));
  if (knownIds.size !== options.words.length) {
    throw new VideocutError("invalid_transcript", "Transcript word ids must be unique before building a cut selection");
  }
  const unknownIds = ids.filter((id) => !knownIds.has(id));
  if (options.rejectUnknownWordIds !== false && unknownIds.length > 0) {
    throw new VideocutError("invalid_cut_selection", `cutWordIds contains ${unknownIds.length} id(s) not present in transcript.json`, { unknownWordIds: unknownIds.slice(0, 20) });
  }
  const orderedIds = options.words.filter((word) => cutWordIds.has(word.id)).map((word) => word.id);
  if (options.rejectUnknownWordIds === false)
    orderedIds.push(...unknownIds);
  const reasons = buildCutSelectionReasons(options.reasons, new Set(orderedIds));
  const { reasons: _staleReasons, ...carried } = previous;
  return {
    ...carried,
    ...overlay,
    schemaVersion: 3,
    cutWordIds: orderedIds,
    cutRanges: buildCutTimeRanges(options.words, cutWordIds),
    ...reasons.length > 0 ? { reasons } : {},
    updatedAt: options.updatedAt ?? new Date().toISOString()
  };
}
function buildCutSelectionFromProposal(words, proposal, previous, updatedAt) {
  if (!isObject(proposal)) {
    throw new VideocutError("invalid_cut_selection", "cut-selection input must be a JSON object");
  }
  return buildCutSelectionDocument({
    words,
    cutWordIds: parseCutWordIds(proposal.cutWordIds),
    previous,
    updatedAt,
    reasons: proposal.reasons
  });
}
function canonicalValue(value) {
  if (Array.isArray(value))
    return value.map(canonicalValue);
  if (!isObject(value))
    return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalValue(child)]));
}
function semanticValue(document) {
  if (!isObject(document))
    return canonicalValue(document);
  const { updatedAt: _updatedAt, ...rest } = document;
  return canonicalValue(rest);
}
function hasSameCutSelectionMeaning(left, right) {
  return JSON.stringify(semanticValue(left)) === JSON.stringify(semanticValue(right));
}
function totalCutDuration(ranges) {
  return ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0);
}
export {
  totalCutDuration,
  parseTranscriptWords,
  hasSameCutSelectionMeaning,
  expandCutWordIdsAcrossEnclosedGaps,
  buildCutTimeRanges,
  buildCutSelectionFromProposal,
  buildCutSelectionDocument
};
