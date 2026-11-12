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
```

It checks: a class uploaded on one device appears on a second, planner edits travel both ways, edits made offline
merge when back online, the office and the rebbi editing different issues at the same time both survive, another
rebbi can't read or take the class, a rebbi can't make himself office, and signing out clears the device.
