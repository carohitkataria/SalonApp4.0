/**
 * MarketingStudio.js — Marketing → Studio / Calendar pieces.
 *
 *  • PosterStudio   — 1-tap branded posters (offer, coupon, service, membership,
 *                     occasion) rendered on a canvas; share to WhatsApp /
 *                     Instagram (phone share sheet), download, save, post to
 *                     Instagram, or send as a WhatsApp photo campaign.
 *  • PhotoPicker    — choose a saved poster, a gallery photo or upload one; the
 *                     image is hosted publicly (needed by WhatsApp / Instagram).
 *  • CalendarPanel  — month calendar of occasions/festivals, own events,
 *                     campaigns and guest birthdays, with one-click actions.
 *  • InstagramCard  — connect Instagram, recent posts, scheduled posts.
 *
 * Backend: backend/marketing_studio.py.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const errMsg = (e, fb) => e?.response?.data?.detail || fb;

export const STUDIO_CSS = `
.mst-grid{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:18px;align-items:start}
@media(max-width:980px){.mst-grid{grid-template-columns:1fr}}
.mst-card{background:#fff;border:1px solid #ECEAF4;border-radius:16px;padding:16px}
.mst-card h4{margin:0 0 10px;font-size:14px;font-weight:800;color:#211a3d;display:flex;align-items:center;gap:8px}
.mst-lbl{display:block;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#8880a8;margin:12px 0 6px}
.mst-in,.mst-sel,.mst-ta{width:100%;border:1.5px solid #E6E3F2;border-radius:10px;padding:9px 11px;font-size:13.5px;font-family:inherit;outline:none;background:#fff;color:#211a3d;box-sizing:border-box}
.mst-in:focus,.mst-sel:focus,.mst-ta:focus{border-color:#6C4FE0}
.mst-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mst-chips{display:flex;gap:6px;flex-wrap:wrap}
.mst-chip{padding:7px 11px;border-radius:999px;border:1.5px solid #E6E3F2;background:#fff;font-size:12.5px;font-weight:700;color:#5C5480;cursor:pointer;font-family:inherit}
.mst-chip.on{border-color:#6C4FE0;background:#F1EEFF;color:#4B33C9}
.mst-sw{display:flex;gap:6px;flex-wrap:wrap}
.mst-sw button{width:34px;height:34px;border-radius:10px;border:2px solid transparent;cursor:pointer}
.mst-sw button.on{border-color:#211a3d;box-shadow:0 0 0 2px #fff inset}
.mst-tog{display:flex;align-items:center;gap:8px;font-size:13px;color:#3B355A;margin-top:8px;cursor:pointer}
.mst-prev{display:flex;flex-direction:column;align-items:center;gap:12px}
.mst-prev canvas{width:100%;max-width:440px;height:auto;border-radius:14px;box-shadow:0 12px 40px rgba(40,20,110,.18);background:#eee}
.mst-prev.story canvas{max-width:300px}
.mst-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:440px}
.mst-btn{display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 10px;border-radius:12px;border:1.5px solid #E6E3F2;background:#fff;font-size:13px;font-weight:800;color:#3B2F7A;cursor:pointer;font-family:inherit;text-decoration:none}
.mst-btn:hover{border-color:#CFC6F6;background:#FBFAFF}
.mst-btn.pri{background:#6C4FE0;border-color:#6C4FE0;color:#fff}
.mst-btn.wa{background:#25D366;border-color:#25D366;color:#fff}
.mst-btn.ig{background:linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF);border:none;color:#fff}
.mst-btn:disabled{opacity:.55;cursor:not-allowed}
.mst-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mst-hint{font-size:12px;color:#8880a8;text-align:center;max-width:440px}
.mst-posters{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.mst-pt{position:relative;border-radius:12px;overflow:hidden;border:1px solid #ECEAF4;background:#F6F5FB;cursor:pointer;aspect-ratio:1/1}
.mst-pt img{width:100%;height:100%;object-fit:cover;display:block}
.mst-pt span{position:absolute;left:0;right:0;bottom:0;padding:5px 8px;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mst-pt button{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:7px;border:none;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;font-size:14px;line-height:1}
.mst-pt.sel{outline:3px solid #6C4FE0;outline-offset:-3px}
.mst-modal-bg{position:fixed;inset:0;background:rgba(15,12,30,.45);z-index:1300;display:grid;place-items:center;padding:16px}
.mst-modal{background:#fff;border-radius:18px;width:min(640px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-family:'Inter',system-ui,sans-serif}
.mst-modal header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #F0EEF7;font-weight:800;color:#211a3d}
.mst-modal .bd{padding:16px 18px;overflow:auto}
.mst-modal footer{padding:12px 18px;border-top:1px solid #F0EEF7;display:flex;justify-content:flex-end;gap:8px}
.mst-x{border:none;background:#F3F3F8;border-radius:9px;width:30px;height:30px;cursor:pointer;font-size:16px;color:#7C8092}
.mst-cal-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.mst-cal-h b{font-size:17px;color:#211a3d}
.mst-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.mst-dow{font-size:11px;font-weight:800;color:#8880a8;text-align:center;text-transform:uppercase;letter-spacing:.5px;padding:4px 0}
.mst-day{min-height:92px;border:1px solid #ECEAF4;border-radius:12px;padding:6px;background:#fff;cursor:pointer;display:flex;flex-direction:column;gap:3px;overflow:hidden;text-align:left;font-family:inherit}
.mst-day:hover{border-color:#CFC6F6;background:#FBFAFF}
.mst-day.out{opacity:.4}
.mst-day.today{border-color:#6C4FE0;box-shadow:0 0 0 2px rgba(108,79,224,.15)}
.mst-day.sel{background:#F4F1FF;border-color:#6C4FE0}
.mst-day .n{font-size:12px;font-weight:800;color:#3B355A}
.mst-ev{font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mst-ev.occ{background:#FFF1DB;color:#9A5B00}
.mst-ev.own{background:#E6F4FF;color:#0B5CAD}
.mst-ev.camp{background:#E8F8EE;color:#137A3C}
.mst-ev.bday{background:#FCE7F3;color:#B0237A}
@media(max-width:700px){.mst-day{min-height:64px}.mst-ev{font-size:9.5px;padding:1px 3px}}
.mst-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#5C5480;margin-top:10px}
.mst-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.mst-side{display:flex;flex-direction:column;gap:10px}
.mst-occ{border:1px solid #ECEAF4;border-radius:14px;padding:12px}
.mst-occ b{display:block;font-size:14px;color:#211a3d}
.mst-occ small{color:#8880a8;font-size:12px}
.mst-occ p{margin:6px 0 10px;font-size:13px;color:#4A4466}
.mst-occ .acts{display:flex;gap:6px;flex-wrap:wrap}
.mst-ig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:10px}
.mst-ig-grid a{display:block;aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#F6F5FB}
.mst-ig-grid img{width:100%;height:100%;object-fit:cover}
.mst-note{font-size:12.5px;color:#5C5480;background:#F8F7FC;border-radius:10px;padding:10px 12px;line-height:1.5}
`;

const Ic = {
  share: () => <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>,
  wa: () => <svg viewBox="0 0 24 24"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" /></svg>,
  ig: () => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" /></svg>,
  dl: () => <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v3h16v-3" /></svg>,
  save: () => <svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3M8 21v-7h8v7" /></svg>,
  send: () => <svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>,
  cal: () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
};

// ---------------------------------------------------------------- helpers

const THEMES = {
  festive: { label: 'Festive', bg: ['#6B1033', '#A8324A'], accent: '#F5C35B', text: '#FFF7E8' },
  diwali: { label: 'Diwali', bg: ['#22093F', '#4A1A7A'], accent: '#FFC94A', text: '#FFF8E6' },
  holi: { label: 'Holi', bg: ['#FF4E8A', '#7A5CFF'], accent: '#FFE14D', text: '#FFFFFF' },
  love: { label: 'Love', bg: ['#E0336F', '#FF8A80'], accent: '#FFFFFF', text: '#FFFFFF' },
  fresh: { label: 'Fresh', bg: ['#007C76', '#38C7C0'], accent: '#FFE48A', text: '#FFFFFF' },
  bold: { label: 'Bold', bg: ['#141220', '#3B2D85'], accent: '#9F87FF', text: '#FFFFFF' },
  minimal: { label: 'Minimal', bg: ['#FFFFFF', '#F3F0FF'], accent: '#6C4FE0', text: '#211A3D' },
};
const LAYOUTS = [
  { id: 'classic', label: 'Classic' }, { id: 'photo', label: 'Photo' },
  { id: 'split', label: 'Split' }, { id: 'minimal', label: 'Clean' },
];
const SIZES = { square: [1080, 1080], story: [1080, 1920] };

const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const im = new Image();
  if (!src.startsWith('data:')) im.crossOrigin = 'anonymous';
  im.onload = () => res(im);
  im.onerror = () => res(null);
  im.src = src;
});

function wrapLines(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  return lines;
}

function fitText(ctx, text, maxW, maxSize, minSize, weight = 800, maxLines = 2) {
  for (let s = maxSize; s >= minSize; s -= 4) {
    ctx.font = `${weight} ${s}px "Plus Jakarta Sans", Inter, Arial, sans-serif`;
    const lines = wrapLines(ctx, text, maxW);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  ctx.font = `${weight} ${minSize}px "Plus Jakarta Sans", Inter, Arial, sans-serif`;
  return { size: minSize, lines: wrapLines(ctx, text, maxW).slice(0, maxLines) };
}

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw a poster onto `canvas`. assets: {logo, photo, qr} (images/canvases or null). */
export function renderPoster(canvas, d, assets = {}) {
  const [W, H] = SIZES[d.size] || SIZES.square;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const t = THEMES[d.theme] || THEMES.festive;
  const story = d.size === 'story';
  const pad = 80;
  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (d.layout === 'photo' && assets.photo) {
    drawCover(ctx, assets.photo, 0, 0, W, H);
    const sh = ctx.createLinearGradient(0, H * 0.25, 0, H);
    sh.addColorStop(0, 'rgba(0,0,0,0.05)'); sh.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
  } else if (d.layout === 'split') {
    const pw = Math.round(W * 0.42);
    if (assets.photo) drawCover(ctx, assets.photo, W - pw, 0, pw, H);
    else { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(W - pw, 0, pw, H); }
  } else if (d.layout !== 'minimal') {
    // soft decorative circles
    ctx.globalAlpha = 0.12; ctx.fillStyle = t.accent;
    ctx.beginPath(); ctx.arc(W * 0.92, H * 0.08, W * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.04, H * 0.96, W * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const light = d.layout === 'photo' && assets.photo ? '#FFFFFF' : t.text;
  const colW = d.layout === 'split' ? Math.round(W * 0.58) - pad * 1.5 : W - pad * 2;
  const cx = d.layout === 'split' ? pad : W / 2;
  const align = d.layout === 'split' ? 'left' : 'center';
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';

  // top: logo + salon name
  let y = pad + 10;
  if (d.showLogo && assets.logo) {
    const s = story ? 150 : 120;
    const lx = align === 'center' ? W / 2 - s / 2 : pad;
    ctx.save(); roundRect(ctx, lx, y, s, s, s / 2); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(lx, y, s, s); drawCover(ctx, assets.logo, lx, y, s, s); ctx.restore();
    y += s + 40;
  }
  ctx.fillStyle = light;
  ctx.font = `700 ${story ? 44 : 38}px Inter, Arial, sans-serif`;
  ctx.globalAlpha = 0.92;
  if (d.salonName) { ctx.fillText(String(d.salonName).toUpperCase(), cx, y + 30); y += 70; }
  ctx.globalAlpha = 1;

  // middle block, vertically centred in the remaining space (photo layout: bottom)
  const blocks = [];
  if (d.eyebrow) blocks.push({ kind: 'eyebrow', text: d.eyebrow });
  if (d.offer) blocks.push({ kind: 'offer', text: d.offer });
  if (d.headline) blocks.push({ kind: 'headline', text: d.headline });
  if (d.subline) blocks.push({ kind: 'subline', text: d.subline });
  const measured = blocks.map((b) => {
    const cfg = {
      eyebrow: [story ? 52 : 44, 30, 700, 1],
      offer: [story ? 230 : 190, 90, 900, 2],
      headline: [story ? 92 : 78, 44, 800, 3],
      subline: [story ? 46 : 40, 28, 500, 3],
    }[b.kind];
    const f = fitText(ctx, b.text, colW, cfg[0], cfg[1], cfg[2], cfg[3]);
    return { ...b, ...f, weight: cfg[2], gap: b.kind === 'offer' ? 26 : 18 };
  });
  const blockH = measured.reduce((s, b) => s + b.lines.length * b.size * 1.12 + b.gap, 0);
  const footerH = (d.code ? 150 : 0) + (d.showQr ? (story ? 330 : 0) : 0) + 150;
  let by = d.layout === 'photo' ? H - footerH - blockH - 40 : Math.max(y + 30, (y + (H - footerH)) / 2 - blockH / 2);
  measured.forEach((b) => {
    ctx.font = `${b.weight} ${b.size}px "Plus Jakarta Sans", Inter, Arial, sans-serif`;
    ctx.fillStyle = b.kind === 'offer' || b.kind === 'eyebrow' ? t.accent : light;
    if (d.layout === 'photo' && assets.photo && b.kind === 'offer') ctx.fillStyle = '#FFE14D';
    b.lines.forEach((ln) => { by += b.size; ctx.fillText(ln, cx, by); by += b.size * 0.12; });
    by += b.gap;
  });

  // coupon code pill
  let fy = Math.max(by + 10, H - footerH);
  if (d.code) {
    ctx.font = `800 ${story ? 58 : 50}px "Plus Jakarta Sans", Inter, monospace`;
    const label = `CODE: ${String(d.code).toUpperCase()}`;
    const tw = ctx.measureText(label).width + 80;
    const px = align === 'center' ? W / 2 - tw / 2 : pad;
    ctx.save(); ctx.setLineDash([14, 10]); ctx.lineWidth = 5; ctx.strokeStyle = t.accent;
    roundRect(ctx, px, fy, tw, 104, 22); ctx.stroke(); ctx.restore();
    ctx.fillStyle = t.accent; ctx.textAlign = 'center';
    ctx.fillText(label, px + tw / 2, fy + 72); ctx.textAlign = align;
    fy += 150;
  }
  // footer: CTA + phone (+ QR)
  const qrS = story ? 260 : 190;
  const hasQr = d.showQr && assets.qr;
  if (hasQr) {
    const qx = story ? W / 2 - qrS / 2 : W - pad - qrS;
    const qy = story ? H - pad - qrS - 120 : H - pad - qrS;
    ctx.fillStyle = '#fff'; roundRect(ctx, qx - 14, qy - 14, qrS + 28, qrS + 28, 18); ctx.fill();
    ctx.drawImage(assets.qr, qx, qy, qrS, qrS);
    if (story) { ctx.fillStyle = light; ctx.font = `700 34px Inter, Arial`; ctx.textAlign = 'center'; ctx.fillText('Scan to book', W / 2, qy + qrS + 60); ctx.textAlign = align; }
  }
  const footX = hasQr && !story ? pad : cx;
  ctx.textAlign = hasQr && !story ? 'left' : align;
  ctx.fillStyle = light;
  const footBase = story ? H - pad - (hasQr ? qrS + 170 : 40) : H - pad - 50;
  if (d.cta) { ctx.font = `800 ${story ? 52 : 44}px "Plus Jakarta Sans", Inter, Arial`; ctx.fillText(d.cta, footX, footBase); }
  if (d.contact) { ctx.globalAlpha = 0.9; ctx.font = `600 ${story ? 38 : 32}px Inter, Arial`; ctx.fillText(d.contact, footX, footBase + (story ? 62 : 52)); ctx.globalAlpha = 1; }
  ctx.textAlign = 'left';
}

const canvasBlob = (canvas) => new Promise((res, rej) => {
  try { canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not render the image'))), 'image/png'); } catch (e) { rej(e); }
});

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

/** Host an image publicly; returns { url, media_id }. */
export async function hostImage(salonId, authHeaders, blob, name = 'photo.png') {
  const fd = new FormData();
  fd.append('file', new File([blob], name, { type: blob.type || 'image/png' }));
  const r = await axios.post(`${API}/salons/${salonId}/marketing/media`, fd, { headers: authHeaders() });
  return r.data;
}

const bookUrl = (salonId) => `${window.location.origin}/salons/${salonId}/book`;
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

function couponOffer(c) {
  if (!c) return '';
  const v = Number(c.value || 0);
  return String(c.type || c.discount_type || '').toLowerCase().startsWith('percent') ? `${v}% OFF` : `${rupee(v)} OFF`;
}

// ---------------------------------------------------------------- Poster studio

const blankDesign = (salon) => ({
  size: 'square', layout: 'classic', theme: 'festive',
  eyebrow: 'Limited time offer', offer: '20% OFF', headline: 'On all hair services',
  subline: 'Book your slot today', code: '', cta: 'Book now',
  contact: [salon?.phone, salon?.city].filter(Boolean).join(' · '),
  salonName: salon?.salon_name || salon?.name || '', showLogo: true, showQr: true, photo: null,
});

export function PosterStudio({ salon, salonId, authHeaders, coupons = [], plans = [], prefill, onSendCampaign }) {
  const [d, setD] = useState(() => ({ ...blankDesign(salon), ...(prefill || {}) }));
  const [services, setServices] = useState([]);
  const [source, setSource] = useState('');
  const [posters, setPosters] = useState([]);
  const [busy, setBusy] = useState('');
  const [ig, setIg] = useState(null);
  const [igOpen, setIgOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const canvasRef = useRef(null);
  const qrWrap = useRef(null);
  const assets = useRef({});
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (prefill) setD((x) => ({ ...x, ...prefill })); }, [prefill]);
  useEffect(() => {
    axios.get(`${API}/salons/${salonId}/services/all`, { headers: authHeaders() })
      .then((r) => setServices((Array.isArray(r.data) ? r.data : r.data?.services || []).filter((s) => s.is_active !== false)))
      .catch(() => {});
    axios.get(`${API}/salons/${salonId}/instagram/status`, { headers: authHeaders() }).then((r) => setIg(r.data)).catch(() => setIg(null));
  }, [salonId, authHeaders]);
  const loadPosters = useCallback(() => {
    axios.get(`${API}/salons/${salonId}/marketing/posters`, { headers: authHeaders() })
      .then((r) => setPosters(r.data.posters || [])).catch(() => {});
  }, [salonId, authHeaders]);
  useEffect(() => { loadPosters(); }, [loadPosters]);

  // re-render whenever the design changes (images are cached in `assets`)
  const draw = useCallback(async () => {
    const a = assets.current;
    if (a.logoSrc !== salon?.logo_url) { a.logo = await loadImg(salon?.logo_url); a.logoSrc = salon?.logo_url; }
    if (a.photoSrc !== d.photo) { a.photo = await loadImg(d.photo); a.photoSrc = d.photo; }
    a.qr = qrWrap.current?.querySelector('canvas') || null;
    if (canvasRef.current) renderPoster(canvasRef.current, d, a);
  }, [d, salon?.logo_url]);
  useEffect(() => { draw(); }, [draw]);

  const applySource = (v) => {
    setSource(v);
    const [kind, id] = v.split(':');
    if (kind === 'coupon') {
      const c = coupons.find((x) => x.id === id);
      if (c) setD((x) => ({ ...x, eyebrow: c.title || 'Special offer', offer: couponOffer(c), headline: c.description || 'On your next visit', subline: c.min_bill_amount ? `On bills above ${rupee(c.min_bill_amount)}` : 'Book your slot today', code: c.code || '' }));
    } else if (kind === 'service') {
      const s = services.find((x) => x.id === id);
      if (s) setD((x) => ({ ...x, eyebrow: 'Now at our salon', offer: rupee(s.base_price || s.price), headline: s.service_name || s.name, subline: s.description || 'Book your slot today', code: '' }));
    } else if (kind === 'plan') {
      const p = plans.find((x) => x.id === id);
      if (p) setD((x) => ({ ...x, eyebrow: 'Membership', offer: p.credit ? `Pay ${rupee(p.amount)} · Get ${rupee(p.credit)}` : rupee(p.amount), headline: p.name, subline: p.validity_months ? `Valid ${p.validity_months} months` : 'Save on every visit', code: '' }));
    }
  };

  const caption = useMemo(() => [d.eyebrow, d.offer && d.headline ? `${d.offer} ${d.headline}` : d.offer || d.headline, d.subline,
    d.code ? `Use code ${String(d.code).toUpperCase()}` : '', `Book: ${bookUrl(salonId)}`].filter(Boolean).join('\n'), [d, salonId]);

  const blob = async () => { await draw(); return canvasBlob(canvasRef.current); };
  const fileName = `${(d.headline || 'poster').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;

  const download = async () => {
    try {
      const b = await blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return b;
    } catch (e) { toast.error('Could not create the image. Try removing the logo or photo.'); return null; }
  };
  const share = async (target) => {
    let b;
    try { b = await blob(); } catch { toast.error('Could not create the image'); return; }
    const file = new File([b], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: caption }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    // Desktop fallback: download the image, copy the caption, open the app.
    await download();
    try { await navigator.clipboard.writeText(caption); } catch { /* clipboard blocked */ }
    if (target === 'wa') {
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank', 'noopener');
      toast.success('Poster downloaded and caption copied — attach the image in WhatsApp');
    } else if (target === 'ig') {
      toast.success('Poster downloaded and caption copied — upload it in Instagram');
    } else toast.success('Poster downloaded and caption copied');
  };
  const save = async () => {
    setBusy('save');
    try {
      const b = await blob();
      const fd = new FormData(); fd.append('file', new File([b], fileName, { type: 'image/png' }));
      const r = await axios.post(`${API}/salons/${salonId}/marketing/posters`, fd, { headers: authHeaders(), params: { title: d.headline || d.offer || 'Poster', size: d.size } });
      toast.success('Saved to My posters');
      loadPosters();
      return r.data;
    } catch (e) { toast.error(errMsg(e, 'Could not save the poster')); return null; } finally { setBusy(''); }
  };
  const sendCampaign = async () => {
    const p = await save();
    if (p) onSendCampaign?.({ name: d.headline || d.offer || 'Photo offer', body: caption, photoUrl: p.url });
  };
  const removePoster = async (p) => {
    if (!window.confirm('Delete this poster?')) return;
    try { await axios.delete(`${API}/salons/${salonId}/marketing/posters/${p.id}`, { headers: authHeaders() }); loadPosters(); }
    catch (e) { toast.error(errMsg(e, 'Delete failed')); }
  };

  const t = THEMES;
  return (
    <div>
      <div className="mst-grid">
        <div className="mst-card" data-testid="poster-form">
          <h4>1 · What is the poster about?</h4>
          <select className="mst-sel" value={source} onChange={(e) => applySource(e.target.value)} data-testid="poster-source">
            <option value="">Write my own…</option>
            {coupons.length > 0 && <optgroup label="Coupons">{coupons.map((c) => <option key={c.id} value={`coupon:${c.id}`}>{c.code} — {c.title}</option>)}</optgroup>}
            {services.length > 0 && <optgroup label="Services">{services.slice(0, 80).map((s) => <option key={s.id} value={`service:${s.id}`}>{s.service_name || s.name} — {rupee(s.base_price || s.price)}</option>)}</optgroup>}
            {plans.length > 0 && <optgroup label="Memberships">{plans.map((p) => <option key={p.id} value={`plan:${p.id}`}>{p.name}</option>)}</optgroup>}
          </select>
          <span className="mst-lbl">Big text</span>
          <input className="mst-in" value={d.offer} onChange={(e) => set('offer', e.target.value)} placeholder="20% OFF" data-testid="poster-offer" />
          <span className="mst-lbl">Headline</span>
          <input className="mst-in" value={d.headline} onChange={(e) => set('headline', e.target.value)} placeholder="On all hair services" data-testid="poster-headline" />
          <div className="mst-row">
            <div><span className="mst-lbl">Small text on top</span><input className="mst-in" value={d.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} /></div>
            <div><span className="mst-lbl">Coupon code</span><input className="mst-in" value={d.code} onChange={(e) => set('code', e.target.value)} placeholder="Optional" /></div>
          </div>
          <span className="mst-lbl">Details</span>
          <input className="mst-in" value={d.subline} onChange={(e) => set('subline', e.target.value)} placeholder="Valid till 15 Nov" />
          <div className="mst-row">
            <div><span className="mst-lbl">Button text</span><input className="mst-in" value={d.cta} onChange={(e) => set('cta', e.target.value)} /></div>
            <div><span className="mst-lbl">Phone / area</span><input className="mst-in" value={d.contact} onChange={(e) => set('contact', e.target.value)} /></div>
          </div>

          <h4 style={{ marginTop: 18 }}>2 · Look</h4>
          <span className="mst-lbl">Size</span>
          <div className="mst-chips">
            {[['square', 'Post · WhatsApp'], ['story', 'Story · Status']].map(([k, l]) => (
              <button key={k} type="button" className={`mst-chip${d.size === k ? ' on' : ''}`} onClick={() => set('size', k)} data-testid={`poster-size-${k}`}>{l}</button>
            ))}
          </div>
          <span className="mst-lbl">Layout</span>
          <div className="mst-chips">
            {LAYOUTS.map((l) => <button key={l.id} type="button" className={`mst-chip${d.layout === l.id ? ' on' : ''}`} onClick={() => set('layout', l.id)} data-testid={`poster-layout-${l.id}`}>{l.label}</button>)}
          </div>
          <span className="mst-lbl">Colours</span>
          <div className="mst-sw">
            {Object.entries(t).map(([k, v]) => (
              <button key={k} type="button" title={v.label} className={d.theme === k ? 'on' : ''} onClick={() => set('theme', k)}
                style={{ background: `linear-gradient(135deg, ${v.bg[0]}, ${v.bg[1]})`, outline: k === 'minimal' ? '1px solid #E6E3F2' : 'none' }} data-testid={`poster-theme-${k}`} />
            ))}
          </div>
          <span className="mst-lbl">Photo (for Photo / Split layouts)</span>
          <div className="mst-chips">
            <button type="button" className="mst-chip" onClick={() => setPhotoOpen(true)} data-testid="poster-photo-btn">{d.photo ? 'Change photo' : 'Choose photo'}</button>
            {d.photo && <button type="button" className="mst-chip" onClick={() => set('photo', null)}>Remove</button>}
          </div>
          <label className="mst-tog"><input type="checkbox" checked={d.showLogo} onChange={(e) => set('showLogo', e.target.checked)} /> Show salon logo</label>
          <label className="mst-tog"><input type="checkbox" checked={d.showQr} onChange={(e) => set('showQr', e.target.checked)} /> QR code to your booking page</label>
        </div>

        <div className={`mst-prev${d.size === 'story' ? ' story' : ''}`}>
          <canvas ref={canvasRef} data-testid="poster-canvas" />
          <div className="mst-acts">
            <button type="button" className="mst-btn wa" onClick={() => share('wa')} data-testid="poster-share-wa"><Ic.wa />WhatsApp</button>
            <button type="button" className="mst-btn ig" onClick={() => (ig?.connected ? setIgOpen(true) : share('ig'))} data-testid="poster-share-ig"><Ic.ig />Instagram</button>
            <button type="button" className="mst-btn" onClick={() => share()} data-testid="poster-share"><Ic.share />Share</button>
            <button type="button" className="mst-btn" onClick={download} data-testid="poster-download"><Ic.dl />Download</button>
            <button type="button" className="mst-btn" onClick={save} disabled={busy === 'save'} data-testid="poster-save"><Ic.save />{busy === 'save' ? 'Saving…' : 'Save'}</button>
            <button type="button" className="mst-btn pri" onClick={sendCampaign} disabled={!!busy} data-testid="poster-send-campaign"><Ic.send />Send to guests</button>
          </div>
          <div className="mst-hint">On a phone, WhatsApp and Instagram open straight away with the poster — post it to your Status or Story in one tap. “Send to guests” sends it as a WhatsApp campaign.</div>
        </div>
      </div>

      <div className="mst-card" style={{ marginTop: 18 }}>
        <h4>My posters</h4>
        {posters.length === 0 ? <div className="mst-note">Posters you save appear here, ready to reuse in campaigns and Instagram.</div> : (
          <div className="mst-posters" data-testid="poster-list">
            {posters.map((p) => (
              <div key={p.id} className="mst-pt" title={p.title}>
                <img src={p.url} alt={p.title} onClick={() => window.open(p.url, '_blank', 'noopener')} />
                <span>{p.title}</span>
                <button type="button" onClick={() => removePoster(p)} title="Delete">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* hidden QR source for the canvas */}
      <div ref={qrWrap} style={{ position: 'absolute', left: -9999, top: 0 }} aria-hidden>
        <QRCodeCanvas value={bookUrl(salonId)} size={300} level="M" marginSize={0} />
      </div>

      <PhotoPicker open={photoOpen} onClose={() => setPhotoOpen(false)} salon={salon} salonId={salonId} authHeaders={authHeaders}
        hostUploads={false} onPick={({ url }) => { set('photo', url); setPhotoOpen(false); if (d.layout === 'classic' || d.layout === 'minimal') set('layout', 'photo'); }} />
      <InstagramPostModal open={igOpen} onClose={() => setIgOpen(false)} salonId={salonId} authHeaders={authHeaders}
        caption={caption} getImage={async () => { const p = await save(); return p?.url; }} />
    </div>
  );
}

// ---------------------------------------------------------------- Photo picker

export function PhotoPicker({ open, onClose, salon, salonId, authHeaders, onPick, hostUploads = true }) {
  const [tab, setTab] = useState('posters');
  const [posters, setPosters] = useState([]);
  const [busy, setBusy] = useState(false);
  const gallery = (salon?.photo_gallery || []).filter((u) => typeof u === 'string' && !u.startsWith('data:video') && !/\.(mp4|webm|mov)(\?|$)/i.test(u));
  useEffect(() => {
    if (!open) return;
    axios.get(`${API}/salons/${salonId}/marketing/posters`, { headers: authHeaders() })
      .then((r) => { setPosters(r.data.posters || []); if (!(r.data.posters || []).length) setTab(gallery.length ? 'gallery' : 'upload'); })
      .catch(() => {});
  }, [open, salonId, authHeaders]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const pickUrl = async (src) => {
    // Posters are already hosted. Gallery photos (data URLs) and uploads are
    // hosted first so WhatsApp / Instagram can fetch them.
    if (!hostUploads || /\/api\/public\/marketing-media\//.test(src)) return onPick({ url: src });
    setBusy(true);
    try {
      const b = src.startsWith('data:') ? await dataUrlToBlob(src) : await (await fetch(src)).blob();
      const r = await hostImage(salonId, authHeaders, b);
      onPick({ url: r.url });
    } catch (e) { toast.error(errMsg(e, 'Could not use this photo')); } finally { setBusy(false); }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!hostUploads) {
      const rd = new FileReader();
      rd.onload = () => onPick({ url: rd.result });
      rd.readAsDataURL(file);
      return;
    }
    setBusy(true);
    try { const r = await hostImage(salonId, authHeaders, file, file.name); onPick({ url: r.url }); }
    catch (e) { toast.error(errMsg(e, 'Upload failed')); } finally { setBusy(false); }
  };

  return ReactDOM.createPortal(
    <div className="mst-modal-bg" onClick={onClose}>
      <style>{STUDIO_CSS}</style>
      <div className="mst-modal" onClick={(e) => e.stopPropagation()} data-testid="photo-picker">
        <header>Choose a photo<button type="button" className="mst-x" onClick={onClose}>×</button></header>
        <div className="bd">
          <div className="mst-chips" style={{ marginBottom: 12 }}>
            {[['posters', `My posters (${posters.length})`], ['gallery', `Salon photos (${gallery.length})`], ['upload', 'Upload']].map(([k, l]) => (
              <button key={k} type="button" className={`mst-chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {busy && <div className="mst-note">Preparing photo…</div>}
          {tab === 'posters' && (posters.length ? (
            <div className="mst-posters">{posters.map((p) => (
              <div key={p.id} className="mst-pt" onClick={() => pickUrl(p.url)} data-testid={`pick-poster-${p.id}`}><img src={p.url} alt={p.title} /><span>{p.title}</span></div>
            ))}</div>
          ) : <div className="mst-note">No saved posters yet. Make one in Marketing → Studio.</div>)}
          {tab === 'gallery' && (gallery.length ? (
            <div className="mst-posters">{gallery.map((u, i) => (
              <div key={i} className="mst-pt" onClick={() => pickUrl(u)}><img src={u} alt="" /></div>
            ))}</div>
          ) : <div className="mst-note">No salon photos yet. Add some in Marketing → Media.</div>)}
          {tab === 'upload' && (
            <label className="mst-btn" style={{ cursor: 'pointer', maxWidth: 260 }}>
              <Ic.dl />Choose an image (JPG / PNG)
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} data-testid="photo-picker-upload" />
            </label>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Instagram

function InstagramPostModal({ open, onClose, salonId, authHeaders, caption, getImage }) {
  const [kind, setKind] = useState('feed');
  const [text, setText] = useState(caption);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setText(caption); setWhen(''); } }, [open, caption]);
  if (!open) return null;
  const go = async () => {
    setBusy(true);
    try {
      const url = await getImage();
      if (!url) return;
      await axios.post(`${API}/salons/${salonId}/instagram/posts`, {
        image_url: url, caption: text, kind, schedule_at: when ? new Date(when).toISOString() : null,
      }, { headers: authHeaders() });
      toast.success(when ? 'Scheduled for Instagram' : 'Posted to Instagram');
      onClose();
    } catch (e) { toast.error(errMsg(e, 'Instagram post failed')); } finally { setBusy(false); }
  };
  return ReactDOM.createPortal(
    <div className="mst-modal-bg" onClick={onClose}>
      <div className="mst-modal" onClick={(e) => e.stopPropagation()}>
        <header>Post to Instagram<button type="button" className="mst-x" onClick={onClose}>×</button></header>
        <div className="bd">
          <div className="mst-chips">
            {[['feed', 'Feed post'], ['story', 'Story']].map(([k, l]) => <button key={k} type="button" className={`mst-chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          {kind === 'feed' && (<><span className="mst-lbl">Caption</span><textarea className="mst-ta" rows={5} value={text} onChange={(e) => setText(e.target.value)} /></>)}
          <span className="mst-lbl">When</span>
          <input className="mst-in" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <div className="mst-note" style={{ marginTop: 8 }}>Leave empty to post now. Stories don't show captions.</div>
        </div>
        <footer>
          <button type="button" className="mst-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="mst-btn ig" onClick={go} disabled={busy}>{busy ? 'Posting…' : when ? 'Schedule' : 'Post now'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function InstagramCard({ salonId, authHeaders }) {
  const [st, setSt] = useState(null);
  const [media, setMedia] = useState([]);
  const [posts, setPosts] = useState([]);
  const load = useCallback(async () => {
    try {
      const s = (await axios.get(`${API}/salons/${salonId}/instagram/status`, { headers: authHeaders() })).data;
      setSt(s);
      if (s.connected) {
        axios.get(`${API}/salons/${salonId}/instagram/media`, { headers: authHeaders() }).then((r) => setMedia(r.data.items || [])).catch(() => {});
        axios.get(`${API}/salons/${salonId}/instagram/posts`, { headers: authHeaders() }).then((r) => setPosts(r.data.posts || [])).catch(() => {});
      }
    } catch { setSt({ configured: false, connected: false }); }
  }, [salonId, authHeaders]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('instagram');
    if (q === 'connected') toast.success('Instagram connected');
    if (q === 'failed') toast.error('Instagram connection did not complete. Please try again.');
  }, []);
  const connect = async () => {
    try { window.location.href = (await axios.post(`${API}/salons/${salonId}/instagram/connect`, {}, { headers: authHeaders() })).data.auth_url; }
    catch (e) { toast.error(errMsg(e, 'Could not start Instagram connection')); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Instagram? Scheduled posts will be cancelled.')) return;
    await axios.delete(`${API}/salons/${salonId}/instagram`, { headers: authHeaders() }).catch(() => {});
    setMedia([]); setPosts([]); load();
  };
  const cancel = async (p) => {
    await axios.delete(`${API}/salons/${salonId}/instagram/posts/${p.id}`, { headers: authHeaders() }).catch(() => {});
    load();
  };
  if (!st) return null;
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  return (
    <div className="mst-card" data-testid="instagram-card">
      <style>{STUDIO_CSS}</style>
      <h4><span style={{ color: '#DD2A7B' }}><Ic.ig /></span> Instagram {st.connected && <span style={{ fontWeight: 600, color: '#8880a8' }}>@{st.username}</span>}</h4>
      {!st.configured && (
        <div className="mst-note">Instagram posting is being set up by the SalonHub team. Until then, use <b>Studio → Instagram</b> to share posters from your phone in one tap.</div>
      )}
      {st.configured && !st.connected && (
        <>
          <div className="mst-note">Connect your salon's Instagram <b>professional</b> account to show your latest posts on your salon page and post or schedule posters straight from SalonHub.</div>
          <button type="button" className="mst-btn ig" style={{ marginTop: 10 }} onClick={connect} data-testid="instagram-connect"><Ic.ig />Connect Instagram</button>
        </>
      )}
      {st.connected && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="mst-btn" onClick={load}>Refresh</button>
            <button type="button" className="mst-btn" onClick={disconnect}>Disconnect</button>
          </div>
          {scheduled.length > 0 && (
            <>
              <span className="mst-lbl">Scheduled</span>
              {scheduled.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #F0EEF7' }}>
                  <img src={p.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                  <span style={{ flex: 1, fontSize: 13 }}>{p.kind === 'story' ? 'Story' : 'Post'} · {new Date(p.schedule_at).toLocaleString('en-IN')}</span>
                  <button type="button" className="mst-chip" onClick={() => cancel(p)}>Cancel</button>
                </div>
              ))}
            </>
          )}
          <span className="mst-lbl">Latest posts</span>
          <div className="mst-ig-grid">
            {media.map((m) => (
              <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer">
                <img src={m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url} alt={m.caption || ''} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Calendar

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fill = (s, salon) => String(s || '').replace(/\{salon\}/g, salon?.salon_name || salon?.name || 'our salon');

export function CalendarPanel({ salon, salonId, authHeaders, onMakePoster, onCreateCampaign }) {
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [data, setData] = useState({ occasions: [], events: [], campaigns: [], birthdays: [] });
  const [sel, setSel] = useState(ymd(new Date()));
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const grid = useMemo(() => {
    const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/salons/${salonId}/marketing/calendar`, {
        headers: authHeaders(), params: { start: ymd(grid[0]), end: ymd(grid[41]) } });
      setData(r.data);
    } catch (e) { toast.error(errMsg(e, 'Could not load the calendar')); }
  }, [salonId, authHeaders, grid]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = {};
    const add = (k, item) => { (m[k] = m[k] || []).push(item); };
    data.occasions.forEach((o) => add(o.date, { kind: 'occ', label: o.name, o }));
    data.events.forEach((e) => add(e.date, { kind: 'own', label: e.title, e }));
    data.campaigns.forEach((c) => add(c.date, { kind: 'camp', label: c.name, c }));
    data.birthdays.forEach((b) => add(b.date, { kind: 'bday', label: `${b.count} birthday${b.count > 1 ? 's' : ''}`, b }));
    return m;
  }, [data]);

  const today = ymd(new Date());
  const upcoming = data.occasions.filter((o) => o.date >= today).slice(0, 4);
  const selItems = byDay[sel] || [];
  const addEvent = async () => {
    if (title.trim().length < 2) return;
    try {
      await axios.post(`${API}/salons/${salonId}/marketing/events`, { title: title.trim(), date: sel }, { headers: authHeaders() });
      setTitle(''); setAdding(false); load();
    } catch (e) { toast.error(errMsg(e, 'Could not add the event')); }
  };
  const delEvent = async (e) => {
    await axios.delete(`${API}/salons/${salonId}/marketing/events/${e.id}`, { headers: authHeaders() }).catch(() => {});
    load();
  };
  const OccActions = ({ o }) => (
    <div className="acts">
      <button type="button" className="mst-btn" onClick={() => onMakePoster?.({ theme: o.theme || 'festive', eyebrow: o.name, headline: o.idea?.split('—')[0]?.trim() || `${o.name} special`, offer: '20% OFF', subline: 'Limited time · Book now' })} data-testid={`occ-poster-${o.id}`}>Make poster</button>
      <button type="button" className="mst-btn pri" onClick={() => onCreateCampaign?.({ name: `${o.name} ${o.date.slice(0, 4)}`, body: fill(o.message, salon) })} data-testid={`occ-campaign-${o.id}`}>Create campaign</button>
    </div>
  );

  return (
    <div className="mst-grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
      <div className="mst-card">
        <div className="mst-cal-h">
          <b>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
          <div className="mst-chips">
            <button type="button" className="mst-chip" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} data-testid="cal-prev">‹ Prev</button>
            <button type="button" className="mst-chip" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); setSel(today); }}>Today</button>
            <button type="button" className="mst-chip" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} data-testid="cal-next">Next ›</button>
          </div>
        </div>
        <div className="mst-cal" data-testid="marketing-calendar">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="mst-dow">{d}</div>)}
          {grid.map((d) => {
            const k = ymd(d);
            const items = byDay[k] || [];
            return (
              <button type="button" key={k} onClick={() => setSel(k)} data-testid={`cal-day-${k}`}
                className={`mst-day${d.getMonth() !== month.getMonth() ? ' out' : ''}${k === today ? ' today' : ''}${k === sel ? ' sel' : ''}`}>
                <span className="n">{d.getDate()}</span>
                {items.slice(0, 3).map((it, i) => <span key={i} className={`mst-ev ${it.kind}`}>{it.label}</span>)}
                {items.length > 3 && <span className="mst-ev" style={{ color: '#8880a8' }}>+{items.length - 3} more</span>}
              </button>
            );
          })}
        </div>
        <div className="mst-leg">
          <span><i style={{ background: '#FFD9A0' }} />Festivals & occasions</span>
          <span><i style={{ background: '#B9DCFF' }} />Your events</span>
          <span><i style={{ background: '#B8EBCB' }} />Campaigns</span>
          <span><i style={{ background: '#F9C4E1' }} />Guest birthdays</span>
        </div>
      </div>

      <div className="mst-side">
        <div className="mst-card">
          <h4><Ic.cal />{new Date(`${sel}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
          {selItems.length === 0 && <div className="mst-note">Nothing planned. Add an event or create a campaign for this day.</div>}
          {selItems.map((it, i) => (
            <div key={i} className="mst-occ" style={{ marginBottom: 8 }}>
              {it.kind === 'occ' && (<><b>{it.o.name}</b><p>{it.o.idea}</p><OccActions o={it.o} /></>)}
              {it.kind === 'own' && (<><b>{it.e.title}</b><small>Your event</small><div className="acts" style={{ marginTop: 8 }}>
                <button type="button" className="mst-btn pri" onClick={() => onCreateCampaign?.({ name: it.e.title, body: `${it.e.title} at ${salon?.salon_name || 'our salon'} — book now!` })}>Create campaign</button>
                <button type="button" className="mst-btn" onClick={() => delEvent(it.e)}>Remove</button></div></>)}
              {it.kind === 'camp' && (<><b>{it.c.name}</b><small>Campaign · {it.c.status}</small></>)}
              {it.kind === 'bday' && (<><b>{it.label}</b><small>Send wishes with a birthday offer — set it once in Campaigns → Automated.</small></>)}
            </div>
          ))}
          {adding ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input className="mst-in" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Salon anniversary sale" onKeyDown={(e) => e.key === 'Enter' && addEvent()} data-testid="cal-event-title" />
              <button type="button" className="mst-btn pri" onClick={addEvent} data-testid="cal-event-save">Add</button>
            </div>
          ) : <button type="button" className="mst-btn" style={{ marginTop: 6, width: '100%' }} onClick={() => setAdding(true)} data-testid="cal-add-event">+ Add my event</button>}
        </div>
        <div className="mst-card">
          <h4>Coming up</h4>
          {upcoming.length === 0 && <div className="mst-note">No occasions in this view. Use Next › to look ahead.</div>}
          {upcoming.map((o) => (
            <div key={o.id} className="mst-occ" style={{ marginBottom: 8 }}>
              <b>{o.name}</b><small>{new Date(`${o.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</small>
              <p>{o.idea}</p><OccActions o={o} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
