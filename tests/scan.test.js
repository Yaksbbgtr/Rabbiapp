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
