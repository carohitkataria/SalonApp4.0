/**
 * "Install app" — lets a salon put SalonHub on their desktop as its own app.
 *
 * Chrome / Edge: one click opens the browser's install dialog (desktop +
 * Start-menu / Dock shortcut, own window). Other browsers: a short
 * how-to. Hidden once the salon is already using the installed app.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useInstallApp, manualInstallHint } from '@/lib/installApp';

const STEPS = {
  'chromium-menu': {
    title: 'Install from the browser menu',
    steps: [
      'Open the browser menu (⋮ in Chrome, … in Edge) at the top-right.',
      'Choose “Cast, save and share” → “Install page as app” (Chrome) or “Apps” → “Install this site as an app” (Edge).',
      'Click Install. SalonHub opens in its own window and gets a desktop / Start-menu shortcut.',
    ],
  },
  'safari-mac': {
    title: 'Add SalonHub to your Dock (Safari)',
    steps: [
      'In the menu bar choose File → Add to Dock.',
      'Click Add. SalonHub opens from the Dock in its own window.',
    ],
  },
  ios: {
    title: 'Add SalonHub to your Home Screen',
    steps: [
      'Tap the Share button in Safari.',
      'Choose “Add to Home Screen”, then tap Add.',
    ],
  },
  firefox: {
    title: 'Use Chrome or Edge to install',
    steps: [
      'Firefox can’t install sites as desktop apps.',
      'Open this page in Google Chrome or Microsoft Edge, sign in, and click “Install app” again.',
    ],
  },
};

const ICON = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    <polyline points="9 9 12 12 15 9" /><line x1="12" y1="5" x2="12" y2="12" />
  </svg>
);

export default function InstallAppButton({ variant = 'light', compact = false }) {
  const { installed, promptInstall } = useInstallApp();
  const [help, setHelp] = useState(null);
  if (installed) return null;

  const onClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'manual') setHelp(STEPS[manualInstallHint()] || STEPS['chromium-menu']);
  };

  const dark = variant === 'dark';
  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', cursor: 'pointer',
    fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: compact ? '7px 9px' : '8px 12px',
    border: dark ? '1px solid rgba(255,255,255,0.2)' : '1px solid #E1DDEE',
    background: dark ? 'rgba(255,255,255,0.05)' : '#fff',
    color: dark ? '#fff' : '#5B3FD1',
  };

  return (
    <>
      <button type="button" onClick={onClick} style={btnStyle} title="Install SalonHub as a desktop app"
        data-testid="install-app-btn">
        {ICON}{!compact && 'Install app'}
      </button>
      {help && ReactDOM.createPortal(
        <div role="dialog" aria-modal="true" aria-label={help.title} data-testid="install-app-help"
          onClick={() => setHelp(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,35,0.45)', zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', color: '#23252F', borderRadius: 16, maxWidth: 420, width: '100%', padding: '20px 22px', boxShadow: '0 20px 60px rgba(20,18,35,0.25)', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <img src="/icons/salon-icon-192.png" alt="" width="40" height="40" style={{ borderRadius: 10 }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{help.title}</div>
                <div style={{ fontSize: 12, color: '#7C8092' }}>SalonHub opens like a desktop app, in its own window.</div>
              </div>
            </div>
            <ol style={{ margin: '0 0 16px', paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: '#3C3F4E' }}>
              {help.steps.map((s) => <li key={s} style={{ marginBottom: 6 }}>{s}</li>)}
            </ol>
            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => setHelp(null)}
                style={{ border: 'none', background: '#6C4FE0', color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 10, padding: '9px 18px', cursor: 'pointer' }}>
                Got it
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
