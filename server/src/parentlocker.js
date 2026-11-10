'use strict';
/*
 * Parent Locker connector — NOT CONNECTED YET.
 *
 * Parent Locker does not publish an API. Once the school gets integration
 * access (API keys, an import endpoint, or a file format they accept), fill in
 * `pushAttendance` below. Until then every absence is queued here with status
 * "waiting" so nothing is lost, and the demo page shows what would be sent.
 *
 * Set PARENTLOCKER_ENABLED=true only after implementing pushAttendance.
 */
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'parentlocker-queue.json');
const enabled = process.env.PARENTLOCKER_ENABLED === 'true';

function readQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch (e) { return []; }
}
function writeQueue(q) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}

/**
 * Send one class's attendance for one day to Parent Locker.
 * @param {object} rec { date, rebbiId, className, records: [{ studentId, name, status: 'A'|'L'|'P' }] }
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function pushAttendance(rec) { // eslint-disable-line no-unused-vars
  // TODO: implement once Parent Locker provides integration access, e.g.
  //   await fetch(PARENTLOCKER_URL + '/attendance', { method: 'POST', headers: { Authorization: ... }, body: JSON.stringify(...) })
  return { ok: false, error: 'Parent Locker is not connected yet' };
}

// Replace the queued entry for this class/day with the latest attendance.
async function sync(rec) {
  const q = readQueue().filter(x => !(x.date === rec.date && x.rebbiId === rec.rebbiId));
  const entry = Object.assign({}, rec, { status: 'waiting', updatedAt: new Date().toISOString() });
  if (enabled) {
    const r = await pushAttendance(rec);
    entry.status = r.ok ? 'sent' : 'error';
    if (!r.ok) entry.error = r.error;
  }
  q.push(entry);
  writeQueue(q);
  return entry;
}

module.exports = { sync, queue: readQueue, enabled, reset: () => writeQueue([]) };
