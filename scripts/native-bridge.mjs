/**
 * Native Android bridge for RIGCORE.
 * Bundled into www/native-bridge.js and injected after the web app boots.
 */
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

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

async function setup() {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('native-app');
  document.body.classList.add('native-app');

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#09080f' });
  } catch (_) { /* older WebViews */ }

  try { await SplashScreen.hide(); } catch (_) { /* auto-hide is enough */ }

  hideHomeScreenShortcut();
  wireYoutube();
  wireExport();
  wireHaptics();

  App.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
