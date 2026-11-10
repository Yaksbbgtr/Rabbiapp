'use strict';
/* Tiny JSON-file store for the school roster and daily attendance state. */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SCHOOL_FILE = path.join(DATA_DIR, 'school.json');
const SAMPLE_FILE = path.join(DATA_DIR, 'school.sample.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

let school = readJSON(SCHOOL_FILE, null) || readJSON(SAMPLE_FILE, { school: '', rebbeim: [] });
let state = readJSON(STATE_FILE, { days: {}, messages: [] });

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

function normalizePhone(p) {
  const digits = String(p || '').replace(/[^\d]/g, '');
  if (digits.length === 10) return '+1' + digits;
  return '+' + digits;
}

module.exports = {
  school: () => school,
  rebbeim: () => school.rebbeim,
  rebbi: id => school.rebbeim.find(r => r.id === id),
  rebbiByPhone: phone => school.rebbeim.find(r => normalizePhone(r.phone) === normalizePhone(phone)),
  normalizePhone,

  // Per-day, per-rebbi record:
  // { prompted, answered, absent: {studentId: 'A'|'L'}, history: [snapshots for undo], pending: [...] }
  day(date, rebbiId) {
    const d = state.days[date] = state.days[date] || {};
    return d[rebbiId] = d[rebbiId] || { prompted: null, answered: null, absent: {}, history: [], pending: [] };
  },
  days: () => state.days,
  logMessage(msg) {
    state.messages.push(Object.assign({ at: new Date().toISOString() }, msg));
    if (state.messages.length > 2000) state.messages.splice(0, state.messages.length - 2000);
  },
  messages: () => state.messages,
  save,
  resetDemo() { state = { days: {}, messages: [] }; save(); }
};
