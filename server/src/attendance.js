'use strict';
/* The morning-text conversation: send the prompt, understand replies, record absences. */
const store = require('./store');
const sms = require('./sms');
const parentlocker = require('./parentlocker');
const { parseReply } = require('./parser');

const TZ = process.env.SCHOOL_TZ || 'America/New_York';

function todayISO(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function fullName(st) { return `${st.first} ${st.last}`; }
function shortName(st, roster) {
  const sameFirst = roster.filter(s => s.first === st.first).length > 1;
  return sameFirst ? `${st.first} ${st.last[0]}.` : st.first;
}
function listNames(ids, roster) {
  return ids.map(id => roster.find(s => s.id === id)).filter(Boolean).map(s => shortName(s, roster)).join(', ');
}

const HELP = 'Reply with the names of boys who are absent, e.g. "Moshe K, Yanky".\n' +
  'Add "late" for late boys ("Dovid late"). "Yanky came in" removes him.\n' +
  'NONE = everyone here · LIST = see today · UNDO = undo last reply';

function morningText(rebbi) {
  return `Good morning ${rebbi.name}! ☀️ Attendance for ${rebbi.className}: who is absent today?\n` +
    'Reply with names (e.g. "Moshe K, Yanky") or NONE if everyone is here.';
}

async function sendMorningPrompt(rebbi, date = todayISO(), opts = {}) {
  const rec = store.day(date, rebbi.id);
  if (rec.prompted && !opts.force) return false;
  rec.prompted = new Date().toISOString();
  store.save();
  await sms.send(rebbi.phone, morningText(rebbi));
  return true;
}

async function sendReminder(rebbi, date = todayISO()) {
  const rec = store.day(date, rebbi.id);
  if (!rec.prompted || rec.answered || rec.reminded) return false;
  rec.reminded = new Date().toISOString();
  store.save();
  await sms.send(rebbi.phone, `Reminder: please reply with today's absences for ${rebbi.className}, or NONE if everyone is here.`);
  return true;
}

function summary(rec, roster) {
  const abs = Object.keys(rec.absent).filter(id => rec.absent[id] === 'A');
  const late = Object.keys(rec.absent).filter(id => rec.absent[id] === 'L');
  const parts = [];
  parts.push(abs.length ? `Absent (${abs.length}): ${listNames(abs, roster)}` : 'Absent: nobody');
  if (late.length) parts.push(`Late: ${listNames(late, roster)}`);
  return parts.join('\n');
}

async function syncParentLocker(rebbi, date, rec) {
  return parentlocker.sync({
    date, rebbiId: rebbi.id, rebbi: rebbi.name, className: rebbi.className,
    records: rebbi.talmidim.map(st => ({ studentId: st.id, name: fullName(st), status: rec.absent[st.id] || 'P' }))
  });
}

/** Handle an incoming text. Returns the reply text (also sent via sms unless opts.noSend). */
async function handleIncoming(phone, body, opts = {}) {
  const date = opts.date || todayISO();
  store.logMessage({ direction: 'in', phone: store.normalizePhone(phone), body });
  const rebbi = store.rebbiByPhone(phone);
  let reply;
  if (!rebbi) {
    reply = 'Sorry, this number is not registered with the attendance system. Please contact the office.';
  } else {
    reply = await respond(rebbi, date, body);
  }
  store.save();
  if (!opts.noSend) await sms.send(phone, reply);
  else store.logMessage({ direction: 'out', phone: store.normalizePhone(phone), body: reply });
  store.save();
  return reply;
}

async function respond(rebbi, date, body) {
  const roster = rebbi.talmidim;
  const rec = store.day(date, rebbi.id);
  const r = parseReply(body, roster);

  if (r.command === 'help') return HELP;
  if (r.command === 'list') return `${rebbi.className}, today:\n${summary(rec, roster)}`;
  if (r.command === 'undo') {
    if (!rec.history.length) return 'Nothing to undo.';
    rec.absent = rec.history.pop();
    await syncParentLocker(rebbi, date, rec);
    return `Undone.\n${summary(rec, roster)}`;
  }

  rec.history.push(Object.assign({}, rec.absent));
  rec.answered = rec.answered || new Date().toISOString();

  if (r.command === 'none') {
    await syncParentLocker(rebbi, date, rec);
    const any = Object.keys(rec.absent).length;
    return any ? `Got it, no one else.\n${summary(rec, roster)}` : `Thank you! Everyone in ${rebbi.className} is marked present. ✅`;
  }

  r.absent.forEach(st => { rec.absent[st.id] = 'A'; });
  r.late.forEach(st => { rec.absent[st.id] = 'L'; });
  r.present.forEach(st => { delete rec.absent[st.id]; });

  const changed = r.absent.length + r.late.length + r.present.length;
  if (!changed) rec.history.pop();
  else await syncParentLocker(rebbi, date, rec);

  const lines = [];
  if (changed) lines.push('✅ Saved.', summary(rec, roster));
  r.ambiguous.forEach(a => {
    lines.push(`❓ Which "${a.text}"? ${a.options.map(o => `${o.first} ${o.last[0]}`).join(' or ')}. Reply e.g. "${a.options[0].first} ${a.options[0].last[0]}".`);
  });
  if (r.unknown.length) lines.push(`⚠️ I couldn't find: ${r.unknown.join(', ')}. Check the spelling, or reply HELP.`);
  if (changed) lines.push('Reply UNDO to undo.');
  return lines.join('\n') || HELP;
}

module.exports = { todayISO, sendMorningPrompt, sendReminder, handleIncoming, morningText, summary, TZ };
