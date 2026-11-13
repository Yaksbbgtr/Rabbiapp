# Sync test (two devices, office, another rebbi)

Runs the real app in headless Chrome against local Firebase emulators, so nothing touches the live project.
Needs Node, Java (`brew install openjdk`), the Firebase CLI and Google Chrome.

```
cd tests/sync
npm install --no-save puppeteer-core@23.11.1
cp ../../firestore.rules .                                               # the emulator needs the rules beside its firebase.json
firebase emulators:start --only auth,firestore --project rabbi--app &
node serve.js &                                                        # serves the app on 127.0.0.1:8765
node e2e.js
node shared.js                                                         # issues from one rebbi to another
```

It checks: a class uploaded on one device appears on a second, planner edits travel both ways, edits made offline
merge when back online, the office and the rebbi editing different issues at the same time both survive, another
rebbi can't read or take the class, a rebbi can't make himself office, and signing out clears the device.

`shared.js` checks issues sent from one rebbi's account to another's: the other rebbi shows up in the Send to list,
receives the issue, his red number clears when he opens it, replies travel both ways, and nobody else (and no
account without a class) can read the shared issue or the rebbeim directory.
