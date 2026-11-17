/*
 * GET /calendar/<token>.ics  →  the rebbi's live calendar.
 *
 * The app keeps calendars/<token> in Firestore up to date (ready-made .ics text); this only hands it out,
 * so Google / Apple / Outlook Calendar can subscribe to it. The token is a long random secret made by the app.
 */
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const TOKEN = /^\/?(?:calendar\/)?([A-Za-z0-9]{24,64})(?:\.ics)?\/?$/;

async function handle(req, res, getDoc) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(405).set('Allow', 'GET, HEAD').send('Method not allowed'); return; }
  const m = TOKEN.exec(req.path || '');
  let snap = null;
  try { snap = m ? await getDoc(m[1]) : null; } catch (e) {
    console.error('calendar read failed', e);
    res.status(503).set('Retry-After', '600').set('Cache-Control', 'no-store').send('Calendar temporarily unavailable (' + (e.code || 'error') + ').');
    return;
  }
  const ics = snap && snap.exists ? snap.get('ics') : null;
  if (typeof ics !== 'string') { res.status(404).set('Cache-Control', 'no-store').send('This calendar link is no longer active.'); return; }
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="calendar.ics"');
  res.set('Cache-Control', 'private, max-age=300');
  res.set('X-Robots-Tag', 'noindex');
  res.status(200).send(ics);
}

exports.calendar = onRequest({ region: 'us-central1', maxInstances: 5, memory: '256MiB', invoker: 'public' },
  (req, res) => handle(req, res, (token) => admin.firestore().collection('calendars').doc(token).get()));

exports._handle = handle; // for tests

/*
 * POST /calimport  { url }  →  { name, events: [...] }   (signed-in rebbeim only: Authorization: Bearer <Firebase ID token>)
 *
 * The other direction: shows the rebbi's own Apple (iCloud) / Google / Outlook calendar inside the planner.
 * Browsers can't read those calendar links themselves (no CORS), so this fetches the link, reads it and sends back
 * the events of the past 2 months and the coming year, with repeating events already spread out.
 * Only calendar hosts are fetched, so this can't be used to reach anything else.
 */
const ALLOWED_HOST = /(^|\.)(icloud\.com|calendar\.google\.com|outlook\.live\.com|outlook\.office365\.com|outlook\.office\.com)$/i;
const MAX_ICS = 5 * 1024 * 1024, MAX_EVENTS = 3000, DAY = 86400000;

function calendarURL(raw) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch (e) { return null; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !ALLOWED_HOST.test(u.hostname)) return null;
  return u;
}

// All-day dates are made at local midnight by node-ical, so read them back with local getters.
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function readCalendar(text, now) {
  const ical = require('node-ical');
  const data = ical.sync.parseICS(text);
  const from = new Date(now - 62 * DAY), to = new Date(now + 400 * DAY);
  let name = '';
  const out = [];
  for (const key of Object.keys(data)) {
    const ev = data[key];
    if (key === 'vcalendar' && ev && ev['WR-CALNAME']) name = String(ev['WR-CALNAME']);
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    if (/@rebbi-app$/.test(ev.uid || '')) continue;            // our own live calendar, already in the planner
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;
    let list;
    try { list = ical.expandRecurringEvent(ev, { from, to, maxIterations: 2000 }); } catch (e) { continue; }
    for (const x of list) {
      if (!x.start || isNaN(x.start)) continue;
      const end = x.end && !isNaN(x.end) ? x.end : null;
      const title = String((x.summary && x.summary.val) || x.summary || 'Busy').slice(0, 300);
      const loc = x.event && x.event.location ? String(x.event.location.val || x.event.location).slice(0, 200) : '';
      const e = { id: String(ev.uid || key).slice(0, 200) + '|' + x.start.getTime(), title, location: loc || undefined };
      if (x.isFullDay) {
        e.allDay = true; e.date = ymd(x.start);
        e.endDate = end && end > x.start ? ymd(end) : undefined;   // exclusive, like the .ics file
        if (e.endDate && e.endDate < ymd(from)) continue;
        if (!e.endDate && e.date < ymd(from)) continue;
      } else {
        if ((end || x.start) < from || x.start > to) continue;
        e.start = x.start.toISOString(); e.end = end ? end.toISOString() : undefined;
      }
      out.push(e);
      if (out.length >= MAX_EVENTS) break;
    }
    if (out.length >= MAX_EVENTS) break;
  }
  out.sort((a, b) => (a.date || a.start).localeCompare(b.date || b.start));
  return { name, events: out };
}

async function importHandle(req, res, deps) {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).set('Allow', 'POST').json({ error: 'method' }); return; }
  const m = /^Bearer (.+)$/.exec(req.get ? req.get('authorization') || '' : (req.headers || {}).authorization || '');
  try { if (!m) throw new Error('no token'); await deps.verify(m[1]); } catch (e) { res.status(401).json({ error: 'signin' }); return; }
  const u = calendarURL(req.body && req.body.url);
  if (!u) { res.status(400).json({ error: 'link' }); return; }
  let text;
  try {
    const r = await deps.fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/calendar, */*' } });
    if (r.url && !calendarURL(r.url)) throw Object.assign(new Error('redirected away'), { status: 400 });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status === 404 || r.status === 403 || r.status === 401 ? 404 : 502 });
    const len = +r.headers.get('content-length') || 0;
    if (len > MAX_ICS) throw Object.assign(new Error('too big'), { status: 413 });
    text = await r.text();
    if (text.length > MAX_ICS) throw Object.assign(new Error('too big'), { status: 413 });
  } catch (e) {
    const status = e.status || 502;
    res.status(status).json({ error: status === 404 ? 'gone' : status === 413 ? 'big' : status === 400 ? 'link' : 'fetch' });
    return;
  }
  if (!/BEGIN:VCALENDAR/.test(text)) { res.status(422).json({ error: 'notcal' }); return; }
  try { res.status(200).json(readCalendar(text, deps.now ? deps.now() : Date.now())); } catch (e) {
    console.error('calimport parse failed', e); res.status(422).json({ error: 'notcal' });
  }
}

exports.calimport = onRequest({ region: 'us-central1', maxInstances: 5, memory: '256MiB', invoker: 'public', timeoutSeconds: 30,
  cors: ['https://yaksbbgtr.github.io', /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] },
  (req, res) => importHandle(req, res, { verify: (t) => admin.auth().verifyIdToken(t), fetch: (u, o) => fetch(u, o) }));

exports._importHandle = importHandle; exports._readCalendar = readCalendar; exports._calendarURL = calendarURL; // for tests
