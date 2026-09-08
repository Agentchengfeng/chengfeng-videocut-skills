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

// packages/core/src/subtitles.ts
var SUBTITLE_SCHEMA_VERSION = 1;
var HEAVY_STACK = '"Source Han Sans SC", "Noto Sans CJK SC", "Lantinghei SC", "PingFang SC", sans-serif';
var TEXT_STACK = '"PingFang SC", "Noto Sans CJK SC", sans-serif';
var DEFAULT_SUBTITLE_STYLE = {
  fontFamily: HEAVY_STACK,
  fontPostScriptName: "SourceHanSansSC-Bold",
  fontSize: 6,
  fontWeight: 700,
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 7,
  shadowColor: "rgba(0, 0, 0, 0.75)",
  shadowOffsetX: 3,
  shadowOffsetY: 3,
  shadowBlur: 6,
  backgroundColor: "",
  backgroundPaddingX: 30,
  backgroundPaddingY: 12,
  backgroundRadius: 20,
  letterSpacing: 0,
  anchor: "bottom",
  offsetY: 9,
  lineHeight: 1.25,
  maxLineWidth: 84
};
var SUBTITLE_STYLE_PRESETS = [
  {
    id: "standard",
    label: "标准",
    style: DEFAULT_SUBTITLE_STYLE
  },
  {
    id: "large",
    label: "大字",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontPostScriptName: "SourceHanSansSC-Heavy",
      fontSize: 7.6,
      strokeWidth: 8,
      shadowColor: "rgba(0, 0, 0, 0.8)",
      shadowBlur: 8,
      letterSpacing: -1,
      offsetY: 10,
      lineHeight: 1.2,
      maxLineWidth: 88
    }
  },
  {
    id: "highlight",
    label: "重点",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 6.4,
      color: "#ffd60a",
      strokeWidth: 9,
      shadowColor: "rgba(0, 0, 0, 0.85)",
      shadowBlur: 8,
      maxLineWidth: 82
    }
  },
  {
    id: "plate",
    label: "胶囊",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontFamily: TEXT_STACK,
      fontPostScriptName: "PingFangSC-Semibold",
      fontSize: 5,
      fontWeight: 600,
      strokeWidth: 0,
      shadowColor: "",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      backgroundColor: "rgba(0, 0, 0, 0.62)",
      backgroundPaddingX: 36,
      backgroundPaddingY: 16,
      backgroundRadius: 80,
      letterSpacing: 2,
      offsetY: 7,
      maxLineWidth: 78
    }
  },
  {
    id: "cinema",
    label: "沉稳",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontFamily: TEXT_STACK,
      fontPostScriptName: "PingFangSC-Medium",
      fontSize: 5,
      fontWeight: 500,
      color: "#f2f2f2",
      strokeWidth: 0,
      shadowColor: "rgba(0, 0, 0, 0.65)",
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 14,
      letterSpacing: 3,
      offsetY: 10,
      lineHeight: 1.35,
      maxLineWidth: 72
    }
  },
  {
    id: "banner",
    label: "亮条",
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontSize: 5.4,
      color: "#111111",
      strokeWidth: 0,
      shadowColor: "rgba(0, 0, 0, 0.45)",
      shadowOffsetX: 0,
      shadowOffsetY: 4,
      shadowBlur: 10,
      backgroundColor: "#ffd60a",
      backgroundPaddingX: 36,
      backgroundPaddingY: 16,
      backgroundRadius: 80,
      offsetY: 8,
      maxLineWidth: 76
    }
  }
];
var LEGACY_STYLE_MIGRATIONS = [
  {
    legacy: {
      fontSize: 5.4,
      fontWeight: 500,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 6,
      backgroundColor: "",
      offsetY: 8
    },
    to: "standard"
  },
  {
    legacy: {
      fontSize: 7.2,
      fontWeight: 600,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 8,
      backgroundColor: "",
      offsetY: 9
    },
    to: "large"
  },
  {
    legacy: {
      fontSize: 6.2,
      fontWeight: 600,
      color: "#ffd60a",
      strokeColor: "#000000",
      strokeWidth: 8,
      backgroundColor: "",
      offsetY: 8
    },
    to: "highlight"
  },
  {
    legacy: {
      fontSize: 4.6,
      fontWeight: 400,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 0,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      offsetY: 6
    },
    to: "plate"
  }
];
function normalizeSubtitleStyle(style) {
  if (!isObject(style))
    return DEFAULT_SUBTITLE_STYLE;
  const legacy = LEGACY_STYLE_MIGRATIONS.find((entry) => Object.keys(entry.legacy).every((key) => entry.legacy[key] === style[key]));
  if (legacy) {
    const preset = SUBTITLE_STYLE_PRESETS.find((candidate) => candidate.id === legacy.to);
    if (preset)
      return preset.style;
  }
  const filled = { ...DEFAULT_SUBTITLE_STYLE };
  for (const key of Object.keys(DEFAULT_SUBTITLE_STYLE)) {
    const value = style[key];
    if (key === "anchor") {
      if (value === "bottom" || value === "middle" || value === "top")
        filled.anchor = value;
      continue;
    }
    if (typeof value === typeof DEFAULT_SUBTITLE_STYLE[key] && Number.isFinite(typeof value === "number" ? value : 0)) {
      filled[key] = value;
    }
  }
  return filled;
}
function matchSubtitleStylePreset(style) {
  return SUBTITLE_STYLE_PRESETS.find((preset) => Object.keys(preset.style).every((key) => preset.style[key] === style[key])) ?? null;
}
var EPSILON = 0.0005;
function orderedSegments(editList) {
  return [...editList?.segments ?? []].sort((left, right) => left.timelineStart - right.timelineStart);
}
function timelineTimeForSourceTime(segments, sourceTime) {
  for (const segment of segments) {
    if (sourceTime >= segment.sourceStart - EPSILON && sourceTime <= segment.sourceEnd + EPSILON) {
      const clamped = Math.min(Math.max(sourceTime, segment.sourceStart), segment.sourceEnd);
      return segment.timelineStart + (clamped - segment.sourceStart) / segment.playbackRate;
    }
  }
  return null;
}
function wordPlays(segments, word) {
  return segments.some((segment) => segment.sourceStart < word.end - EPSILON && segment.sourceEnd > word.start + EPSILON);
}
var COMFORTABLE_COLUMNS_PER_SECOND = 9;
var COLUMN_WIDTHS = { han: 1, upper: 0.7, lower: 0.55 };
function displayColumns(text) {
  let columns = 0;
  for (const character of text) {
    if (/\s/u.test(character))
      continue;
    if (/[\u{2E80}-\u{9FFF}\u{F900}-\u{FAFF}\u{FF00}-\u{FF60}]/u.test(character)) {
      columns += COLUMN_WIDTHS.han;
    } else if (/[A-Z]/u.test(character)) {
      columns += COLUMN_WIDTHS.upper;
    } else {
      columns += COLUMN_WIDTHS.lower;
    }
  }
  return columns;
}
function subtitleCueTimings(document, words, editList) {
  const segments = orderedSegments(editList);
  const byId = new Map(words.map((word) => [word.id, word]));
  return document.cues.map((cue) => {
    const times = [];
    for (const wordId of cue.wordIds) {
      const word = byId.get(wordId);
      if (!word || !wordPlays(segments, word))
        continue;
      const start2 = timelineTimeForSourceTime(segments, word.start);
      const end2 = timelineTimeForSourceTime(segments, word.end);
      if (start2 !== null)
        times.push(start2);
      if (end2 !== null)
        times.push(end2);
    }
    const columns = displayColumns(cue.text);
    if (times.length === 0) {
      return {
        cueId: cue.id,
        start: 0,
        end: 0,
        duration: 0,
        columns,
        columnsPerSecond: Number.POSITIVE_INFINITY,
        tooFast: true,
        orphaned: true
      };
    }
    const start = Math.min(...times);
    const end = Math.max(...times);
    const duration = Math.max(0, end - start);
    const columnsPerSecond = duration > 0 ? columns / duration : Number.POSITIVE_INFINITY;
    return {
      cueId: cue.id,
      start,
      end,
      duration,
      columns,
      columnsPerSecond,
      tooFast: columnsPerSecond > COMFORTABLE_COLUMNS_PER_SECOND,
      orphaned: false
    };
  });
}
function subtitleStaleness(document, words, editList) {
  const segments = orderedSegments(editList);
  const byId = new Map(words.map((word) => [word.id, word]));
  const stale = [];
  document.cues.forEach((cue, index) => {
    const missingWordIds = [];
    const cutWordIds = [];
    const cutWords = [];
    let surviving = 0;
    for (const wordId of cue.wordIds) {
      const word = byId.get(wordId);
      if (!word) {
        missingWordIds.push(wordId);
        continue;
      }
      if (!wordPlays(segments, word)) {
        cutWordIds.push(wordId);
        cutWords.push(word);
        continue;
      }
      surviving += 1;
    }
    if (missingWordIds.length === 0 && cutWordIds.length === 0)
      return;
    stale.push({
      cueId: cue.id,
      index,
      missingWordIds,
      cutWordIds,
      cutText: joinWordText(cutWords),
      orphaned: surviving === 0
    });
  });
  return stale;
}
function respellSubtitles(document, respellings) {
  const byWord = new Map;
  for (const item of respellings) {
    if (item.from !== item.to && item.from !== "")
      byWord.set(item.wordId, item);
  }
  if (byWord.size === 0)
    return { document, updated: [], needsAttention: [] };
  const updated = [];
  const needsAttention = [];
  const cues = document.cues.map((cue, index) => {
    const mine = cue.wordIds.map((id) => byWord.get(id)).filter((item) => item !== undefined);
    if (mine.length === 0)
      return cue;
    let text = cue.text;
    for (const item of mine) {
      if (!text.includes(item.from)) {
        needsAttention.push({ cueId: cue.id, index, text: cue.text, expected: item.from });
        continue;
      }
      text = text.split(item.from).join(item.to);
      updated.push({ cueId: cue.id, index, from: item.from, to: item.to });
    }
    return text === cue.text ? cue : { ...cue, text };
  });
  return { document: { ...document, cues }, updated, needsAttention };
}
function joinWordText(words) {
  let out = "";
  for (const word of words) {
    const text = (word.text ?? "").trim();
    if (!text)
      continue;
    if (out && /[A-Za-z0-9]$/u.test(out) && /^[A-Za-z0-9]/u.test(text))
      out += " ";
    out += text;
  }
  return out;
}
var DEFAULT_MAX_COLUMNS = 17;
var DEFAULT_BREAK_PAUSE_SECONDS = 0.32;
var TIGHT_BREAK_COST = 49;
var MINIMUM_SCREEN_COLUMNS = 4;
var SENTENCE_PAUSE_SECONDS = 0.1;
var SENTENCE_END = /[。！？!?]/u;
var CLAUSE_END = /[，、；：,;:]/u;
function splitRun(run, maxColumns, breakPause, tightBreakCost) {
  const { words, gapBefore } = run;
  const count = words.length;
  if (count === 0)
    return [];
  const columns = words.map((word) => displayColumns(word.text ?? ""));
  const best = new Array(count + 1).fill(Number.POSITIVE_INFINITY);
  const from = new Array(count + 1).fill(count);
  best[count] = 0;
  for (let start = count - 1;start >= 0; start -= 1) {
    let width = 0;
    for (let end = start + 1;end <= count; end += 1) {
      width += columns[end - 1] ?? 0;
      if (width > maxColumns && end > start + 1)
        break;
      const slack = maxColumns - width;
      const tail = best[end];
      if (tail === undefined || !Number.isFinite(tail))
        continue;
      const gap = end < count ? gapBefore[end] ?? 0 : breakPause;
      const tightness = breakPause > 0 ? Math.min(gap, breakPause) / breakPause : 1;
      const afterClause = end > 0 && end <= count && Boolean(words[end - 1]?.punctuation) && CLAUSE_END.test(words[end - 1]?.punctuation ?? "");
      const breakPenalty = afterClause ? 0 : (1 - tightness) * tightBreakCost;
      const cost = slack * slack + breakPenalty + tail;
      if (cost < (best[start] ?? Number.POSITIVE_INFINITY)) {
        best[start] = cost;
        from[start] = end;
      }
    }
  }
  const screens = [];
  let cursor = 0;
  while (cursor < count) {
    const end = from[cursor] ?? count;
    screens.push(words.slice(cursor, end));
    cursor = end <= cursor ? cursor + 1 : end;
  }
  return screens;
}
function buildSubtitleCues(words, editList, options = {}) {
  const maxColumns = options.maxColumns ?? DEFAULT_MAX_COLUMNS;
  const breakPause = options.breakPauseSeconds ?? DEFAULT_BREAK_PAUSE_SECONDS;
  const prefix = options.idPrefix ?? "sub";
  const tightBreakCost = options.tightBreakCost ?? TIGHT_BREAK_COST;
  const segments = orderedSegments(editList);
  const ordered = [...words].sort((left, right) => left.start - right.start);
  const runs = [];
  let run = { words: [], gapBefore: [], afterDeletion: false };
  let previousEndTimeline = null;
  let previousCueId = null;
  let previousPunctuation = false;
  let speechDeletedSinceLastKept = false;
  const endRun = (afterDeletion = false) => {
    if (run.words.length > 0)
      runs.push(run);
    run = { words: [], gapBefore: [], afterDeletion };
  };
  for (const word of ordered) {
    if (!wordPlays(segments, word)) {
      if (word.isGap !== true && (word.text ?? "").trim())
        speechDeletedSinceLastKept = true;
      continue;
    }
    const startOnTimeline = timelineTimeForSourceTime(segments, word.start);
    const endOnTimeline = timelineTimeForSourceTime(segments, word.end);
    if (word.isGap === true || !(word.text ?? "").trim()) {
      const heard = startOnTimeline !== null && endOnTimeline !== null ? endOnTimeline - startOnTimeline : 0;
      if (heard >= breakPause)
        endRun();
      continue;
    }
    if (speechDeletedSinceLastKept)
      endRun(true);
    speechDeletedSinceLastKept = false;
    const gap = previousEndTimeline !== null && startOnTimeline !== null ? Math.max(0, startOnTimeline - previousEndTimeline) : 0;
    const sentenceEnded = previousCueId !== null && !previousPunctuation && word.cueId !== undefined && word.cueId !== previousCueId && gap >= SENTENCE_PAUSE_SECONDS;
    if (run.words.length > 0 && (sentenceEnded || gap >= breakPause))
      endRun();
    previousCueId = word.cueId ?? previousCueId;
    previousPunctuation = Boolean(word.punctuation);
    run.gapBefore.push(run.words.length === 0 ? breakPause : gap);
    run.words.push(word);
    if (endOnTimeline !== null)
      previousEndTimeline = endOnTimeline;
    if (word.punctuation && (SENTENCE_END.test(word.punctuation) || CLAUSE_END.test(word.punctuation))) {
      endRun();
    }
  }
  endRun();
  const screens = [];
  for (const item of runs) {
    for (const [index, words2] of splitRun(item, maxColumns, breakPause, tightBreakCost).entries()) {
      if (!joinWordText(words2))
        continue;
      screens.push({ words: words2, afterDeletion: item.afterDeletion && index === 0 });
    }
  }
  return mergeStubScreens(screens, maxColumns).map((words2, index) => ({
    id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
    wordIds: words2.map((word) => word.id),
    text: joinWordText(words2)
  }));
}
function mergeStubScreens(screens, maxColumns) {
  const endsSentence = (words) => SENTENCE_END.test(words.at(-1)?.punctuation ?? "");
  const out = [];
  const pending = [];
  for (const screen of screens)
    pending.push({ ...screen, words: [...screen.words] });
  for (let index = 0;index < pending.length; index += 1) {
    const screen = pending[index];
    const columns = displayColumns(joinWordText(screen.words));
    if (columns >= MINIMUM_SCREEN_COLUMNS || screen.afterDeletion) {
      out.push(screen);
      continue;
    }
    const previous = out.at(-1);
    const fits = (other) => displayColumns(joinWordText([...other, ...screen.words])) <= maxColumns;
    if (previous && !endsSentence(previous.words) && fits(previous.words)) {
      previous.words = [...previous.words, ...screen.words];
      continue;
    }
    const next = pending[index + 1];
    if (next && !next.afterDeletion && displayColumns(joinWordText([...screen.words, ...next.words])) <= maxColumns) {
      next.words = [...screen.words, ...next.words];
      continue;
    }
    out.push(screen);
  }
  return out.map((screen) => screen.words);
}
function createSubtitleDocument(projectId, baseTranscriptRevision, words, editList, options = {}) {
  return {
    schemaVersion: SUBTITLE_SCHEMA_VERSION,
    projectId,
    baseTranscriptRevision,
    style: { ...DEFAULT_SUBTITLE_STYLE, ...options.style ?? {} },
    cues: buildSubtitleCues(words, editList, options)
  };
}
function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function invalid(message, details) {
  throw new VideocutError("invalid_subtitles", message, details);
}
function assertSubtitleDocument(value) {
  if (!isObject(value))
    invalid("Subtitle document must be an object");
  if (value.schemaVersion !== SUBTITLE_SCHEMA_VERSION) {
    invalid(`Unsupported subtitle schema: ${String(value.schemaVersion)}`);
  }
  if (typeof value.projectId !== "string" || !value.projectId.trim()) {
    invalid("Subtitle document requires projectId");
  }
  if (!isObject(value.style))
    invalid("Subtitle document requires a style object");
  if (!Array.isArray(value.cues))
    invalid("Subtitle document requires a cues array");
  const seenCueIds = new Set;
  const claimedWords = new Map;
  value.cues.forEach((cue, index) => {
    if (!isObject(cue))
      invalid(`cues[${index}] must be an object`);
    const id = typeof cue.id === "string" ? cue.id.trim() : "";
    if (!id)
      invalid(`cues[${index}].id is required`);
    if (seenCueIds.has(id))
      invalid(`Subtitle cue id is not unique: ${id}`);
    seenCueIds.add(id);
    if (typeof cue.text !== "string")
      invalid(`cues[${index}].text must be a string`);
    if (!Array.isArray(cue.wordIds)) {
      invalid(`cues[${index}].wordIds must be an array`);
    }
    for (const wordId of cue.wordIds) {
      if (typeof wordId !== "string" || !wordId.trim()) {
        invalid(`cues[${index}].wordIds must contain word ids`);
      }
      const owner = claimedWords.get(wordId);
      if (owner) {
        invalid(`Word ${wordId} is claimed by two subtitle cues: ${owner} and ${id}`);
      }
      claimedWords.set(wordId, id);
    }
  });
}
export {
  wordPlays,
  timelineTimeForSourceTime,
  subtitleStaleness,
  subtitleCueTimings,
  respellSubtitles,
  orderedSegments,
  normalizeSubtitleStyle,
  matchSubtitleStylePreset,
  joinWordText,
  displayColumns,
  createSubtitleDocument,
  buildSubtitleCues,
  assertSubtitleDocument,
  SUBTITLE_STYLE_PRESETS,
  SUBTITLE_SCHEMA_VERSION,
  DEFAULT_SUBTITLE_STYLE,
  COMFORTABLE_COLUMNS_PER_SECOND
};
