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
const TOKEN_KEY = 'rigcore_githubToken';
let updateCheckInFlight = false;

function toast(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
}

function getGithubToken() {
  return (localStorage.getItem(TOKEN_KEY) || '').trim();
}

function authHeaders() {
  const headers = { 'User-Agent': 'RIGCORE-Android', Accept: 'application/vnd.github+json' };
  const token = getGithubToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
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

function parseGithubJson(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return null; }
  }
  return data;
}

async function fetchManifestFromRaw(ref) {
  const url = `https://raw.githubusercontent.com/${UPDATE_REPO}/${ref}/live-update/manifest.json?t=${Date.now()}`;
  const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': 'RIGCORE-Android' }, connectTimeout: 8000, readTimeout: 12000 });
  if (res.status !== 200 || !res.data) return null;
  const data = parseGithubJson(res.data);
  if (!data?.version) return null;
  return {
    version: data.version,
    zipUrl: `https://raw.githubusercontent.com/${UPDATE_REPO}/${ref}/live-update/www.zip?v=${encodeURIComponent(data.version)}`,
  };
}

async function fetchManifestFromApi(ref) {
  const headers = authHeaders();
  const manUrl = `https://api.github.com/repos/${UPDATE_REPO}/contents/live-update/manifest.json?ref=${encodeURIComponent(ref)}`;
  const manRes = await CapacitorHttp.get({ url: manUrl, headers, connectTimeout: 8000, readTimeout: 15000 });
  if (manRes.status !== 200 || !manRes.data) return null;
  const manMeta = parseGithubJson(manRes.data);
  let manifest = null;
  if (manMeta?.content && manMeta.encoding === 'base64') {
    try { manifest = JSON.parse(atob(manMeta.content.replace(/\n/g, ''))); } catch (_) { manifest = null; }
  } else {
    manifest = parseGithubJson(manMeta);
  }
  if (!manifest?.version) return null;

  const zipUrlApi = `https://api.github.com/repos/${UPDATE_REPO}/contents/live-update/www.zip?ref=${encodeURIComponent(ref)}`;
  const zipRes = await CapacitorHttp.get({ url: zipUrlApi, headers, connectTimeout: 8000, readTimeout: 15000 });
  const zipMeta = parseGithubJson(zipRes.data);
  const zipUrl = zipMeta?.download_url;
  if (!zipUrl) return null;
  return { version: manifest.version, zipUrl };
}

async function fetchLatestManifest() {
  for (const ref of UPDATE_REFS) {
    try {
      const raw = await fetchManifestFromRaw(ref);
      if (raw) return raw;
    } catch (_) { /* private repos 404 here */ }
    try {
      const api = await fetchManifestFromApi(ref);
      if (api) return api;
    } catch (_) { /* token missing or invalid */ }
  }
  return getGithubToken() ? null : { privateRepo: true };
}

function wireUpdateStatus(version, extra) {
  const rows = document.querySelectorAll('#view-settings .settings-row');
  const versionRow = [...rows].find((r) => r.textContent.includes('Version'));
  if (versionRow) {
    const val = versionRow.querySelector('.l2') || versionRow.lastElementChild;
    if (val) val.textContent = String(version).replace(/^3\.3\.\d+-g/, '3.3 · ');
  }
  const card = versionRow && versionRow.parentElement;
  if (!card) return;

  let row = document.getElementById('liveUpdateRow');
  if (!row) {
    row = document.createElement('div');
    row.id = 'liveUpdateRow';
    row.className = 'settings-row';
    card.appendChild(row);
  }
  row.innerHTML = `<div>Auto-update<div class="l2">${extra || 'Checks GitHub when you open the app'}</div></div><div class="l2 mono">On</div>`;

  let tokenWrap = document.getElementById('liveUpdateTokenWrap');
  if (!tokenWrap) {
    tokenWrap = document.createElement('div');
    tokenWrap.id = 'liveUpdateTokenWrap';
    tokenWrap.style.marginTop = '12px';
    card.appendChild(tokenWrap);
  }
  const saved = getGithubToken();
  tokenWrap.innerHTML = `
    <div class="l2" style="margin-bottom:6px;">If the GitHub repo is private, paste a token with Contents: Read. Leave blank if the repo is public.</div>
    <div class="log-form">
      <input id="githubTokenInput" type="password" autocomplete="off" placeholder="ghp_…" value="${saved.replace(/"/g, '&quot;')}">
      <button class="btn" id="githubTokenSave" type="button">Save</button>
    </div>`;
  const saveBtn = document.getElementById('githubTokenSave');
  const input = document.getElementById('githubTokenInput');
  if (saveBtn && input) {
    saveBtn.addEventListener('click', () => {
      const v = input.value.trim();
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
      toast(v ? 'Token saved' : 'Token cleared');
      checkAndApplyUpdate();
    });
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
    if (manifest.privateRepo) {
      wireUpdateStatus(current, 'Repo is private — make it public or save a token below');
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
