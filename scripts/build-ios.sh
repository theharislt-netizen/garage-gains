#!/usr/bin/env bash
# Native iPhone IPA entry point (macOS + Xcode only).
# Same command Android friends already have as ./scripts/build-apk.sh:
#   IOS_TEAM_ID=XXXXXXXXXX bash scripts/build-ios.sh
# Without IOS_TEAM_ID this still produces dist/RIGCORE.ipa from a real
# iphoneos binary. Apple will not let friends tap that file to install;
# add IOS_TEAM_ID so CI can sign it for TestFlight.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/package-ios-ipa.sh"
