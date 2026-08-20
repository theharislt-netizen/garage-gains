#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -d "$ANDROID_HOME/platforms" ]]; then
  echo "Android SDK not found at $ANDROID_HOME" >&2
  echo "Install command-line tools and packages; see README.md" >&2
  exit 1
fi

if [[ ! -f android/local.properties ]]; then
  echo "sdk.dir=${ANDROID_HOME}" > android/local.properties
fi

if [[ ! -f android/app/keystore/rigcore-release.p12 ]]; then
  echo "Missing release keystore at android/app/keystore/rigcore-release.p12" >&2
  exit 1
fi
if [[ ! -f android/keystore.properties ]]; then
  echo "Missing android/keystore.properties" >&2
  exit 1
fi

npm run build:apk

OUT="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$OUT" ]]; then
  echo "Gradle did not produce $OUT" >&2
  exit 1
fi

mkdir -p dist
cp -f "$OUT" dist/RIGCORE.apk
cp -f "$OUT" dist/RIGCORE-v3.2.apk

echo
echo "APK ready:"
ls -lh dist/RIGCORE.apk

AAPT="$(ls -d "$ANDROID_HOME"/build-tools/*/aapt 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$AAPT" && -x "$AAPT" ]]; then
  "$AAPT" dump badging dist/RIGCORE.apk | head -25
fi
