#!/usr/bin/env bash
# Builds a signed iOS IPA on macOS (Xcode). This cannot run on Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iOS IPAs have to be built on a Mac with Xcode." >&2
  echo "On a Mac:" >&2
  echo "  npm install" >&2
  echo "  npm run prepare:www" >&2
  echo "  npx cap sync ios" >&2
  echo "  bash scripts/build-ios.sh" >&2
  echo >&2
  echo "To share with iPhone friends without Xcode, use TestFlight after this IPA," >&2
  echo "or the GitHub Pages home-screen app (see README)." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null; then
  echo "Xcode / xcodebuild is required" >&2
  exit 1
fi

npm run prepare:www
npx cap sync ios

TEAM_ID="${IOS_TEAM_ID:-}"
SCHEME="App"
WORKSPACE="$ROOT/ios/App/App.xcodeproj"
OUT_DIR="$ROOT/dist"
ARCHIVE="$OUT_DIR/RIGCORE.xcarchive"
EXPORT_PLIST="$OUT_DIR/ExportOptions.plist"

mkdir -p "$OUT_DIR"

if [[ -n "$TEAM_ID" ]]; then
  cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${IOS_EXPORT_METHOD:-app-store}</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>compileBitcode</key>
  <false/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
EOF
  xcodebuild -project "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    archive
  xcodebuild -exportArchive -archivePath "$ARCHIVE" \
    -exportPath "$OUT_DIR" -exportOptionsPlist "$EXPORT_PLIST"
  find "$OUT_DIR" -name "*.ipa" -exec cp -f {} "$OUT_DIR/RIGCORE.ipa" \;
  echo "IPA ready: $OUT_DIR/RIGCORE.ipa"
else
  echo "Set IOS_TEAM_ID to your Apple Developer Team ID to export an IPA."
  echo "Building unsigned simulator archive to verify the project compiles..."
  xcodebuild -project "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
    -destination "generic/platform=iOS Simulator" \
    CODE_SIGNING_ALLOWED=NO \
    build
  echo "iOS simulator build succeeded. Add IOS_TEAM_ID and rerun for a shareable IPA / TestFlight upload."
fi
