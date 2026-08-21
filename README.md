# RIGCORE (Garage Gains)

One app file, **`garage-gains.html`**, ships to Android and iPhone. You do **not** maintain two copies.

Package id: `com.rigcore.app` · Version **3.3.2**.

## Android (actual app)

Download [`dist/RIGCORE.apk`](dist/RIGCORE.apk). On the phone: allow **Install unknown apps**, open the APK, tap **Install**.

Minimum Android **8.0**. Data stays on the phone.

## iPhone (actual app)

Apple does **not** let anyone share an iPhone app like an Android APK. A website, or Safari → Add to Home Screen, is **not** the iPhone app.

RIGCORE’s iPhone app is a native Capacitor shell (`ios/`, bundle id `com.rigcore.app`), the same as Android. GitHub Actions packages it as `RIGCORE.ipa`.

Friends can install that native app only through **TestFlight**, which needs an Apple Developer account ($99/year) so the IPA can be signed:

1. Enroll at [developer.apple.com/programs](https://developer.apple.com/programs).
2. In the GitHub repo, add Action secret `IOS_TEAM_ID` (your 10-character Team ID).
3. Re-run the **iOS** workflow. It writes a signed IPA and uploads it as the `RIGCORE-iOS` artifact.
4. Upload that IPA to App Store Connect → TestFlight and send your friends the TestFlight invite.

On a Mac you can also run:

```bash
export IOS_TEAM_ID=YOUR_TEAM_ID
bash scripts/build-ios.sh
```

That writes `dist/RIGCORE.ipa`.

## One source → both phones

```
garage-gains.html     ← only file to edit for app features
        │
        ▼
npm run prepare:www
        │
        ├── live-update/www.zip   auto-update for installed Android + native iPhone
        ├── android/              native Android shell
        └── ios/                  native iPhone shell
```

Opening the **installed native app** (Android APK or iPhone TestFlight) downloads `live-update/www.zip` from this public repo. Workout logs stay on the phone.

## Rebuild

```bash
npm install
npm run prepare:www
npx cap sync android ios
./scripts/build-apk.sh                          # Linux/macOS → dist/RIGCORE.apk
IOS_TEAM_ID=XXXX bash scripts/build-ios.sh      # macOS → dist/RIGCORE.ipa
```

Release APKs are signed with `android/app/keystore/rigcore-release.p12`. Keep that keystore so later APKs install as updates.
