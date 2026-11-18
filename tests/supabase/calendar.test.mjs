import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { handleCalendar, handleImport, readCalendar, calendarURL } from '../../supabase/functions/_shared/calcore.js';

const ical = createRequire(import.meta.url)('node-ical');
const ICS = fs.readFileSync(new URL('./sample.ics', import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-01T12:00:00Z');
const BASE = 'https://x.supabase.co/functions/v1/calendar/';

// ---------- live calendar ----------
const TOK = 'abcdefghijklmnopqrstuvwxyz0123';
const getIcs = async (t) => (t === TOK ? 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' : null);

test('serves the calendar for a known token', async () => {
  for (const p of [TOK + '.ics', TOK, TOK + '/']) {
    const r = await handleCalendar(new Request(BASE + p), getIcs);
    assert.strictEqual(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /^text\/calendar/);
    assert.match(await r.text(), /BEGIN:VCALENDAR/);
  }
});
test('unknown, short or odd tokens get 404, bad ones without a lookup', async () => {
  let looked = 0;
  const spy = async (t) => { looked++; return getIcs(t); };
  for (const p of ['zzzzzzzzzzzzzzzzzzzzzzzzzzzz.ics', 'short.ics', '', TOK + '.ics/extra']) {
    const r = await handleCalendar(new Request(BASE + p), spy);
    assert.strictEqual(r.status, 404, p);
  }
  assert.strictEqual(looked, 1);
});
test('database trouble: 503, try later', async () => {
  const r = await handleCalendar(new Request(BASE + TOK + '.ics'), async () => { throw Object.assign(new Error('x'), { code: 'PGRST' }); });
  assert.strictEqual(r.status, 503);
});
test('only GET / HEAD', async () => {
  const r = await handleCalendar(new Request(BASE + TOK + '.ics', { method: 'POST' }), getIcs);
  assert.strictEqual(r.status, 405);
});

// ---------- import ----------
test('only calendar hosts are allowed', () => {
  assert.ok(calendarURL('webcal://p52-caldav.icloud.com/published/2/abc'));
  assert.ok(calendarURL('https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics'));
  assert.ok(calendarURL('https://outlook.office365.com/owa/calendar/a/b/calendar.ics'));
  for (const bad of ['https://evil.com/x.ics', 'https://icloud.com.evil.com/x', 'http://169.254.169.254/', 'file:///etc/passwd',
    'https://user:pw@p1-caldav.icloud.com/x', 'https://p1-caldav.icloud.com:8443/x', 'not a link', ''])
    assert.strictEqual(calendarURL(bad), null, bad);
});

test('reads events, spreads out repeating ones, keeps skipped and moved dates right', () => {
  const { events } = readCalendar(ical, ICS, NOW);
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
  assert.ok(!readCalendar(ical, ICS.replace('UID:b2', 'UID:lesson-1@rebbi-app'), NOW).events.some((e) => e.title === 'Shabbaton'));
});

const LINK = 'webcal://p52-caldav.icloud.com/published/2/abc';
const okVerify = async (t) => { if (t !== 'good') throw new Error('bad'); return { id: 'u1' }; };
const fakeFetch = (body, status = 200, url) => async (u) => new Proxy(new Response(body, { status }), { get: (r, k) => (k === 'url' ? url || u : typeof r[k] === 'function' ? r[k].bind(r) : r[k]) });
const post = (url, token = 'good', origin = 'https://yaksbbgtr.github.io') => new Request('https://x.supabase.co/functions/v1/calimport', {
  method: 'POST', body: JSON.stringify({ url }), headers: Object.assign({ origin, 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}) });
const deps = (f) => ({ verify: okVerify, fetch: f || fakeFetch(ICS), ical, now: () => NOW });
const call = async (req, d) => { const r = await handleImport(req, d || deps()); return { status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers }; };

test('import: needs sign-in, a calendar link, and a calendar', async () => {
  assert.strictEqual((await call(post(LINK, null))).status, 401);
  assert.strictEqual((await call(post(LINK, 'nope'))).status, 401);
  let fetched = 0;
  let r = await call(post('https://evil.com/a.ics'), deps(async () => { fetched++; }));
  assert.deepStrictEqual([r.status, r.body.error, fetched], [400, 'link', 0]);
  assert.strictEqual((await call(post(LINK), deps(fakeFetch('<html>hi</html>')))).status, 422);
  r = await call(post(LINK), deps(fakeFetch('', 404)));
  assert.deepStrictEqual([r.status, r.body.error], [404, 'gone']);
  assert.strictEqual((await call(post(LINK), deps(fakeFetch(ICS, 200, 'https://evil.com/')))).status, 400);
  assert.strictEqual((await call(new Request('https://x/calimport'))).status, 405);
});
test('import: returns the events, with CORS only for the app', async () => {
  let r = await call(post(LINK));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.events.length, 6);
  assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://yaksbbgtr.github.io');
  r = await call(post(LINK, 'good', 'https://evil.com'));
  assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
  r = await call(new Request('https://x/calimport', { method: 'OPTIONS', headers: { origin: 'http://localhost:8765' } }));
  assert.strictEqual(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers'), /authorization/);
});
