'use strict';
/*
 * Parent Locker connector.
 *
 * Parent Locker has no API, so when PARENTLOCKER_ENABLED=true a hidden browser
 * (src/parentlocker-robot.js) enters the attendance on the website. Every
 * reply is saved to data/parentlocker-queue.json first, so nothing is lost if
 * Parent Locker is down or the login has expired.
 *
 * A rebbi often sends a correction ("Dovid came in") a minute later, so each
 * class waits PARENTLOCKER_DELAY_SECONDS after its last reply before the robot
 * goes in, and then sends the latest attendance once. Classes go one at a time.
 *
 * Each rebbi needs "parentLockerCourse" in school.json (the course link on the
 * Take Attendance page). A talmid whose Parent Locker name isn't "Last, First"
 * can have "parentLockerName".
 */
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'parentlocker-queue.json');
const enabled = process.env.PARENTLOCKER_ENABLED === 'true';
const DELAY_MS = 1000 * parseInt(process.env.PARENTLOCKER_DELAY_SECONDS || '120', 10);
const DRY_RUN = process.env.PARENTLOCKER_DRY_RUN === 'true'; // fill in but don't press Save

function readQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch (e) { return []; }
}
function writeQueue(q) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}
function updateEntry(date, rebbiId, fields) {
  const q = readQueue();
  const e = q.find(x => x.date === date && x.rebbiId === rebbiId);
  if (e) { Object.assign(e, fields, { updatedAt: new Date().toISOString() }); writeQueue(q); }
  return e;
}

/**
 * Send one class's attendance for one day to Parent Locker.
 * @param {object} rec { date, rebbiId, course, records: [{ studentId, name, plName, status: 'A'|'L'|'P' }] }
 * @returns {Promise<{ok:boolean, error?:string, code?:string, result?:object}>}
 */
async function pushAttendance(rec) {
  if (!rec.course) return { ok: false, code: 'NO_COURSE', error: `No parentLockerCourse set for ${rec.rebbi || rec.rebbiId} in school.json` };
  try {
    const robot = require('./parentlocker-robot');
    const result = await robot.takeAttendance({ course: rec.course, date: rec.date, records: rec.records, save: !DRY_RUN });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, code: e.code || 'ERROR', error: e.message };
  }
}

// One robot at a time; one pending timer per class/day.
const timers = new Map();
let chain = Promise.resolve();
let onDone = null; // (entry, rec) => void, set by attendance.js to text the rebbi on failure

function schedule(rec, delay = DELAY_MS) {
  const key = rec.date + '|' + rec.rebbiId;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    chain = chain.then(async () => {
      const latest = readQueue().find(x => x.date === rec.date && x.rebbiId === rec.rebbiId);
      if (!latest || latest.status !== 'scheduled') return;
      updateEntry(rec.date, rec.rebbiId, { status: 'sending' });
      const r = await pushAttendance(latest);
      // A correction that came in while the robot was busy has its own timer; leave it scheduled for that one.
      const now = readQueue().find(x => x.date === rec.date && x.rebbiId === rec.rebbiId);
      if (now && now.rev !== latest.rev) return;
      const entry = updateEntry(rec.date, rec.rebbiId, r.ok
        ? { status: DRY_RUN ? 'dry-run' : 'sent', sentAt: new Date().toISOString(), result: r.result, error: undefined, code: undefined }
        : { status: 'error', error: r.error, code: r.code });
      if (onDone) { try { await onDone(entry, r); } catch (e) { console.error('Parent Locker notify failed:', e.message); } }
    }).catch(e => console.error('Parent Locker push failed:', e));
  }, delay));
}

// Replace the queued entry for this class/day with the latest attendance.
async function sync(rec) {
  const all = readQueue();
  const prev = all.find(x => x.date === rec.date && x.rebbiId === rec.rebbiId);
  const q = all.filter(x => x !== prev);
  const entry = Object.assign({}, rec, { status: enabled ? 'scheduled' : 'waiting', rev: ((prev && prev.rev) || 0) + 1, updatedAt: new Date().toISOString() });
  q.push(entry);
  writeQueue(q);
  if (enabled) schedule(rec);
  return entry;
}

module.exports = {
  sync, pushAttendance, queue: readQueue, enabled, dryRun: DRY_RUN,
  onResult: fn => { onDone = fn; },
  reset: () => writeQueue([])
};
