# RIGCORE (Garage Gains)

A garage-gym tracker that ships as a **native Android app**, a **native iPhone app**, and a shareable home-screen web app. Source of truth: `garage-gains.html`.

Package id: `com.rigcore.app` · Version **3.3.2**.

## Android (APK)

1. Download [`dist/RIGCORE.apk`](dist/RIGCORE.apk).
2. On the phone: allow **Install unknown apps**, open the APK, tap **Install**.
3. Launch **RIGCORE**.

Minimum Android **8.0**. Workout data stays on the device. Use **Settings → Export Backup** to save a JSON backup.

## iPhone

Apple does not let you sideload an `.ipa` the way Android sideloads an APK. This Linux builder also cannot sign an iPhone app (that needs a Mac + Xcode + an Apple Developer team). Friends can still run RIGCORE in two ways:

### Home-screen app (share this with iPhone friends today)

After GitHub Pages is on, send this link:

**https://theharislt-netizen.github.io/garage-gains/**

On the iPhone: open it in **Safari** → tap **Share** → **Add to Home Screen**. That puts a RIGCORE icon on the home screen. Every time they open it, Safari loads the latest copy from GitHub. No App Store, no token.

Enable Pages once if the link 404s: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the **GitHub Pages** workflow (or push again). The Pages job skips deploy until that setting is on.

### Native iPhone app (same shell as Android)

The Xcode project in `ios/` is the same Capacitor wrap as Android: same `com.rigcore.app` id, same backup import/share, same GitHub live-update (`live-update/www.zip`) on launch and when the app comes back to the foreground.

On a Mac with Xcode and an Apple Developer Team ID:

```bash
npm install
npm run prepare:www
npx cap sync ios
export IOS_TEAM_ID=YOUR_TEAM_ID
bash scripts/build-ios.sh
```

That writes `dist/RIGCORE.ipa`. Upload it to App Store Connect and invite friends on **TestFlight**. Opening the native iPhone app checks GitHub and applies the new web bundle the same way Android does.

`npx cap open ios` runs it on a plugged-in iPhone during development.

## Auto-updates

Install the Android APK or the native iOS app **once**. Opening RIGCORE (and coming back to it) downloads a newer web bundle from this **public** GitHub repo and swaps it in. Workout logs stay on the phone.

The iPhone **home-screen** shortcut updates by loading the GitHub Pages site on each open.

That covers HTML/CSS/JS changes. A new APK/IPA is only needed if native code changes (permissions, plugins, signing).

The published bundle is `live-update/manifest.json` + `live-update/www.zip`, refreshed by `npm run prepare:www`.

## What the native wrap does

The HTML app is packaged with [Capacitor 8](https://capacitorjs.com/):

| Feature | Native behavior |
| --- | --- |
| Launcher icon + splash | Dark RIGCORE plate / "R" mark |
| YouTube form demos | Opens in the system browser |
| Export backup | Share sheet (Android and iPhone) |
| Import backup | System file picker |
| Haptics | Capacitor Haptics |
| Fonts | Bundled offline |
| Auto-update | GitHub `live-update/` on launch and resume |

`garage-gains.html` stays the source of truth. `scripts/prepare-www.mjs` copies it into `www/` and injects the native bridge.

## Rebuild

Needs Node 22+. Android also needs JDK 21 and the Android SDK. iOS IPAs need a Mac + Xcode.

```bash
npm install
npm run prepare:www
npx cap sync android ios
./scripts/build-apk.sh          # Linux/macOS → dist/RIGCORE.apk
IOS_TEAM_ID=XXXX bash scripts/build-ios.sh   # macOS → dist/RIGCORE.ipa
```

### Android signing

Release APKs are signed with `android/app/keystore/rigcore-release.p12` using `android/keystore.properties`. Keep that keystore so later APKs install as updates.

## Project layout

```
garage-gains.html      Web app source (edit here)
scripts/               Prepare www, icons, APK/IPA builds
www/                   Generated web assets
android/               Capacitor Android project
ios/                   Capacitor iOS project
live-update/           Auto-update bundle (manifest + www.zip)
dist/RIGCORE.apk       Installable Android release
capacitor.config.json  App id com.rigcore.app
```
