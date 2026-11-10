/*
 * Sample class for "Try it with a sample class".
 * All names, phone numbers and emails are made up (555 numbers, example.com).
 */
(function () {
  'use strict';

  // [first, last, Hebrew name, father's Hebrew name, father, mother, nickname-ish note]
  var KIDS = [
    ['Avraham', 'Adler', 'אברהם', 'משה', 'Moshe', 'Rivka', 'Wears glasses – seat him in the front row.'],
    ['Yitzchak', 'Levy', 'יצחק', 'דוד', 'Dovid', 'Sarah', ''],
    ['Yaakov', 'Friedman', 'יעקב', 'שמואל', 'Shmuel', 'Leah', 'Goes by "Yanky". Loves being chazan – great motivator.'],
    ['Moshe', 'Goldberg', 'משה', 'חיים', 'Chaim', 'Chana', 'Extra kriah help with Morah Feldman, Tuesday & Thursday.'],
    ['Moshe', 'Katz', 'משה', 'יוסף', 'Yosef', 'Miriam', 'PEANUT ALLERGY – EpiPen in office.'],
    ['Dovid', 'Rosen', 'דוד', 'אליעזר', 'Eliezer', 'Esther', 'New this year (moved from Lakewood). Making friends nicely.'],
    ['Shmuel', 'Weiss', 'שמואל', 'בנימין', 'Binyamin', 'Devorah', ''],
    ['Mordechai', 'Klein', 'מרדכי', 'אהרן', 'Aharon', 'Rochel', 'Very bright – give him a "challenge kasha" to keep him busy.'],
    ['Eliyahu', 'Schwartz', 'אליהו', 'מנחם', 'Menachem', 'Bracha', 'Twin brother Elchanan is in Kitah Daled.'],
    ['Chaim', 'Stern', 'חיים', 'יהודה', 'Yehuda', 'Shira', ''],
    ['Binyamin', 'Gross', 'בנימין', 'זאב', 'Zev', 'Tzipora', 'Responds well to responsibility – make him a monitor.'],
    ['Nachum', 'Berger', 'נחום', 'פינחס', 'Pinchas', 'Malka', ''],
    ['Yosef', 'Weber', 'יוסף', 'אברהם', 'Avraham', 'Gittel', 'Needs movement breaks; send him on errands.'],
    ['Aryeh', 'Halpern', 'אריה', 'ישראל', 'Yisroel', 'Basya', ''],
    ['Menachem', 'Fisher', 'מנחם', 'שלמה', 'Shlomo', 'Perel', 'Father is a rebbi in the high school – very involved.'],
    ['Tzvi', 'Lowenstein', 'צבי', 'נפתלי', 'Naftali', 'Yehudis', 'Quiet – encourage him to answer.']
  ];
  var STREETS = ['Maple Ave', 'Oak St', 'Cedar Lane', 'Elm Ct', 'Birch Rd', 'Willow Dr', 'Pine St', 'Chestnut Ave'];

  var DINIM = [
    'Brachos: Hamotzi vs. Mezonos – which bracha comes first',
    'Netilas yadayim in the morning – why and how',
    'Kibud av va\'em – standing up for a parent',
    'Hachanos for Shabbos – what we do on Erev Shabbos',
    'Bracha achrona: Al hamichya vs. Borei nefashos',
    'Hilchos davening: kavana in Shema',
    'Muktzah basics',
    'Bein adam lachaveiro: lashon hara for kids'
  ];
  var DAVENING = [
    'Shacharis: focus on Modeh Ani & Birchos Hashachar',
    'Shacharis: answering Amen – "Amen" contest',
    'Shacharis: Ashrei slowly, one pasuk at a time',
    'Shacharis: Shema – cover eyes, kavana for pasuk 1',
    'Shacharis: Shemoneh Esrei – feet together, no talking'
  ];
  var MISHNAYOS = [
    ['Brachos 1:1', 'From when do we say Shema at night?'],
    ['Brachos 1:2', 'From when do we say Shema in the morning?'],
    ['Brachos 1:3', 'Beis Shammai & Beis Hillel – how we say Shema'],
    ['Brachos 1:4', 'The brachos before and after Shema'],
    ['Brachos 1:5', 'Remembering yetzias Mitzrayim at night'],
    ['Brachos 2:1', 'Kavana when saying Shema']
  ];
  var STORIES = [
    'Story: the Chofetz Chaim and the honest wagon driver',
    'Story: Rabbi Akiva and the drop of water on the stone',
    'Story: Hillel on the roof in the snow',
    'Story: Reb Aryeh Levin\'s visits to the prisoners'
  ];

  function pad(n) { return String(n).padStart(2, '0'); }

  function build(state, uid, todayISO) {
    var H = window.HebCal;
    var today = todayISO();
    var todayRD = H.isoToRD(today);
    var thisYear = new Date().getFullYear();

    // ---------- talmidim ----------
    state.talmidim = KIDS.map(function (k, i) {
      var month = (i * 7) % 12 + 1, day = (i * 11) % 27 + 1;
      return {
        id: uid(), first: k[0], last: k[1], hebName: k[2] + ' בן ' + k[3],
        father: k[4] + ' ' + k[1], mother: k[5] + ' ' + k[1],
        phone: '(555) 01' + pad(10 + i) + '-' + (2000 + i * 37),
        phone2: i % 3 === 0 ? '(555) 01' + pad(40 + i) + '-' + (3100 + i * 13) : '',
        email: k[4].toLowerCase() + '.' + k[1].toLowerCase() + '@example.com',
        address: (100 + i * 17) + ' ' + STREETS[i % STREETS.length],
        birthday: (thisYear - 9 + (month > 8 ? -1 : 0)) + '-' + pad(month) + '-' + pad(day),
        notes: k[6], archived: false
      };
    });
    var t = state.talmidim;
    var byFirst = function (first, last) { return t.find(function (s) { return s.first === first && (!last || s.last === last); }); };

    state.settings.rebbiName = 'Rabbi Cohen';
    state.settings.className = 'Kitah Gimmel';
    state.settings.school = 'Yeshiva Ketana (Sample)';
    state.settings.setupDone = true;

    // ---------- school days around today ----------
    function isSchoolDay(rd) {
      var wd = H.weekday(rd);
      if (wd === 6) return false;
      return !H.holidaysBetween(rd, rd).some(function (x) { return x.yomTov || x.cholHamoed; });
    }
    var sunday = todayRD - H.weekday(todayRD);

    // ---------- lesson plans: last week, this week, next week ----------
    var mishnaIdx = 0, dinIdx = 0, storyIdx = 0;
    for (var w = -1; w <= 1; w++) {
      var sun = sunday + 7 * w;
      var parsha = H.parshaForShabbos(sun + 6);
      var pName = parsha.holiday ? 'chazara' : 'Parshas ' + parsha.en;
      for (var d = 0; d < 6; d++) {
        var rd = sun + d;
        if (!isSchoolDay(rd)) continue;
        var iso = H.rdToISO(rd);
        var past = rd < todayRD;
        var add = function (subject, plan, notes) {
          state.lessons.push({ id: uid(), date: iso, subject: subject, plan: plan, notes: past ? (notes || '') : '', done: past });
        };
        if (d === 5) { // Friday: short day
          add('Davening', 'Shacharis + Tehillim for cholim');
          add('Parsha', pName + ' – review the whole week, hand out parsha sheet for the Shabbos table',
            'Sheets went home. Remind parents in Sunday note.');
          add('Dinim', DINIM[3]);
          add('Story', STORIES[storyIdx++ % STORIES.length] + ' – then Shabbos songs');
          continue;
        }
        var p1 = d * 5 + 1;
        add('Davening', DAVENING[d % DAVENING.length]);
        add('Chumash', pName + ': pesukim ' + p1 + '–' + (p1 + 4) +
          ' – read inside, translate word by word, ' + (d % 2 ? 'Rashi on pasuk ' + (p1 + 1) : 'chazara of yesterday first'),
          d % 2 ? 'Stopped at pasuk ' + (p1 + 3) + '. Finish tomorrow.' : 'Finished. Most of the class has the teitch down.');
        if (d !== 3) {
          var m = MISHNAYOS[mishnaIdx % MISHNAYOS.length];
          if (d === 1 || d === 4) mishnaIdx++;
          add('Mishnayos', m[0] + ' – ' + m[1], d === 4 ? 'Chazara contest – teams by rows.' : '');
        } else {
          add('Kriah', 'Kriah groups: nekudos review (segol / tzeirei), timed reading', 'Moshe G. improving!');
        }
        add('Dinim', DINIM[dinIdx++ % DINIM.length]);
      }
    }

    // ---------- limud units with mastery ----------
    var pThis = H.parshaForShabbos(sunday + 6), pLast = H.parshaForShabbos(sunday - 1);
    var units = [
      { subject: 'Chumash', title: pLast.holiday ? 'Chazara' : 'Parshas ' + pLast.en + ' – first aliyah', date: H.rdToISO(sunday - 7), base: 2 },
      { subject: 'Chumash', title: pThis.holiday ? 'Chazara' : 'Parshas ' + pThis.en + ' – first aliyah', date: H.rdToISO(sunday), base: 1 },
      { subject: 'Mishnayos', title: 'Brachos 1:1–1:2', date: H.rdToISO(sunday - 14), base: 2 },
      { subject: 'Mishnayos', title: 'Brachos 1:3–1:4', date: H.rdToISO(sunday - 7), base: 1 },
      { subject: 'Kriah', title: 'Nekudos: segol & tzeirei', date: H.rdToISO(sunday - 21), base: 2 }
    ];
    state.units = units.map(function (u, ui) {
      var unit = { id: uid(), subject: u.subject, title: u.title, date: u.date };
      state.mastery[unit.id] = {};
      t.forEach(function (s, i) {
        var lvl = u.base + ((i * 3 + ui * 5) % 7 === 0 ? -1 : (i * 5 + ui) % 4 === 0 ? 1 : 0);
        if (s.first === 'Moshe' && s.last === 'Goldberg' && u.subject === 'Kriah') lvl = 1;
        if (s.first === 'Mordechai') lvl = 3;
        state.mastery[unit.id][s.id] = Math.max(0, Math.min(3, lvl));
      });
      return unit;
    });

    // ---------- attendance: last 12 school days ----------
    var days = [];
    for (var back = 1; days.length < 12 && back < 40; back++) if (isSchoolDay(todayRD - back)) days.push(todayRD - back);
    days.forEach(function (rd, di) {
      var rec = state.attendance[H.rdToISO(rd)] = {};
      t.forEach(function (s, i) {
        var v = 'P';
        if ((i * 7 + di * 3) % 41 === 0) v = 'A';
        else if ((i * 5 + di) % 29 === 0) v = 'L';
        rec[s.id] = v;
      });
    });
    var yesterday = state.attendance[H.rdToISO(days[0])];
    if (yesterday) { yesterday[byFirst('Chaim').id] = 'A'; yesterday[byFirst('Aryeh').id] = 'L'; }

    // ---------- bechinos ----------
    var tests = [
      { title: 'Parshas ' + (pLast.holiday ? 'review' : pLast.en) + ' bechina', subject: 'Chumash', date: H.rdToISO(days[1] || todayRD), max: 100 },
      { title: 'Brachos perek 1 – mishnayos 1-2', subject: 'Mishnayos', date: H.rdToISO(days[6] || todayRD), max: 20 },
      { title: 'Kriah check', subject: 'Kriah', date: H.rdToISO(days[10] || todayRD), max: 10 }
    ];
    state.tests = tests.map(function (x, ti) {
      var test = Object.assign({ id: uid() }, x);
      state.scores[test.id] = {};
      t.forEach(function (s, i) {
        var pct = 0.72 + ((i * 13 + ti * 7) % 28) / 100;
        if (s.first === 'Mordechai') pct = 1;
        state.scores[test.id][s.id] = Math.round(pct * x.max);
      });
      return test;
    });

    // ---------- parent contacts ----------
    var c = function (first, last, back, method, note, followDays) {
      var s = byFirst(first, last);
      state.contacts.push({
        id: uid(), talmidId: s.id, date: H.rdToISO(todayRD - back), method: method, note: note,
        followUp: followDays !== undefined ? H.rdToISO(todayRD + followDays) : '', followUpDone: false
      });
    };
    c('Moshe', 'Goldberg', 9, 'Phone call', 'Discussed kriah progress with Mrs. Goldberg. She will practice 10 minutes a night.', 1);
    c('Dovid', 'Rosen', 6, 'In person', 'Mr. Rosen at pickup – Dovid is happy and settling in well.');
    c('Yaakov', 'Friedman', 4, 'Text', 'Nachas text: Yanky led the davening beautifully.');
    c('Yosef', 'Weber', 2, 'Phone call', 'Spoke about restlessness after lunch. Agreed to try movement breaks and check in next week.', 5);
    c('Chaim', 'Stern', 1, 'Text', 'Absent – mother says he has a fever. Sent home the parsha sheet.', 0);

    // ---------- report comments & notes ----------
    state.comments[byFirst('Mordechai').id] = 'Mordechai is a true masmid. His questions show deep thinking and he is always ready to help a friend.';
    state.comments[byFirst('Dovid').id] = 'Dovid has adjusted wonderfully to our class. He participates with enthusiasm and his kriah has improved greatly.';
    state.comments[byFirst('Yaakov').id] = 'Yanky davens with real feeling and is a leader in the class. Keep up the chazara at home!';
    state.notes.push(
      { id: uid(), date: H.rdToISO(todayRD - 1), text: 'Order more prizes for the prize box.' },
      { id: uid(), date: today, text: 'Ask the office for extra copies of the parsha sheet.' }
    );

    // Jobs this week
    state.jobs.forEach(function (j, i) { j.holder = t[(i * 3) % t.length].id; });
  }

  window.DemoData = { build: build };
})();
