'use strict';
// The robot is replaced by a slow fake, to check corrections sent while it's busy aren't lost.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-test-'));
process.env.PARENTLOCKER_ENABLED = 'true';
process.env.PARENTLOCKER_DELAY_SECONDS = '0';

const calls = [];
const robotPath = require.resolve('../src/parentlocker-robot');
require.cache[robotPath] = { id: robotPath, filename: robotPath, loaded: true, exports: {
  takeAttendance: async o => { calls.push(o.records.filter(r => r.status !== 'P').map(r => r.name + '=' + r.status).join(',')); await new Promise(r => setTimeout(r, 150)); return { saved: true, changed: [] }; }
} };
const pl = require('../src/parentlocker');
const wait = ms => new Promise(r => setTimeout(r, ms));
const rec = records => ({ date: '2026-11-16', rebbiId: 'r1', className: 'K', course: 'C', records });

test('a correction sent while the robot is busy is sent after it', async () => {
  await pl.sync(rec([{ name: 'A', status: 'A' }]));
  await wait(50);                       // robot is now busy with the first reply
  await pl.sync(rec([{ name: 'A', status: 'A' }, { name: 'B', status: 'L' }]));
  await wait(500);
  assert.deepStrictEqual(calls, ['A=A', 'A=A,B=L']);
  const e = pl.queue()[0];
  assert.strictEqual(e.status, 'sent');
  assert.strictEqual(e.records.length, 2);
});
