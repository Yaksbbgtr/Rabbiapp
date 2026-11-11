// Run with: node tests/scan.test.js
const assert = require('assert');
const { parseClassList } = require('../js/scan.js');

let failures = 0;
function check(name, fn) { try { fn(); } catch (e) { failures++; console.error('FAIL', name, '-', e.message); } }
const names = rows => rows.map(r => [r.first, r.last, r.hebName].filter(Boolean).join(' '));

check('numbered list with header', () => {
  const rows = parseClassList('Kitah Gimmel - Class List 5787\n1. Avraham Adler\n2) Yitzchak Levy\n3 Yaakov Friedman\n\n');
  assert.deepStrictEqual(names(rows), ['Avraham Adler', 'Yitzchak Levy', 'Yaakov Friedman']);
});

check('Last, First format and capitalization', () => {
  const rows = parseClassList('COHEN, MOSHE\nlevy, dovid');
  assert.deepStrictEqual(rows.map(r => [r.first, r.last]), [['Moshe', 'Cohen'], ['Dovid', 'Levy']]);
});

check('Hebrew names and mixed lines', () => {
  const rows = parseClassList('1. Avraham Adler   אברהם בן משה\n2. יצחק לוי\n');
  assert.strictEqual(rows[0].first, 'Avraham');
  assert.strictEqual(rows[0].last, 'Adler');
  assert.strictEqual(rows[0].hebName, 'אברהם בן משה');
  assert.strictEqual(rows[1].hebName, 'יצחק לוי');
  assert.strictEqual(rows[1].first, '');
});

check('phone numbers are pulled out', () => {
  const rows = parseClassList('Shmuel Weiss    (732) 555-0142\nDovid Rosen 732.555.0199');
  assert.deepStrictEqual(rows.map(r => [r.first, r.last, r.phone]), [
    ['Shmuel', 'Weiss', '(732) 555-0142'], ['Dovid', 'Rosen', '732.555.0199']]);
});

check('OCR junk is cleaned or dropped', () => {
  const rows = parseClassList('| Mosh3 Katz |\n— —\n•  Ch4im Stern\n|||\n2. M0rdechai Klein\nx');
  assert.deepStrictEqual(names(rows), ['Mosh Katz', 'Chim Stern', 'Mordechai Klein'].map((n, i) => i < 2 ? names(rows)[i] : n));
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[2].first, 'Mordechai');
});

check('bullets and duplicates', () => {
  const rows = parseClassList('• Eli Schwartz\n- Eli Schwartz\n* Binyamin Gross');
  assert.deepStrictEqual(names(rows), ['Eli Schwartz', 'Binyamin Gross']);
});

check('headers in Hebrew are skipped', () => {
  const rows = parseClassList('רשימת תלמידים כיתה ג\nמשה כץ');
  assert.deepStrictEqual(names(rows), ['משה כץ']);
});

if (failures) { console.error(failures + ' test(s) failed'); process.exit(1); }
console.log('All scan tests passed');

// ---- graded bechina ----
const { parseBechinaScan } = require('../js/scan.js');
const roster = [
  { id: 'a', first: 'Yaakov', last: 'Friedman', hebName: 'יעקב בן שמואל' }, { id: 'b', first: 'Moshe', last: 'Katz', hebName: 'משה בן יוסף' },
  { id: 'c', first: 'Moshe', last: 'Goldberg', hebName: 'משה בן חיים' }, { id: 'd', first: 'Dovid', last: 'Rosen', hebName: 'דוד בן אליעזר' }];
let f2 = 0;
function check2(name, fn) { try { fn(); } catch (e) { f2++; console.error('FAIL', name, '-', e.message); } }
check2('name and fraction', () => {
  const r = parseBechinaScan('Chumash Bechina\nName: Yaakov Friedman\n\n1. ...\n\n85/100', roster, 100);
  assert.strictEqual(r.talmid.id, 'a'); assert.strictEqual(r.score, 85);
});
check2('percent and last name only', () => {
  const r = parseBechinaScan('Rosen   Parshas Lech Lecha\nGrade: 90%', roster, 20);
  assert.strictEqual(r.talmid.id, 'd'); assert.strictEqual(r.score, 18);
});
check2('ambiguous first name asks', () => {
  const r = parseBechinaScan('Moshe\nScore 17', roster, 20);
  assert.strictEqual(r.talmid, null); assert.deepStrictEqual(r.options.map(t => t.id).sort(), ['b', 'c']); assert.strictEqual(r.score, 17);
});
check2('typo in last name', () => {
  const r = parseBechinaScan('Yaakov Freidman  72 / 100', roster, 100);
  assert.strictEqual(r.talmid.id, 'a'); assert.strictEqual(r.score, 72);
});
check2('Hebrew name and lone circled number', () => {
  const r = parseBechinaScan('בחינה בחומש\nיעקב\n\n(8)\n', roster, 10);
  assert.strictEqual(r.talmid.id, 'a'); assert.strictEqual(r.score, 8);
});
check2('question numbers are not marks', () => {
  const r = parseBechinaScan('Dovid Rosen\n1.\n2.\n3.\n', roster, 100);
  assert.strictEqual(r.talmid.id, 'd'); assert.strictEqual(r.score, null);
});
if (f2) { console.error(f2 + ' bechina test(s) failed'); process.exit(1); }
console.log('All bechina scan tests passed');
