'use strict';
/*
 * Understands a rebbi's text reply and matches names to his class list.
 *
 *   "Moshe K, Yanky"         -> absent: Moshe Katz, Yaakov Friedman
 *   "Dovid late"             -> late: Dovid Rosen
 *   "none" / "all here"      -> nobody absent
 *   "undo" / "list" / "help" -> commands
 *
 *   "Yanky came in"          -> remove Yaakov from today's list
 * Returns { command, absent: [student], late: [student], present: [student], unknown: [text],
 *           ambiguous: [{ text, options: [student] }] }
 */

const NONE_WORDS = new Set([
  'none', 'no one', 'noone', 'nobody', 'all here', 'everyone here', 'everyone is here',
  'all present', 'full class', 'no', '0', 'nope', 'nada', 'kulam', 'כולם', 'אין'
]);
const COMMANDS = {
  undo: 'undo', cancel: 'undo', oops: 'undo',
  list: 'list', status: 'list', who: 'list',
  help: 'help', '?': 'help'
};
const FILLER = /\b(is|are|absent|out|missing|home|sick|today|not here|didnt come|didn't come|also|only|just)\b/g;

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // Hebrew nikud
    .replace(/[.!?'"׳״()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function namesFor(st) {
  const first = normalize(st.first), last = normalize(st.last);
  const firsts = [first, normalize(st.hebrew)].concat((st.aliases || []).map(normalize)).filter(Boolean);
  return { first, last, firsts };
}

// Find students matching one piece of text, e.g. "moshe k", "katz", "yanky", "משה".
function matchName(text, roster) {
  const t = normalize(text);
  if (!t) return [];
  const words = t.split(' ');
  const exact = [], fuzzy = [];
  for (const st of roster) {
    const n = namesFor(st);
    const full = n.firsts.map(f => f + ' ' + n.last);
    if (full.includes(t) || n.firsts.includes(t) || t === n.last) { exact.push(st); continue; }
    // "moshe k" / "moshe katz" / "katz moshe"
    if (words.length === 2) {
      const [a, b] = words;
      if (n.firsts.includes(a) && n.last.startsWith(b)) { exact.push(st); continue; }
      if (n.firsts.includes(b) && n.last === a) { exact.push(st); continue; }
    }
    // Typos: allow 1 edit for names of 4+ letters, 2 edits for 7+
    const allowed = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0;
    if (allowed && n.firsts.concat(full, [n.last]).some(c => levenshtein(c, t) <= allowed)) fuzzy.push(st);
  }
  return exact.length ? exact : fuzzy;
}

function splitNames(raw) {
  return String(raw || '')
    .toLowerCase()
    .split(/\s*(?:,|;|\n|&|\+|\/|\band\b)\s*/)
    .map(s => normalize(s).replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// "yanky duvi moshe k" (no commas): greedily read two-word then one-word names.
function splitRun(piece, roster) {
  const words = piece.split(' ');
  const out = [];
  let i = 0;
  while (i < words.length) {
    let took = 0;
    for (const len of [2, 1]) {
      if (i + len > words.length) continue;
      const chunk = words.slice(i, i + len).join(' ');
      if (matchName(chunk, roster).length) { out.push(chunk); took = len; break; }
    }
    if (!took) return null;
    i += took;
  }
  return out;
}

function parseReply(body, roster) {
  const result = { command: null, absent: [], late: [], present: [], unknown: [], ambiguous: [] };
  const text = normalize(body);
  if (!text) { result.command = 'help'; return result; }
  if (COMMANDS[text]) { result.command = COMMANDS[text]; return result; }
  if (NONE_WORDS.has(text) || NONE_WORDS.has(text.replace(FILLER, '').trim())) { result.command = 'none'; return result; }

  const pieces = [];
  for (const piece of splitNames(body)) {
    const bare = piece.replace(/\blate\b/g, '').trim();
    const run = bare.includes(' ') && !matchName(bare, roster).length ? splitRun(bare, roster) : null;
    if (run && run.length > 1) run.forEach(r => pieces.push(bare === piece ? r : r + ' late'));
    else pieces.push(piece);
  }

  const seen = new Set();
  for (let piece of pieces) {
    let late = false, present = false;
    if (/\blate\b/.test(piece)) { late = true; piece = piece.replace(/\blate\b/g, '').trim(); }
    if (/\b(here|came|came in|arrived|remove|not absent)\b/.test(piece)) {
      present = true; piece = piece.replace(/\b(is here|here|came in|came|arrived|remove|not absent)\b/g, '').trim();
    }
    if (!piece) continue;
    const matches = matchName(piece, roster);
    if (matches.length === 1) {
      const st = matches[0];
      if (seen.has(st.id)) continue;
      seen.add(st.id);
      (present ? result.present : late ? result.late : result.absent).push(st);
    } else if (matches.length > 1) {
      result.ambiguous.push({ text: piece, options: matches, late, present });
    } else {
      result.unknown.push(piece);
    }
  }
  return result;
}

module.exports = { parseReply, matchName, normalize, levenshtein, splitNames };
