/*
 * Calendar export: puts planner items, bechinos, Hebrew birthdays and yomim tovim
 * into Google Calendar or Apple Calendar (iPhone, iPad, Mac), and Outlook.
 *
 * Everything is a one-way copy, built on this device: a standard .ics calendar file
 * (Apple, Outlook, Google import) or a prefilled Google "new event" link for one item.
 * Each event keeps a fixed UID, so importing again updates it instead of adding a duplicate.
 */
(function () {
  'use strict';
  var h = UI.h;

  // ---------- .ics building ----------
  function compact(iso) { return iso.replace(/-/g, ''); }
  function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // Lines longer than 75 bytes are folded (RFC 5545); never split a multi-byte character.
  function fold(line) {
    var out = [], cur = '', bytes = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += b;
    });
    out.push(cur);
    return out.join('\r\n');
  }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); }

  // ev: { uid, title, date (YYYY-MM-DD, all-day), details?, category? }
  function ics(events, calName) {
    var now = stamp();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rebbi App//Calendar export//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (calName) lines.push('X-WR-CALNAME:' + esc(calName));
    events.forEach(function (ev) {
      lines.push('BEGIN:VEVENT',
        'UID:' + ev.uid + '@rebbi-app',
        'DTSTAMP:' + now,
        'DTSTART;VALUE=DATE:' + compact(ev.date),
        'DTEND;VALUE=DATE:' + compact(UI.addDays(ev.date, 1)),
        'SUMMARY:' + esc(ev.title),
        'TRANSP:TRANSPARENT'); // all-day notes, not "busy" blocks
      if (ev.details) lines.push('DESCRIPTION:' + esc(ev.details));
      if (ev.category) lines.push('CATEGORIES:' + esc(ev.category));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function googleLink(ev) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(ev.title) +
      '&dates=' + compact(ev.date) + '/' + compact(UI.addDays(ev.date, 1)) +
      (ev.details ? '&details=' + encodeURIComponent(ev.details) : '');
  }

  var isApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // iPhone/iPad: opening the calendar data directly brings up Calendar's "Add All" sheet.
  // Everywhere else: a .ics file is downloaded; opening it adds the events.
  function openICS(text, filename) {
    if (isIOS) { window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text); return; }
    UI.download(filename, text, 'text/calendar');
  }

  function fileSafe(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Rebbi App'; }

  // ---------- events from the class data ----------
  function className() {
    var s = Store.get().settings;
    return s.className || s.rebbiName || 'My class';
  }

  function collect(opts) {
    var st = Store.get();
    var from = opts.from, to = opts.to;
    var inRange = function (iso) { return iso && iso >= from && iso <= to; };
    var out = [];
    if (opts.lessons) st.lessons.forEach(function (l) {
      if (!inRange(l.date)) return;
      out.push({ uid: 'lesson-' + l.id, date: l.date, category: 'Planner',
        title: l.subject + (l.plan ? ': ' + l.plan.split('\n')[0] : ''),
        details: [l.plan.indexOf('\n') >= 0 ? l.plan : '', l.notes ? 'Notes: ' + l.notes : ''].filter(Boolean).join('\n\n') });
    });
    if (opts.tests) st.tests.forEach(function (x) { if (inRange(x.date)) out.push(testEvent(x)); });
    var fromRD = HebCal.isoToRD(opts.yearFrom || from), toRD = HebCal.isoToRD(opts.yearTo || to);
    if (opts.birthdays) {
      Store.activeTalmidim().forEach(function (t) {
        if (!t.birthday) return;
        var orig = HebCal.isoToRD(t.birthday);
        for (var rd = HebCal.nextHebrewAnniversary(orig, fromRD); rd !== null && rd <= toRD; rd = HebCal.nextHebrewAnniversary(orig, rd + 1)) {
          var hd = HebCal.fromRD(rd);
          var age = hd.year - HebCal.fromRD(orig).year;
          out.push({ uid: 'bday-' + t.id + '-' + hd.year, date: HebCal.rdToISO(rd), category: 'Birthdays',
            title: '🎂 ' + Store.displayName(t) + ' – Hebrew birthday' + (age > 0 ? ' (' + age + ')' : ''),
            details: HebCal.formatHebrew(hd) });
        }
      });
    }
    if (opts.holidays) {
      HebCal.holidaysBetween(fromRD, toRD).forEach(function (x) {
        var iso = HebCal.rdToISO(x.rd);
        out.push({ uid: 'yt-' + iso + '-' + x.en.replace(/[^A-Za-z0-9]+/g, ''), date: iso, title: x.en, category: 'Yomim tovim' });
      });
    }
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }

  function testEvent(x) {
    return { uid: 'bechina-' + x.id, date: x.date, category: 'Bechinos',
      title: 'Bechina: ' + x.title, details: (x.subject ? x.subject + ' · ' : '') + 'out of ' + x.max };
  }

  // ---------- dialogs ----------
  // One item: Google gets a ready-to-save event; Apple/Outlook get a one-event file.
  function addOne(ev) {
    UI.modal('Add to calendar', h('div',
      h('p', h('strong', ev.title), h('br'), h('span.muted', UI.fmtDate(ev.date, { year: 'numeric' }))),
      h('div.cal-choices',
        h('a.btn', { href: googleLink(ev), target: '_blank', rel: 'noopener' }, UI.icon('calendar', 16), 'Google Calendar'),
        h('button.btn', { type: 'button', onclick: function () { openICS(ics([ev]), fileSafe(ev.title) + '.ics'); } },
          UI.icon('calendar', 16), isApple ? 'Apple Calendar' : 'Apple / Outlook (.ics file)'))), [{ label: 'Done' }]);
  }

  // Many items at once, chosen with check boxes.
  function exportDialog(preset) {
    var today = Store.todayISO();
    var pick = Object.assign({ lessons: true, tests: true, birthdays: true, holidays: false, past: false }, preset || {});
    var boxes = {};
    function box(key, label, hint) {
      boxes[key] = h('input', { type: 'checkbox', checked: pick[key], onchange: update });
      return h('label.check-row', boxes[key], h('span', label, hint ? h('span.small.muted', ' – ' + hint) : null));
    }
    var count = h('p.small.muted');
    var body = h('div',
      h('p', 'Copy your class into your phone or computer calendar. Pick what to include:'),
      box('lessons', 'Planner'),
      box('tests', 'Bechinos'),
      box('birthdays', 'Talmidim\'s Hebrew birthdays', 'next 12 months'),
      box('holidays', 'Yomim tovim & fast days', 'chutz la\'aretz'),
      box('past', 'Also include past items'),
      count,
      h('div.cal-choices',
        h('button.btn.primary', { type: 'button', onclick: function () { go('apple'); } }, UI.icon('calendar', 16), isApple ? 'Apple Calendar' : 'Apple / Outlook (.ics file)'),
        h('button.btn', { type: 'button', onclick: function () { go('google'); } }, UI.icon('calendar', 16), 'Google Calendar')),
      h('details.cal-help',
        h('summary', 'How it works'),
        h('p.small', h('strong', 'iPhone / iPad: '), 'tap Apple Calendar, then "Add All". ',
          h('strong', 'Mac / Outlook: '), 'open the downloaded file. ',
          h('strong', 'Google: '), 'the file downloads and Google Calendar\'s Import page opens: choose the file and press Import. ' +
          'On an Android phone, do the Google import once in a browser; the events then show in the Google Calendar app.'),
        h('p.small.muted', 'This is a copy, not a live link: after you add or change items, export again. Items you exported before are updated, not doubled. ' +
          'Items deleted in the app stay in the calendar until you delete them there.')));

    // Planner and bechinos: everything from today on (or all of them); birthdays and yomim tovim: the next 12 months.
    function opts() {
      var o = {}; Object.keys(boxes).forEach(function (k) { o[k] = boxes[k].checked; });
      return collect({ lessons: o.lessons, tests: o.tests, birthdays: o.birthdays, holidays: o.holidays,
        from: o.past ? '0000-01-01' : today, to: '9999-12-31', yearFrom: today, yearTo: UI.addDays(today, 365) });
    }
    function update() {
      var n = opts().length;
      count.textContent = n ? n + (n === 1 ? ' item' : ' items') + ' will be added.' : 'Nothing to add with these choices.';
    }
    function go(where) {
      var events = opts();
      if (!events.length) { UI.toast('Nothing to add'); return; }
      var name = className();
      var text = ics(events, name);
      if (where === 'google') {
        UI.download(fileSafe(name) + ' calendar.ics', text, 'text/calendar');
        window.open('https://calendar.google.com/calendar/u/0/r/settings/export', '_blank', 'noopener');
        UI.toast('Choose the downloaded file and press Import');
      } else {
        openICS(text, fileSafe(name) + ' calendar.ics');
      }
    }
    update();
    UI.modal('Add to calendar', body, [{ label: 'Close' }]);
  }

  function settingsCard() {
    return h('div.card',
      h('h2', 'Google & Apple Calendar'),
      h('p', 'Put your planner, bechinos and talmidim\'s Hebrew birthdays into the calendar on your phone or computer.'),
      h('button.btn', { type: 'button', onclick: function () { exportDialog(); } }, UI.icon('calendar'), 'Add to calendar…'));
  }

  window.Calendar = { ics: ics, googleLink: googleLink, collect: collect, testEvent: testEvent,
    addOne: addOne, exportDialog: exportDialog, settingsCard: settingsCard };
})();
