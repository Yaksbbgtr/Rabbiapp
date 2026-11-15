'use strict';
/*
 * Parent Locker "robot": a hidden browser that takes attendance the same way a
 * rebbi does on the website, because Parent Locker has no API.
 *
 *   home.php → Take Attendance → the course link → mark each boy Present / Late /
 *   Absent → Save Attendance → reload and check every boy shows as saved.
 *
 * It signs in with a saved browser session (data/parentlocker/session.json,
 * made by `npm run pl:login`), never a password. If Parent Locker changes this
 * page, the selectors in SEL are the place to fix.
 */
const fs = require('fs');
const path = require('path');

const SESSION = process.env.PARENTLOCKER_SESSION ||
  path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'parentlocker', 'session.json');
const SHOTS = path.join(path.dirname(SESSION), 'screenshots');

// The school's own Parent Locker site (e.g. https://yourschool.parentlocker.com): PARENTLOCKER_URL, or else
// the school address found in the saved login session.
function baseUrl() {
  if (process.env.PARENTLOCKER_URL) return process.env.PARENTLOCKER_URL.replace(/\/$/, '');
  try {
    const c = JSON.parse(fs.readFileSync(SESSION, 'utf8')).cookies
      .map(x => x.domain.replace(/^\./, '')).find(d => /\.parentlocker\.com$/.test(d) && !/^(login|www)\./.test(d));
    if (c) return 'https://' + c;
  } catch (e) { /* no session yet */ }
  return 'https://login.parentlocker.com';
}

const SEL = {
  takeAttendance: { role: 'link', name: 'Take Attendance' },
  row: '.srow',
  name: '.student-name',
  buttons: '.status-buttons-container > .selector',
  saved: 'savedTd',
  save: { role: 'button', name: 'Save Attendance' }
};
const LABEL = { P: 'Present', L: 'Late', A: 'Absent' };

class RobotError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z֐-׿,]/g, '');

function playwright() {
  try { return require('playwright'); } catch (e) {
    throw new RobotError('NO_PLAYWRIGHT', 'Playwright is not installed. Run `npm install` in the server folder.');
  }
}

async function withCourse(course, fn) {
  if (!fs.existsSync(SESSION)) throw new RobotError('NO_SESSION', 'No saved Parent Locker login. Run `npm run pl:login`.');
  const browser = await playwright().chromium.launch({ headless: process.env.PARENTLOCKER_SHOW !== 'true' });
  try {
    const ctx = await browser.newContext({ storageState: SESSION, viewport: { width: 1280, height: 2400 } });
    ctx.setDefaultTimeout(20000);
    const page = await ctx.newPage();
    await page.goto(baseUrl() + '/home.php');
    if (/login/i.test(new URL(page.url()).hostname + new URL(page.url()).pathname)) {
      throw new RobotError('LOGIN_EXPIRED', 'The saved Parent Locker login has expired. Run `npm run pl:login` again.');
    }
    await page.getByRole(SEL.takeAttendance.role, { name: SEL.takeAttendance.name }).click();
    await page.waitForLoadState('networkidle');
    const link = page.getByRole('link', { name: course });
    if (await link.count() === 0) throw new RobotError('NO_COURSE', `Course "${course}" isn't on the Take Attendance page today.`);
    await link.first().click();
    await page.waitForSelector(SEL.row);
    await page.waitForLoadState('networkidle');
    const result = await fn(page);
    await ctx.storageState({ path: SESSION }); // keep the login fresh
    fs.chmodSync(SESSION, 0o600);
    return result;
  } catch (e) {
    if (e instanceof RobotError) throw e;
    throw new RobotError('PAGE_CHANGED', `Parent Locker page didn't look as expected: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

// [{ name: 'Last, First', status: 'P'|'L'|'A'|null }]
function readRows(page) {
  return page.$$eval(SEL.row, (rows, s) => rows.map(r => {
    const btns = [...r.querySelectorAll(s.buttons)];
    const saved = btns.find(b => b.classList.contains(s.saved));
    const t = saved ? saved.textContent.trim() : '';
    return { name: (r.querySelector(s.name) || {}).textContent.trim(), status: t === 'Present' ? 'P' : t === 'Late' ? 'L' : t === 'Absent' ? 'A' : null };
  }), { buttons: SEL.buttons, name: SEL.name, saved: SEL.saved });
}

/** The class list as Parent Locker has it, with what's saved for today. */
function readCourse(course) {
  return withCourse(course, readRows);
}

function expectedDateText(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Mark attendance for one course on today's page.
 * @param {object} o { course, date (YYYY-MM-DD, must be the date Parent Locker shows), records: [{ name, plName?, status }], save }
 * @returns {{ saved:boolean, changed:string[], notInParentLocker:string[], notInRoster:string[], screenshot:string }}
 */
async function takeAttendance({ course, date, records, save }) {
  return withCourse(course, async page => {
    const want = expectedDateText(date);
    if (!(await page.textContent('body')).includes(want)) {
      throw new RobotError('WRONG_DATE', `Parent Locker's attendance page isn't showing ${want}.`);
    }
    const rows = await readRows(page);
    const byName = new Map(rows.map((r, i) => [norm(r.name), i]));
    const missing = records.filter(r => !byName.has(norm(r.plName || r.name)));
    if (missing.some(r => r.status !== 'P')) {
      throw new RobotError('NAME_MISMATCH', `Not found in Parent Locker: ${missing.filter(r => r.status !== 'P').map(r => r.name).join(', ')}`);
    }
    const wanted = new Map(records.map(r => [norm(r.plName || r.name), r.status]));
    const changed = [];
    const rowEls = page.locator(SEL.row);
    for (let i = 0; i < rows.length; i++) {
      const status = wanted.get(norm(rows[i].name));
      if (!status || rows[i].status === status) continue;
      await rowEls.nth(i).locator(SEL.buttons, { hasText: LABEL[status] }).click();
      changed.push(`${rows[i].name}: ${LABEL[status]}`);
    }
    fs.mkdirSync(SHOTS, { recursive: true });
    const screenshot = path.join(SHOTS, `${date}-${norm(course).replace(/,/g, '') || 'course'}${save ? '' : '-dry-run'}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    if (save && changed.length) {
      await page.getByRole(SEL.save.role, { name: SEL.save.name }).click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      await page.reload();
      await page.waitForLoadState('networkidle');
      // After a reload the page may need the course picked again.
      if (await page.locator(SEL.row).count() === 0) {
        await page.getByRole('link', { name: course }).first().click();
        await page.waitForSelector(SEL.row);
        await page.waitForLoadState('networkidle');
      }
      const after = await readRows(page);
      const wrong = after.filter(r => wanted.has(norm(r.name)) && r.status !== wanted.get(norm(r.name)));
      if (wrong.length) throw new RobotError('NOT_SAVED', `Saved, but Parent Locker doesn't show it for: ${wrong.map(r => r.name).join(', ')}`);
    }
    return {
      saved: !!save && changed.length > 0,
      changed,
      notInParentLocker: missing.map(r => r.name),
      notInRoster: rows.filter(r => !wanted.has(norm(r.name))).map(r => r.name),
      screenshot
    };
  });
}

module.exports = { takeAttendance, readCourse, RobotError, SESSION, baseUrl };
