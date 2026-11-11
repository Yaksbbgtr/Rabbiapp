# Rebbi App

An all-in-one classroom app for **yeshiva ketana rebbeim**. It runs entirely in the browser, works offline, and keeps all data private on the rebbi's own device.

## What's inside

| Screen | What it does |
| --- | --- |
| **Today** | Hebrew date, parshas hashavua, sefiras ha'omer, upcoming yomim tovim and fasts, talmidim's Hebrew birthdays, today's attendance, plan, parent follow-ups, quick notes |
| **Talmidim** | Roster with Hebrew names, parents, phones, birthdays, private notes. Scan a printed class list with the phone camera (English and Hebrew names, phone numbers), or paste one in. Each talmid has a profile with everything in one place |
| **Attendance** | Everyone starts as Here; tap Late / Absent / Excused for the exceptions and press Save attendance, monthly grid, CSV export, print |
| **Limud** | One page per limud (perek / mishna / sugya) with the rebbi's source notes, each talmid's level (Not yet → Learning → Knows it → Fluent), a "chazara focus" list, and a Create project button (worksheet / test / coloring page – demo for now) |
| **Bechinos** | Tests and quizzes, fast score entry (Enter jumps to the next talmid), class stats, gradebook |
| **Planner** | Day, week and month views with Hebrew dates, parsha and yomim tovim, "where we stopped" notes, copy previous day/week |
| **Parents** | Contact log with follow-up reminders, eight longer letter templates that ask one question and weave in the talmid's own limud levels, last bechina and absences, open in email or text, class directory, who hasn't been called in 30 days |
| **Tools** | Fair random picker (everyone gets a turn), chavrusa / group maker, full-screen timer with presets or a typed time, class jobs rotation |
| **Reports** | Class list that opens each talmid's report card; send them to the school office as separate PDFs through the phone's share sheet; printable report cards (by subject, mastery, attendance, rebbi's comment, signature lines) for any date range |
| **Profiles** | Each rebbi logs in to his own class on the device, with an optional PIN. Sample profiles for grades 1–8 (Kitah Alef to Ches) can be added from the login screen |
| **Settings** | Backup / restore, new-school-year reset, light/dark mode, Hebrew-names mode, PIN |

## Morning attendance texts (demo)

The `server/` folder is a small add-on that texts every rebbi each morning, reads his reply ("Yanky, Moshe K"), and records the absences, ready to send to Parent Locker once that connection is available. See [server/README.md](server/README.md).

## Running it

**Live app:** <https://yaksbbgtr.github.io/Rabbiapp/>. It's published automatically from this branch by `.github/workflows/pages.yml` on every push.


No build step and no server needed.

- **Quickest:** open `index.html` in a browser.
- **To install as an app (offline, home-screen icon):** host the folder on any static host (GitHub Pages, Netlify, etc.), open it, then choose *Add to Home Screen* / *Install app*.
- **Locally with offline support:** `python3 -m http.server` in this folder, then visit <http://localhost:8000>.

Data is stored in the browser's `localStorage`, separately for each profile. Use **Settings → Download backup** regularly. The backup file also moves a class to another device.

## Hebrew calendar

`js/hebcal.js` is a self-contained implementation of the fixed Hebrew calendar, parsha schedule (chutz la'aretz), yomim tovim and Hebrew numerals. It has no dependencies.

```
node tests/hebcal.test.js
node tests/scan.test.js
node tests/templates.test.js
```

The tests check every day from 1990–2060 against the browser's built-in (ICU) Hebrew calendar, check known parsha dates, and confirm that every year from 5600–6000 reads each parsha exactly once.

## Project layout

```
index.html            app shell
css/app.css           styles (light/dark, mobile, print)
js/hebcal.js          Hebrew calendar + parsha
js/store.js           data model & localStorage persistence
js/ui.js              DOM helpers, modals, toasts
js/app.js             navigation & router
js/views/*.js         one file per screen
sw.js                 offline cache
manifest.webmanifest  install metadata
```
