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
  // live: a subscribed calendar; asks calendar apps to check back every hour.
  function ics(events, calName, live) {
    var now = stamp();
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rebbi App//Calendar export//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    if (calName) lines.push('X-WR-CALNAME:' + esc(calName));
    if (live) lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
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


  // ---------- live calendar (updates itself) ----------
  // The app keeps a copy of the calendar in the cloud (calendars/{token}) whenever the class changes.
  // Google / Apple Calendar subscribe to a secret link that always serves the newest copy.
  var FEED_BASE = 'https://us-central1-rabbi--app.cloudfunctions.net/calendar/';
  var SENT_KEY = 'rabbiapp.calfeed.sent.';
  function feed() { return Store.get().settings.calFeed || null; }
  function feedURL(f) { return FEED_BASE + f.token + '.ics'; }
  function webcalURL(f) { return feedURL(f).replace(/^https:/, 'webcal:'); }
  function googleSubscribeURL(f) { return 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(webcalURL(f)); }
  function newToken() {
    var a = new Uint8Array(18); crypto.getRandomValues(a);
    return Array.from(a, function (b) { return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]; }).join('') +
      Date.now().toString(36);
  }
  function hashStr(str) {
    var x = 5381;
    for (var i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
    return (x >>> 0).toString(36) + '.' + str.length;
  }
  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    return null;
  }

  // Planner items from the last 2 months on, every bechina, and birthdays / yomim tovim for the coming 18 months.
  function feedEvents(f) {
    var today = Store.todayISO();
    return collect({ lessons: f.lessons, tests: f.tests, birthdays: f.birthdays, holidays: f.holidays,
      from: f.tests ? '0000-01-01' : UI.addDays(today, -60), to: '9999-12-31',
      yearFrom: UI.addDays(today, -30), yearTo: UI.addDays(today, 548) })
      .filter(function (ev) { return ev.category !== 'Planner' || ev.date >= UI.addDays(today, -60); });
  }

  var timer = null, publishing = false;
  function publishSoon(delay) {
    clearTimeout(timer);
    timer = setTimeout(publish, delay === undefined ? 4000 : delay);
  }
  // Uploads the calendar if it changed since this device last sent it. Quietly waits for sign-in / internet.
  function publish(force) {
    var f = feed();
    if (!f || !f.token || publishing || !window.Sync || !Sync.isOn() || !navigator.onLine) return Promise.resolve(false);
    var events = feedEvents(f), name = className();
    var sig = hashStr(name + JSON.stringify(events));
    if (!force && ls(SENT_KEY + f.token) === sig) return Promise.resolve(false);
    publishing = true;
    return Sync.publishCalendar(f.token, ics(events, name, true), name).then(function () {
      ls(SENT_KEY + f.token, sig); publishing = false; return true;
    }, function (e) { publishing = false; console.warn('Calendar not updated: ' + e.message); return false; });
  }
  Store.onChange(function () { if (feed()) publishSoon(); });
  window.addEventListener('online', function () { publishSoon(1000); });
  setTimeout(function () { publishSoon(0); }, 6000); // a new day moves the birthday / yom tov window along

  function turnOn(include) {
    Store.update(function (s) { s.settings.calFeed = Object.assign({ token: newToken() }, include); });
    return publish(true);
  }
  function turnOff() {
    var f = feed();
    Store.update(function (s) { delete s.settings.calFeed; });
    if (f) { ls(SENT_KEY + f.token, null); return Sync.removeCalendar(f.token).catch(function () { /* already gone */ }); }
    return Promise.resolve();
  }

  // refresh: called after turning it on / off / new link (Settings re-renders the page).
  function liveCard(refresh) {
    refresh = refresh || function () { App.render(); };
    var f = feed();
    var card = h('div.card', h('h2', 'Live calendar (updates itself)'));
    if (!window.Sync || !Sync.isOn()) {
      card.appendChild(h('p', 'Your planner, bechinos and birthdays show in Google or Apple Calendar and stay up to date as you make changes. ' +
        'To use it, first turn on sync and sign in (see "Sync" on this page).'));
      return card;
    }
    var pick = f || { lessons: true, tests: true, birthdays: true, holidays: false };
    var boxes = {};
    function box(key, label) {
      boxes[key] = h('input', { type: 'checkbox', checked: !!pick[key], onchange: function () {
        if (!feed()) return;
        Store.update(function (s) { s.settings.calFeed[key] = boxes[key].checked; });
        UI.toast('Saved – your calendar will update');
      } });
      return h('label.check-row', boxes[key], h('span', label));
    }
    var choices = h('div', box('lessons', 'Planner'), box('tests', 'Bechinos'), box('birthdays', 'Talmidim\'s Hebrew birthdays'), box('holidays', 'Yomim tovim & fast days'));
    if (!f) {
      card.appendChild(h('p', 'Add your class to Google or Apple Calendar once, and it keeps itself up to date: whatever you add, change or delete here shows up there too.'));
      card.appendChild(choices);
      card.appendChild(h('div.cal-choices', h('button.btn.primary', { type: 'button', onclick: function (e) {
        var inc = {}; Object.keys(boxes).forEach(function (k) { inc[k] = boxes[k].checked; });
        e.target.disabled = true;
        turnOn(inc).then(function (ok) { UI.toast(ok ? 'Live calendar is on' : 'Turned on – it will upload when you\'re online'); refresh(); });
      } }, UI.icon('calendar', 16), 'Turn on live calendar')));
      return card;
    }
    card.appendChild(h('p', 'Add it once on each phone or computer:'));
    card.appendChild(h('div.cal-choices',
      h('a.btn.primary', { href: webcalURL(f) }, UI.icon('calendar', 16), 'Apple Calendar'),
      h('a.btn', { href: googleSubscribeURL(f), target: '_blank', rel: 'noopener' }, UI.icon('calendar', 16), 'Google Calendar'),
      h('button.btn', { type: 'button', onclick: function () { UI.copyText(feedURL(f)); } }, UI.icon('copy', 16), 'Copy link')));
    card.appendChild(h('details.cal-help',
      h('summary', 'How it works'),
      h('p.small', h('strong', 'iPhone / iPad / Mac: '), 'tap Apple Calendar, then Subscribe. ',
        h('strong', 'Google: '), 'tap Google Calendar, then Add. It then shows in the Google Calendar app on Android and iPhone too. ',
        h('strong', 'Outlook: '), 'Add calendar → Subscribe from web, and paste the copied link.'),
      h('p.small.muted', 'Changes reach Apple Calendar within about an hour. Google checks on its own schedule, usually a few times a day. ' +
        'The calendar is read-only there: make changes in Rebbi App. Anyone with the link can see the calendar, so only share it with people you trust; "New link" stops the old one.')));
    card.appendChild(h('div', { style: 'margin-top:10px' }, h('span.field-label', 'Show in the calendar'), choices));
    card.appendChild(h('div.row.gap.wrap', { style: 'margin-top:12px' },
      h('button.btn', { type: 'button', onclick: function () {
        UI.confirm('Make a new link? Calendars added with the old link stop updating, and you\'ll need to add the calendar again on each device.', function () {
          var inc = Object.assign({}, feed()); delete inc.token;
          turnOff().then(function () { return turnOn(inc); }).then(function () { UI.toast('New link made'); refresh(); });
        }, 'New link');
      } }, 'New link'),
      h('button.btn.danger', { type: 'button', onclick: function () {
        UI.confirm('Turn off the live calendar? It will stop updating and disappear from calendars that subscribed to it.', function () {
          turnOff().then(function () { UI.toast('Live calendar turned off'); refresh(); });
        }, 'Turn off');
      } }, 'Turn off')));
    return card;
  }

  // The Planner's "Add to calendar" button: the live calendar, plus the one-time copy.
  function open() {
    var holder = h('div');
    function fill() {
      holder.innerHTML = '';
      holder.appendChild(liveCard(fill));
      holder.appendChild(h('p', h('button.link', { type: 'button', onclick: function () { dlg.close(); exportDialog({ birthdays: false }); } }, 'Or make a one-time copy instead…')));
    }
    fill();
    var dlg = UI.modal('Add to calendar', holder, [{ label: 'Close' }]);
  }

  function settingsCard() {
    var wrap = h('div');
    wrap.appendChild(liveCard());
    wrap.appendChild(h('div.card',
      h('h2', 'One-time copy to a calendar'),
      h('p', 'Or copy your planner, bechinos and birthdays into a calendar once, without a live link (doesn\'t need sync).'),
      h('button.btn', { type: 'button', onclick: function () { exportDialog(); } }, UI.icon('calendar'), 'Copy to calendar…')));
    return wrap;
  }

  window.Calendar = { ics: ics, googleLink: googleLink, collect: collect, testEvent: testEvent,
    addOne: addOne, exportDialog: exportDialog, open: open, settingsCard: settingsCard,
    publish: publish, publishSoon: publishSoon, feedEvents: feedEvents, feedURL: function () { var f = feed(); return f ? feedURL(f) : null; } };
})();
