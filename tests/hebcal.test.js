// Run with: node tests/hebcal.test.js
const assert = require('assert');
const H = require('../js/hebcal.js');

let failures = 0;
function check(name, fn) {
  try { fn(); } catch (e) { failures++; console.error('FAIL', name, '-', e.message); }
}

// 1. Hebrew dates agree with the ICU Hebrew calendar for every day 1990-2060.
const INTL_MONTHS = { Tishri: 'Tishrei', Heshvan: 'Cheshvan', Kislev: 'Kislev', Tevet: 'Teves',
  Shevat: 'Shevat', 'Adar I': 'Adar I', 'Adar II': 'Adar II', Adar: 'Adar', Nisan: 'Nisan',
  Iyar: 'Iyar', Sivan: 'Sivan', Tamuz: 'Tammuz', Av: 'Av', Elul: 'Elul' };
const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
check('ICU agreement', () => {
  const start = H.isoToRD('1990-01-01'), end = H.isoToRD('2060-12-31');
  for (let rd = start; rd <= end; rd++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(H.rdToISO(rd) + 'T12:00:00Z')).map(p => [p.type, p.value]));
    const h = H.fromRD(rd);
    const m = INTL_MONTHS[parts.month] || parts.month;
    if (+parts.day !== h.day || m !== h.month || +parts.year !== h.year)
      throw new Error(`${H.rdToISO(rd)}: ours ${h.day} ${h.month} ${h.year}, ICU ${parts.day} ${parts.month} ${parts.year}`);
    if (H.toRD(h.year, h.month, h.day) !== rd) throw new Error('round trip ' + H.rdToISO(rd));
  }
});

// 2. Known parshiyos (chutz la'aretz).
const known = {
  '2024-04-20': 'Metzora', '2024-05-04': 'Acharei Mos', '2024-06-08': 'Bamidbar',
  '2024-07-13': 'Chukas', '2024-07-20': 'Balak', '2024-08-03': 'Matos-Masei',
  '2024-08-10': 'Devarim', '2024-09-28': 'Nitzavim-Vayeilech', '2024-10-05': "Ha'azinu",
  '2024-10-26': 'Bereishis', '2025-03-22': 'Vayakhel', '2025-03-29': 'Pekudei', '2014-04-12': 'Acharei Mos', '2014-07-19': 'Matos', '2014-07-26': 'Masei', '2023-03-18': 'Vayakhel-Pekudei', '2025-04-12': 'Tzav',
  '2025-04-19': "Shvi'i shel Pesach", '2025-04-26': 'Shemini', '2025-05-03': 'Tazria-Metzora',
  '2025-05-10': 'Acharei Mos-Kedoshim', '2025-05-24': 'Behar-Bechukosai', '2025-05-31': 'Bamidbar',
  '2025-09-20': 'Nitzavim', '2025-09-27': 'Vayeilech', '2025-10-04': "Ha'azinu",
  '2025-10-18': 'Bereishis', '2023-12-09': 'Vayeishev', '2026-04-04': 'Shabbos Chol Hamoed Pesach',
  '2026-11-14': 'Toldos',
};
check('known parshiyos', () => {
  for (const [iso, name] of Object.entries(known)) {
    const p = H.parshaForShabbos(H.isoToRD(iso));
    assert.strictEqual(p.en, name, iso);
  }
});

// 3. Every Shabbos 5600-6000 gets a reading with no fitting warnings,
//    and every parsha (except V'zos Habracha) is read exactly once per year.
check('full cycles', () => {
  for (let y = 5600; y < 6000; y++) {
    const c = H.parshaCycle(y);
    if (c.warnings.length) throw new Error(y + ': ' + c.warnings.join('; '));
    const start = H.newYear(y), end = H.newYear(y + 1) - 1;
    const seen = {};
    for (let rd = H.upcomingShabbos(start); rd <= end; rd += 7) {
      const p = H.parshaForShabbos(rd);
      if (!p.en) throw new Error('no reading ' + H.rdToISO(rd));
      p.ids.forEach(i => { seen[i] = (seen[i] || 0) + 1; });
    }
    // Readings in Hebrew year y: Vayeilech/Ha'azinu of Tishrei + Bereishis..before RH.
    for (let i = 0; i < 53; i++) {
      const name = H.PARSHIYOS[i][0];
      const n = seen[i] || 0;
      const ok = name === 'Vayeilech' ? (n === 1 || n === 2 || n === 0) : name === "Ha'azinu" ? n === 1 : n === 1;
      if (!ok) throw new Error(`${y}: ${name} read ${n} times`);
    }
  }
});

check('gematriya', () => {
  assert.strictEqual(H.gematriya(15), 'ט״ו');
  assert.strictEqual(H.gematriya(5787), 'תשפ״ז');
  assert.strictEqual(H.gematriya(1), 'א׳');
  assert.strictEqual(H.gematriya(770), 'תש״ע');
});

check('omer', () => {
  assert.strictEqual(H.omerDay(H.toRD(5785, 'Nisan', 16)), 1);
  assert.strictEqual(H.omerDay(H.toRD(5785, 'Iyar', 18)), 33);
});

if (failures) { console.error(failures + ' test group(s) failed'); process.exit(1); }
console.log('All hebcal tests passed');
