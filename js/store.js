/* Local data store: everything lives in the browser (localStorage). */
(function () {
  'use strict';
  var KEY = 'rabbiapp.v1';
  var listeners = [];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function defaults() {
    return {
      version: 1,
      settings: {
        rebbiName: '',
        className: '',
        school: '',
        hebrewFirst: false,
        attendanceDays: [0, 1, 2, 3, 4, 5], // Sunday-Friday
        setupDone: false
      },
      talmidim: [],
      attendance: {},          // { 'YYYY-MM-DD': { talmidId: 'P'|'A'|'L'|'E' } }
      units: [],               // limud units: { id, subject, title, date, archived }
      mastery: {},             // { unitId: { talmidId: 0..3 } }
      tests: [],               // bechinos: { id, title, subject, date, max }
      scores: {},              // { testId: { talmidId: number } }
      lessons: [],             // planner: { id, date, subject, plan, done, notes }
      contacts: [],            // parent log: { id, talmidId, date, method, note, followUp, followUpDone }
      templates: window.MessageTemplates.defaults(uid),
      templatesVersion: window.MessageTemplates.VERSION,
      jobs: [
        { id: uid(), name: 'Chazan', holder: null },
        { id: uid(), name: 'Gabbai', holder: null },
        { id: uid(), name: 'Line leader', holder: null },
        { id: uid(), name: 'Board monitor', holder: null },
        { id: uid(), name: 'Sefarim monitor', holder: null }
      ],
      comments: {},            // report card comments { talmidId: text }
      notes: []                // quick notes { id, date, text, talmidId? }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var data = JSON.parse(raw);
      window.MessageTemplates.upgrade(data, uid);
      var d = defaults();
      Object.keys(d).forEach(function (k) { if (data[k] === undefined) data[k] = d[k]; });
      data.settings = Object.assign(d.settings, data.settings);
      return data;
    } catch (e) {
      console.error('Could not load data', e);
      return defaults();
    }
  }

  var state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save — storage may be full. Please export a backup.');
    }
    listeners.forEach(function (fn) { fn(state); });
  }

  var Store = {
    uid: uid,
    todayISO: todayISO,
    get: function () { return state; },
    save: save,
    update: function (fn) { fn(state); save(); },
    onChange: function (fn) { listeners.push(fn); },

    talmid: function (id) { return state.talmidim.find(function (t) { return t.id === id; }); },
    activeTalmidim: function () {
      return state.talmidim.filter(function (t) { return !t.archived; }).sort(function (a, b) {
        return (a.last || '').localeCompare(b.last || '') || (a.first || '').localeCompare(b.first || '');
      });
    },
    displayName: function (t, opts) {
      if (!t) return '(removed)';
      opts = opts || {};
      var en = (t.first || '') + (opts.short ? '' : ' ' + (t.last || ''));
      if (state.settings.hebrewFirst && t.hebName) return t.hebName;
      return en.trim() || t.hebName || '?';
    },

    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.talmidim)) throw new Error('This does not look like a Rebbi App backup file.');
      window.MessageTemplates.upgrade(data, uid);
      var d = defaults();
      Object.keys(d).forEach(function (k) { if (data[k] === undefined) data[k] = d[k]; });
      state = data;
      save();
    },
    reset: function () { state = defaults(); save(); },
    loadDemo: function () {
      state = defaults();
      window.DemoData.build(state, uid, todayISO);
      save();
    }
  };

  window.Store = Store;
})();
