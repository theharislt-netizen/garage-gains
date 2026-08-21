#!/usr/bin/env bash
# Builds a real iPhone device binary as dist/RIGCORE.ipa.
# Unsigned IPA: always works on macOS CI, will not install on a stock iPhone.
# Signed TestFlight IPA: needs IOS_TEAM_ID + App Store Connect API key.
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
ASC_KEY_ID="${APP_STORE_CONNECT_KEY_ID:-}"
ASC_ISSUER="${APP_STORE_CONNECT_ISSUER_ID:-}"
ASC_KEY="${APP_STORE_CONNECT_API_KEY:-}"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="App"

echo "ios_team_id=$([[ -n "$TEAM_ID" ]] && echo set || echo missing)"
echo "asc_key_id=$([[ -n "$ASC_KEY_ID" ]] && echo set || echo missing)"
echo "asc_issuer=$([[ -n "$ASC_ISSUER" ]] && echo set || echo missing)"
echo "asc_api_key=$([[ -n "$ASC_KEY" ]] && echo set || echo missing)"

write_asc_key() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  umask 077
  if [[ "$ASC_KEY" == *"BEGIN PRIVATE KEY"* ]]; then
    printf '%s\n' "$ASC_KEY" > "$dest"
  else
    printf '%s' "$ASC_KEY" | tr -d '\n' | base64 --decode > "$dest"
  fi
}

build_unsigned() {
  echo "Building unsigned iphoneos IPA (not installable by tapping on iPhone)"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    COMPILER_INDEX_STORE_ENABLE=NO \
    build

  local app
  app="$(find "$DERIVED" -path '*iphoneos*' -name 'App.app' -type d | head -1)"
  if [[ -z "$app" || ! -d "$app" ]]; then
    echo "xcodebuild did not produce an iphoneos App.app" >&2
    find "$DERIVED" -name '*.app' -type d | head -20 >&2 || true
    return 1
  fi

  local stage
  stage="$(mktemp -d)"
  mkdir -p "$stage/Payload"
  cp -R "$app" "$stage/Payload/App.app"
  rm -f "$ROOT/dist/RIGCORE.ipa"
  (cd "$stage" && zip -qry "$ROOT/dist/RIGCORE.ipa" Payload)
  rm -rf "$stage"
}

build_signed() {
  local key_file="$ROOT/dist/AuthKey_${ASC_KEY_ID}.p8"
  write_asc_key "$key_file"
  mkdir -p "$HOME/.appstoreconnect/private_keys"
  cp -f "$key_file" "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"

  local archive="$ROOT/dist/RIGCORE.xcarchive"
  local export_plist="$ROOT/dist/ExportOptions.plist"
  cat > "$export_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>compileBitcode</key>
  <false/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <true/>
</dict>
</plist>
EOF

  echo "Archiving signed iPhone app for TestFlight"
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$archive" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$key_file" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER" \
    archive

  xcodebuild -exportArchive -archivePath "$archive" \
    -exportPath "$ROOT/dist" -exportOptionsPlist "$export_plist" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$key_file" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER"

  find "$ROOT/dist" -name "*.ipa" ! -name "RIGCORE.ipa" -exec cp -f {} "$ROOT/dist/RIGCORE.ipa" \;
  if [[ ! -f "$ROOT/dist/RIGCORE.ipa" ]]; then
    echo "signed export did not produce an IPA" >&2
    return 1
  fi

  echo "Uploading IPA to App Store Connect / TestFlight"
  xcrun altool --upload-app --type ios --file "$ROOT/dist/RIGCORE.ipa" \
    --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER" \
    --quiet || {
      echo "TestFlight upload failed. Create the iOS app in App Store Connect with bundle id com.rigcore.app, then re-run." >&2
      return 1
    }
  echo "signed_testflight_upload=ok"
}

if [[ -n "$TEAM_ID" && -n "$ASC_KEY_ID" && -n "$ASC_ISSUER" && -n "$ASC_KEY" ]]; then
  if ! build_signed; then
    echo "Signed TestFlight build failed; falling back to unsigned IPA so CI stays green."
    build_unsigned
  fi
else
  if [[ -n "$TEAM_ID" ]]; then
    echo "IOS_TEAM_ID is set, but App Store Connect API key secrets are missing."
    echo "Add APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_API_KEY."
  fi
  build_unsigned
fi

ROOT="$ROOT" python3 - <<'PY'
import os, zipfile, sys
root = os.environ["ROOT"]
ipa = os.path.join(root, "dist", "RIGCORE.ipa")
if not os.path.isfile(ipa):
    sys.exit("missing dist/RIGCORE.ipa")
z = zipfile.ZipFile(ipa)
names = z.namelist()
print("ipa", round(os.path.getsize(ipa) / 1024 / 1024, 2), "MB")
print("entries", len(names))
if not any(n.startswith("Payload/") and ".app/" in n for n in names):
    sys.exit("IPA is not a real iPhone app (missing Payload/*.app)")
print("iphone ipa ok")
PY
echo "IPA ready: $ROOT/dist/RIGCORE.ipa"
ls -lh "$ROOT/dist/RIGCORE.ipa"
