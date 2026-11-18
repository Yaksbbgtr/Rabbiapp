/*
 * Runs the texting demo entirely in the browser, for the GitHub Pages copy (no server there).
 * It loads the server's own parser.js and attendance.js and gives them a pretend
 * store, text sender and Parent Locker queue kept in this browser's localStorage.
 * The Node server (npm start) doesn't use this file.
 */
(function () {
  'use strict';
  var KEY = 'rebbi-texts-demo';
  var school = null, state = null;

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: keeps working until reload */ } }
  function fresh() { return { days: {}, messages: [], queue: [] }; }
  function normalizePhone(p) {
    var digits = String(p || '').replace(/[^\d]/g, '');
    return digits.length === 10 ? '+1' + digits : '+' + digits;
  }

  var store = {
    school: function () { return school; },
    rebbeim: function () { return school.rebbeim; },
    rebbi: function (id) { return school.rebbeim.find(function (r) { return r.id === id; }); },
    rebbiByPhone: function (phone) { return school.rebbeim.find(function (r) { return normalizePhone(r.phone) === normalizePhone(phone); }); },
    normalizePhone: normalizePhone,
    day: function (date, rebbiId) {
      var d = state.days[date] = state.days[date] || {};
      return d[rebbiId] = d[rebbiId] || { prompted: null, answered: null, absent: {}, history: [], pending: [] };
    },
    days: function () { return state.days; },
    logMessage: function (msg) {
      state.messages.push(Object.assign({ at: new Date().toISOString() }, msg));
      if (state.messages.length > 2000) state.messages.splice(0, state.messages.length - 2000);
    },
    messages: function () { return state.messages; },
    save: save
  };
  var sms = {
    provider: 'demo',
    send: function (to, body) { store.logMessage({ direction: 'out', phone: normalizePhone(to), body: body }); save(); return Promise.resolve({ ok: true, demo: true }); }
  };
  var parentlocker = {
    enabled: false,
    onResult: function () {},
    queue: function () { return state.queue; },
    sync: function (rec) {
      var prev = state.queue.find(function (x) { return x.date === rec.date && x.rebbiId === rec.rebbiId; });
      state.queue = state.queue.filter(function (x) { return x !== prev; });
      var entry = Object.assign({}, rec, { status: 'waiting', rev: ((prev && prev.rev) || 0) + 1, updatedAt: new Date().toISOString() });
      state.queue.push(entry); save();
      return Promise.resolve(entry);
    }
  };

  var modules = { './store': store, './sms': sms, './parentlocker': parentlocker };
  function load(path, name) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.text(); }).then(function (src) {
      var module = { exports: {} };
      new Function('module', 'exports', 'require', 'process', src)(module, module.exports, function (n) { return modules[n]; }, { env: {} });
      modules[name] = module.exports;
    });
  }

  var ready = null;
  function init() {
    return ready = ready || fetch('data/school.sample.json').then(function (r) { return r.json(); }).then(function (s) {
      school = s; state = read() || fresh();
      return load('src/parser.js', './parser');
    }).then(function () { return load('src/attendance.js', './attendance'); });
  }

  function overview() {
    var att = modules['./attendance'];
    var date = att.todayISO();
    var day = state.days[date] || {};
    return {
      date: date, demo: true, smsProvider: 'demo', parentLockerConnected: false, browserOnly: true,
      sendTime: '08:00', timeZone: att.TZ, school: school.school,
      rebbeim: school.rebbeim.map(function (r) {
        var rec = day[r.id] || { absent: {} };
        return {
          id: r.id, name: r.name, className: r.className, phone: normalizePhone(r.phone),
          prompted: rec.prompted || null, answered: rec.answered || null,
          talmidim: r.talmidim.map(function (st) { return { id: st.id, name: st.first + ' ' + st.last, status: rec.absent[st.id] || 'P' }; })
        };
      }),
      parentLocker: state.queue.filter(function (q) { return q.date === date; }),
      messages: state.messages.slice(-300)
    };
  }

  // Same calls as the Node server's /api/... endpoints.
  window.BrowserDemo = {
    get: function () { return init().then(overview); },
    post: function (path, body) {
      return init().then(function () {
        var att = modules['./attendance'];
        if (path === 'api/demo/send-morning') {
          return school.rebbeim.reduce(function (p, r) { return p.then(function () { return att.sendMorningPrompt(r, att.todayISO(), { force: true }); }); }, Promise.resolve())
            .then(function () { return { ok: true }; });
        }
        if (path === 'api/demo/reply') {
          var r = store.rebbi(body.rebbiId);
          if (!r) return { error: 'No such rebbi' };
          return att.handleIncoming(r.phone, String(body.text || ''), { noSend: true }).then(function (reply) { return { reply: reply }; });
        }
        if (path === 'api/demo/reset') { state = fresh(); save(); return { ok: true }; }
        return { error: 'Unknown' };
      });
    }
  };
})();
