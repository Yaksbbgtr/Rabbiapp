// Issues sent from one rebbi to another (like e2e.js): the real app in headless Chrome, against an in-memory Postgres with the real
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
  const a1 = user('a'), b1 = user('b'), c1 = user('c');
  const A = await device('rebbi A', a1);
  const B = await device('rebbi B', b1);
  const C = await device('outsider C', c1);
  const a = await A.evaluate(() => Store.createProfile({ name: 'Rabbi Aaa', className: 'Kitah A' }));
  const b = await B.evaluate(() => Store.createProfile({ name: 'Rabbi Bbb', className: 'Kitah B' }));
  await A.evaluate((id) => Store.login(id), a); await B.evaluate((id) => Store.login(id), b);
  ok(await until(A, (b) => Issues.rebbeim().some((r) => r.key === 'rebbi:' + b), b), 'A sees rebbi B in the Send to list');

  await A.evaluate(() => { location.hash = '#/issues'; Issues.report(''); });
  await sleep(400);
  await A.evaluate(() => {
    document.querySelector('.to-rebbeim').open = true;
    [...document.querySelectorAll('.to-check')].find((x) => /Principal/.test(x.textContent)).querySelector('input').click();
    document.querySelector('.to-rebbeim .to-check input').click();
    const t = document.querySelector('.modal input:not([type=checkbox])'); t.value = 'Swap recess duty Tuesday 3pm';
    document.querySelector('.modal-actions .btn.primary').click();
  });
  const sent = await A.evaluate(() => Store.get().issues.slice(-1)[0]);
  ok(sent && sent.to.includes('rebbi:' + b) && sent.to.includes('principal'), 'issue saved with B and principal');

  ok(await until(B, () => Issues.received().some((x) => /Swap recess/.test(x.issue.title))), 'B received it');
  ok(await until(B, () => Issues.unreadCount() === 1), 'B has 1 unread');
  await B.evaluate((id) => { location.hash = '#/issue/' + id; }, sent.id); await sleep(800);
  ok(await until(B, () => Issues.unreadCount() === 0), 'opening it clears B\'s red number');
  await B.evaluate(() => { const t = document.querySelector('#main textarea'); t.value = 'Sure, I can take it'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  ok(await until(A, (id) => (Store.get().issues.find((i) => i.id === id).notes || []).some((n) => /I can take it/.test(n.text)), sent.id), 'A got B\'s reply in his own issue');
  ok(await until(A, () => Issues.unreadCount() === 1), 'A sees it as a new reply');
  await A.evaluate((id) => Store.update((s) => { const i = s.issues.find((x) => x.id === id); i.notes.push({ id: 'n2', at: new Date().toISOString(), date: Store.todayISO(), by: 'Rabbi Aaa', text: 'Thanks!', office: false }); }), sent.id);
  ok(await until(B, (id) => Issues.received().find((x) => x.issue.id === id).issue.notes.some((n) => n.text === 'Thanks!'), sent.id), 'B got A\'s answer');
  ok(await until(B, () => /Thanks!/.test(document.querySelector('#main').textContent)), 'B sees A\'s answer on the open page');
  ok(await B.evaluate((id) => Issues.received().find((x) => x.issue.id === id).issue.notes.filter((n) => /I can take it/.test(n.text)).length === 1, sent.id), 'B\'s reply shows once');
  await sleep(800);
  ok(await C.evaluate(() => Issues.received().length === 0), 'outsider C got nothing');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ':\n  ' + errors.join('\n  ') : ''));
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
