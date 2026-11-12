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
        var pool = presentToday();
        var left = pool.filter(function (t) { return pickedIds.indexOf(t.id) < 0; }).length;
        remaining.textContent = !pool.length ? 'Add talmidim first (or nobody is here today).'
          : !left ? 'Everyone has had a turn – the next pick starts a new round.'
          : left + ' left before everyone has had a turn';
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
      var tDisplay = h('div.timer-display', { role: 'timer', 'aria-live': 'off', title: 'Tap to start or stop' }, fmt(timer.left));
      var startBtn = h('button.btn.primary', { type: 'button' }, 'Start');
      var fsStart = h('button.btn.primary.big', { type: 'button' }, 'Start');
      var box = h('div.timer-box');
      function isFull() { return document.fullscreenElement === box || box.classList.contains('timer-fs'); }
      function labels() {
        var l = timer.running ? 'Stop' : timer.left <= 0 ? 'Start again' : timer.left < timer.total ? 'Resume' : 'Start';
        startBtn.textContent = l; fsStart.textContent = l;
        box.classList.toggle('running', timer.running);
      }
      function tick() {
        if (!timer.running) return;
        timer.left--;
        tDisplay.textContent = fmt(Math.max(0, timer.left));
        if (timer.left <= 0) {
          timer.running = false; clearInterval(timer.handle);
          tDisplay.classList.add('done');
          beep(); labels();
        }
      }
      function setTime(sec) { timer.total = timer.left = sec; timer.running = false; clearInterval(timer.handle); tDisplay.textContent = fmt(sec); tDisplay.classList.remove('done'); labels(); }
      function toggle() {
        if (timer.running) { timer.running = false; clearInterval(timer.handle); labels(); return; }
        if (timer.left <= 0) setTime(timer.total);
        timer.running = true; clearInterval(timer.handle);
        timer.handle = setInterval(function () {
          if (!document.body.contains(tDisplay)) { clearInterval(timer.handle); timer.running = false; return; }
          tick();
        }, 1000);
        labels();
      }
      function enterFull() {
        // Real full screen where the browser allows it; otherwise (iPhone) fill the window instead.
        var fallback = function () { if (document.fullscreenElement !== box) box.classList.add('timer-fs'); };
        if (box.requestFullscreen) {
          try { Promise.resolve(box.requestFullscreen()).catch(fallback); } catch (e) { fallback(); }
          setTimeout(fallback, 400);
        } else fallback();
        labels();
      }
      function exitFull() {
        if (document.fullscreenElement === box && document.exitFullscreen) document.exitFullscreen();
        box.classList.remove('timer-fs');
      }
      // Tap anywhere on the timer (not a button) to start/stop
      box.addEventListener('click', function (e) { if (!e.target.closest('button')) toggle(); });
      // Type any time: minutes and seconds
      function editTime() {
        var mins = UI.input({ type: 'number', inputmode: 'numeric', min: 0, max: 180, value: Math.floor(timer.total / 60), 'aria-label': 'Minutes' });
        var secs = UI.input({ type: 'number', inputmode: 'numeric', min: 0, max: 59, value: timer.total % 60, 'aria-label': 'Seconds' });
        function apply() {
          var total = (parseInt(mins.value, 10) || 0) * 60 + (parseInt(secs.value, 10) || 0);
          if (total <= 0) { UI.toast('Enter a time'); return false; }
          setTime(Math.min(total, 180 * 60));
        }
        var m = UI.modal('Set the timer', h('div',
          h('div.form-grid', UI.field('Minutes', mins), UI.field('Seconds', secs)),
          h('p.small.muted', 'Up to 3 hours.')), [
          { label: 'Cancel' },
          { label: 'Set', primary: true, onClick: apply }
        ]);
        [mins, secs].forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (apply() !== false) m.close(); } }); });
        mins.select();
      }
      // Keyboard in full screen: space = start/stop, R = reset, Esc = leave
      function onKey(e) {
        if (!document.body.contains(box)) { document.removeEventListener('keydown', onKey); return; }
        if (!isFull() || (e.target && e.target.closest && e.target.closest('input, textarea, select'))) return;
        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setTime(timer.total); }
        else if (e.key === 'Escape') exitFull();
      }
      document.addEventListener('keydown', onKey);
      startBtn.addEventListener('click', toggle);
      fsStart.addEventListener('click', toggle);
      box.appendChild(tDisplay);
      box.appendChild(h('div.timer-fs-controls',
        fsStart,
        h('button.btn.big', { type: 'button', onclick: function () { setTime(timer.total); } }, 'Reset'),
        h('button.btn.big', { type: 'button', onclick: exitFull }, 'Exit full screen'),
        h('div.small.timer-hint', 'Tap the screen or press space to start / stop · R resets · Esc leaves')));
      labels();
      grid.appendChild(h('div.card',
        h('h2', 'Timer'),
        box,
        h('p.small.muted', 'Tap the numbers to start or stop.'),
        h('div.chips', [1, 2, 3, 5, 10, 15, 20, 30].map(function (m) { return h('button.chip', { type: 'button', onclick: function () { setTime(m * 60); } }, m + ' min'); }),
          h('button.chip', { type: 'button', onclick: editTime }, UI.icon('edit', 14), 'Edit time…')),
        h('div.row.gap.wrap',
          startBtn,
          h('button.btn', { type: 'button', onclick: function () { setTime(timer.total); } }, 'Reset'),
          h('button.btn', { type: 'button', onclick: enterFull }, 'Full screen'))));

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
    }
  });

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
