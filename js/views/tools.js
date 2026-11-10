(function () {
  'use strict';
  var h = UI.h;
  var pickedIds = [];
  var timer = { total: 300, left: 300, running: false, handle: null };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function presentToday() {
    var att = Store.get().attendance[Store.todayISO()] || {};
    return Store.activeTalmidim().filter(function (t) { return att[t.id] !== 'A' && att[t.id] !== 'E'; });
  }

  Views.register('tools', {
    title: 'Classroom tools', short: 'Tools', icon: 'tool',
    render: function (main) {
      var st = Store.get();
      main.appendChild(h('div.page-head', h('div', h('h1', 'Classroom tools'), h('p.muted', 'Absent talmidim (from today\'s attendance) are skipped automatically.'))));
      var grid = h('div.grid.two');
      main.appendChild(grid);

      // Random picker
      var display = h('div.picker-display', '?');
      var remaining = h('div.small.muted');
      function updateRemaining() {
        var left = presentToday().filter(function (t) { return pickedIds.indexOf(t.id) < 0; }).length;
        remaining.textContent = left + ' left before everyone has had a turn';
      }
      updateRemaining();
      grid.appendChild(h('div.card',
        h('h2', 'Who\'s next?'),
        h('p.muted.small', 'Calls on everyone once before repeating, so every talmid gets a turn to lein, answer, or say the pshat.'),
        display, remaining,
        h('div.row.gap',
          h('button.btn.primary.big', { onclick: function () {
            var pool = presentToday();
            if (!pool.length) { UI.toast('No talmidim'); return; }
            var avail = pool.filter(function (t) { return pickedIds.indexOf(t.id) < 0; });
            if (!avail.length) { pickedIds = []; avail = pool; }
            var spins = 12, i = 0;
            var iv = setInterval(function () {
              var t = i < spins ? pool[Math.floor(Math.random() * pool.length)] : avail[Math.floor(Math.random() * avail.length)];
              display.textContent = Store.displayName(t);
              display.classList.toggle('final', i >= spins);
              if (i++ >= spins) { clearInterval(iv); pickedIds.push(t.id); updateRemaining(); }
            }, 60);
          } }, UI.icon('shuffle'), 'Pick'),
          h('button.btn', { onclick: function () { pickedIds = []; display.textContent = '?'; updateRemaining(); } }, 'Reset'))));

      // Chavrusas / groups
      var size = UI.select([[2, 'Chavrusas (pairs)'], [3, 'Groups of 3'], [4, 'Groups of 4'], [5, 'Groups of 5']], 2);
      var out = h('div.groups');
      grid.appendChild(h('div.card',
        h('h2', 'Chavrusas & groups'),
        h('div.row.gap', size, h('button.btn.primary', { onclick: function () {
          var pool = shuffle(presentToday());
          var n = +size.value;
          var groups = [];
          for (var i = 0; i < pool.length; i += n) groups.push(pool.slice(i, i + n));
          // fold a lonely last member into the previous group
          if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(groups.pop()[0]);
          out.innerHTML = '';
          groups.forEach(function (g, gi) {
            out.appendChild(h('div.group', h('div.small.muted', (n === 2 ? 'Chavrusa ' : 'Group ') + (gi + 1)),
              g.map(function (t) { return h('div', Store.displayName(t)); })));
          });
        } }, UI.icon('shuffle'), 'Make')),
        out));

      // Timer
      var tDisplay = h('div.timer-display', fmt(timer.left));
      function tick() {
        if (!timer.running) return;
        timer.left--;
        tDisplay.textContent = fmt(Math.max(0, timer.left));
        if (timer.left <= 0) {
          timer.running = false; clearInterval(timer.handle);
          tDisplay.classList.add('done');
          beep();
        }
      }
      function setTime(sec) { timer.total = timer.left = sec; timer.running = false; clearInterval(timer.handle); tDisplay.textContent = fmt(sec); tDisplay.classList.remove('done'); }
      grid.appendChild(h('div.card',
        h('h2', 'Timer'),
        tDisplay,
        h('div.chips', [1, 2, 3, 5, 10, 15].map(function (m) { return h('button.chip', { onclick: function () { setTime(m * 60); } }, m + ' min'); })),
        h('div.row.gap',
          h('button.btn.primary', { onclick: function () {
            if (timer.running) { timer.running = false; clearInterval(timer.handle); return; }
            if (timer.left <= 0) setTime(timer.total);
            timer.running = true; clearInterval(timer.handle); timer.handle = setInterval(function () {
              if (!document.body.contains(tDisplay)) { clearInterval(timer.handle); timer.running = false; return; }
              tick();
            }, 1000);
          } }, 'Start / Pause'),
          h('button.btn', { onclick: function () { setTime(timer.total); } }, 'Reset'),
          h('button.btn', { onclick: function () { if (tDisplay.requestFullscreen) tDisplay.requestFullscreen(); } }, 'Full screen'))));

      // Jobs rotation
      var talmidim = Store.activeTalmidim();
      grid.appendChild(h('div.card',
        h('h2', 'Class jobs'),
        st.jobs.length ? h('ul.list', st.jobs.map(function (j) {
          var sel = UI.select(UI.talmidOptions('— nobody —'), j.holder || '');
          sel.addEventListener('change', function () { Store.update(function () { j.holder = sel.value || null; }); });
          return h('li.row.between.gap', h('span', j.name), h('span.row.gap', sel,
            h('button.icon-btn.small', { 'aria-label': 'Remove job', onclick: function () { Store.update(function (s) { s.jobs = s.jobs.filter(function (x) { return x !== j; }); }); App.render(); } }, '×')));
        })) : null,
        h('div.row.gap.wrap',
          h('button.btn.primary', { onclick: function () {
            if (!talmidim.length) return;
            Store.update(function (s) {
              // Rotate: the next talmidim in the list take over, so everyone gets a turn.
              var ids = talmidim.map(function (t) { return t.id; });
              var first = s.jobs[0] && s.jobs[0].holder ? ids.indexOf(s.jobs[0].holder) : -1;
              var base = first < 0 ? 0 : first + s.jobs.length;
              s.jobs.forEach(function (j, k) { j.holder = ids[(base + k) % ids.length]; });
            });
            UI.toast('Jobs rotated'); App.render();
          } }, 'Rotate jobs'),
          h('button.btn', { onclick: function () {
            var name = prompt('Job name');
            if (name && name.trim()) { Store.update(function (s) { s.jobs.push({ id: Store.uid(), name: name.trim(), holder: null }); }); App.render(); }
          } }, UI.icon('plus'), 'Add job'))));

      // Gematria calculator
      var gIn = UI.input({ placeholder: 'Type Hebrew letters or a number', dir: 'rtl' });
      var gOut = h('div.big-he');
      gIn.addEventListener('input', function () {
        var v = gIn.value.trim();
        if (/^\d+$/.test(v)) gOut.textContent = HebCal.gematriya(+v);
        else gOut.textContent = v ? String(gematriaValue(v)) : '';
      });
      grid.appendChild(h('div.card', h('h2', 'Gematria'), gIn, gOut));
    }
  });

  var LETTER_VALUES = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
  function gematriaValue(s) { return s.split('').reduce(function (n, c) { return n + (LETTER_VALUES[c] || 0); }, 0); }

  function fmt(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(function (t) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch (e) { /* no audio */ }
  }
})();
