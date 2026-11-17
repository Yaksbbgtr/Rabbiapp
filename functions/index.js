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
  const snap = m ? await getDoc(m[1]) : null;
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
