/*
 * Hebrew calendar, parsha and yomim tovim calculations.
 * Self-contained (no dependencies). Calculations follow the standard
 * arithmetic of the fixed Hebrew calendar (see Reingold & Dershowitz,
 * "Calendrical Calculations"). Parsha schedule is for chutz la'aretz.
 *
 * Works in the browser (window.HebCal) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  var EPOCH = -1373427; // R.D. of 1 Tishrei, year 1
  var UNIX_EPOCH_RD = 719163; // R.D. of 1970-01-01

  // ---------- core arithmetic ----------
  function mod(a, b) { return a - b * Math.floor(a / b); }

  function isLeap(y) { return mod(7 * y + 1, 19) < 7; }

  function elapsedDays(y) {
    var months = Math.floor((235 * y - 234) / 19);
    var parts = 12084 + 13753 * months;
    var day = months * 29 + Math.floor(parts / 25920);
    return mod(3 * (day + 1), 7) < 3 ? day + 1 : day;
  }

  function yearCorrection(y) {
    var ny0 = elapsedDays(y - 1), ny1 = elapsedDays(y), ny2 = elapsedDays(y + 1);
    if (ny2 - ny1 === 356) return 2;
    if (ny1 - ny0 === 382) return 1;
    return 0;
  }

  var nyCache = {};
  function newYear(y) {
    if (nyCache[y] === undefined) nyCache[y] = EPOCH + elapsedDays(y) + yearCorrection(y);
    return nyCache[y];
  }

  function daysInYear(y) { return newYear(y + 1) - newYear(y); }

  var MONTH_HE = {
    Tishrei: 'תשרי', Cheshvan: 'חשון', Kislev: 'כסלו', Teves: 'טבת', Shevat: 'שבט',
    Adar: 'אדר', 'Adar I': 'אדר א׳', 'Adar II': 'אדר ב׳', Nisan: 'ניסן', Iyar: 'אייר',
    Sivan: 'סיון', Tammuz: 'תמוז', Av: 'אב', Elul: 'אלול'
  };

  // Months of a Hebrew year in order (Tishrei first) with lengths.
  function monthsOfYear(y) {
    var len = daysInYear(y);
    var r = mod(len, 10); // 3 = deficient, 4 = regular, 5 = complete
    var list = [
      ['Tishrei', 30],
      ['Cheshvan', r === 5 ? 30 : 29],
      ['Kislev', r === 3 ? 29 : 30],
      ['Teves', 29],
      ['Shevat', 30]
    ];
    if (isLeap(y)) list.push(['Adar I', 30], ['Adar II', 29]);
    else list.push(['Adar', 29]);
    list.push(['Nisan', 30], ['Iyar', 29], ['Sivan', 30], ['Tammuz', 29], ['Av', 30], ['Elul', 29]);
    return list;
  }

  function normalizeMonth(y, month) {
    if (month === 'Adar' && isLeap(y)) return 'Adar II';
    if ((month === 'Adar I' || month === 'Adar II') && !isLeap(y)) return 'Adar';
    return month;
  }

  function toRD(y, month, day) {
    month = normalizeMonth(y, month);
    var rd = newYear(y);
    var months = monthsOfYear(y);
    for (var i = 0; i < months.length; i++) {
      if (months[i][0] === month) return rd + day - 1;
      rd += months[i][1];
    }
    throw new Error('Bad month ' + month);
  }

  function fromRD(rd) {
    var y = Math.floor((rd - EPOCH) / 365.2468) + 1;
    while (newYear(y) > rd) y--;
    while (newYear(y + 1) <= rd) y++;
    var d = rd - newYear(y);
    var months = monthsOfYear(y);
    for (var i = 0; i < months.length; i++) {
      if (d < months[i][1]) return { year: y, month: months[i][0], day: d + 1, rd: rd };
      d -= months[i][1];
    }
    throw new Error('fromRD overflow');
  }

  // ---------- Gregorian <-> RD (local calendar date, timezone-safe) ----------
  function dateToRD(date) {
    var utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round(utc / 86400000) + UNIX_EPOCH_RD;
  }
  function rdToDate(rd) {
    var d = new Date((rd - UNIX_EPOCH_RD) * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function isoToRD(iso) {
    var p = iso.split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000) + UNIX_EPOCH_RD;
  }
  function rdToISO(rd) {
    var d = new Date((rd - UNIX_EPOCH_RD) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function weekday(rd) { return mod(rd, 7); } // 0 = Sunday ... 6 = Shabbos

  // ---------- gematria ----------
  var ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  var TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  var HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

  function gematriya(n, opts) {
    opts = opts || {};
    n = Math.floor(n);
    if (n <= 0) return String(n);
    var thousands = Math.floor(n / 1000);
    n = n % 1000;
    var s = '';
    while (n >= 400) { s += 'ת'; n -= 400; }
    if (n >= 100) { s += HUNDREDS[Math.floor(n / 100)]; n %= 100; }
    if (n === 15) s += 'טו';
    else if (n === 16) s += 'טז';
    else {
      if (n >= 10) { s += TENS[Math.floor(n / 10)]; n %= 10; }
      s += ONES[n];
    }
    if (!opts.noPunct) {
      if (s.length === 1) s += '׳';
      else s = s.slice(0, -1) + '״' + s.slice(-1);
    }
    if (thousands && opts.thousands) s = ONES[thousands] + '׳' + s;
    return s;
  }

  // ---------- parshiyos ----------
  var PARSHIYOS = [
    ['Bereishis', 'בראשית'], ['Noach', 'נח'], ['Lech Lecha', 'לך לך'], ['Vayeira', 'וירא'],
    ['Chayei Sarah', 'חיי שרה'], ['Toldos', 'תולדות'], ['Vayeitzei', 'ויצא'], ['Vayishlach', 'וישלח'],
    ['Vayeishev', 'וישב'], ['Mikeitz', 'מקץ'], ['Vayigash', 'ויגש'], ['Vayechi', 'ויחי'],
    ['Shemos', 'שמות'], ['Va\'eira', 'וארא'], ['Bo', 'בא'], ['Beshalach', 'בשלח'],
    ['Yisro', 'יתרו'], ['Mishpatim', 'משפטים'], ['Terumah', 'תרומה'], ['Tetzaveh', 'תצוה'],
    ['Ki Sisa', 'כי תשא'], ['Vayakhel', 'ויקהל'], ['Pekudei', 'פקודי'],
    ['Vayikra', 'ויקרא'], ['Tzav', 'צו'], ['Shemini', 'שמיני'], ['Tazria', 'תזריע'],
    ['Metzora', 'מצורע'], ['Acharei Mos', 'אחרי מות'], ['Kedoshim', 'קדושים'], ['Emor', 'אמור'],
    ['Behar', 'בהר'], ['Bechukosai', 'בחקתי'],
    ['Bamidbar', 'במדבר'], ['Nasso', 'נשא'], ['Beha\'aloscha', 'בהעלתך'], ['Shelach', 'שלח'],
    ['Korach', 'קרח'], ['Chukas', 'חקת'], ['Balak', 'בלק'], ['Pinchas', 'פינחס'],
    ['Matos', 'מטות'], ['Masei', 'מסעי'],
    ['Devarim', 'דברים'], ['Va\'eschanan', 'ואתחנן'], ['Eikev', 'עקב'], ['Re\'eh', 'ראה'],
    ['Shoftim', 'שופטים'], ['Ki Seitzei', 'כי תצא'], ['Ki Savo', 'כי תבוא'], ['Nitzavim', 'נצבים'],
    ['Vayeilech', 'וילך'], ['Ha\'azinu', 'האזינו'], ['V\'zos Habracha', 'וזאת הברכה']
  ];
  function P(name) {
    for (var i = 0; i < PARSHIYOS.length; i++) if (PARSHIYOS[i][0] === name) return i;
    throw new Error('Unknown parsha ' + name);
  }
  function range(a, b) { var r = []; for (var i = P(a); i <= P(b); i++) r.push([i]); return r; }

  // Combine adjacent pairs (given by first parsha name) in a list of reading slots.
  function combine(slots, firstNames) {
    var out = [];
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s.length === 1 && firstNames.indexOf(PARSHIYOS[s[0]][0]) >= 0 && i + 1 < slots.length) {
        out.push([s[0], slots[i + 1][0]]);
        i++;
      } else out.push(s);
    }
    return out;
  }

  // Fit a list of readings into a number of available Shabbosos by combining
  // pairs in the given priority order.
  function fit(slots, count, priority, warnings, label) {
    var need = slots.length - count;
    if (need < 0 || need > priority.length) {
      warnings.push(label + ': ' + slots.length + ' readings for ' + count + ' Shabbosos');
      need = Math.max(0, Math.min(need, priority.length));
    }
    return combine(slots, priority.slice(0, need));
  }

  // Shabbos is "blocked" by Yom Tov (chutz la'aretz).
  function yomTovOnShabbos(h) {
    var m = h.month, d = h.day;
    if (m === 'Tishrei' && (d <= 2 || d === 10 || (d >= 15 && d <= 23))) return true;
    if (m === 'Nisan' && d >= 15 && d <= 22) return true;
    if (m === 'Sivan' && (d === 6 || d === 7)) return true;
    return false;
  }

  function shabbososBetween(fromRD, toRD) { // inclusive, excluding Yom Tov
    var first = fromRD + mod(6 - weekday(fromRD), 7);
    var out = [];
    for (var rd = first; rd <= toRD; rd += 7) if (!yomTovOnShabbos(fromRD_(rd))) out.push(rd);
    return out;
  }
  var fromRD_ = fromRD;

  var cycleCache = {};
  // Readings from Bereishis (after Simchas Torah of year y) until Rosh Hashana of y+1.
  function parshaCycle(y) {
    if (cycleCache[y]) return cycleCache[y];
    var warnings = [];
    var leap = isLeap(y);
    var start = toRD(y, 'Tishrei', 24);
    var pesach = toRD(y, 'Nisan', 15);
    var shavuos = toRD(y, 'Sivan', 6);
    var av9 = toRD(y, 'Av', 9);
    var nextRH = newYear(y + 1);
    var rhNextDow = weekday(nextRH);

    var segs = [];
    if (leap) {
      // Leap year: nothing is combined before Shavuos; the extra Shabbosos are
      // absorbed by reading Acharei Mos before Pesach / Nasso before Shavuos
      // when needed. Only Matos-Masei and Chukas-Balak may combine.
      var sL = shabbososBetween(start, av9);
      segs.push([sL, fit(range('Bereishis', 'Devarim'), sL.length, ['Matos', 'Chukas'], warnings, 'Bereishis-Devarim')]);
    } else {
      // Regular year: Tzav is read on Shabbos HaGadol ...
      var s1 = shabbososBetween(start, pesach - 1);
      segs.push([s1, fit(range('Bereishis', 'Tzav'), s1.length, ['Vayakhel'], warnings, 'Pre-Pesach')]);
      // ... and Bamidbar right before Shavuos (always 6 Shabbosos in between).
      var s2 = shabbososBetween(pesach + 8, shavuos - 1);
      segs.push([s2, fit(range('Shemini', 'Bamidbar'), s2.length, ['Tazria', 'Acharei Mos', 'Behar'], warnings, 'Sefirah')]);
      // Then through Devarim on Shabbos Chazon.
      var s3 = shabbososBetween(shavuos + 2, av9);
      segs.push([s3, fit(range('Nasso', 'Devarim'), s3.length, ['Matos', 'Chukas'], warnings, 'Summer')]);
    }

    // Segment 4: Va'eschanan .. before Rosh Hashana
    var s4 = shabbososBetween(av9 + 1, nextRH - 1);
    var r4 = range('Va\'eschanan', 'Nitzavim');
    if (!(rhNextDow === 1 || rhNextDow === 2)) r4[r4.length - 1] = [P('Nitzavim'), P('Vayeilech')];
    r4 = fit(r4, s4.length, [], warnings, 'Elul');

    var map = {};
    segs.push([s4, r4]);
    segs.forEach(function (pair) {
      pair[0].forEach(function (rd, i) { if (pair[1][i]) map[rd] = pair[1][i]; });
    });
    cycleCache[y] = { map: map, warnings: warnings };
    return cycleCache[y];
  }

  function parshaName(ids, lang) {
    var idx = lang === 'he' ? 1 : 0;
    return ids.map(function (i) { return PARSHIYOS[i][idx]; }).join('-');
  }

  // Holiday name for a Yom Tov Shabbos (chutz la'aretz).
  function shabbosHolidayName(h) {
    var m = h.month, d = h.day;
    if (m === 'Tishrei') {
      if (d <= 2) return ['Rosh Hashana', 'ראש השנה'];
      if (d === 10) return ['Yom Kippur', 'יום כיפור'];
      if (d === 15 || d === 16) return ['Sukkos', 'סוכות'];
      if (d >= 17 && d <= 21) return ['Shabbos Chol Hamoed Sukkos', 'שבת חול המועד סוכות'];
      if (d === 22) return ['Shemini Atzeres', 'שמיני עצרת'];
      if (d === 23) return ['Simchas Torah', 'שמחת תורה'];
    }
    if (m === 'Nisan') {
      if (d === 15 || d === 16) return ['Pesach', 'פסח'];
      if (d >= 17 && d <= 20) return ['Shabbos Chol Hamoed Pesach', 'שבת חול המועד פסח'];
      if (d === 21) return ['Shvi\'i shel Pesach', 'שביעי של פסח'];
      return ['Acharon shel Pesach', 'אחרון של פסח'];
    }
    if (m === 'Sivan') return ['Shavuos', 'שבועות'];
    return null;
  }

  /**
   * Reading for a given Shabbos (R.D.). Returns
   * { en, he, ids, holiday:boolean, rd }
   */
  function parshaForShabbos(rd) {
    var h = fromRD(rd);
    var hol = yomTovOnShabbos(h) ? shabbosHolidayName(h) : null;
    if (hol) return { en: hol[0], he: hol[1], ids: [], holiday: true, rd: rd };
    var ids;
    if (h.month === 'Tishrei' && h.day < 24) {
      // Between Rosh Hashana and Sukkos: Vayeilech and/or Ha'azinu
      var rhDow = weekday(newYear(h.year));
      if ((rhDow === 1 || rhDow === 2) && h.day <= 9) ids = [P('Vayeilech')];
      else ids = [P('Ha\'azinu')];
    } else {
      ids = parshaCycle(h.year).map[rd];
    }
    if (!ids) return { en: '', he: '', ids: [], holiday: false, rd: rd };
    return { en: parshaName(ids, 'en'), he: parshaName(ids, 'he'), ids: ids, holiday: false, rd: rd };
  }

  function upcomingShabbos(rd) { return rd + mod(6 - weekday(rd), 7); }

  // The parsha of the week: the next regular reading on/after the given day.
  function parshaOfWeek(rd) {
    var s = upcomingShabbos(rd);
    var p = parshaForShabbos(s);
    p.shabbosRD = s;
    return p;
  }

  // ---------- yomim tovim & special days (chutz la'aretz) ----------
  function holidaysForYear(y) {
    var list = [];
    function add(month, day, en, he, opts) {
      var rd = toRD(y, month, day);
      list.push(Object.assign({ rd: rd, en: en, he: he }, opts || {}));
    }
    function fast(month, day, en, he) {
      var rd = toRD(y, month, day);
      if (weekday(rd) === 6) rd += 1; // pushed to Sunday
      list.push({ rd: rd, en: en, he: he, fast: true });
    }
    add('Tishrei', 1, 'Rosh Hashana I', 'א׳ דראש השנה', { yomTov: true });
    add('Tishrei', 2, 'Rosh Hashana II', 'ב׳ דראש השנה', { yomTov: true });
    var g = toRD(y, 'Tishrei', 3); if (weekday(g) === 6) g++;
    list.push({ rd: g, en: 'Tzom Gedaliah', he: 'צום גדליה', fast: true });
    add('Tishrei', 10, 'Yom Kippur', 'יום כיפור', { yomTov: true, fast: true });
    add('Tishrei', 15, 'Sukkos I', 'א׳ דסוכות', { yomTov: true });
    add('Tishrei', 16, 'Sukkos II', 'ב׳ דסוכות', { yomTov: true });
    for (var d = 17; d <= 20; d++) add('Tishrei', d, 'Chol Hamoed Sukkos', 'חול המועד סוכות', { cholHamoed: true });
    add('Tishrei', 21, 'Hoshana Rabbah', 'הושענא רבה', { cholHamoed: true });
    add('Tishrei', 22, 'Shemini Atzeres', 'שמיני עצרת', { yomTov: true });
    add('Tishrei', 23, 'Simchas Torah', 'שמחת תורה', { yomTov: true });
    var kislevLen = monthsOfYear(y)[2][1];
    for (var c = 1; c <= 8; c++) {
      var cd = 24 + c; // night of 24 Kislev is the first candle
      var rd = toRD(y, 'Kislev', 1) + cd - 1;
      list.push({ rd: rd, en: 'Chanukah: ' + c + ' candle' + (c > 1 ? 's' : '') + ' (lit night before)',
        he: 'חנוכה – נר ' + gematriya(c), chanukah: c });
    }
    void kislevLen;
    add('Teves', 10, 'Asarah B\'Teves', 'עשרה בטבת', { fast: true });
    add('Shevat', 15, 'Tu B\'Shvat', 'ט״ו בשבט', {});
    var adar = isLeap(y) ? 'Adar II' : 'Adar';
    if (isLeap(y)) {
      add('Adar I', 14, 'Purim Katan', 'פורים קטן', {});
    }
    var te = toRD(y, adar, 13); if (weekday(te) === 6) te -= 2;
    list.push({ rd: te, en: 'Taanis Esther', he: 'תענית אסתר', fast: true });
    add(adar, 14, 'Purim', 'פורים', {});
    add(adar, 15, 'Shushan Purim', 'שושן פורים', {});
    add('Nisan', 14, 'Erev Pesach', 'ערב פסח', {});
    add('Nisan', 15, 'Pesach I', 'א׳ דפסח', { yomTov: true });
    add('Nisan', 16, 'Pesach II', 'ב׳ דפסח', { yomTov: true });
    for (d = 17; d <= 20; d++) add('Nisan', d, 'Chol Hamoed Pesach', 'חול המועד פסח', { cholHamoed: true });
    add('Nisan', 21, 'Shvi\'i shel Pesach', 'שביעי של פסח', { yomTov: true });
    add('Nisan', 22, 'Acharon shel Pesach', 'אחרון של פסח', { yomTov: true });
    add('Iyar', 14, 'Pesach Sheni', 'פסח שני', {});
    add('Iyar', 18, 'Lag BaOmer', 'ל״ג בעומר', {});
    add('Sivan', 5, 'Erev Shavuos', 'ערב שבועות', {});
    add('Sivan', 6, 'Shavuos I', 'א׳ דשבועות', { yomTov: true });
    add('Sivan', 7, 'Shavuos II', 'ב׳ דשבועות', { yomTov: true });
    fast('Tammuz', 17, 'Shiva Asar B\'Tammuz', 'שבעה עשר בתמוז');
    fast('Av', 9, 'Tisha B\'Av', 'תשעה באב');
    add('Av', 15, 'Tu B\'Av', 'ט״ו באב', {});
    add('Elul', 29, 'Erev Rosh Hashana', 'ערב ראש השנה', {});

    // Rosh Chodesh
    var months = monthsOfYear(y);
    var rdm = newYear(y);
    for (var i = 0; i < months.length; i++) {
      var name = months[i][0];
      if (i > 0) {
        var prevLen = months[i - 1][1];
        if (prevLen === 30) list.push({ rd: rdm - 1, en: 'Rosh Chodesh ' + name, he: 'ראש חודש ' + MONTH_HE[name], roshChodesh: true });
        list.push({ rd: rdm, en: 'Rosh Chodesh ' + name, he: 'ראש חודש ' + MONTH_HE[name], roshChodesh: true });
      }
      rdm += months[i][1];
    }
    return list.sort(function (a, b) { return a.rd - b.rd; });
  }

  function holidaysBetween(fromRD, toRD) {
    var y1 = fromRD_(fromRD).year, y2 = fromRD_(toRD).year;
    var out = [];
    for (var y = y1; y <= y2; y++) {
      holidaysForYear(y).forEach(function (h) { if (h.rd >= fromRD && h.rd <= toRD) out.push(h); });
    }
    return out;
  }

  // Days melacha is forbidden (Shabbos or Yom Tov, chutz la'aretz): returns the day's name, or '' if it's a weekday.
  // Chol Hamoed and minor days don't count.
  function noMelacha(rd) {
    var yt = holidaysBetween(rd, rd).filter(function (x) { return x.yomTov; })[0];
    if (yt) return yt.en;
    return weekday(rd) === 6 ? 'Shabbos' : '';
  }

  // Sefiras HaOmer: day counted on the NIGHT that begins the civil date's evening.
  function omerDay(rd) {
    var h = fromRD(rd);
    var start = toRD(h.year, 'Nisan', 16);
    var n = rd - start + 1;
    return n >= 1 && n <= 49 ? n : 0;
  }

  // ---------- formatting ----------
  function formatHebrew(h, opts) {
    opts = opts || {};
    var s = gematriya(h.day) + ' ' + MONTH_HE[h.month];
    if (!opts.noYear) s += ' ' + gematriya(h.year);
    return s;
  }
  function formatEnglish(h, opts) {
    opts = opts || {};
    return h.day + ' ' + h.month + (opts.noYear ? '' : ' ' + h.year);
  }

  // Next anniversary (e.g. Hebrew birthday) on or after rd.
  function nextHebrewAnniversary(origRD, rd) {
    var o = fromRD(origRD);
    var y = fromRD(rd).year;
    for (var k = 0; k < 3; k++) {
      var yy = y + k;
      var month = o.month;
      if (month === 'Adar I' || month === 'Adar II') month = isLeap(yy) ? month : 'Adar';
      else if (month === 'Adar' && isLeap(yy)) month = 'Adar II';
      var day = o.day;
      var len = monthsOfYear(yy).filter(function (m) { return m[0] === normalizeMonth(yy, month); })[0][1];
      if (day > len) day = len;
      var cand = toRD(yy, month, day);
      if (cand >= rd) return cand;
    }
    return null;
  }

  var api = {
    isLeap: isLeap, newYear: newYear, daysInYear: daysInYear, monthsOfYear: monthsOfYear,
    toRD: toRD, fromRD: fromRD, dateToRD: dateToRD, rdToDate: rdToDate, isoToRD: isoToRD,
    rdToISO: rdToISO, weekday: weekday, gematriya: gematriya, MONTH_HE: MONTH_HE,
    PARSHIYOS: PARSHIYOS, parshaForShabbos: parshaForShabbos, parshaOfWeek: parshaOfWeek,
    parshaCycle: parshaCycle, upcomingShabbos: upcomingShabbos, holidaysForYear: holidaysForYear,
    holidaysBetween: holidaysBetween, noMelacha: noMelacha, omerDay: omerDay, formatHebrew: formatHebrew,
    formatEnglish: formatEnglish, nextHebrewAnniversary: nextHebrewAnniversary
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HebCal = api;
})(typeof window !== 'undefined' ? window : this);
