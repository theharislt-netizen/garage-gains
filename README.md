# RIGCORE (Garage Gains)

One app file, **`garage-gains.html`**, ships to Android, iPhone, and the web. You do **not** maintain two copies. A workout or UI change is edited once; Android and iPhone both pick it up.

Package id: `com.rigcore.app` · Version **3.3.2**.

## Why the iPhone link 404s

**https://theharislt-netizen.github.io/garage-gains/** is GitHub Pages. That site is **not on yet**, so friends get 404. I cannot flip that switch from here.

Turn it on (about 30 seconds):

1. Open **https://github.com/theharislt-netizen/garage-gains/settings/pages**
2. Under **Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `cursor/android-apk-eee8`
   - **Folder:** `/docs`
3. Click **Save**
4. Wait about a minute, then send your friend:

**https://theharislt-netizen.github.io/garage-gains/**

On their iPhone: **Safari → Share → Add to Home Screen**.

There is no iPhone file you can text like the Android APK. Apple does not allow that. The Pages link is the shareable iPhone install.

## Android (APK)

1. Download [`dist/RIGCORE.apk`](dist/RIGCORE.apk).
2. Allow **Install unknown apps**, open the APK, tap **Install**.
3. Launch **RIGCORE**.

Minimum Android **8.0**. Data stays on the phone. **Settings → Export Backup** saves a JSON backup.

## One source → both phones (no double work)

```
garage-gains.html     ← only file to edit for app features
        │
        ▼
npm run prepare:www   ← one command
        │
        ├── docs/                 iPhone home-screen site (GitHub Pages)
        ├── live-update/www.zip   auto-update for the installed Android app
        │                         and the native iPhone app
        ├── android/              native shell (icon, file picker, …)
        └── ios/                  native shell (same plugins / same update)
```

| What you change | What you rebuild | Who updates |
| --- | --- | --- |
| Workouts, UI, backup, settings | `npm run prepare:www` only | Android + iPhone (live-update or Pages) |
| Icon, splash, file picker, signing | APK and/or IPA | New install of that native shell |

Opening the **installed Android app** (and a **native iPhone app** later) downloads `live-update/www.zip` from this public repo. Workout logs stay on the phone. The iPhone **home-screen** shortcut loads Pages on each open.

## Native iPhone app (TestFlight)

Same Capacitor shell as Android. Needs a Mac, Xcode, and an Apple Developer team:

```bash
export IOS_TEAM_ID=YOUR_TEAM_ID
bash scripts/build-ios.sh
```

That writes `dist/RIGCORE.ipa` for TestFlight. It uses the same `live-update/` zip as Android.

## Rebuild

```bash
npm install
npm run prepare:www          # updates docs/ + live-update for both phones
npx cap sync android ios     # only if native shells changed
./scripts/build-apk.sh       # Linux/macOS → dist/RIGCORE.apk
IOS_TEAM_ID=XXXX bash scripts/build-ios.sh   # macOS → dist/RIGCORE.ipa
```

Release APKs are signed with `android/app/keystore/rigcore-release.p12`. Keep that keystore so later APKs install as updates.
