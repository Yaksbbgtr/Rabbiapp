// The real app in headless Chrome, several devices and accounts, against an in-memory Postgres with the real
// schema and row level security (see fake-server.js). Run: node tests/supabase/e2e.js  (serves the app itself).
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { chromium } = require(path.join(__dirname, '../../server/node_modules/playwright'));
const { makeDb, user } = require('./db');
const { attach } = require('./fake-server');

const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function until(page, fn, arg, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* page busy */ } await sleep(200); }
  return false;
}

(async () => {
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT)) return r.writeHead(403).end();
    fs.readFile(f, (e, b) => { if (e) return r.writeHead(404).end(); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  const URL = 'http://127.0.0.1:' + server.address().port + '/index.html';

  const db = await makeDb();
  await db.query("insert into public.admins values ('office@example.com')");
  const browser = await chromium.launch();
  const errors = [];
  async function device(name, acct) {
    const ctx = await browser.newContext();
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); // nothing leaves the machine
    await attach(ctx, db);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR/i.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await page.evaluate((a) => { localStorage.setItem('fake.account', JSON.stringify(a)); }, acct);
    await page.evaluate(() => Sync.signIn());
    ok(await until(page, () => Sync.status() === 'synced'), name + ' signed in and synced');
    return page;
  }
  const r1 = user('rebbi1'), office = user('office'), r2 = user('rebbi2');

  // ---------- two devices, one rebbi ----------
  const A1 = await device('rebbi-dev1', r1);
  const id = await A1.evaluate(() => Store.createProfile({ sampleGrade: 3 }));
  const nT = await A1.evaluate((id) => Store.peek(id).talmidim.length, id);
  ok(await until(A1, (id) => Store.profiles().some((p) => p.id === id && p.cloud) && Sync.status() === 'synced', id), 'a class made while signed in uploads by itself');

  const A2 = await device('rebbi-dev2', r1);
  ok(await until(A2, ([id, n]) => Store.hasData(id) && Store.peek(id).talmidim.length === n && Store.profiles().some((p) => p.id === id && p.cloud), [id, nT]), 'second device received the class (' + nT + ' talmidim)');

  await A2.evaluate((id) => { Store.login(id); Store.update((s) => s.lessons.push({ id: 'L1', date: '2026-11-15', subject: 'Meeting', plan: 'from dev2', done: false, notes: '' })); }, id);
  ok(await until(A1, (id) => Store.peek(id).lessons.some((l) => l.id === 'L1'), id), 'planner item from device 2 shows on device 1');

  const id2 = await A1.evaluate(() => Store.createProfile({ name: 'Rabbi New', className: 'Kitah Vov' }));
  ok(await until(A2, (id2) => Store.hasData(id2) && Store.profiles().some((p) => p.id === id2 && p.cloud && p.className === 'Kitah Vov'), id2), 'new profile made on device 1 appears on device 2');

  // Offline edits on both sides, different keys
  await A1.context().setOffline(true);
  ok(await until(A1, () => Sync.status() === 'offline'), 'device 1 shows offline');
  await A1.evaluate((id) => Store.updateProfile(id, (d) => { d.settings.school = 'Offline School'; }), id);
  await A2.evaluate(() => Store.update((s) => s.lessons.push({ id: 'L2', date: '2026-11-16', subject: 'Chumash', plan: 'dev2 while dev1 offline', done: false, notes: '' })));
  await sleep(1500);
  await A1.context().setOffline(false);
  ok(await until(A1, (id) => { const d = Store.peek(id); return d.lessons.some((l) => l.id === 'L2') && d.settings.school === 'Offline School'; }, id), 'device 1 merged: kept its offline edit and got device 2\'s');
  ok(await until(A2, () => Store.get().settings.school === 'Offline School'), 'device 2 got device 1\'s offline edit');
  ok(await until(A1, () => Sync.status() === 'synced'), 'device 1 back to "Up to date"');

  // Quick edits in a row all arrive (one write at a time per class)
  await A2.evaluate(() => { for (let i = 0; i < 5; i++) Store.update((s) => s.lessons.push({ id: 'Q' + i, date: '2026-11-17', subject: 'Q', plan: String(i), done: false, notes: '' })); });
  await sleep(100);
  await A2.evaluate(() => Store.update((s) => { s.lessons = s.lessons.filter((l) => l.id !== 'Q0'); }));
  ok(await until(A1, (id) => { const L = Store.peek(id).lessons; return ['Q1', 'Q2', 'Q3', 'Q4'].every((q) => L.some((l) => l.id === q)) && !L.some((l) => l.id === 'Q0'); }, id), 'quick edits and a delete all reached device 1');

  // ---------- office + rebbi editing different issues at the same time ----------
  const O = await device('office', office);
  ok(await until(O, (id) => Store.hasData(id), id), 'office sees the rebbi\'s class');
  ok(await O.evaluate(() => Sync.isAdmin()), 'office account is recognised');
  await A2.evaluate(() => Store.update((s) => s.issues.push({ id: 'ISSUE1', date: '2026-11-10', by: 'Rebbi', title: 'first', notes: [], status: 'open', priority: 'normal' })));
  ok(await until(O, (id) => Store.peek(id).issues.some((i) => i.id === 'ISSUE1'), id), 'office got the first issue');
  await Promise.all([
    O.evaluate((id) => Store.updateProfile(id, (d) => { d.issues.find((i) => i.id === 'ISSUE1').notes.push({ date: '2026-11-11', by: 'Office', text: 'office note', office: true }); }), id),
    A2.evaluate(() => Store.update((s) => s.issues.push({ id: 'NEWISSUE', date: '2026-11-11', by: 'Rebbi', title: 'new from rebbi', notes: [], status: 'open', priority: 'normal' })))
  ]);
  ok(await until(A1, (id) => { const d = Store.peek(id); return d.issues.some((i) => i.id === 'NEWISSUE') && d.issues.find((i) => i.id === 'ISSUE1').notes.some((n) => n.text === 'office note'); }, id), 'both simultaneous issue edits arrived on device 1');
  ok(await until(O, (id) => Store.peek(id).issues.some((i) => i.id === 'NEWISSUE'), id), 'office got the rebbi\'s new issue');
  ok(await until(A2, () => Store.get().issues.find((i) => i.id === 'ISSUE1').notes.some((n) => n.text === 'office note')), 'rebbi got the office note');

  // ---------- another rebbi ----------
  const B = await device('other-rebbi', r2);
  await sleep(1000);
  ok(await B.evaluate((id) => !Store.hasData(id), id), 'another rebbi does not get the class');

  // ---------- live calendar row ----------
  ok(await A1.evaluate(() => Sync.publishCalendar('abcdefghijklmnopqrstuvwxyz12', 'BEGIN:VCALENDAR', 'x').then(() => true, () => false)), 'live calendar uploads');
  ok((await db.query("select count(*)::int n from public.calendars")).rows[0].n === 1, 'calendar row saved');
  await A1.evaluate((id) => { Store.login(id); Store.update((s) => { s.settings.calFeed = { token: 'abcdefghijklmnopqrstuvwxyz12', lessons: true }; }); }, id);
  ok(await A1.evaluate(() => Calendar.feedURL()) === 'https://test.supabase.co/functions/v1/calendar/abcdefghijklmnopqrstuvwxyz12.ics', 'live calendar link points at the Supabase function');
  ok(await until(A1, () => Calendar.publish(true)), 'live calendar publishes through Sync');
  ok(/Planner|VCALENDAR/.test((await db.query("select ics from public.calendars")).rows[0].ics), 'calendar text saved');

  // ---------- log out / skip / sign back in ----------
  await A2.evaluate(() => Profiles.logout());
  ok(await until(A2, () => !Sync.user() && Store.profiles().some((p) => p.cloud)), 'log out signs out and keeps synced classes on the device');
  await A2.evaluate((id) => { App.render(); [...document.querySelectorAll('.profile-row')].find((b) => b.textContent.includes(Store.profiles().find((p) => p.id === id).name)).click(); }, id);
  ok(await until(A2, () => /Sign in to open/.test((document.querySelector('.modal h2') || {}).textContent || '')), 'tapping a synced profile asks to sign in');
  await A2.evaluate(() => [...document.querySelectorAll('.modal-actions .btn')].find((b) => /Skip/.test(b.textContent)).click());
  ok(await until(A2, (id) => Store.currentProfile() && Store.currentProfile().id === id, id), 'Skip – demo testing opens the profile');
  await A2.evaluate(() => Sync.signIn());
  ok(await until(A2, (id) => Sync.status() === 'synced' && Sync.canOpen(Store.profiles().find((p) => p.id === id)), id), 'signing back in reconnects and allows the profile');

  // ---------- sign out clears the device ----------
  await A1.evaluate(() => Sync.signOut());
  await A1.evaluate(() => document.querySelector('.modal-actions .btn.danger').click());
  ok(await until(A1, (id) => !Store.hasData(id) && Sync.status() === 'off', id), 'sign out removes synced classes from the device');

  // ---------- reload keeps you signed in ----------
  await A2.reload();
  ok(await until(A2, () => Sync.status() === 'synced' && !!Sync.user()), 'after a reload, still signed in and synced');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ':\n  ' + errors.join('\n  ') : ''));
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
