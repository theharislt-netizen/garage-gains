#!/usr/bin/env node
/**
 * Confirms the Capacitor iOS shell matches Android: same app id, live-update
 * plugin, backup import, and shareable project files. Does not build an IPA.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing ${rel}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function mustExist(rel, minBytes = 1) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing ${rel}`);
    return;
  }
  const size = statSync(path).size;
  if (size < minBytes) errors.push(`${rel} is too small (${size} bytes)`);
}

function mustInclude(rel, snippets) {
  const text = read(rel);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${rel} missing ${JSON.stringify(snippet)}`);
  }
}

mustExist('ios/App/App/BackupImportPlugin.swift', 400);
mustExist('ios/App/App/RIGCOREBridgeViewController.swift', 80);
mustExist('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 10000);
mustExist('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png', 10000);
mustExist('scripts/build-ios.sh', 200);
mustExist('scripts/package-ios-ipa.sh', 400);
mustExist('scripts/install-page.html', 400);

mustInclude('ios/App/App/BackupImportPlugin.swift', [
  'jsName = "BackupImport"',
  'pickBackup',
  'UIDocumentPickerViewController',
]);
mustInclude('ios/App/App/RIGCOREBridgeViewController.swift', [
  'registerPluginInstance(BackupImportPlugin())',
]);
mustInclude('ios/App/App/SceneDelegate.swift', [
  'RIGCOREBridgeViewController()',
]);
mustInclude('ios/App/CapApp-SPM/Package.swift', [
  'CapgoCapacitorUpdater',
  'capacitor-swift-pm',
  'CapacitorApp',
]);
mustInclude('ios/App/App.xcodeproj/project.pbxproj', [
  'BackupImportPlugin.swift',
  'RIGCOREBridgeViewController.swift',
  'PRODUCT_BUNDLE_IDENTIFIER = com.rigcore.app;',
  'MARKETING_VERSION = 3.3.2;',
  'CURRENT_PROJECT_VERSION = 332;',
]);
mustInclude('ios/App/App/Info.plist', [
  'ITSAppUsesNonExemptEncryption',
  'UIInterfaceOrientationPortrait',
  'UIStatusBarStyleLightContent',
]);
mustInclude('capacitor.config.json', [
  '"appId": "com.rigcore.app"',
  '"scheme": "App"',
  '"autoUpdate": false',
]);
mustInclude('scripts/native-bridge.mjs', [
  "from '@capgo/capacitor-updater'",
  "App.addListener('appStateChange'",
  'CapacitorUpdater.download',
  'CapacitorUpdater.set(bundle)',
]);
mustInclude('package.json', ['"@capacitor/ios"', '"build:ios"']);
mustInclude('.github/workflows/ios.yml', ['macos-26', 'CODE_SIGNING_ALLOWED=NO', 'package-ios-ipa.sh', 'RIGCORE-iOS']);
mustInclude('.github/workflows/pages.yml', ['actions/deploy-pages@v4', 'path: docs']);
mustInclude('scripts/package-ios-ipa.sh', ['iphoneos', 'Payload', 'RIGCORE.ipa']);
mustInclude('scripts/install-page.html', ['Download Android app', 'TestFlight', 'not the iPhone app']);
mustInclude('scripts/prepare-www.mjs', ['install-page.html', 'docs']);
mustInclude('scripts/build-ios.sh', ['package-ios-ipa.sh']);

if (errors.length) {
  console.error('iOS project check failed:');
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}
console.log('iOS project ok — native iphoneos IPA packaging + install page (not a web-app shortcut)');
