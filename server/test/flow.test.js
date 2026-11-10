'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att-'));
fs.copyFileSync(path.join(__dirname, '..', 'data', 'school.sample.json'), path.join(dir, 'school.sample.json'));
process.env.DATA_DIR = dir;
process.env.SMS_PROVIDER = 'demo';
const att = require('../src/attendance');
const store = require('../src/store');
const parentlocker = require('../src/parentlocker');
const scheduler = require('../src/scheduler');
const PHONE = '+15550001001';
const DATE = '2026-11-10';
const say = text => att.handleIncoming(PHONE, text, { date: DATE, noSend: true });

test('full conversation records absences and queues for Parent Locker', async () => {
  await att.sendMorningPrompt(store.rebbi('r1'), DATE);
  let reply = await say('Yanky, Moshe');
  assert.match(reply, /Absent \(1\): Yaakov/);
  assert.match(reply, /Which "moshe"\?/);
  reply = await say('Moshe K');
  assert.match(reply, /Absent \(2\)/);
  reply = await say('Dovid late');
  assert.match(reply, /Late: Dovid/);
  const rec = store.day(DATE, 'r1');
  assert.deepStrictEqual(rec.absent, { g3: 'A', g5: 'A', g6: 'L' });

  const q = parentlocker.queue().find(x => x.date === DATE && x.rebbiId === 'r1');
  assert.strictEqual(q.status, 'waiting');
  assert.strictEqual(q.records.find(x => x.studentId === 'g5').status, 'A');

  reply = await say('undo');
  assert.ok(!('g6' in store.day(DATE, 'r1').absent));
  reply = await say('Yanky came in');
  assert.deepStrictEqual(store.day(DATE, 'r1').absent, { g5: 'A' });
});

test('unknown phone number is rejected politely', async () => {
  const reply = await att.handleIncoming('+15559999999', 'Yanky', { date: DATE, noSend: true });
  assert.match(reply, /not registered/);
});

test('no morning text on Shabbos or Yom Tov', () => {
  assert.strictEqual(scheduler.isSchoolDay('2026-11-14', 6), false); // Shabbos
  assert.strictEqual(scheduler.isSchoolDay('2026-09-12', 6), false); // Rosh Hashana
  assert.strictEqual(scheduler.isSchoolDay('2026-10-01', 4), false); // Chol Hamoed Sukkos
  assert.strictEqual(scheduler.isSchoolDay('2026-11-10', 2), true);
});
