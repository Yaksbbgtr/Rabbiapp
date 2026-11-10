'use strict';
/*
 * Sends the morning text on school days at SEND_TIME (school time zone),
 * and one reminder REMINDER_MINUTES later to rebbeim who haven't answered.
 * Skips Shabbos, Yom Tov and Chol Hamoed (using the app's Hebrew calendar).
 */
const HebCal = require('../../js/hebcal.js');
const store = require('./store');
const att = require('./attendance');

const SEND_TIME = process.env.SEND_TIME || '08:00';
const REMINDER_MINUTES = parseInt(process.env.REMINDER_MINUTES || '45', 10);
const SCHOOL_DAYS = (process.env.SCHOOL_DAYS || '0,1,2,3,4,5').split(',').map(Number); // 0 = Sunday
const LATEST_MINUTES = 120; // don't send a "morning" text more than 2 hours late

function localNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: att.TZ, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10), weekday: days[parts.weekday] };
}

function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

function isSchoolDay(dateISO, weekday) {
  if (!SCHOOL_DAYS.includes(weekday)) return false;
  const rd = HebCal.isoToRD(dateISO);
  const blocked = HebCal.holidaysBetween(rd, rd).some(h => h.yomTov || h.cholHamoed);
  return !blocked;
}

async function tick(now = new Date()) {
  const date = att.todayISO(now);
  const { minutes, weekday } = localNow(now);
  if (!isSchoolDay(date, weekday)) return;
  const start = toMinutes(SEND_TIME);
  for (const rebbi of store.rebbeim()) {
    try {
      if (minutes >= start && minutes < start + LATEST_MINUTES) await att.sendMorningPrompt(rebbi, date);
      if (REMINDER_MINUTES > 0 && minutes >= start + REMINDER_MINUTES && minutes < start + LATEST_MINUTES) await att.sendReminder(rebbi, date);
    } catch (e) {
      console.error('scheduler error for', rebbi.name, e);
    }
  }
}

function start() {
  console.log(`Morning texts at ${SEND_TIME} (${att.TZ}) on days ${SCHOOL_DAYS.join(',')}; reminder after ${REMINDER_MINUTES} min.`);
  tick();
  return setInterval(tick, 30 * 1000);
}

module.exports = { start, tick, isSchoolDay, SEND_TIME };
