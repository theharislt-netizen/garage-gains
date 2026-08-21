#!/usr/bin/env bash
# Builds a real iPhone device binary and wraps it as dist/RIGCORE.ipa.
# Must run on macOS with Xcode. Signing is optional (IOS_TEAM_ID).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iPhone IPAs have to be built on a Mac with Xcode (GitHub Actions macos runners do this)." >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null; then
  echo "xcodebuild is required" >&2
  exit 1
fi

if [[ "${SKIP_PREPARE:-}" != "1" ]]; then
  npm run prepare:www
  npx cap sync ios
fi

DERIVED="$ROOT/ios/DerivedData"
rm -rf "$DERIVED"
mkdir -p "$ROOT/dist" "$DERIVED"

TEAM_ID="${IOS_TEAM_ID:-}"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="App"

if [[ -n "$TEAM_ID" ]]; then
  ARCHIVE="$ROOT/dist/RIGCORE.xcarchive"
  EXPORT_PLIST="$ROOT/dist/ExportOptions.plist"
  cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${IOS_EXPORT_METHOD:-ad-hoc}</string>
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
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    -allowProvisioningUpdates \
    archive
  xcodebuild -exportArchive -archivePath "$ARCHIVE" \
    -exportPath "$ROOT/dist" -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates
  find "$ROOT/dist" -name "*.ipa" ! -name "RIGCORE.ipa" -exec cp -f {} "$ROOT/dist/RIGCORE.ipa" \;
else
  # Unsigned device .app — a real iPhone binary, not a website. Apple still
  # blocks installing this by tapping the file; TestFlight needs IOS_TEAM_ID.
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    COMPILER_INDEX_STORE_ENABLE=NO \
    build

  APP="$(find "$DERIVED" -path '*iphoneos*' -name 'App.app' -type d | head -1)"
  if [[ -z "$APP" || ! -d "$APP" ]]; then
    echo "xcodebuild did not produce an iphoneos App.app" >&2
    find "$DERIVED" -name '*.app' -type d | head -20 >&2 || true
    exit 1
  fi

  STAGE="$(mktemp -d)"
  mkdir -p "$STAGE/Payload"
  cp -R "$APP" "$STAGE/Payload/App.app"
  rm -f "$ROOT/dist/RIGCORE.ipa"
  (cd "$STAGE" && zip -qry "$ROOT/dist/RIGCORE.ipa" Payload)
  rm -rf "$STAGE"
fi

ROOT="$ROOT" python3 - <<'PY'
import os, zipfile, sys
root = os.environ["ROOT"]
ipa = os.path.join(root, "dist", "RIGCORE.ipa")
if not os.path.isfile(ipa):
    sys.exit("missing dist/RIGCORE.ipa")
z = zipfile.ZipFile(ipa)
names = z.namelist()
apps = [n for n in names if n.startswith("Payload/") and n.endswith(".app/")]
print("ipa", round(os.path.getsize(ipa) / 1024 / 1024, 2), "MB")
print("entries", len(names))
print("payload_apps", apps[:5] or names[:12])
if not any(n.startswith("Payload/") and ".app/" in n for n in names):
    sys.exit("IPA is not a real iPhone app (missing Payload/*.app)")
print("iphone ipa ok")
PY
echo "IPA ready: $ROOT/dist/RIGCORE.ipa"
ls -lh "$ROOT/dist/RIGCORE.ipa"
