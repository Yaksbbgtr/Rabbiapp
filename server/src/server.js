'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const sms = require('./sms');
const att = require('./attendance');
const parentlocker = require('./parentlocker');
const scheduler = require('./scheduler');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DEMO = process.env.DEMO !== 'false';
const PUBLIC = path.join(__dirname, '..', 'public');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function overview(date) {
  const day = store.days()[date] || {};
  return {
    date, demo: DEMO, smsProvider: sms.provider, parentLockerConnected: parentlocker.enabled,
    sendTime: scheduler.SEND_TIME, timeZone: att.TZ, school: store.school().school,
    rebbeim: store.rebbeim().map(r => {
      const rec = day[r.id] || { absent: {} };
      return {
        id: r.id, name: r.name, className: r.className, phone: store.normalizePhone(r.phone),
        prompted: rec.prompted || null, answered: rec.answered || null,
        talmidim: r.talmidim.map(st => ({ id: st.id, name: `${st.first} ${st.last}`, status: rec.absent[st.id] || 'P' }))
      };
    }),
    parentLocker: parentlocker.queue().filter(q => q.date === date),
    messages: store.messages().slice(-300)
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // Twilio webhook for incoming texts
    if (req.method === 'POST' && url.pathname === '/sms/incoming') {
      const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
      if (sms.provider === 'twilio') {
        const publicUrl = (process.env.PUBLIC_URL || `https://${req.headers.host}`) + url.pathname;
        if (!sms.validTwilioSignature(publicUrl, params, req.headers['x-twilio-signature'])) {
          res.writeHead(403); return res.end('Invalid signature');
        }
      }
      const reply = await att.handleIncoming(params.From, params.Body || '', { noSend: true });
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`);
    }

    if (req.method === 'GET' && url.pathname === '/api/overview') {
      return json(res, 200, overview(url.searchParams.get('date') || att.todayISO()));
    }

    // Demo-only endpoints: pretend to be a rebbi's phone
    if (DEMO && req.method === 'POST' && url.pathname.startsWith('/api/demo/')) {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (url.pathname === '/api/demo/send-morning') {
        for (const r of store.rebbeim()) await att.sendMorningPrompt(r, att.todayISO(), { force: true });
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/demo/reply') {
        const r = store.rebbi(body.rebbiId);
        if (!r) return json(res, 404, { error: 'No such rebbi' });
        const reply = await att.handleIncoming(r.phone, String(body.text || ''), { noSend: sms.provider !== 'twilio' });
        return json(res, 200, { reply });
      }
      if (url.pathname === '/api/demo/reset') {
        store.resetDemo(); parentlocker.reset();
        return json(res, 200, { ok: true });
      }
    }

    // Static demo page
    if (req.method === 'GET') {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const full = path.join(PUBLIC, path.normalize(file));
      if (full.startsWith(PUBLIC) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        res.writeHead(200, { 'Content-Type': (types[path.extname(full)] || 'text/plain') + '; charset=utf-8' });
        return fs.createReadStream(full).pipe(res);
      }
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Attendance bot running on http://localhost:${PORT}  (texts: ${sms.provider}, Parent Locker: ${parentlocker.enabled ? 'on' : 'not connected'})`);
    scheduler.start();
  });
}

module.exports = { server, overview };
