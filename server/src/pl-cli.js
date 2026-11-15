'use strict';
/*
 * Parent Locker helper commands.
 *
 *   npm run pl:password -- you@school.org  save the Parent Locker login in the Mac's Keychain (run in Terminal)
 *   npm run pl:courses                      list today's courses on the Take Attendance page
 *   npm run pl:roster -- "<course>" "<rebbi name>" "<cell>" [class name]
 *                                           copy a course's class list from Parent Locker into data/school.json
 *   npm run pl:try -- <rebbiId> [name=A|L ...] [--save] [--show]
 *                                           fill in attendance (everyone else Present). Without --save it only
 *                                           fills in, takes a screenshot and leaves without saving.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SCHOOL_FILE = path.join(DATA_DIR, 'school.json');
const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const pos = args.filter(a => !a.startsWith('--'));
if (flags.has('--show')) process.env.PARENTLOCKER_SHOW = 'true';
const robot = require('./parentlocker-robot');
const { todayISO } = require('./attendance');

function readSchool() {
  try { return JSON.parse(fs.readFileSync(SCHOOL_FILE, 'utf8')); } catch (e) { return { school: '', rebbeim: [] }; }
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  if (cmd === 'password') {
    // Saves the Parent Locker email and password in this Mac's Keychain. macOS asks for the password itself
    // (hidden, twice), so it never appears on screen, in a file or in the shell history.
    const email = pos[0];
    if (!email || !email.includes('@')) throw new Error('Usage: npm run pl:password -- you@example.org');
    if (process.platform !== 'darwin') throw new Error('Keychain is Mac-only. On a server set PARENTLOCKER_EMAIL and PARENTLOCKER_PASSWORD instead.');
    if (!process.stdin.isTTY) throw new Error('This asks for the password, so run it in the Terminal app, not through Claude.');
    const { spawnSync } = require('child_process');
    spawnSync('security', ['delete-generic-password', '-s', robot.KEYCHAIN_SERVICE], { stdio: 'ignore' });
    console.log(`Type your Parent Locker password for ${email} (it won't show), then again to confirm:`);
    const r = spawnSync('security', ['add-generic-password', '-s', robot.KEYCHAIN_SERVICE, '-a', email, '-l', 'Parent Locker (attendance robot)', '-w'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Not saved.');
    console.log('Saved in Keychain as "Parent Locker (attendance robot)".');
    return;
  }

  if (cmd === 'courses') {
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const ctx = await b.newContext({ storageState: robot.SESSION });
    const page = await ctx.newPage();
    await page.goto(robot.baseUrl() + '/home.php');
    await page.getByRole('link', { name: 'Take Attendance' }).click();
    await page.waitForLoadState('networkidle');
    const names = await page.$$eval('a', as => as.map(a => a.textContent.replace(/\s+/g, ' ').trim()).filter(t => /\d{3}/.test(t) && !/\d{4}$/.test(t)));
    await b.close();
    console.log(names.length ? names.join('\n') : 'No courses found.');
    return;
  }

  if (cmd === 'roster') {
    const [course, rebbiName, phone, className] = pos;
    if (!course || !rebbiName || !phone) throw new Error('Usage: npm run pl:roster -- "<course>" "<rebbi name>" "<cell>" [class name]');
    const rows = await robot.readCourse(course);
    const school = readSchool();
    const id = slug(rebbiName) || 'r' + (school.rebbeim.length + 1);
    const talmidim = rows.map((r, i) => {
      const [last, rest = ''] = r.name.split(',').map(s => s.trim());
      const words = rest.split(/\s+/).filter(Boolean);
      return {
        id: `${id}-${i + 1}`, first: words[0] || rest, last, hebrew: '',
        aliases: words.length > 1 ? [rest] : [], parentLockerName: r.name
      };
    });
    const rebbi = { id, name: rebbiName, phone, className: className || course, parentLockerCourse: course, talmidim };
    const old = school.rebbeim.find(x => x.id === id);
    if (old) Object.assign(old, rebbi, { talmidim: talmidim.map(t => {
      const prev = old.talmidim.find(p => p.parentLockerName === t.parentLockerName);
      return prev ? Object.assign({}, t, { hebrew: prev.hebrew, aliases: [...new Set([...prev.aliases, ...t.aliases])] }) : t;
    }) });
    else school.rebbeim.push(rebbi);
    fs.writeFileSync(SCHOOL_FILE, JSON.stringify(school, null, 2));
    fs.chmodSync(SCHOOL_FILE, 0o600);
    console.log(`${old ? 'Updated' : 'Added'} ${rebbiName} (id "${id}") with ${talmidim.length} talmidim from "${course}" in data/school.json.`);
    return;
  }

  if (cmd === 'try') {
    const [rebbiId, ...marks] = pos;
    const rebbi = readSchool().rebbeim.find(r => r.id === rebbiId);
    if (!rebbi) throw new Error(`No rebbi "${rebbiId}" in data/school.json`);
    const status = {};
    for (const m of marks) {
      const [who, st] = m.split('=');
      const s = (st || 'A').toUpperCase()[0];
      const hits = rebbi.talmidim.filter(t => `${t.first} ${t.last} ${t.parentLockerName}`.toLowerCase().includes(who.toLowerCase()));
      if (hits.length !== 1) throw new Error(`"${who}" matches ${hits.length} talmidim; be more specific.`);
      status[hits[0].id] = s;
    }
    const records = rebbi.talmidim.map(t => ({ name: `${t.first} ${t.last}`, plName: t.parentLockerName || `${t.last}, ${t.first}`, status: status[t.id] || 'P' }));
    const r = await robot.takeAttendance({ course: rebbi.parentLockerCourse, date: todayISO(), records, save: flags.has('--save') });
    console.log(r.saved ? 'Saved to Parent Locker.' : flags.has('--save') ? 'Nothing to change; already matches.' : 'Dry run: filled in, NOT saved.');
    console.log(r.changed.length ? 'Changes:\n  ' + r.changed.join('\n  ') : 'No changes needed.');
    if (r.notInParentLocker.length) console.log('Not on Parent Locker:', r.notInParentLocker.join(', '));
    if (r.notInRoster.length) console.log('On Parent Locker but not in school.json (left alone):', r.notInRoster.join(', '));
    console.log('Screenshot:', r.screenshot);
    return;
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
