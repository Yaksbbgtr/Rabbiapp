const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const realLoad = Module._load;
Module._load = function (name, ...rest) {
  if (name === 'firebase-admin') return { initializeApp() {}, firestore() { throw new Error('not in tests'); } };
  if (name === 'firebase-functions/v2/https') return { onRequest: (opts, fn) => fn };
  return realLoad.call(this, name, ...rest);
};
const { _importHandle, _readCalendar, _calendarURL } = require('../index.js');
Module._load = realLoad;

const ICS = fs.readFileSync(path.join(__dirname, 'sample.ics'), 'utf8');
const NOW = Date.parse('2026-11-01T12:00:00Z');

function res() {
  const r = { code: 0, headers: {}, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.set = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const okVerify = async (t) => { if (t !== 'good') throw new Error('bad'); return { uid: 'u1' }; };
const fakeFetch = (body, status = 200, url) => async (u) => ({ ok: status < 300, status, url: url || u, headers: { get: () => null }, text: async () => body });
const req = (url, token = 'good') => ({ method: 'POST', body: { url }, headers: { authorization: token ? 'Bearer ' + token : '' } });
const LINK = 'webcal://p52-caldav.icloud.com/published/2/abc';

test('only calendar hosts are allowed', () => {
  assert.ok(_calendarURL(LINK));
  assert.ok(_calendarURL('https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics'));
  assert.ok(_calendarURL('https://outlook.office365.com/owa/calendar/a/b/calendar.ics'));
  for (const bad of ['https://evil.com/x.ics', 'https://icloud.com.evil.com/x', 'http://169.254.169.254/', 'file:///etc/passwd',
    'https://user:pw@p1-caldav.icloud.com/x', 'https://p1-caldav.icloud.com:8443/x', 'not a link', ''])
    assert.strictEqual(_calendarURL(bad), null, bad);
});

test('reads events, spreads out repeating ones, keeps skipped and moved dates right', () => {
  const { events } = _readCalendar(ICS, NOW);
  const staff = events.filter((e) => /Staff/.test(e.title));
  assert.deepStrictEqual(staff.map((e) => e.start), [
    '2026-10-26T23:30:00.000Z', '2026-11-03T00:30:00.000Z', '2026-11-17T02:00:00.000Z', '2026-11-24T00:30:00.000Z', '2026-12-01T00:30:00.000Z']);
  assert.strictEqual(staff[0].location, 'Room 4');
  assert.strictEqual(staff[2].title, 'Staff meeting (moved)');
  const sh = events.find((e) => e.title === 'Shabbaton');
  assert.deepStrictEqual([sh.allDay, sh.date, sh.endDate], [true, '2026-11-20', '2026-11-22']);
  assert.strictEqual(new Set(events.map((e) => e.id)).size, events.length);
});

test('skips our own live calendar\'s events', () => {
  const own = ICS.replace('UID:b2', 'UID:lesson-1@rebbi-app');
  assert.ok(!_readCalendar(own, NOW).events.some((e) => e.title === 'Shabbaton'));
});

test('handler: needs sign-in, a calendar link, and a calendar', async () => {
  let r = res(); await _importHandle(req(LINK, null), r, { verify: okVerify, fetch: fakeFetch(ICS), now: () => NOW });
  assert.strictEqual(r.code, 401);
  r = res(); await _importHandle(req(LINK, 'nope'), r, { verify: okVerify, fetch: fakeFetch(ICS), now: () => NOW });
  assert.strictEqual(r.code, 401);
  let fetched = 0;
  r = res(); await _importHandle(req('https://evil.com/a.ics'), r, { verify: okVerify, fetch: async () => { fetched++; }, now: () => NOW });
  assert.deepStrictEqual([r.code, r.body.error, fetched], [400, 'link', 0]);
  r = res(); await _importHandle(req(LINK), r, { verify: okVerify, fetch: fakeFetch('<html>hi</html>'), now: () => NOW });
  assert.strictEqual(r.code, 422);
  r = res(); await _importHandle(req(LINK), r, { verify: okVerify, fetch: fakeFetch('', 404), now: () => NOW });
  assert.deepStrictEqual([r.code, r.body.error], [404, 'gone']);
  r = res(); await _importHandle(req(LINK), r, { verify: okVerify, fetch: fakeFetch(ICS, 200, 'https://evil.com/'), now: () => NOW });
  assert.strictEqual(r.code, 400);
  r = res(); await _importHandle({ method: 'GET', headers: {} }, r, { verify: okVerify, fetch: fakeFetch(ICS) });
  assert.strictEqual(r.code, 405);
});

test('handler: returns the events', async () => {
  const r = res(); await _importHandle(req(LINK), r, { verify: okVerify, fetch: fakeFetch(ICS), now: () => NOW });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.events.length, 6);
});
