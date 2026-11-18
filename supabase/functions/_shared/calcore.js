/*
 * The two calendar web addresses, written as plain Request → Response handlers so they run the same in
 * Supabase Edge Functions (Deno) and in the Node tests. Anything from outside (database, sign-in check,
 * the calendar reader, fetch) is passed in.
 *
 *   GET  .../calendar/<token>.ics   the rebbi's live calendar, for Google / Apple / Outlook Calendar to subscribe to.
 *   POST .../calimport  { url }     the other way: reads the rebbi's own Apple / Google / Outlook calendar link
 *                                   (browsers can't, no CORS) and returns its events for the planner.
 */

// ---------- live calendar ----------
const TOKEN = /(?:^|\/)([A-Za-z0-9]{24,64})(?:\.ics)?\/?$/;

export async function handleCalendar(req, getIcs) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const path = new URL(req.url).pathname;
  // Only the last part of the path may be the token, and only after .../calendar/
  const m = /\/calendar\/[^/]+\/?$/.test(path) ? TOKEN.exec(path) : null;
  let ics = null;
  try { ics = m ? await getIcs(m[1]) : null; } catch (e) {
    console.error('calendar read failed', e);
    return new Response('Calendar temporarily unavailable (' + (e.code || 'error') + ').', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  }
  if (typeof ics !== 'string') return new Response('This calendar link is no longer active.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(req.method === 'HEAD' ? null : ics, { status: 200, headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="calendar.ics"',
    'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' } });
}

// ---------- calendar import ----------
const ALLOWED_HOST = /(^|\.)(icloud\.com|calendar\.google\.com|outlook\.live\.com|outlook\.office365\.com|outlook\.office\.com)$/i;
const ORIGINS = /^(https:\/\/yaksbbgtr\.github\.io|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MAX_ICS = 5 * 1024 * 1024, MAX_EVENTS = 3000, DAY = 86400000;

export function calendarURL(raw) {
  let u;
  try { u = new URL(String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch (e) { return null; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !ALLOWED_HOST.test(u.hostname)) return null;
  return u;
}

// All-day dates are made at local midnight by node-ical, so read them back with local getters.
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

export function readCalendar(ical, text, now) {
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
        if ((e.endDate || e.date) < ymd(from)) continue;
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

function cors(req) {
  const o = req.headers.get('origin') || '';
  return ORIGINS.test(o) ? { 'Access-Control-Allow-Origin': o, Vary: 'Origin' } : { Vary: 'Origin' };
}
function json(req, status, body) {
  return new Response(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, cors(req)) });
}
class Fail extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

// deps: { verify(token) → user (throws if not signed in), fetch, ical, now? }
export async function handleImport(req, deps) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({
    'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '86400' }, cors(req)) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method' });
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
  try { if (!m) throw new Error('no token'); await deps.verify(m[1]); } catch (e) { return json(req, 401, { error: 'signin' }); }
  let body = {};
  try { body = await req.json(); } catch (e) { /* treated as no link */ }
  const u = calendarURL(body && body.url);
  if (!u) return json(req, 400, { error: 'link' });
  let text;
  try {
    const r = await deps.fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/calendar, */*' } });
    if (r.url && !calendarURL(r.url)) throw new Fail(400, 'link');
    if (!r.ok) throw new Fail(r.status === 404 || r.status === 403 || r.status === 401 ? 404 : 502, r.status === 404 || r.status === 403 || r.status === 401 ? 'gone' : 'fetch');
    if ((+r.headers.get('content-length') || 0) > MAX_ICS) throw new Fail(413, 'big');
    text = await r.text();
    if (text.length > MAX_ICS) throw new Fail(413, 'big');
  } catch (e) {
    return json(req, e.status || 502, { error: e.code && e instanceof Fail ? e.code : 'fetch' });
  }
  if (!/BEGIN:VCALENDAR/.test(text)) return json(req, 422, { error: 'notcal' });
  try { return json(req, 200, readCalendar(deps.ical, text, deps.now ? deps.now() : Date.now())); } catch (e) {
    console.error('calimport parse failed', e); return json(req, 422, { error: 'notcal' });
  }
}
