/* Local data store: everything lives in the browser (localStorage). */
(function () {
  'use strict';
  var LEGACY_KEY = 'rabbiapp.v1';          // single-class data from before profiles existed
  var PROFILES_KEY = 'rabbiapp.profiles';  // { current: id|null, list: [{ id, name, className, pin, sampleGrade }] }
  var listeners = [];
  function dataKey(id) { return 'rabbiapp.data.' + id; }

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
        officeEmail: '',
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

  function prepare(data) {
    window.MessageTemplates.upgrade(data, uid);
    var d = defaults();
    Object.keys(d).forEach(function (k) { if (data[k] === undefined) data[k] = d[k]; });
    data.settings = Object.assign(d.settings, data.settings);
    return data;
  }

  function load(id) {
    try {
      var raw = id && localStorage.getItem(dataKey(id));
      return raw ? prepare(JSON.parse(raw)) : defaults();
    } catch (e) {
      console.error('Could not load data', e);
      return defaults();
    }
  }

  // ----- profiles -----
  function readIndex() {
    var idx = null;
    try { idx = JSON.parse(localStorage.getItem(PROFILES_KEY)); } catch (e) { /* ignore */ }
    if (idx && Array.isArray(idx.list)) return idx;
    idx = { current: null, list: [] };
    // First run after the update: the existing class becomes the first profile, already logged in.
    try {
      var old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        var data = JSON.parse(old);
        if (data && Array.isArray(data.talmidim)) {
          var id = uid();
          localStorage.setItem(dataKey(id), old);
          idx.list.push({ id: id, name: (data.settings && data.settings.rebbiName) || 'My class', className: (data.settings && data.settings.className) || '' });
          idx.current = id;
          localStorage.setItem(PROFILES_KEY, JSON.stringify(idx));
          localStorage.removeItem(LEGACY_KEY);
        }
      }
    } catch (e) { console.error('Could not move existing data into a profile', e); }
    return idx;
  }
  var index = readIndex();
  function writeIndex() {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(index)); } catch (e) { /* ignore */ }
  }
  function profile(id) { return index.list.find(function (p) { return p.id === id; }); }
  // A PIN is only a light lock between rebbeim sharing a device, not real security.
  function pinHash(id, pin) {
    var str = id + ':' + pin, hsh = 5381;
    for (var i = 0; i < str.length; i++) hsh = ((hsh << 5) + hsh + str.charCodeAt(i)) | 0;
    return 'h' + (hsh >>> 0).toString(36);
  }

  var state = load(index.current && profile(index.current) ? index.current : (index.current = null));

  function save() {
    if (!index.current) return;
    try {
      localStorage.setItem(dataKey(index.current), JSON.stringify(state));
    } catch (e) {
      alert('Could not save — storage may be full. Please export a backup.');
    }
    // Keep the profile's name and class in step with Settings.
    var p = profile(index.current);
    if (p && (p.name !== (state.settings.rebbiName || p.name) || p.className !== state.settings.className)) {
      p.name = state.settings.rebbiName || p.name;
      p.className = state.settings.className;
      writeIndex();
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
      state = prepare(data);
      save();
    },
    reset: function () {
      var p = profile(index.current);
      state = defaults();
      if (p) { state.settings.rebbiName = p.name; state.settings.className = p.className; state.settings.setupDone = true; }
      save();
    },
    loadDemo: function (grade) {
      state = defaults();
      window.DemoData.build(state, uid, todayISO, grade || 3);
      save();
    },

    // ----- profiles: each rebbi has his own class data on this device -----
    profiles: function () { return index.list.slice(); },
    currentProfile: function () { return profile(index.current) || null; },
    hasPin: function (id) { var p = profile(id); return !!(p && p.pin); },
    login: function (id, pin) {
      var p = profile(id);
      if (!p) return false;
      if (p.pin && p.pin !== pinHash(id, String(pin || ''))) return false;
      index.current = id; writeIndex();
      state = load(id);
      return true;
    },
    logout: function () { index.current = null; writeIndex(); state = defaults(); },
    createProfile: function (opts) {
      var id = uid();
      var p = { id: id, name: (opts.name || '').trim() || 'Rebbi', className: (opts.className || '').trim() };
      if (opts.pin) p.pin = pinHash(id, String(opts.pin));
      if (opts.sampleGrade) p.sampleGrade = opts.sampleGrade;
      var data = defaults();
      if (opts.sampleGrade) {
        window.DemoData.build(data, uid, todayISO, opts.sampleGrade);
        p.name = data.settings.rebbiName; p.className = data.settings.className;
      } else {
        data.settings.rebbiName = p.name; data.settings.className = p.className;
        data.settings.school = opts.school || ''; data.settings.setupDone = true;
      }
      try { localStorage.setItem(dataKey(id), JSON.stringify(data)); }
      catch (e) { throw new Error('This device is out of storage space for another profile.'); }
      index.list.push(p); writeIndex();
      return id;
    },
    // Adds a sample profile for every grade 1-8 that doesn't have one yet. Returns how many were added.
    createSampleProfiles: function () {
      var added = 0;
      window.DemoData.grades.forEach(function (g) {
        if (index.list.some(function (p) { return p.sampleGrade === g.grade; })) return;
        Store.createProfile({ sampleGrade: g.grade }); added++;
      });
      return added;
    },
    setPin: function (id, pin) {
      var p = profile(id); if (!p) return;
      if (pin) p.pin = pinHash(id, String(pin)); else delete p.pin;
      writeIndex();
    },
    deleteProfile: function (id) {
      index.list = index.list.filter(function (p) { return p.id !== id; });
      if (index.current === id) { index.current = null; state = defaults(); }
      writeIndex();
      try { localStorage.removeItem(dataKey(id)); } catch (e) { /* ignore */ }
    }
  };

  window.Store = Store;
})();
