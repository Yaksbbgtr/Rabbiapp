# Morning attendance texts (demo)

Every school morning, each rebbi gets a text message asking who is absent. He replies with names and the system:

1. matches the names to **his** class list (nicknames, typos, Hebrew names, "Moshe K"),
2. records absences and lates,
3. queues the attendance for **Parent Locker**. The connector is a placeholder for now; see below.

```
08:00  📱 Good morning Rabbi Cohen! Attendance for Kitah Gimmel: who is absent today?
       Reply with names (e.g. "Moshe K, Yanky") or NONE if everyone is here.
       ↩︎ Yanky, Moshe
       📱 ✅ Saved. Absent (1): Yaakov
          ❓ Which "moshe"? Moshe G or Moshe K. Reply e.g. "Moshe G".
       ↩︎ Moshe K
       📱 ✅ Saved. Absent (2): Yaakov, Moshe K.  Reply UNDO to undo.
```

What a rebbi can reply:

| Reply | Meaning |
| --- | --- |
| `Yanky, Duvi` / one name per line / `yanky duvi` | these boys are absent |
| `Dovid late` | Dovid is late |
| `Yanky came in` | take Yanky off today's list |
| `none`, `all here` | everyone is present |
| `list` | show today's list |
| `undo` | undo the last reply |
| `help` | how to reply |

If a rebbi hasn't answered within 45 minutes he gets one reminder. No texts go out on Shabbos, Yom Tov or Chol Hamoed.

## Try the demo

Requires Node.js 18 or newer. There are no packages to install.

```
cd server
npm start
```

Open <http://localhost:3000>. Press **Send morning texts now**, pick a rebbi on the pretend phone, and reply as him. Today's attendance and the Parent Locker queue update on the right. No real texts are sent in demo mode.

```
npm test
```

## Setting up the school

Copy `data/school.sample.json` to `data/school.json` and fill in each rebbi's cell number and class list. Nicknames go in `aliases`. `school.json` is git-ignored so phone numbers stay private.

## Settings (environment variables)

| Variable | Default | |
| --- | --- | --- |
| `SEND_TIME` | `08:00` | when the morning text goes out |
| `SCHOOL_TZ` | `America/New_York` | school time zone |
| `SCHOOL_DAYS` | `0,1,2,3,4,5` | 0 = Sunday … 5 = Friday |
| `REMINDER_MINUTES` | `45` | reminder delay (0 = no reminder) |
| `SMS_PROVIDER` | `demo` | `demo` or `twilio` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | | for real texts |
| `PUBLIC_URL` | | public address of the server (to verify Twilio webhooks) |
| `DEMO` | `true` | set `false` in production to turn off the demo buttons |
| `PARENTLOCKER_ENABLED` | `false` | turn on after the connector is written |
| `PORT` | `3000` | |

### Going live with real texts (later)

1. Create a Twilio account and buy a phone number (about $1/month plus about 1¢ per text).
2. Host this folder on any Node host (Render, Railway, Fly.io…) with the variables above and `SMS_PROVIDER=twilio`.
3. In Twilio, set the number's "A message comes in" webhook to `https://YOUR-SERVER/sms/incoming` (HTTP POST).

## Parent Locker

Parent Locker doesn't publish an API, so `src/parentlocker.js` is a placeholder. After every reply it saves the class's full attendance for the day to `data/parentlocker-queue.json` with status `waiting`, and the demo page shows exactly what would be sent. When the school gets integration access from Parent Locker, fill in `pushAttendance()` in that file and set `PARENTLOCKER_ENABLED=true`. Nothing else needs to change.
