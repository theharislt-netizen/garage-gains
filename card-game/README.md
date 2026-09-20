# PALACE (working title)

Separate card-game Android app. Same **install once, auto-update on open** workflow as RIGCORE.

This is not a RIGCORE reskin of the workout tracker. The game lives in `card-game/` with its own:

- App id `com.palace.app` (installs next to RIGCORE, not over it)
- Save key `palaceCards_v1` (never `garageGains_v1`)
- APK `card-game/dist/PALACE.apk`
- Live-update zip `card-game/live-update/www.zip`

Working title is **PALACE**. Rename later if you want; keep the application id and save key stable so the installed phone copy keeps updating.

## Install once

Download [`dist/PALACE.apk`](dist/PALACE.apk). On the phone: allow **Install unknown apps**, open the APK, tap **Install**.

Minimum Android **8.0**. Progress stays on the phone.

Direct link after this branch is pushed:

`https://github.com/theharislt-netizen/garage-gains/raw/cursor/card-game-setup-e78b/card-game/dist/PALACE.apk`

## How updates reach the phone

Same pipeline as RIGCORE:

```
card-game.html          ← only file to edit for app features
        │
        ▼
npm run prepare:www
        │
        ├── live-update/www.zip   auto-update for the installed APK
        └── android/              native Android shell
```

Opening the **installed native app** downloads `card-game/live-update/www.zip` from this public repo (branch `cursor/card-game-setup-e78b`, then `main`). You do **not** transfer a new APK for each code change.

## Rebuild

From `card-game/`:

```bash
npm install
python3 scripts/generate-icons.py
npm run prepare:www
npx cap sync android
./scripts/build-apk.sh            # → dist/PALACE.apk
```

Release APKs are signed with `android/app/keystore/palace-release.p12`. Keep that keystore so later APKs install as updates of PALACE.

## What this setup includes

- Capacitor Android shell copied from RIGCORE’s proven APK branch
- Capgo live-update on every app open / resume
- Navigation shell from the card-game design (Home, Shop, Inventory, Subscription, Friends, Settings)
- Inventory / Enchant / Craft layout reused from RIGCORE
- Settings Export / Import backup
- Starter save: 400 coins, daily login +50, independent of RIGCORE

Match play, bots, and cosmetic catalogs are not in this setup pass. Design notes live in `design/`.

## Do not mix with RIGCORE

- Do not rename `garageGains_v1`
- Do not put PALACE code into `garage-gains.html`
- Do not reuse `com.rigcore.app` — that would overwrite the workout app
