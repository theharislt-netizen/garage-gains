/**
 * Native bridge for PALACE (Android).
 * Bundled into www/native-bridge.js and injected after the web app boots.
 * Same Capgo live-update flow as RIGCORE: on open, fetch the latest
 * card-game/live-update/www.zip from GitHub and apply it in place.
 */
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import {
  UPDATE_REPO,
  UPDATE_DIR,
  UPDATE_REFS,
  pickNewestCandidate,
  refsFromManifest,
  uniqueRefs,
} from './live-update-select.mjs';

const STORE_KEY = 'palaceCards_v1';
const REGISTRY_KEY = STORE_KEY + '::registry';
const APP_ID = 'palace';

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

const BackupImport = registerPlugin('BackupImport');

function currentProfileJson() {
  let id = 'p1';
  try {
    const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    if (registry.currentId) id = registry.currentId;
  } catch (_) { /* keep p1 */ }
  const key = id === 'p1' ? STORE_KEY : STORE_KEY + '::' + id;
  return localStorage.getItem(key) || '{}';
}

function backupJsonForExport() {
  if (typeof window.buildBackupPayload === 'function') {
    try {
      return JSON.stringify(window.buildBackupPayload(), null, 2);
    } catch (_) { /* fall through */ }
  }
  const raw = currentProfileJson();
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed && parsed.app === APP_ID && parsed.state) {
      return JSON.stringify(parsed, null, 2);
    }
    return JSON.stringify({
      app: APP_ID,
      format: 1,
      exportedAt: new Date().toISOString(),
      state: parsed,
    }, null, 2);
  } catch (_) {
    return raw || '{}';
  }
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
  const visibleModals = [...document.querySelectorAll('.modal-overlay, .full-overlay')].filter((el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.style.display !== 'none';
  });
  if (visibleModals.length) {
    const last = visibleModals[visibleModals.length - 1];
    const closeBtn = last.querySelector('.modal-close, [id$="Close"], [id$="LeaveBtn"], .instance-leave-btn');
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
  const filename = `palace-backup-${todayStamp()}.json`;
  const data = backupJsonForExport();
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
    title: 'PALACE backup',
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

function fallbackFileInput() {
  const input = document.getElementById('importFile');
  if (input) input.click();
}

function wireImport() {
  const importBtn = document.getElementById('importBtn');
  if (!importBtn) return;
  const clone = importBtn.cloneNode(true);
  importBtn.parentNode.replaceChild(clone, importBtn);
  clone.addEventListener('click', async () => {
    try {
      const res = await BackupImport.pickBackup();
      if (!res || res.canceled) return;
      if (typeof window.applyImportedBackupText === 'function') {
        window.applyImportedBackupText(res.text || '');
      } else {
        toast('Import failed — restart the app and try again');
      }
    } catch (err) {
      console.error('native import failed', err);
      fallbackFileInput();
    }
  });
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

const TOKEN_KEY = 'palace_githubToken';
let updateCheckInFlight = false;
let updatesArePublic = true;

function toast(msg) {
  if (typeof window.showToast === 'function') window.showToast(msg);
}

function getGithubToken() {
  return (localStorage.getItem(TOKEN_KEY) || '').trim();
}

function authHeaders() {
  const headers = { 'User-Agent': 'PALACE', Accept: 'application/vnd.github+json' };
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

function headerValue(headers, name) {
  if (!headers) return '';
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || '') : '';
}

function decodeManifest(raw) {
  const data = parseGithubJson(raw);
  if (data?.version) return data;
  if (data?.content && data.encoding === 'base64') {
    try { return JSON.parse(atob(String(data.content).replace(/\n/g, ''))); } catch { return null; }
  }
  return data?.version ? data : null;
}

function zipUrlFor(ref, version, sha) {
  const v = encodeURIComponent(version);
  const t = Date.now();
  if (sha) {
    return `https://raw.githubusercontent.com/${UPDATE_REPO}/${sha}/${UPDATE_DIR}/www.zip?v=${v}`;
  }
  return `https://raw.githubusercontent.com/${UPDATE_REPO}/${ref}/${UPDATE_DIR}/www.zip?v=${v}&t=${t}`;
}

function candidateFromManifest(ref, manifest, extras = {}) {
  if (!manifest?.version) return null;
  const zipUrl = extras.zipUrl || zipUrlFor(ref, manifest.version, extras.sha);
  if (!zipUrl) return null;
  return {
    version: manifest.version,
    zipUrl,
    checksum: manifest.checksum || '',
    public: extras.public !== false,
    ref,
    committedAt: extras.committedAt || '',
    extraRefs: refsFromManifest(manifest),
  };
}

async function httpGet(url, headers) {
  return CapacitorHttp.get({
    url,
    headers: headers || { 'User-Agent': 'PALACE' },
    connectTimeout: 8000,
    readTimeout: 15000,
  });
}

async function fetchManifestCommit(ref) {
  const url = `https://api.github.com/repos/${UPDATE_REPO}/commits?path=${encodeURIComponent(UPDATE_DIR + '/manifest.json')}&sha=${encodeURIComponent(ref)}&per_page=1`;
  const res = await httpGet(url, authHeaders());
  if (res.status !== 200) return null;
  const data = parseGithubJson(res.data);
  const commit = Array.isArray(data) ? data[0] : data;
  if (!commit?.sha) return null;
  const committedAt = commit.commit?.committer?.date || commit.commit?.author?.date || '';
  return { sha: commit.sha, committedAt };
}

async function fetchManifestFromRaw(ref) {
  let commit = null;
  try { commit = await fetchManifestCommit(ref); } catch (_) { /* fall back to branch name */ }
  const pathRef = commit?.sha || ref;
  const stamp = Date.now();
  const urls = [
    `https://raw.githubusercontent.com/${UPDATE_REPO}/${pathRef}/${UPDATE_DIR}/manifest.json?t=${stamp}`,
  ];
  if (!commit?.sha) {
    urls.push(
      `https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@${encodeURIComponent(ref)}/${UPDATE_DIR}/manifest.json?t=${stamp}`
    );
  }
  for (const url of urls) {
    const res = await httpGet(url);
    const manifest = decodeManifest(res.status === 200 ? res.data : null);
    if (!manifest?.version) continue;
    const cdnZip = url.includes('jsdelivr')
      ? `https://cdn.jsdelivr.net/gh/${UPDATE_REPO}@${encodeURIComponent(commit?.sha || ref)}/${UPDATE_DIR}/www.zip?v=${encodeURIComponent(manifest.version)}`
      : '';
    return candidateFromManifest(ref, manifest, {
      public: true,
      sha: commit?.sha,
      committedAt: commit?.committedAt || headerValue(res.headers, 'Last-Modified'),
      zipUrl: commit?.sha ? zipUrlFor(ref, manifest.version, commit.sha) : (cdnZip || zipUrlFor(ref, manifest.version)),
    });
  }
  return null;
}

async function fetchManifestFromApi(ref) {
  const manUrl = `https://api.github.com/repos/${UPDATE_REPO}/contents/${UPDATE_DIR}/manifest.json?ref=${encodeURIComponent(ref)}`;
  const manRes = await httpGet(manUrl, authHeaders());
  if (manRes.status !== 200 || !manRes.data) return null;
  const manifest = decodeManifest(manRes.data);
  if (!manifest?.version) return null;
  let commit = null;
  try { commit = await fetchManifestCommit(ref); } catch (_) { /* branch raw URL still works */ }
  return candidateFromManifest(ref, manifest, {
    public: !getGithubToken(),
    sha: commit?.sha,
    committedAt: commit?.committedAt,
  });
}

async function probeRef(ref) {
  try {
    const api = await fetchManifestFromApi(ref);
    if (api) return api;
  } catch (_) { /* token missing or not yet public */ }
  try {
    return await fetchManifestFromRaw(ref);
  } catch (_) {
    return null;
  }
}

async function fetchLatestManifest() {
  const seen = new Set();
  let queue = uniqueRefs(UPDATE_REFS);
  const candidates = [];

  while (queue.length && seen.size < 12) {
    const batch = queue.filter((ref) => !seen.has(ref));
    queue = [];
    for (const ref of batch) seen.add(ref);
    const results = await Promise.all(batch.map(probeRef));
    for (const candidate of results) {
      if (!candidate?.version) continue;
      candidates.push(candidate);
      for (const extra of candidate.extraRefs || []) {
        if (!seen.has(extra)) queue.push(extra);
      }
    }
  }

  const newest = pickNewestCandidate(candidates);
  if (newest) return newest;
  return getGithubToken() ? null : { privateRepo: true };
}

function wireUpdateStatus(version, extra) {
  const rows = document.querySelectorAll('#view-settings .settings-row');
  const versionRow = [...rows].find((r) => r.textContent.includes('Version'));
  if (versionRow) {
    const val = versionRow.querySelector('.l2') || versionRow.lastElementChild;
    if (val) val.textContent = String(version).replace(/^0\.1\.0-g/, '0.1 · ');
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
  if (updatesArePublic) {
    tokenWrap.style.display = 'none';
    tokenWrap.innerHTML = '';
    return;
  }
  tokenWrap.style.display = '';
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

async function fetchLatestManifestWithRetry() {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      last = await fetchLatestManifest();
      if (last && (last.version || last.privateRepo)) return last;
    } catch (err) {
      last = null;
      console.error('update check failed', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return last;
}

async function checkAndApplyUpdate() {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    const current = await localBundleVersion();
    wireUpdateStatus(current, 'Checking GitHub for updates…');
    const manifest = await fetchLatestManifestWithRetry();
    if (!manifest) {
      wireUpdateStatus(current, 'Could not reach GitHub — using this copy');
      return;
    }
    if (manifest.privateRepo) {
      updatesArePublic = false;
      wireUpdateStatus(current, 'Repo is private — make it public or save a token below');
      return;
    }
    if (manifest.public) updatesArePublic = true;
    if (manifest.version === current) {
      wireUpdateStatus(current, 'Auto-update is on — you are on the latest');
      return;
    }
    console.info('palace live-update', current, '→', manifest.version, manifest.ref || '');
    toast('Updating PALACE…');
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

function isIosSafari() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function wireWebInstallHint() {
  const btn = document.getElementById('addHomeBtn');
  if (!btn || !isIosSafari()) return;
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  clone.addEventListener('click', () => {
    toast('Safari: tap Share, then Add to Home Screen');
  });
}

async function setup() {
  if (window.navigator.standalone) hideHomeScreenShortcut();
  if (!Capacitor.isNativePlatform()) {
    wireWebInstallHint();
    return;
  }

  document.documentElement.classList.add('native-app');
  document.body.classList.add('native-app');

  try { await CapacitorUpdater.notifyAppReady(); } catch (_) { /* builtin bundle */ }

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
  } catch (_) { /* older WebViews / Android 16 ignores overlay */ }

  try { await SplashScreen.hide(); } catch (_) { /* auto-hide is enough */ }

  hideHomeScreenShortcut();
  if (typeof window.syncHeaderHeight === 'function') {
    window.syncHeaderHeight();
    requestAnimationFrame(() => window.syncHeaderHeight());
    setTimeout(() => window.syncHeaderHeight(), 250);
  }
  wireExport();
  wireImport();
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
