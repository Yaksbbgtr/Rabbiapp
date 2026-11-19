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
          return h('li.job-row', h('span.job-name', { title: j.name }, j.name), sel,
            h('button.icon-btn.small', { 'aria-label': 'Remove job', onclick: function () { Store.update(function (s) { s.jobs = s.jobs.filter(function (x) { return x !== j; }); }); App.render(); } }, '×'));
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

      main.appendChild(seatingCard());
    }
  });

  // ---------- Seating chart ----------
  // s.seating = { rows, cols, seats: { 'r,c': talmidId }, off: { 'r,c': true } }  (off = no desk there, e.g. an aisle)
  function seating() {
    var st = Store.get();
    if (!st.seating) st.seating = { rows: 4, cols: 6, seats: {}, off: {} };
    if (!st.seating.seats) st.seating.seats = {};
    if (!st.seating.off) st.seating.off = {};
    return st.seating;
  }
  function seatingCard() {
    var card = h('div.card.seating-card');
    var editDesks = false;   // "Edit desks" mode: tapping a spot adds/removes a desk
    var picked = null;       // tap-to-move: { id, from: 'r,c' | null }
    var drag = null;

    function activeIds() { return Store.activeTalmidim().map(function (t) { return t.id; }); }
    function absentToday() { return Store.get().attendance[Store.todayISO()] || {}; }
    function seatOf(id) {
      var seats = seating().seats;
      return Object.keys(seats).find(function (k) { return seats[k] === id; }) || null;
    }
    function save(fn) { Store.update(function () { fn(seating()); }); draw(); }

    // Put talmid `id` on seat `to` (null = back to the list). Whoever sat there moves to where `id` came from.
    function place(id, to) {
      save(function (sc) {
        var from = Object.keys(sc.seats).find(function (k) { return sc.seats[k] === id; }) || null;
        if (from === to) return;
        var other = to ? sc.seats[to] : null;
        if (from) delete sc.seats[from];
        if (to) sc.seats[to] = id;
        if (other && other !== id) { if (from) sc.seats[from] = other; }
      });
    }

    function chip(t, from) {
      var att = absentToday()[t.id];
      var el = h('div.seat-chip' + (att === 'A' || att === 'E' ? '.absent' : '') + (picked && picked.id === t.id ? '.picked' : ''),
        { 'data-id': t.id, title: Store.displayName(t) + (att === 'A' || att === 'E' ? ' (absent today)' : '') }, nameParts(t));
      el.addEventListener('pointerdown', function (e) { startDrag(e, t, from, el); });
      return el;
    }

    // First name and last name on their own lines, so names fit in narrow desks on a phone
    function nameParts(t) {
      var full = Store.displayName(t), first = Store.displayName(t, { short: true });
      if (full === first || full.indexOf(first + ' ') !== 0) return h('span.seat-fn', full);
      return [h('span.seat-fn', first), ' ', h('span.seat-ln', full.slice(first.length + 1))];
    }

    function startDrag(e, t, from, el) {
      if (editDesks || e.button > 0) return;
      var sx = e.clientX, sy = e.clientY, ghost = null, over = null;
      function target(x, y) {
        var under = document.elementFromPoint(x, y);
        return under && under.closest('.seat:not(.off), .seat-tray');
      }
      function move(ev) {
        if (!ghost) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return;
          ghost = h('div.seat-chip.seat-ghost', Store.displayName(t));
          document.body.appendChild(ghost);
          el.classList.add('dragging');
          picked = null;
        }
        ev.preventDefault();
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        var tg = target(ev.clientX, ev.clientY);
        if (tg !== over) { if (over) over.classList.remove('drop-over'); over = tg; if (over) over.classList.add('drop-over'); }
      }
      function up(ev) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        if (!ghost) {
          // A tap: pick this talmid, then tap a seat (or the list) to move him there.
          if (ev.type !== 'pointerup') return;
          if (picked && picked.id !== t.id && from) { var pid = picked.id; picked = null; place(pid, from); return; } // swap with the one already picked
          picked = picked && picked.id === t.id ? null : { id: t.id, from: from };
          draw();
          return;
        }
        ghost.remove(); el.classList.remove('dragging');
        if (over) over.classList.remove('drop-over');
        if (ev.type === 'pointerup' && over) place(t.id, over.classList.contains('seat-tray') ? null : over.getAttribute('data-key'));
        else draw();
      }
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    }

    function draw() {
      var sc = seating();
      var ids = activeIds();
      // Forget seats outside the grid and talmidim who left the class
      Object.keys(sc.seats).forEach(function (k) {
        var rc = k.split(',').map(Number);
        if (rc[0] >= sc.rows || rc[1] >= sc.cols || ids.indexOf(sc.seats[k]) < 0 || sc.off[k]) delete sc.seats[k];
      });
      var seatedIds = Object.keys(sc.seats).map(function (k) { return sc.seats[k]; });
      var unseated = Store.activeTalmidim().filter(function (t) { return seatedIds.indexOf(t.id) < 0; });
      var desks = 0;
      for (var r0 = 0; r0 < sc.rows; r0++) for (var c0 = 0; c0 < sc.cols; c0++) if (!sc.off[r0 + ',' + c0]) desks++;

      var nums = []; for (var n = 1; n <= 10; n++) nums.push([n, n]);
      var rowsSel = UI.select(nums, sc.rows, { 'aria-label': 'Rows' });
      var colsSel = UI.select(nums, sc.cols, { 'aria-label': 'Desks across' });
      rowsSel.addEventListener('change', function () { save(function (s) { s.rows = +rowsSel.value; }); });
      colsSel.addEventListener('change', function () { save(function (s) { s.cols = +colsSel.value; }); });

      var grid = h('div.seat-grid', { style: 'grid-template-columns: repeat(' + sc.cols + ', minmax(0, 1fr))' });
      for (var r = 0; r < sc.rows; r++) {
        for (var c = 0; c < sc.cols; c++) {
          (function (key) {
            var off = !!sc.off[key];
            var t = sc.seats[key] ? Store.talmid(sc.seats[key]) : null;
            var seat = h('div.seat' + (off ? '.off' : '') + (t ? '.taken' : '') + (editDesks ? '.editing' : ''), { 'data-key': key },
              off ? (editDesks ? h('span.seat-empty', '+ desk') : null) : t ? chip(t, key) : h('span.seat-empty', editDesks ? 'remove' : ''));
            seat.addEventListener('click', function (e) {
              if (editDesks) { save(function (s) { if (s.off[key]) delete s.off[key]; else { s.off[key] = true; delete s.seats[key]; } }); return; }
              if (picked && !off && !e.target.closest('.seat-chip')) { var id = picked.id; picked = null; place(id, key); }
            });
            grid.appendChild(seat);
          })(r + ',' + c);
        }
      }

      var tray = h('div.seat-tray' + (picked && picked.from ? '.target' : ''),
        h('div.small.muted.seat-tray-label', unseated.length ? 'Not seated yet (' + unseated.length + ')' : 'Everyone has a seat. Drag a talmid here to take him out of his seat.'),
        h('div.seat-tray-chips', unseated.map(function (t) { return chip(t, null); })));
      tray.addEventListener('click', function (e) {
        if (picked && picked.from && !e.target.closest('.seat-chip')) { var id = picked.id; picked = null; place(id, null); }
      });

      card.innerHTML = '';
      card.appendChild(h('div.row.between.wrap.gap',
        h('div', h('h2', 'Seating chart'),
          h('p.muted.small', editDesks ? 'Tap a spot to add or remove a desk (leave gaps for aisles). Tap Done when finished.'
            : 'Drag a talmid onto a desk, or tap him and then tap a desk. Drop him on someone else to swap them.')),
        h('div.row.gap.wrap.seat-size',
          h('label.small.muted', 'Rows ', rowsSel),
          h('label.small.muted', 'Across ', colsSel))));
      card.appendChild(h('div.seat-front', 'Front of the room · Rebbi\'s desk'));
      card.appendChild(grid);
      card.appendChild(h('div.small.muted.seat-count', desks + ' desks · ' + ids.length + ' talmidim' + (ids.length > desks ? ' – add ' + (ids.length - desks) + ' more desk' + (ids.length - desks === 1 ? '' : 's') : '')));
      card.appendChild(tray);
      card.appendChild(h('div.row.gap.wrap',
        h('button.btn.primary', { type: 'button', onclick: function () {
          var pool = shuffle(activeIds());
          save(function (s) {
            s.seats = {};
            for (var r = 0; r < s.rows; r++) for (var c = 0; c < s.cols; c++) {
              var k = r + ',' + c;
              if (!s.off[k] && pool.length) s.seats[k] = pool.shift();
            }
          });
          UI.toast(pool.length ? pool.length + ' talmidim need a desk' : 'Seats shuffled');
        } }, UI.icon('shuffle'), 'Shuffle seats'),
        h('button.btn' + (editDesks ? '.primary' : ''), { type: 'button', onclick: function () { editDesks = !editDesks; picked = null; draw(); } }, editDesks ? 'Done' : 'Edit desks'),
        h('button.btn', { type: 'button', onclick: function () {
          UI.confirmDialog('Take everyone out of their seats?', function () { save(function (s) { s.seats = {}; }); }, 'Clear');
        } }, 'Clear'),
        h('button.btn', { type: 'button', onclick: printSeating }, UI.icon('print'), 'Print')));
    }

    function printSeating() {
      var sc = seating(), st = Store.get();
      var rows = [];
      for (var r = 0; r < sc.rows; r++) {
        var cells = [];
        for (var c = 0; c < sc.cols; c++) {
          var k = r + ',' + c;
          var t = sc.seats[k] ? Store.talmid(sc.seats[k]) : null;
          cells.push(h('td' + (sc.off[k] ? '.off' : ''), sc.off[k] ? '' : t ? Store.displayName(t) : ''));
        }
        rows.push(h('tr', cells));
      }
      UI.printSheet(h('div.seat-sheet',
        h('h1', 'Seating chart' + (st.settings.className ? ' – ' + st.settings.className : '')),
        st.settings.rebbiName ? h('div', st.settings.rebbiName) : null,
        h('div.seat-sheet-front', 'Front of the room'),
        h('table', h('tbody', rows))));
    }

    draw();
    return card;
  }

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
