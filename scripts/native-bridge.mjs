/**
 * Native Android bridge for RIGCORE.
 * Bundled into www/native-bridge.js and injected after the web app boots.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const STORE_KEY = 'garageGains_v1';
const REGISTRY_KEY = STORE_KEY + '::registry';

function todayStamp() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function currentProfileJson() {
  let id = 'p1';
  try {
    const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    if (registry.currentId) id = registry.currentId;
  } catch (_) { /* keep p1 */ }
  const key = id === 'p1' ? STORE_KEY : STORE_KEY + '::' + id;
  return localStorage.getItem(key) || '{}';
}

function hideHomeScreenShortcut() {
  const btn = document.getElementById('addHomeBtn');
  if (!btn) return;
  const card = btn.closest('.card');
  const title = card && card.previousElementSibling;
  if (title && title.classList.contains('section-title')) title.style.display = 'none';
  if (card) card.style.display = 'none';
}

function closeTopOverlay() {
  const leave = document.querySelector(
    '#enchantWindow[style*="display: block"] .instance-leave-btn, #enchantWindow:not([style*="display:none"]) .instance-leave-btn'
  );
  if (leave && leave.offsetParent) {
    leave.click();
    return true;
  }
  const visibleModals = [...document.querySelectorAll('.modal-overlay')].filter((el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.style.display !== 'none';
  });
  if (visibleModals.length) {
    const last = visibleModals[visibleModals.length - 1];
    const closeBtn = last.querySelector('.modal-close, [id$="Close"], [id$="LeaveBtn"]');
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    last.style.display = 'none';
    return true;
  }
  return false;
}

async function exportBackup() {
  const filename = `garage-gains-backup-${todayStamp()}.json`;
  const data = currentProfileJson();
  await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  const { uri } = await Filesystem.getUri({
    path: filename,
    directory: Directory.Cache,
  });
  await Share.share({
    title: 'RIGCORE backup',
    text: filename,
    url: uri,
    dialogTitle: 'Save or share your backup',
  });
}

function wireExport() {
  const exportBtn = document.getElementById('exportBtn');
  if (!exportBtn) return;
  const clone = exportBtn.cloneNode(true);
  exportBtn.parentNode.replaceChild(clone, exportBtn);
  clone.addEventListener('click', async () => {
    try {
      await exportBackup();
      if (typeof window.showToast === 'function') window.showToast('Backup ready to save');
    } catch (err) {
      console.error('export failed', err);
      if (typeof window.showToast === 'function') window.showToast('Export failed');
    }
  });
}

function wireYoutube() {
  window.openYoutube = async (query) => {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    try {
      await Browser.open({ url });
    } catch (_) {
      window.open(url, '_blank');
    }
  };
}

function wireHaptics() {
  const nativeVibrate = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
  try {
    navigator.vibrate = (pattern) => {
      try { if (nativeVibrate) nativeVibrate(pattern); } catch (_) { /* ignore */ }
      try {
        const ms = Array.isArray(pattern) ? pattern[0] : pattern;
        if (ms && ms >= 30) Haptics.impact({ style: ImpactStyle.Medium });
        else Haptics.impact({ style: ImpactStyle.Light });
      } catch (_) { /* ignore */ }
      return true;
    };
  } catch (_) { /* WebView may freeze navigator.vibrate */ }
}

const UPDATE_REPO = 'theharislt-netizen/garage-gains';
const UPDATE_REFS = ['main', 'cursor/android-apk-eee8'];
let updateCheckInFlight = false;

function toast(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
}

async function localBundleVersion() {
  try {
    const info = await CapacitorUpdater.current();
    const v = info?.bundle?.version;
    if (v && v !== 'builtin') return v;
  } catch (_) { /* first install */ }
  try {
    const res = await fetch('./bundle-version.json', { cache: 'no-store' });
    if (res.ok) {
      const j = await res.json();
      if (j?.version) return j.version;
    }
  } catch (_) { /* bundled file may be missing on old APKs */ }
  return 'builtin';
}

async function fetchLatestManifest() {
  for (const ref of UPDATE_REFS) {
    const url = `https://raw.githubusercontent.com/${UPDATE_REPO}/${ref}/live-update/manifest.json?t=${Date.now()}`;
    try {
      const res = await CapacitorHttp.get({ url, connectTimeout: 10000, readTimeout: 15000 });
      if (res.status !== 200 || !res.data) continue;
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (!data?.version) continue;
      const zipUrl = (Array.isArray(data.urls) ? data.urls.find((u) => u.includes(`/${ref}/`)) : null)
        || data.url
        || `https://raw.githubusercontent.com/${UPDATE_REPO}/${ref}/live-update/www.zip`;
      return { ...data, zipUrl: zipUrl + (zipUrl.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(data.version) };
    } catch (_) { /* try next ref */ }
  }
  return null;
}

function wireUpdateStatus(version, extra) {
  const rows = document.querySelectorAll('#view-settings .settings-row');
  const versionRow = [...rows].find((r) => r.textContent.includes('Version'));
  if (versionRow) {
    const val = versionRow.querySelector('.l2') || versionRow.lastElementChild;
    if (val) val.textContent = version.replace(/^3\.3\.0-g/, '3.3 · ');
  }
  let row = document.getElementById('liveUpdateRow');
  if (!row && versionRow && versionRow.parentElement) {
    row = document.createElement('div');
    row.id = 'liveUpdateRow';
    row.className = 'settings-row';
    versionRow.parentElement.appendChild(row);
  }
  if (row) {
    row.innerHTML = `<div>Auto-update<div class="l2">${extra || 'Checks GitHub when you open the app'}</div></div><div class="l2 mono">On</div>`;
  }
}

async function checkAndApplyUpdate() {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    const current = await localBundleVersion();
    wireUpdateStatus(current);
    const manifest = await fetchLatestManifest();
    if (!manifest) {
      wireUpdateStatus(current, 'Could not reach GitHub — using this copy');
      return;
    }
    if (manifest.version === current) {
      wireUpdateStatus(current, 'You are on the latest workout app');
      return;
    }
    toast('Updating RIGCORE…');
    wireUpdateStatus(current, 'Downloading latest…');
    const bundle = await CapacitorUpdater.download({
      version: manifest.version,
      url: manifest.zipUrl,
    });
    await CapacitorUpdater.set(bundle);
  } catch (err) {
    console.error('live update failed', err);
    toast('Update skipped — using this copy');
  } finally {
    updateCheckInFlight = false;
  }
}

async function setup() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('native-app');
  document.body.classList.add('native-app');

  try { await CapacitorUpdater.notifyAppReady(); } catch (_) { /* builtin bundle */ }

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#09080f' });
  } catch (_) { /* older WebViews */ }

  try { await SplashScreen.hide(); } catch (_) { /* auto-hide is enough */ }

  hideHomeScreenShortcut();
  wireYoutube();
  wireExport();
  wireHaptics();
  localBundleVersion().then((v) => wireUpdateStatus(v));
  checkAndApplyUpdate();

  App.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) checkAndApplyUpdate();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
