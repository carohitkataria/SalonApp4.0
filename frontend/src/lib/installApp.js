/**
 * Desktop app install for salons (Progressive Web App).
 *
 * On salon pages the browser is pointed at /salon-manifest.json, so Chrome /
 * Edge offer to install "SalonHub" as a desktop app: its own window and icon,
 * a desktop / Start-menu / Dock shortcut, opening straight on the dashboard.
 * Customer pages keep the customer manifest.
 *
 * The browser fires `beforeinstallprompt` once, early, so it is captured at
 * import time (this module is imported from index.js) and replayed to the
 * "Install app" button whenever it mounts.
 */
import { useEffect, useState } from 'react';

const SALON_SECTIONS = new Set([
  'login', 'signup', 'dashboard', 'staff-portal', 'staff', 'marketplace',
  'checkout', 'orders', 'inventory', 'customer-orders',
]);

/** True for the salon-side app (/salon/dashboard, /salon/login …), not customer /salon/:id pages. */
export const isSalonAppPath = (pathname = '') => {
  const parts = String(pathname).split('/').filter(Boolean);
  return parts[0] === 'salon' && SALON_SECTIONS.has(parts[1]);
};

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own "Install app" button instead
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

const setHead = (selector, attr, value, create) => {
  let el = document.head.querySelector(selector);
  if (!el && create) { el = create(); document.head.appendChild(el); }
  if (el && el.getAttribute(attr) !== value) el.setAttribute(attr, value);
};

/** Point the page at the salon or customer manifest (and matching theme colour / icon). */
export const applyAppManifest = (pathname) => {
  if (typeof document === 'undefined') return;
  const salon = isSalonAppPath(pathname);
  setHead('link[rel="manifest"]', 'href', salon ? '/salon-manifest.json' : '/manifest.json', () => {
    const l = document.createElement('link'); l.rel = 'manifest'; return l;
  });
  setHead('meta[name="theme-color"]', 'content', salon ? '#6C4FE0' : '#0E0C09');
  setHead('meta[name="apple-mobile-web-app-title"]', 'content', 'SalonHub', () => {
    const m = document.createElement('meta'); m.name = 'apple-mobile-web-app-title'; return m;
  });
  if (salon && 'serviceWorker' in navigator) {
    // Same worker as notifications; it also serves the offline screen.
    navigator.serviceWorker.register('/notification-sw.js').catch(() => { /* optional */ });
  }
};

/** Running as the installed app (its own window)? */
export const isRunningAsApp = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: minimal-ui)').matches
    || window.navigator.standalone === true;
};

/** Which manual steps to show when the browser has no one-click install. */
export const manualInstallHint = () => {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/.test(ua);
  if (isIOS) return 'ios';
  if (isSafari) return 'safari-mac';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  return 'chromium-menu';
};

/** React hook for the "Install app" button. */
export function useInstallApp() {
  const [, force] = useState(0);
  const [installed, setInstalled] = useState(isRunningAsApp());
  useEffect(() => {
    const fn = () => { force((n) => n + 1); setInstalled(isRunningAsApp()); };
    listeners.add(fn);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', fn);
    return () => { listeners.delete(fn); mq?.removeEventListener?.('change', fn); };
  }, []);
  const promptInstall = async () => {
    if (!deferredPrompt) return 'manual';
    const evt = deferredPrompt;
    deferredPrompt = null;
    evt.prompt();
    const choice = await evt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    notify();
    return choice?.outcome || 'dismissed';
  };
  return { installed, canPrompt: !!deferredPrompt, promptInstall };
}
