# PALACE (working title) — Android APK

This is a **real Android app**, the same kind as RIGCORE: a signed `.apk` you install once on the phone.

It is also the same single HTML client (`card-game.html`). The cheapest cross-platform test path is to host that file as a browser table — no second codebase, no React rewrite.

- Phone install page: https://theharislt-netizen.github.io/garage-gains/palace/
- Browser table (no install): https://theharislt-netizen.github.io/garage-gains/palace/play/
- Direct APK: [`dist/PALACE.apk`](dist/PALACE.apk)

On the phone: allow **Install unknown apps**, open `PALACE.apk`, tap **Install**. After that, later code pushes update the installed app the next time you open it.

Package id: `com.palace.app` (installs **next to** RIGCORE, not over it). Save key: `palaceCards_v1`.

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
