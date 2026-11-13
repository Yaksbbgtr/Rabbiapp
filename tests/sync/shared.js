// Rebbi-to-rebbi issues across two Google accounts (run like e2e.js, with the emulators and serve.js running).
const puppeteer = require('puppeteer-core');
const URL = 'http://127.0.0.1:8765/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function until(page, fn, arg, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(300); }
  return false;
}
(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/rabbi--app/databases/(default)/documents', { method: 'DELETE' });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const errors = [];
  async function device(name, sub, email) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|emulator|Failed to load resource/i.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await page.evaluate(() => { localStorage.setItem('rabbiapp.sync.emulator', '127.0.0.1'); localStorage.setItem('rabbiapp.sync.on', '1'); });
    await page.reload();
    await until(page, () => window.firebase && firebase.apps.length);
    await page.evaluate((sub, email) => firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }))), sub, email);
    ok(await until(page, () => Sync.status() === 'synced'), name + ' signed in and synced');
    return page;
  }
  const A = await device('rebbi A', 'ra', 'a@test.com');
  const B = await device('rebbi B', 'rb', 'b@test.com');
  const C = await device('outsider C', 'rc', 'c@test.com');
  const a = await A.evaluate(() => Store.createProfile({ name: 'Rabbi Aaa', className: 'Kitah A' }));
  const b = await B.evaluate(() => Store.createProfile({ name: 'Rabbi Bbb', className: 'Kitah B' }));
  await A.evaluate(id => Store.login(id), a); await B.evaluate(id => Store.login(id), b);
  ok(await until(A, b => Issues.rebbeim().some(r => r.key === 'rebbi:' + b), b), 'A sees rebbi B in the Send to list');

  // A sends to B and the principal
  await A.evaluate(() => { location.hash = '#/issues'; Issues.report(''); });
  await sleep(400);
  await A.evaluate(b => {
    document.querySelector('.to-rebbeim').open = true;
    [...document.querySelectorAll('.to-check')].find(x => /Principal/.test(x.textContent)).querySelector('input').click();
    document.querySelector('.to-rebbeim .to-check input').click();
    const t = document.querySelector('.modal input:not([type=checkbox])'); t.value = 'Swap recess duty Tuesday 3pm'; 
    document.querySelector('.modal-actions .btn.primary').click();
  }, b);
  const sent = await A.evaluate(() => Store.get().issues.slice(-1)[0]);
  ok(sent && sent.to.includes('rebbi:' + b) && sent.to.includes('principal'), 'issue saved with B and principal: ' + JSON.stringify(sent && sent.to));

  ok(await until(B, () => Issues.received().some(x => /Swap recess/.test(x.issue.title))), 'B received it');
  ok(await until(B, () => Issues.unreadCount() === 1), 'B has 1 unread');
  await B.evaluate(id => { location.hash = '#/issue/' + id; }, sent.id); await sleep(800);
  ok(await until(B, () => Issues.unreadCount() === 0), 'opening it clears B\'s red number');
  await B.evaluate(() => { const t = document.querySelector('#main textarea'); t.value = 'Sure, I can take it'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  ok(await until(A, id => (Store.get().issues.find(i => i.id === id).notes || []).some(n => /I can take it/.test(n.text)), sent.id), 'A got B\'s reply in his own issue');
  ok(await until(A, () => Issues.unreadCount() === 1), 'A sees it as a new reply');
  // A answers back
  await A.evaluate(id => Store.update(s => { const i = s.issues.find(x => x.id === id); i.notes.push({ id: 'n2', at: new Date().toISOString(), date: Store.todayISO(), by: 'Rabbi Aaa', text: 'Thanks!', office: false }); }), sent.id);
  ok(await until(B, id => Issues.received().find(x => x.issue.id === id).issue.notes.some(n => n.text === 'Thanks!'), sent.id), 'B got A\'s answer');
  ok(await until(B, () => /Thanks!/.test(document.querySelector('#main').textContent)), 'B sees A\'s answer on the open page');
  ok(await B.evaluate(id => Issues.received().find(x => x.issue.id === id).issue.notes.filter(n => /I can take it/.test(n.text)).length === 1, sent.id), 'B\'s reply shows once');

  // Security
  const r1 = await C.evaluate(id => firebase.firestore().collection('shared').doc(id).get({ source: 'server' }).then(() => 'read', e => e.code), sent.id);
  ok(r1 === 'permission-denied', 'outsider cannot read the shared issue (' + r1 + ')');
  const r2 = await B.evaluate(id => firebase.firestore().collection('shared').doc(id).update({ issue: '{"title":"hacked"}' }).then(() => 'wrote', e => e.code), sent.id);
  ok(r2 === 'permission-denied', 'recipient cannot change the issue itself (' + r2 + ')');
  const r3 = await B.evaluate(id => firebase.firestore().collection('shared').doc(id).update({ members: ['b@test.com', 'c@test.com', 'a@test.com'] }).then(() => 'wrote', e => e.code), sent.id);
  ok(r3 === 'permission-denied', 'recipient cannot add people (' + r3 + ')');
  const r4 = await B.evaluate(a => firebase.firestore().collection('classes').doc(a).get({ source: 'server' }).then(() => 'read', e => e.code), a);
  ok(r4 === 'permission-denied', 'B still cannot read A\'s class (' + r4 + ')');
  const r5 = await C.evaluate(() => firebase.firestore().collection('people').get({ source: 'server' }).then(s => 'read ' + s.size, e => e.code));
  ok(r5 === 'permission-denied', 'outsider with no class cannot read the directory (' + r5 + ')');
  const r6 = await C.evaluate(() => firebase.firestore().collection('people').doc('a@test.com').set({ uid: 'ra', profiles: {} }).then(() => 'wrote', e => e.code));
  ok(r6 === 'permission-denied', 'cannot overwrite someone else\'s directory entry (' + r6 + ')');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
