# RIGCORE (Garage Gains)

A garage-gym tracker that now ships as a **real Android app** (`com.rigcore.app`), plus the original single-file web app in `garage-gains.html`.

## Install the APK

1. Download [`dist/RIGCORE.apk`](dist/RIGCORE.apk) from this repo (or the pull request).
2. On your phone: **Settings → Security** (or **Apps**) → allow **Install unknown apps** for Chrome/Files/whatever you used to download it.
3. Open the APK and tap **Install**.
4. Launch **RIGCORE** from the app drawer.

Minimum Android version: **8.0 (API 24)**. Target: Android 16 (API 36).

Your workout data stays on the device (`localStorage` inside the app). Use **Settings → Export Backup** to share/save a JSON backup through Android's share sheet.

## What this wrap does

The HTML app is packaged with [Capacitor 8](https://capacitorjs.com/) into a native WebView:

| Feature | Native behavior |
| --- | --- |
| Launcher icon + splash | Dark RIGCORE plate / "R" mark |
| YouTube form demos | Opens in Chrome/YouTube via the Browser plugin |
| Export backup | Writes a JSON file and opens the Android share sheet |
| Import backup | System file picker (already in the web UI) |
| Haptics | Vibration permission + Capacitor Haptics |
| Back button | Closes overlays first, then exits |
| Fonts | Bundled offline (no Google Fonts at runtime) |
| Add to Home Screen | Hidden in the native app (you already installed it) |

The original `garage-gains.html` is unchanged as the source of truth. `scripts/prepare-www.mjs` copies it into `www/`, injects the native bridge, and swaps in local fonts before each Android build.

## Rebuild the APK

Needs Node 22+, JDK 21, and the Android SDK (platforms 36 + build-tools 36).

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # or your JDK 21
export ANDROID_HOME=$HOME/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME

npm install
chmod +x scripts/build-apk.sh
./scripts/build-apk.sh
```

That writes a signed release APK to `dist/RIGCORE.apk`.

Useful pieces:

- `npm run prepare:www` — refresh `www/` from `garage-gains.html`
- `npm run icons` — regenerate launcher / splash images
- `npm run build:debug` — unsigned debug APK
- `npm run build:apk` — signed release APK
- `npx cap open android` — open in Android Studio

### Signing

Release builds are signed with `android/app/keystore/rigcore-release.p12` using `android/keystore.properties`. **Keep that keystore** if you want later APKs to install as updates over this one. A new keystore means Android treats it as a different app.

This is a personal sideload key, not a Play Store upload key. For Play Console you'd create an upload key / Play App Signing separately.

## Project layout

```
garage-gains.html      Web app source (edit here)
scripts/               Prepare www, icons, APK build
www/                   Generated web assets copied into the APK
android/               Capacitor Android project
dist/RIGCORE.apk       Installable release APK
capacitor.config.json  App id com.rigcore.app
```

## Version

App version **3.2.0** (`versionCode` 320), matching the in-app About screen.
