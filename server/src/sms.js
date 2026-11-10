'use strict';
/*
 * Text message providers.
 *   SMS_PROVIDER=demo   (default) messages are only recorded and shown on the demo page
 *   SMS_PROVIDER=twilio real texts via Twilio (needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
 */
const crypto = require('crypto');
const store = require('./store');

const provider = (process.env.SMS_PROVIDER || 'demo').toLowerCase();

async function send(to, body) {
  store.logMessage({ direction: 'out', phone: store.normalizePhone(to), body });
  store.save();
  if (provider !== 'twilio') {
    console.log(`[sms:demo] -> ${to}: ${body.replace(/\n/g, ' / ')}`);
    return { ok: true, demo: true };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[sms:twilio] send failed', res.status, text);
    return { ok: false, error: text };
  }
  return { ok: true };
}

// Verify that an incoming webhook really came from Twilio.
function validTwilioSignature(url, params, signature) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { send, provider, validTwilioSignature };
