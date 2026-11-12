/*
 * Sample classes for grades 1-8 (Kitah Alef - Kitah Ches).
 * All names, phone numbers and emails are made up (555 numbers, example.com).
 */
(function () {
  'use strict';

  // [English, Hebrew]
  var FIRST = [
    ['Avraham', 'אברהם'], ['Yitzchak', 'יצחק'], ['Yaakov', 'יעקב'], ['Moshe', 'משה'], ['Aharon', 'אהרן'], ['Dovid', 'דוד'],
    ['Shmuel', 'שמואל'], ['Mordechai', 'מרדכי'], ['Eliyahu', 'אליהו'], ['Chaim', 'חיים'], ['Binyamin', 'בנימין'], ['Nachum', 'נחום'],
    ['Yosef', 'יוסף'], ['Aryeh', 'אריה'], ['Menachem', 'מנחם'], ['Tzvi', 'צבי'], ['Yehuda', 'יהודה'], ['Shlomo', 'שלמה'],
    ['Naftali', 'נפתלי'], ['Ephraim', 'אפרים'], ['Meir', 'מאיר'], ['Yisroel', 'ישראל'], ['Pinchas', 'פינחס'], ['Zev', 'זאב']
  ];
  var LAST = ['Adler', 'Berger', 'Cohen', 'Fisher', 'Friedman', 'Goldberg', 'Gross', 'Halpern', 'Katz', 'Klein', 'Levy', 'Lowenstein',
    'Rosen', 'Schwartz', 'Stern', 'Weber', 'Weiss', 'Feldman', 'Greenberg', 'Kaplan', 'Perlman', 'Rubin', 'Shapiro', 'Wolf'];
  var MOTHERS = ['Rivka', 'Sarah', 'Leah', 'Chana', 'Miriam', 'Esther', 'Devorah', 'Rochel', 'Bracha', 'Shira', 'Tzipora', 'Malka',
    'Gittel', 'Basya', 'Perel', 'Yehudis'];
  // Families with boys in more than one class (made-up names and numbers). members: grade -> [which boy in that class, his name].
  var SIBLINGS = [
    { last: 'Brenner', father: ['Shmuel', 'שמואל'], mother: 'Chana', phone: '(555) 0170-4410', mphone: '(555) 0171-4411', street: '12 Maple Ave',
      members: { 1: [2, ['Yosef', 'יוסף']], 3: [5, ['Moshe', 'משה']], 6: [8, ['Eliyahu', 'אליהו']] } },
    { last: 'Mandel', father: ['Dovid', 'דוד'], mother: 'Leah', phone: '(555) 0172-4420', mphone: '(555) 0173-4421', street: '48 Oak St',
      members: { 2: [4, ['Chaim', 'חיים']], 5: [1, ['Yehuda', 'יהודה']] } },
    { last: 'Tauber', father: ['Meir', 'מאיר'], mother: 'Esther', phone: '(555) 0174-4430', mphone: '', street: '7 Cedar Lane',
      members: { 4: [6, ['Naftali', 'נפתלי']], 7: [3, ['Shlomo', 'שלמה']], 8: [10, ['Pinchas', 'פינחס']] } }
  ];
  // Make a sample boy part of one of the sibling families above (same parents, phones, email and address).
  function applySibling(t, grade, k) {
    var fam = SIBLINGS.filter(function (s) { return s.members[grade] && s.members[grade][0] === k; })[0];
    if (!fam) return t;
    var me = fam.members[grade][1];
    t.first = me[0]; t.last = fam.last;
    t.hebName = me[1] + ' בן ' + fam.father[1];
    t.father = fam.father[0] + ' ' + fam.last; t.mother = fam.mother + ' ' + fam.last;
    t.fatherPhone = fam.phone; t.motherPhone = fam.mphone;
    t.email = fam.father[0].toLowerCase() + '.' + fam.last.toLowerCase() + '@example.com';
    t.address = fam.street;
    return t;
  }
  var STREETS = ['Maple Ave', 'Oak St', 'Cedar Lane', 'Elm Ct', 'Birch Rd', 'Willow Dr', 'Pine St', 'Chestnut Ave'];
  var NOTES = [
    'Wears glasses – seat him in the front row.', '', 'Loves being chazan – great motivator.',
    'Extra kriah help with Morah Feldman, Tuesday & Thursday.', '',
    'New this year. Making friends nicely.', '', 'Very bright – give him a "challenge kasha" to keep him busy.',
    'Has a twin brother in the parallel class.', '', 'Responds well to responsibility – make him a monitor.', '',
    'Needs movement breaks; send him on errands.', '', 'Father is a rebbi in the high school – very involved.',
    'Quiet – encourage him to answer.', '', 'Takes the bus – must leave on time.'
  ];
  var STORIES = [
    'Story: the Chofetz Chaim and the honest wagon driver',
    'Story: Rabbi Akiva and the drop of water on the stone',
    'Story: Hillel on the roof in the snow',
    'Story: Reb Aryeh Levin\'s visits to the prisoners'
  ];
  var DAVENING = [
    'Shacharis: focus on Modeh Ani & Birchos Hashachar',
    'Shacharis: answering Amen – "Amen" contest',
    'Shacharis: Ashrei slowly, one pasuk at a time',
    'Shacharis: Shema – cover eyes, kavana for pasuk 1',
    'Shacharis: Shemoneh Esrei – feet together, no talking'
  ];

  // What each grade learns. The first three subjects get limud units and bechinos.
  var GRADES = {
    1: { className: 'Kitah Alef', rebbi: 'Rabbi Adler', size: 18, subjects: [
      { s: 'Kriah', items: ['Alef-Beis: letters א to ל', 'Alef-Beis: letters מ to ת and end letters', 'Nekudos: kamatz & patach', 'Nekudos: segol & tzeirei', 'Blending two-letter words', 'Reading the first lines of Modeh Ani'] },
      { s: 'Tefillah', items: ['Modeh Ani & Torah Tziva by heart', 'Shema: first pasuk with kavana', 'Brachos on food: Shehakol & Ha\'eitz', 'Birchos Hashachar: the first five brachos'] },
      { s: 'Parsha', items: ['{parsha}: the story, part 1 (with pictures)', '{parsha}: the story, part 2', '{parsha}: act it out', '{parsha}: parsha project', '{parsha}: review questions'] },
      { s: 'Yahadus', items: ['Negel vasser in the morning', 'Kibud av va\'em – listening the first time', 'Saying brachos out loud so others can answer Amen', 'Getting ready for Shabbos'] }
    ] },
    2: { className: 'Kitah Beis', rebbi: 'Rabbi Berger', size: 17, subjects: [
      { s: 'Chumash', items: ['Bereishis perek 1: pesukim 1–5 (first day)', 'Bereishis perek 1: pesukim 6–13', 'Bereishis perek 1: pesukim 14–23', 'Bereishis perek 1: pesukim 24–31', 'Bereishis perek 2: pesukim 1–3 (Shabbos)', 'Shorashim & prefixes: ו, ה, ב, ל'] },
      { s: 'Kriah', items: ['Fluency: timed reading of Ashrei', 'Sheva na & sheva nach', 'Reading with trop: first pasuk of Shema', 'Fluency: Aleinu', 'Dagesh: בּ / ב, כּ / כ, פּ / פ'] },
      { s: 'Parsha', items: ['{parsha}: main story and who is who', '{parsha}: a mitzvah from the parsha', '{parsha}: questions for the Shabbos table', '{parsha}: review'] },
      { s: 'Dinim', items: ['Brachos: Hamotzi and Mezonos', 'Bracha achrona: Borei nefashos', 'Hachanos for Shabbos', 'Netilas yadayim for bread'] }
    ] },
    3: { className: 'Kitah Gimmel', rebbi: 'Rabbi Cohen', size: 16, subjects: [
      { s: 'Chumash', items: ['Lech Lecha perek 12: pesukim 1–9', 'Lech Lecha perek 12: pesukim 10–20', 'Lech Lecha perek 13: pesukim 1–9', 'Lech Lecha perek 13: pesukim 10–18', 'First Rashis: perek 12 pasuk 1', 'Chazara: perek 12 with teitch'] },
      { s: 'Mishnayos', items: ['Brachos 1:1–1:2', 'Brachos 1:3–1:4', 'Brachos 1:5', 'Brachos 2:1–2:2', 'Brachos 2:3–2:4'] },
      { s: 'Kriah', items: ['Nekudos review: segol & tzeirei', 'Rashi letters: א to י', 'Rashi letters: כ to ת', 'Timed reading: Chumash pesukim'] },
      { s: 'Dinim', items: ['Which bracha comes first', 'Al hamichya vs. Borei nefashos', 'Kavana in Shema', 'Muktzah basics', 'Lashon hara for kids'] }
    ] },
    4: { className: 'Kitah Daled', rebbi: 'Rabbi Friedman', size: 17, subjects: [
      { s: 'Chumash', items: ['Shemos perek 1: pesukim 1–14', 'Shemos perek 1: pesukim 15–22', 'Shemos perek 2: pesukim 1–10', 'Shemos perek 2: pesukim 11–25', 'Rashi on perek 1 pasuk 8', 'Chazara: perek 1 inside'] },
      { s: 'Mishnayos', items: ['Rosh Hashana 1:1–1:2', 'Rosh Hashana 1:3–1:4', 'Rosh Hashana 1:5–1:6', 'Rosh Hashana 1:7–1:9', 'Rosh Hashana perek 1 chazara'] },
      { s: 'Navi', items: ['Yehoshua perek 1', 'Yehoshua perek 2: the meraglim and Rachav', 'Yehoshua perek 3: crossing the Yarden', 'Yehoshua perek 4: the twelve stones'] },
      { s: 'Dinim', items: ['Hilchos Shabbos: 39 melachos overview', 'Borer for children', 'Kiddush and Havdalah', 'Hilchos tefillah: where to daven'] }
    ] },
    5: { className: 'Kitah Hei', rebbi: 'Rabbi Goldberg', size: 16, subjects: [
      { s: 'Gemara', items: ['Eilu Metzios 21a: the mishna', 'Eilu Metzios 21a: "v\'kama?" – how much is scattered fruit', 'Eilu Metzios 21b: yiush shelo midaas, first tzad', 'Eilu Metzios 21b: Abaye and Rava', 'Gemara skills: key words (תנן, תניא, מאי טעמא)', 'Chazara: 21a inside with a chavrusa'] },
      { s: 'Chumash', items: ['Vayikra perek 19: pesukim 1–10', 'Vayikra perek 19: pesukim 11–18 with Rashi', 'Vayikra perek 19: pesukim 19–28', 'Vayikra perek 19: pesukim 29–37', 'Rashi chazara: "kedoshim tihyu"'] },
      { s: 'Mishnayos', items: ['Bava Metzia 2:1–2:2', 'Bava Metzia 2:3–2:5', 'Bava Metzia 2:6–2:8', 'Bava Metzia 2:9–2:11'] },
      { s: 'Navi', items: ['Shoftim perek 4: Devorah and Barak', 'Shoftim perek 6: Gidon', 'Shoftim perek 7: the three hundred', 'Shoftim perek 13: Shimshon'] }
    ] },
    6: { className: 'Kitah Vav', rebbi: 'Rabbi Halpern', size: 15, subjects: [
      { s: 'Gemara', items: ['Hamafkid 33b: the mishna', 'Hamafkid 33b–34a: "shilem v\'lo ratza lishava"', 'Hamafkid 34a: kefel to the shomer', 'Hamafkid 34b: Rashi inside', 'Chazara: the mishna and first sugya', 'Introducing Tosafos: first dibur hamaschil'] },
      { s: 'Chumash', items: ['Bamidbar perek 13: the meraglim, pesukim 1–20', 'Bamidbar perek 13: pesukim 21–33 with Rashi', 'Bamidbar perek 14: pesukim 1–10', 'Bamidbar perek 14: pesukim 11–25', 'Rashi chazara: perek 13'] },
      { s: 'Navi', items: ['Shmuel Alef perek 1: Chana', 'Shmuel Alef perek 3: Hashem calls Shmuel', 'Shmuel Alef perek 8: asking for a king', 'Shmuel Alef perek 9: Shaul'] },
      { s: 'Halacha', items: ['Kitzur: hilchos hashkamas haboker', 'Kitzur: hilchos tzitzis', 'Kitzur: hilchos tefillin (preparing for bar mitzvah)', 'Kitzur: hilchos brachos'] }
    ] },
    7: { className: 'Kitah Zayin', rebbi: 'Rabbi Katz', size: 15, subjects: [
      { s: 'Gemara', items: ['Bava Kamma 2a: the mishna – arba avos nezikin', 'Bava Kamma 2a–2b: avos and toldos', 'Bava Kamma 2b: toldos of keren', 'Bava Kamma 3a: shen and regel', 'Rashi and Tosafos on 2a', 'Chazara b\'al peh: 2a'] },
      { s: 'Chumash', items: ['Devarim perek 6 with Rashi', 'Devarim perek 8 with Rashi', 'Devarim perek 11: v\'haya im shamoa', 'Ramban on perek 6 pasuk 18 (selected)'] },
      { s: 'Halacha', items: ['Hilchos tefillin: placing the shel yad', 'Hilchos tefillin: the shel rosh and brachos', 'Hilchos krias haTorah: getting an aliyah', 'Hilchos tefillah b\'tzibur'] },
      { s: 'Navi', items: ['Melachim Alef perek 3: Shlomo\'s wisdom', 'Melachim Alef perek 8: the Beis Hamikdash', 'Melachim Alef perek 18: Eliyahu at Har HaCarmel'] }
    ] },
    8: { className: 'Kitah Ches', rebbi: 'Rabbi Klein', size: 14, subjects: [
      { s: 'Gemara', items: ['Kiddushin 2a: the mishna – ha\'isha niknis', 'Kiddushin 2a–2b: "derech" and "davar"', 'Kiddushin 2b: kesef from where?', 'Kiddushin 3a: the gezeira shava "kicha kicha"', 'Tosafos 2a d"h "b\'kesef"', 'Preparing a sugya b\'chavrusa before shiur'] },
      { s: 'Chumash', items: ['Shemos perek 20: Aseres Hadibros with Rashi', 'Shemos perek 21: pesukim 1–11 with Rashi', 'Shemos perek 21: pesukim 12–27', 'Ramban on Aseres Hadibros (selected)'] },
      { s: 'Halacha', items: ['Mishna Berura: hilchos Shabbos – hadlakas neiros', 'Mishna Berura: kiddush b\'makom seuda', 'Mishna Berura: hilchos bishul – kli rishon and sheni', 'Hilchos bein adam lachaveiro: ona\'as devarim'] },
      { s: 'Mussar', items: ['Mesilas Yesharim: introduction', 'Mesilas Yesharim: zehirus', 'Pirkei Avos 1:1–1:4', 'Preparing for mesivta: seder and hasmada'] }
    ] }
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  // Sample source notes so the demo limudim aren't empty.
  function sampleNotes(subject, title) {
    var byLine = {
      Chumash: ['Mareh mekomos: Rashi on the first pasuk; Ramban and Sforno on the main question.', 'Kasha to open with: why does the Torah tell us this here?', 'Word list for the sheet: 8 new shorashim.', 'Watch out: boys mix up the two similar pesukim – read them side by side.'],
      Gemara: ['Mareh mekomos: Rashi d"h on the mishna; Tosafos first d"h; Rambam for the halacha l\'maaseh.', 'Key words to drill: תנן, תניא, מאי טעמא, איבעיא להו.', 'Chazara plan: first sugya b\'al peh by Thursday.', 'Where we got stuck last year: the second tzad – bring a chart.'],
      Mishnayos: ['Bartenura on each mishna; Tosfos Yom Tov for the strong boys.', 'Act out the case before reading inside.', 'Review game: teams by rows, one mishna each.'],
      Navi: ['Read inside with Metzudos; Rashi on the hard pesukim.', 'Map of Eretz Yisroel for the places mentioned.', 'Discussion: what middah does this story teach?'],
      Kriah: ['Flash cards for the new nekudos; 2 minutes a day.', 'Boys who need extra time: see the chazara focus list.', 'Timed reading on Thursday – keep a chart.'],
      Tefillah: ['Say it together slowly, then one boy at a time.', 'Explain two words each day.', 'Prize for the first boy to know it by heart.'],
      Parsha: ['Story in the boys\' words first, then the pesukim.', 'Parsha sheet questions: 5 for the Shabbos table.', 'Craft or picture for the main scene.'],
      Halacha: ['Kitzur Shulchan Aruch inside; Mishna Berura for sources.', 'Practical cases to discuss: 3 real-life questions.', 'Short written quiz at the end of the week.'],
      Dinim: ['Source in Kitzur Shulchan Aruch; show the boys where it is.', 'Practice the actual bracha or action in class.', 'Review questions for the Shabbos sheet.']
    };
    var lines = byLine[subject] || ['Sources and meforshim to bring.', 'Questions to ask the class.', 'What to review next week.'];
    return 'Source notes – ' + title + '\n\n' + lines.map(function (l) { return '• ' + l; }).join('\n');
  }

  function build(state, uid, todayISO, grade) {
    grade = GRADES[grade] ? grade : 3;
    var G = GRADES[grade];
    var H = window.HebCal;
    var today = todayISO();
    var todayRD = H.isoToRD(today);
    var thisYear = new Date().getFullYear();

    // ---------- talmidim ----------
    state.talmidim = [];
    for (var k = 0; k < G.size; k++) {
      var f = FIRST[(k * 5 + grade * 3) % FIRST.length];
      var last = LAST[(k * 7 + grade * 11) % LAST.length];
      var father = FIRST[(k * 11 + grade * 5 + 7) % FIRST.length];
      var mother = MOTHERS[(k * 3 + grade) % MOTHERS.length];
      var month = (k * 7 + grade) % 12 + 1, day = (k * 11 + grade * 2) % 27 + 1;
      state.talmidim.push(applySibling({
        id: uid(), first: f[0], last: last, hebName: f[1] + ' בן ' + father[1],
        father: father[0] + ' ' + last, mother: mother + ' ' + last,
        fatherPhone: '(555) 01' + pad(10 + k) + '-' + (2000 + grade * 100 + k * 37),
        motherPhone: k % 3 === 2 ? '' : '(555) 01' + pad(40 + k) + '-' + (3100 + k * 13),
        email: father[0].toLowerCase() + '.' + last.toLowerCase() + '@example.com',
        address: (100 + k * 17 + grade) + ' ' + STREETS[(k + grade) % STREETS.length],
        birthday: (thisYear - 5 - grade + (month > 8 ? -1 : 0)) + '-' + pad(month) + '-' + pad(day),
        allergies: ['', '', '', '', 'Peanuts – EpiPen in office', '', '', 'Tree nuts', '', '', '', 'Dairy (lactose)', ''][(k + grade) % 13],
        notes: NOTES[(k + grade) % NOTES.length], archived: false
      }, grade, k));
    }
    var t = state.talmidim;
    var star = t[7 % t.length];

    state.settings.rebbiName = G.rebbi;
    state.settings.className = G.className;
    state.settings.school = 'Yeshiva Ketana (Sample)';
    state.settings.setupDone = true;

    // ---------- school days around today ----------
    function isSchoolDay(rd) {
      if (H.weekday(rd) === 6) return false;
      return !H.holidaysBetween(rd, rd).some(function (x) { return x.yomTov || x.cholHamoed; });
    }
    var sunday = todayRD - H.weekday(todayRD);

    // ---------- lesson plans: last week, this week, next week ----------
    var counter = 0, storyIdx = 0;
    for (var w = -1; w <= 1; w++) {
      var sun = sunday + 7 * w;
      var parsha = H.parshaForShabbos(sun + 6);
      var pName = parsha.holiday ? 'Yom Tov' : 'Parshas ' + parsha.en;
      for (var d = 0; d < 6; d++) {
        var rd = sun + d;
        if (!isSchoolDay(rd)) continue;
        var iso = H.rdToISO(rd);
        var past = rd < todayRD;
        var add = function (subject, plan, notes) {
          state.lessons.push({ id: uid(), date: iso, subject: subject, plan: plan.replace('{parsha}', pName), notes: past ? (notes || '') : '', done: past });
        };
        add('Davening', DAVENING[d % DAVENING.length]);
        if (d === 5) { // Friday: short day
          add('Parsha', pName + ' – review the week, hand out the parsha sheet for the Shabbos table', 'Sheets went home.');
          add(G.subjects[0].s, 'Chazara of the week' + (grade >= 5 ? ' and short bechina' : ' – review game in teams'));
          if (grade <= 4) add('Story', STORIES[storyIdx++ % STORIES.length] + ' – then Shabbos songs');
          continue;
        }
        G.subjects.forEach(function (sub, si) {
          // the main limud every day; the others on alternating days
          if (si > 1 && (d + si) % 2) return;
          var item = sub.items[(counter + (si ? Math.floor(counter / 2) : 0)) % sub.items.length];
          add(sub.s, item, si === 0 ? (d % 2 ? 'Did not finish. Pick up here tomorrow.' : 'Finished. Most of the class has it.') : '');
        });
        counter++;
      }
    }

    // ---------- limud units with mastery ----------
    var unitDefs = [
      { sub: G.subjects[0], item: 0, weeksAgo: 2, base: 2 }, { sub: G.subjects[0], item: 1, weeksAgo: 0, base: 1 },
      { sub: G.subjects[1], item: 0, weeksAgo: 2, base: 2 }, { sub: G.subjects[1], item: 1, weeksAgo: 1, base: 1 },
      { sub: G.subjects[2], item: 0, weeksAgo: 3, base: 2 }
    ];
    state.units = unitDefs.map(function (u, ui) {
      var title = u.sub.items[u.item].replace('{parsha}', 'Parsha');
      var unit = { id: uid(), subject: u.sub.s, title: title, date: H.rdToISO(sunday - 7 * u.weeksAgo), notes: ui < 2 ? sampleNotes(u.sub.s, title) : '' };
      state.mastery[unit.id] = {};
      t.forEach(function (s, i) {
        var lvl = u.base + ((i * 3 + ui * 5 + grade) % 7 === 0 ? -1 : (i * 5 + ui + grade) % 4 === 0 ? 1 : 0);
        if (s === star) lvl = 3;
        state.mastery[unit.id][s.id] = Math.max(0, Math.min(3, lvl));
      });
      return unit;
    });

    // ---------- attendance: last 12 school days ----------
    var days = [];
    for (var back = 1; days.length < 12 && back < 40; back++) if (isSchoolDay(todayRD - back)) days.push(todayRD - back);
    days.forEach(function (rd2, di) {
      var rec = state.attendance[H.rdToISO(rd2)] = {};
      t.forEach(function (s, i) {
        var v = 'P';
        if ((i * 7 + di * 3 + grade) % 41 === 0) v = 'A';
        else if ((i * 5 + di + grade) % 29 === 0) v = 'L';
        rec[s.id] = v;
      });
    });
    var yesterday = state.attendance[H.rdToISO(days[0])];
    if (yesterday) { yesterday[t[9 % t.length].id] = 'A'; yesterday[t[13 % t.length].id] = 'L'; }

    // ---------- bechinos ----------
    var maxes = [100, 20, 10];
    state.tests = [0, 1, 2].map(function (ti) {
      var sub = G.subjects[ti];
      var test = { id: uid(), title: sub.items[0].replace('{parsha}', 'Parsha') + ' – bechina', subject: sub.s,
        date: H.rdToISO(days[[1, 6, 10][ti]] || todayRD), max: maxes[ti] };
      state.scores[test.id] = {};
      t.forEach(function (s, i) {
        var pct = 0.72 + ((i * 13 + ti * 7 + grade * 3) % 28) / 100;
        if (s === star) pct = 1;
        state.scores[test.id][s.id] = Math.round(pct * test.max);
      });
      return test;
    });

    // ---------- parent contacts ----------
    var c = function (idx, back2, method, note, followDays) {
      state.contacts.push({
        id: uid(), talmidId: t[idx % t.length].id, date: H.rdToISO(todayRD - back2), method: method, note: note,
        followUp: followDays !== undefined ? H.rdToISO(todayRD + followDays) : '', followUpDone: false
      });
    };
    c(3, 9, 'Phone call', 'Discussed his progress in ' + G.subjects[0].s + ' with his mother. She will review with him 10 minutes a night.', 1);
    c(5, 6, 'In person', 'Spoke to his father at pickup – he is happy and doing well.');
    c(2, 4, 'Text', 'Nachas text: he led the davening beautifully.');
    c(12, 2, 'Phone call', 'Spoke about restlessness after lunch. Agreed to try movement breaks and check in next week.', 5);
    c(9, 1, 'Text', 'Absent – mother says he has a fever. Sent home the sheets.', 0);

    // ---------- report comments & notes ----------
    state.comments[star.id] = star.first + ' is a true masmid. His questions show deep thinking and he is always ready to help a friend.';
    state.comments[t[5].id] = t[5].first + ' participates with enthusiasm, and his ' + G.subjects[0].s + ' has improved greatly.';
    state.comments[t[2].id] = t[2].first + ' davens with real feeling and is a leader in the class. Keep up the chazara at home!';
    state.notes.push(
      { id: uid(), date: H.rdToISO(todayRD - 1), text: 'Order more prizes for the prize box.' },
      { id: uid(), date: today, text: 'Ask the office for extra copies of the parsha sheet.' }
    );

    // ---------- issues sent to the office (sample: Kitah Beis) ----------
    state.settings.rebbiPhone = '(555) 020-' + String(1000 + grade * 111).slice(0, 4);
    if (grade === 2) {
      var d = function (n) { return H.rdToISO(todayRD - n); };
      var boy = function (i) { return t[i % t.length]; };
      var issue = function (o) {
        state.issues.push(Object.assign({ id: uid(), by: G.rebbi, byPhone: state.settings.rebbiPhone, className: G.className, talmidId: '', talmidName: '',
          details: '', priority: 'normal', status: 'open', assignedTo: '', due: '', notes: [], seenOffice: 0 }, o));
      };
      issue({ date: d(9), title: 'Broken window latch in the classroom', details: 'The window by the back row won\'t close all the way. It gets cold in the afternoon.',
        status: 'done', to: 'maintenance', assignedTo: 'Maintenance (Mr. Gold)', updatedAt: d(5), seenOffice: 2, officeSeen: 1,
        notes: [{ date: d(8), by: 'Office', text: 'Thank you – Mr. Gold will come Wednesday after dismissal.', office: true },
          { date: d(5), by: 'Office', text: 'Fixed. Please let us know if it happens again.', office: true }] });
      issue({ date: d(4), talmidId: boy(3).id, talmidName: boy(3).first + ' ' + boy(3).last, title: 'Needs extra kriah help', to: 'principal',
        details: 'He is falling behind in kriah – still mixing up the nekudos. Can we arrange a tutor or resource room time?',
        priority: 'high', status: 'progress', assignedTo: 'Mrs. Kaplan (resource room)', due: d(-3), updatedAt: d(1), seenOffice: 0, officeSeen: 2,
        notes: [{ date: d(3), by: 'Office', text: 'Mrs. Kaplan can take him Tuesday and Thursday during Chumash, 20 minutes. Starting next week.', office: true },
          { date: d(2), by: G.rebbi, text: 'Thank you! Tuesday is better during Kriah instead – is that possible?', office: false },
          { date: d(1), by: 'Office', text: 'Done – Tuesday during Kriah and Thursday during Chumash. We also called his mother to let her know.', office: true }] });
      issue({ date: d(2), talmidId: boy(8).id, talmidName: boy(8).first + ' ' + boy(8).last, title: 'Parent asked about bus pickup time',
        details: 'His father asked if the bus can pick him up 10 minutes earlier on Fridays.', updatedAt: d(1), seenOffice: 0, officeSeen: 1,
        notes: [{ date: d(1), by: 'Office', text: 'We spoke to the bus company. Fridays at 12:50 starting this week.', office: true }] });
      issue({ date: d(1), title: 'Classroom light flickering', details: 'The light over the front board flickers all morning. Hard on the boys\' eyes.', to: 'maintenance', priority: 'high', status: 'open', updatedAt: d(1) });
      issue({ date: d(0), title: 'Need more Chumash sheets copied', details: '20 copies of the Bereishis perek 2 sheet for Sunday, please.', status: 'open', updatedAt: d(0) });
    }

    // Jobs this week
    state.jobs.forEach(function (j, i) { j.holder = t[(i * 3) % t.length].id; });
  }

  window.DemoData = {
    build: build,
    applySibling: applySibling,
    grades: Object.keys(GRADES).map(function (g) { return { grade: +g, className: GRADES[g].className, rebbi: GRADES[g].rebbi }; })
  };
})();
