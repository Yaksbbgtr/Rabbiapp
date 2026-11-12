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
  await fetch('http://127.0.0.1:8080/v1/projects/rabbi--app/databases/(default)/documents/admins/office@test.com', {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { note: { stringValue: 'x' } } }) });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const errors = [];
  async function device(name, sub, email) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('requestfailed', r => { if (!/:9099|:8080|google|gstatic/.test(r.url())) errors.push(name + ' request failed: ' + r.url() + ' ' + r.failure().errorText); });
    page.on('console', m => { if (m.type() === 'error' && !/favicon|emulator|Failed to load resource/i.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    await page.goto(URL);
    await page.evaluate(() => { localStorage.setItem('rabbiapp.sync.emulator', '127.0.0.1'); localStorage.setItem('rabbiapp.sync.on', '1'); });
    await page.reload();
    await until(page, () => window.firebase && firebase.apps.length);
    await page.evaluate((sub, email) => firebase.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }))), sub, email);
    ok(await until(page, () => Sync.status() === 'synced'), name + ' signed in and synced');
    return page;
  }
  const A1 = await device('rebbi-dev1', 'r1', 'rebbi1@test.com');
  const id = await A1.evaluate(() => Store.createProfile({ sampleGrade: 3 }));
  const nT = await A1.evaluate(id => Store.peek(id).talmidim.length, id);
  await A1.evaluate(id => Sync.upload(id), id);
  ok(await until(A1, () => Sync.status() === 'synced'), 'upload finished');

  const A2 = await device('rebbi-dev2', 'r1', 'rebbi1@test.com');
  ok(await until(A2, ([id, n]) => Store.hasData(id) && Store.peek(id).talmidim.length === n && Store.profiles().some(p => p.id === id && p.cloud), [id, nT]), 'second device received the class (' + nT + ' talmidim)');

  await A2.evaluate(id => { Store.login(id); Store.update(s => s.lessons.push({ id: 'L1', date: '2026-11-15', subject: 'Meeting', plan: 'from dev2', done: false, notes: '' })); }, id);
  ok(await until(A1, id => Store.peek(id).lessons.some(l => l.id === 'L1'), id), 'planner item from device 2 shows on device 1');

  // A profile made while signed in uploads by itself
  const id2 = await A1.evaluate(() => Store.createProfile({ name: 'Rabbi New', className: 'Kitah Vov' }));
  ok(await until(A2, id2 => Store.hasData(id2) && Store.profiles().some(p => p.id === id2 && p.cloud && p.className === 'Kitah Vov'), id2), 'new profile made on device 1 appears on device 2 without pressing Upload');

  // Offline edits on both sides, different keys
  await A1.evaluate(() => firebase.firestore().disableNetwork());
  await A1.evaluate(id => Store.updateProfile(id, d => { d.settings.school = 'Offline School'; }), id);
  await A2.evaluate(id => Store.update(s => s.lessons.push({ id: 'L2', date: '2026-11-16', subject: 'Chumash', plan: 'dev2 while dev1 offline', done: false, notes: '' })), id);
  await sleep(2000);
  await A1.evaluate(() => firebase.firestore().enableNetwork());
  ok(await until(A1, id => { const d = Store.peek(id); return d.lessons.some(l => l.id === 'L2') && d.settings.school === 'Offline School'; }, id), 'device 1 merged: kept its offline edit and got device 2 edit');
  ok(await until(A2, id => Store.get().settings.school === 'Offline School', id), 'device 2 got device 1 offline edit');

  // Office + rebbi editing different issues at the same time
  const O = await device('office', 'o1', 'office@test.com');
  ok(await until(O, id => Store.hasData(id), id), 'office sees the rebbi class');
  await A2.evaluate(() => Store.update(s => s.issues.push({ id: 'ISSUE1', date: '2026-11-10', by: 'Rebbi', title: 'first', notes: [], status: 'open', priority: 'normal' })));
  const issueId = 'ISSUE1';
  ok(await until(O, id => Store.peek(id).issues.some(i => i.id === 'ISSUE1'), id), 'office got the first issue');
  await Promise.all([
    O.evaluate(([id, iid]) => Store.updateProfile(id, d => { d.issues.find(i => i.id === iid).notes.push({ date: '2026-11-11', by: 'Office', text: 'office note', office: true }); }), [id, issueId]),
    A2.evaluate(() => Store.update(s => s.issues.push({ id: 'NEWISSUE', date: '2026-11-11', by: 'Rebbi', title: 'new from rebbi', notes: [], status: 'open', priority: 'normal' })))
  ]);
  ok(await until(A1, ([id, iid]) => { const d = Store.peek(id); return d.issues.some(i => i.id === 'NEWISSUE') && d.issues.find(i => i.id === iid).notes.some(n => n.text === 'office note'); }, [id, issueId]), 'both simultaneous issue edits arrived on device 1');
  ok(await until(O, id => Store.peek(id).issues.some(i => i.id === 'NEWISSUE'), id), 'office got the rebbi new issue');
  ok(await until(A2, ([id, iid]) => Store.get().issues.find(i => i.id === iid).notes.some(n => n.text === 'office note'), [id, issueId]), 'rebbi got the office note');

  // Another rebbi can't see it
  const B = await device('other-rebbi', 'r2', 'rebbi2@test.com');
  await sleep(1500);
  ok(await B.evaluate(id => !Store.hasData(id), id), 'other rebbi does not get the class');
  const denied = await B.evaluate(id => firebase.firestore().collection('classes').doc(id).get({ source: 'server' }).then(() => 'read', e => e.code), id);
  ok(denied === 'permission-denied', 'other rebbi direct read is denied (' + denied + ')');
  const denied2 = await B.evaluate(id => firebase.firestore().collection('classes').doc(id).update({ owner: 'r2' }).then(() => 'wrote', e => e.code), id);
  ok(denied2 === 'permission-denied', 'other rebbi cannot take the class (' + denied2 + ')');
  const denied3 = await A1.evaluate(id => firebase.firestore().collection('admins').doc('rebbi1@test.com').set({ x: 1 }).then(() => 'wrote', e => e.code), id);
  ok(denied3 === 'permission-denied', 'rebbi cannot make himself office (' + denied3 + ')');

  // Sign out clears the device
  await A1.evaluate(() => { window.confirm = () => true; });
  await A1.evaluate(() => Sync.signOut());
  await A1.evaluate(() => document.querySelector('.modal-actions .btn.danger').click());
  ok(await until(A1, id => !Store.hasData(id) && Sync.status() === 'off', id), 'sign out removes synced classes from the device');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ':\n  ' + errors.join('\n  ') : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
