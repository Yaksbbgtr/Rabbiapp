'use strict';
// npm run sms:test -- +15551234567   sends one test text through Twilio using the settings in .env
const to = process.argv[2];
if (!to) { console.error('Usage: npm run sms:test -- +15551234567'); process.exit(1); }
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) {
  if (!process.env[k]) { console.error(`✗ ${k} is missing in server/.env`); process.exit(1); }
}
process.env.SMS_PROVIDER = 'twilio';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sms-test-'));
require('./sms').send(to, '✅ Test from the attendance texts. If you got this, Twilio is set up.')
  .then(r => { console.log(r.ok ? 'Sent. Check the phone.' : '✗ Twilio said: ' + r.error); process.exit(r.ok ? 0 : 1); });
