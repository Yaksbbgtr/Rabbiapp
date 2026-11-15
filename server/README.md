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

Requires Node.js 18 or newer. The texting demo needs no packages; the Parent Locker robot needs `npm install`.

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
| `PARENTLOCKER_ENABLED` | `false` | `true` = the robot enters attendance on Parent Locker |
| `PARENTLOCKER_URL` | from the saved login | the school's Parent Locker site, e.g. `https://yourschool.parentlocker.com` |
| `PARENTLOCKER_DELAY_SECONDS` | `120` | wait after a class's last reply before entering it |
| `PARENTLOCKER_DRY_RUN` | `false` | fill in but don't press Save |
| `OFFICE_PHONE` | | also texted when the robot can't enter a class |
| `PORT` | `3000` | |

### Going live with real texts (later)

1. Create a Twilio account and buy a phone number (about $1/month plus about 1¢ per text).
2. Host this folder on any Node host (Render, Railway, Fly.io…) with the variables above and `SMS_PROVIDER=twilio`.
3. In Twilio, set the number's "A message comes in" webhook to `https://YOUR-SERVER/sms/incoming` (HTTP POST).

## Parent Locker

Parent Locker has no API, so a hidden browser (Playwright) enters attendance on the website the way a rebbi would: **Take Attendance → the course → Present / Late / Absent for each boy → Save Attendance**, then reloads the page to check it saved. Code: `src/parentlocker-robot.js` (selectors at the top, in case Parent Locker changes the page).

- Each reply is saved to `data/parentlocker-queue.json` first. The robot waits `PARENTLOCKER_DELAY_SECONDS` (default 120) after a class's last reply, so corrections ("Dovid came in") go in with it, then sends the latest attendance once. Classes go one at a time.
- If it can't (login expired, course not on today's page, a name doesn't match, page changed), it texts the rebbi, and `OFFICE_PHONE` if set, to enter it by hand.
- It only enters **today's** attendance, and checks the page shows today's date first.

### Setting it up

```
cd server
npm install
npm run pl:login        # a browser opens: log in to Parent Locker, then quit it with ⌘Q (saves the login, not the password)
npm run pl:courses      # today's courses on the Take Attendance page
npm run pl:roster -- "PB-L Limudei Kodesh" "Rabbi Cohen" "+15550001001" "Kitah Gimmel"
                        # copies that course's class list into data/school.json (add nicknames to "aliases" after)
npm run pl:try -- rabbi-cohen "Katz, Moshe=A" "Rosen=L"
                        # fills in Parent Locker and takes a screenshot but does NOT save; add --save to save, --show to watch
```

Then run the server with `PARENTLOCKER_ENABLED=true`. `PARENTLOCKER_DRY_RUN=true` fills in without saving, for testing.

The login session, screenshots and `school.json` hold real names and are git-ignored. `npm run pl:record` records clicks on the site (Playwright codegen) if the page changes and the robot needs updating.
