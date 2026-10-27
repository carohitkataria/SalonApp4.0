/**
 * HelpDrawer.js — right-side Help centre opened from the ribbon "?" icon.
 *
 *  • Help videos and FAQs managed by the platform team (Platform console →
 *    Help center), loaded from GET /api/help?audience=salon
 *  • Search across titles, answers, categories and #hashtags; category chips
 *  • Chat on WhatsApp with support (pre-filled with the open video's topic)
 *  • Full illustrated guide (/help/guide) and its PDF
 *
 * Rendered via a portal so it stacks above the ribbon, like NotificationsDrawer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { supportWhatsAppUrl, GUIDE_PATH, GUIDE_PDF } from '@/lib/helpContent';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const CSS = `
.hlp-scrim{position:fixed;inset:0;z-index:1200;background:rgba(15,12,30,.28);transition:opacity .2s}
.hlp{position:fixed;top:0;right:0;bottom:0;width:min(480px,94vw);z-index:1210;background:#fff;display:flex;flex-direction:column;color:#211a3d;font-family:'Inter',system-ui,sans-serif;transition:transform .28s cubic-bezier(.22,.61,.36,1)}
.hlp *{box-sizing:border-box}
.hlp-h{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #F0EEF7}
.hlp-h .ic{width:38px;height:38px;border-radius:11px;background:#F1EEFF;color:#6C4FE0;display:grid;place-items:center;flex:none}
.hlp-h .tt{flex:1;min-width:0}
.hlp-h .tt b{display:block;font-size:16px;font-weight:800;letter-spacing:-.2px}
.hlp-h .tt span{font-size:12px;color:#8880a8}
.hlp-x{background:#F3F3F8;border:none;border-radius:10px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;color:#7C8092}
.hlp-x:hover{background:#FCEAF1;color:#E45C86}
.hlp svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.hlp-search{padding:14px 18px 6px;position:relative}
.hlp-search input{width:100%;height:42px;border:1.5px solid #E6E3F2;border-radius:12px;padding:0 14px 0 40px;font-size:14px;outline:none;font-family:inherit}
.hlp-search input:focus{border-color:#6C4FE0;box-shadow:0 0 0 3px rgba(108,79,224,.12)}
.hlp-search .mg{position:absolute;left:31px;top:26px;color:#A49CC4}
.hlp-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px 18px 4px}
.hlp-act{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;border:1px solid #ECE9F6;background:#FBFAFF;font-size:13px;font-weight:700;color:#3B2F7A;cursor:pointer;text-decoration:none;font-family:inherit}
.hlp-act:hover{border-color:#CFC6F6;background:#F4F1FF}
.hlp-act.wa{grid-column:1 / -1;background:#E8F8EE;border-color:#C9EBD6;color:#137A3C;justify-content:center;font-size:14px}
.hlp-act.wa:hover{background:#DDF4E6}
.hlp-cats{display:flex;gap:6px;overflow-x:auto;padding:10px 18px 2px;scrollbar-width:none}
.hlp-cats::-webkit-scrollbar{display:none}
.hlp-cat{flex:none;padding:6px 11px;border-radius:999px;border:1px solid #E6E3F2;background:#fff;font-size:12px;font-weight:700;color:#5C5480;cursor:pointer;font-family:inherit;white-space:nowrap}
.hlp-cat.on{background:#6C4FE0;border-color:#6C4FE0;color:#fff}
.hlp-body{flex:1;overflow-y:auto;padding:6px 18px 24px}
.hlp-sec{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#8880a8;margin:16px 2px 8px}
.hlp-vid{border:1px solid #ECE9F6;border-radius:14px;margin-bottom:8px;overflow:hidden}
.hlp-vid > button{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:none;cursor:pointer;text-align:left;font-family:inherit}
.hlp-vid > button:hover{background:#FBFAFF}
.hlp-vid .th{width:64px;height:40px;border-radius:8px;background:#F1EEFF center/cover no-repeat;color:#6C4FE0;display:grid;place-items:center;flex:none}
.hlp-vid .t{flex:1;min-width:0;font-size:14px;font-weight:700;color:#211a3d}
.hlp-vid .t small{display:block;font-size:11px;font-weight:600;color:#9A92BC;margin-top:2px}
.hlp-vid .chev{color:#A49CC4;transition:transform .2s}
.hlp-vid.open .chev{transform:rotate(90deg)}
.hlp-vid .in{padding:0 12px 12px;font-size:13px;line-height:1.55;color:#4A4466}
.hlp-vid .in video,.hlp-vid .in iframe{display:block;width:100%;border:0;border-radius:10px;background:#1c1830;aspect-ratio:16/10;margin-bottom:8px}
.hlp-vid .in p{margin:0 0 8px}
.hlp-tags{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 8px}
.hlp-tag{font-size:11.5px;font-weight:600;color:#6C4FE0;background:#F4F1FF;border:none;border-radius:6px;padding:2px 7px;cursor:pointer;font-family:inherit}
.hlp-link{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;padding:7px 11px;border-radius:9px;text-decoration:none;cursor:pointer;border:none;font-family:inherit}
.hlp-link.ghost{background:#E8F8EE;color:#137A3C}
.hlp-link.pri{background:#6C4FE0;color:#fff}
.hlp-link svg{width:14px;height:14px}
.hlp-faq{border-bottom:1px solid #F0EEF7}
.hlp-faq > button{width:100%;display:flex;gap:10px;align-items:flex-start;padding:11px 2px;background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:650;color:#211a3d}
.hlp-faq > button .q{flex:1}
.hlp-faq > button small{display:block;font-size:11px;font-weight:600;color:#9A92BC;margin-top:2px}
.hlp-faq .a{padding:0 2px 12px;font-size:13px;line-height:1.55;color:#4A4466;white-space:pre-line}
.hlp-faq .chev{color:#A49CC4;transition:transform .2s;margin-top:2px}
.hlp-faq.open .chev{transform:rotate(90deg)}
.hlp-empty{padding:24px 8px;text-align:center;color:#8880a8;font-size:13px}
`;

const Ic = {
  help: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  x: () => <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  search: () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  chev: () => <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>,
  book: () => <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5V21h16" /></svg>,
  pdf: () => <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v3h16v-3" /></svg>,
  wa: () => <svg viewBox="0 0 24 24"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" /><path d="M9 10c0 3 2 5 5 5l1-1.5-2-1-1 .8c-.8-.4-1.4-1-1.8-1.8l.8-1-1-2z" /></svg>,
  play: () => <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>,
  ext: () => <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>,
};

const openGuide = () => window.open(GUIDE_PATH, '_blank', 'noopener,noreferrer');
const abs = (src) => (src && src.startsWith('/api/') ? `${BACKEND_URL}${src}` : src);

// YouTube / Vimeo links embed; direct video files play in <video>; other links open in a tab.
function playerFor(src) {
  if (!src) return { kind: 'none' };
  const yt = src.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: 'iframe', url: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = src.match(/vimeo\.com\/(\d+)/);
  if (vm) return { kind: 'iframe', url: `https://player.vimeo.com/video/${vm[1]}` };
  if (src.startsWith('/api/') || /\.(mp4|webm|mov)(\?|$)/i.test(src)) return { kind: 'video', url: abs(src) };
  return { kind: 'link', url: src };
}

const norm = (s) => String(s || '').toLowerCase();

export default function HelpDrawer({ open, onClose }) {
  const [content, setContent] = useState(null); // {categories, videos, faqs}
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [openVid, setOpenVid] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Load (or refresh) the platform-managed content each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    axios.get(`${API}/help`, { params: { audience: 'salon' } })
      .then((r) => { if (!cancelled) { setContent(r.data); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open]);

  const catName = useMemo(() => Object.fromEntries((content?.categories || []).map((c) => [c.id, c.name])), [content]);
  const { videos, faqs, cats } = useMemo(() => {
    const words = norm(q).replace(/#/g, '').split(/\s+/).filter(Boolean);
    const hit = (item, text) => (!cat || item.category_id === cat)
      && words.every((w) => norm(`${text} ${(item.hashtags || []).join(' ')} ${catName[item.category_id] || ''}`).includes(w));
    const vs = (content?.videos || []).filter((v) => hit(v, `${v.title} ${v.description || ''}`));
    const fs = (content?.faqs || []).filter((f) => hit(f, `${f.question} ${f.answer}`));
    const used = new Set([...(content?.videos || []), ...(content?.faqs || [])].map((x) => x.category_id).filter(Boolean));
    return { videos: vs, faqs: fs, cats: (content?.categories || []).filter((c) => used.has(c.id)) };
  }, [content, q, cat, catName]);

  const activeVideo = videos.find((v) => v.id === openVid);
  const searching = q.trim().length > 0 || !!cat;
  const playVideo = (v) => {
    const next = openVid === v.id ? null : v.id;
    setOpenVid(next);
    if (next) axios.post(`${API}/help/videos/${v.id}/view`).catch(() => {});
  };
  const Tags = ({ item }) => (item.hashtags?.length ? (
    <div className="hlp-tags">{item.hashtags.map((t) => <button key={t} type="button" className="hlp-tag" onClick={() => setQ(`#${t}`)}>#{t}</button>)}</div>
  ) : null);

  return ReactDOM.createPortal(
    <>
      <style>{CSS}</style>
      <div className="hlp-scrim" onClick={onClose} style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }} />
      <aside
        className="hlp"
        role="dialog"
        aria-label="Help"
        aria-hidden={!open}
        data-testid="help-drawer"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)', boxShadow: open ? '-24px 0 60px rgba(15,10,40,.20)' : 'none' }}
      >
        <div className="hlp-h">
          <span className="ic"><Ic.help /></span>
          <div className="tt"><b>Help centre</b><span>Videos, FAQs and support</span></div>
          <button type="button" className="hlp-x" onClick={onClose} title="Close" data-testid="help-close"><Ic.x /></button>
        </div>

        <div className="hlp-search">
          <span className="mg"><Ic.search /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help: invoice, coupon, #gst…"
            data-testid="help-search"
          />
        </div>

        <div className="hlp-acts">
          <a className="hlp-act wa" href={supportWhatsAppUrl(activeVideo?.title)} target="_blank" rel="noopener noreferrer" data-testid="help-whatsapp">
            <Ic.wa />Chat with us on WhatsApp
          </a>
          <button type="button" className="hlp-act" onClick={openGuide} data-testid="help-open-guide"><Ic.book />Full guide</button>
          <a className="hlp-act" href={GUIDE_PDF} download data-testid="help-download-pdf"><Ic.pdf />Download PDF</a>
        </div>

        {cats.length > 0 && (
          <div className="hlp-cats" data-testid="help-categories">
            <button type="button" className={`hlp-cat${!cat ? ' on' : ''}`} onClick={() => setCat('')}>All</button>
            {cats.map((c) => (
              <button key={c.id} type="button" className={`hlp-cat${cat === c.id ? ' on' : ''}`} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="hlp-body">
          {!content && !failed && <div className="hlp-empty">Loading help…</div>}
          {failed && !content && <div className="hlp-empty">Couldn’t load help right now. Use the full guide, or chat with us on WhatsApp.</div>}
          {content && !content.videos.length && !content.faqs.length && (
            <div className="hlp-empty">Help videos and FAQs are being added. Meanwhile, see the full guide or chat with us on WhatsApp.</div>
          )}

          {content && (content.videos.length > 0) && (
            <>
              <div className="hlp-sec">{searching ? `Videos (${videos.length})` : 'How-to videos'}</div>
              {videos.length === 0 && <div className="hlp-empty">No video matches. Try another word.</div>}
              {videos.map((v) => {
                const isOpen = openVid === v.id;
                const pl = playerFor(v.video_src);
                return (
                  <div key={v.id} className={`hlp-vid${isOpen ? ' open' : ''}`} data-testid={`help-video-${v.id}`}>
                    <button type="button" onClick={() => playVideo(v)}>
                      <span className="th" style={v.poster_src ? { backgroundImage: `url(${abs(v.poster_src)})` } : undefined}>{!v.poster_src && <Ic.play />}</span>
                      <span className="t">{v.title}{catName[v.category_id] && <small>{catName[v.category_id]}</small>}</span>
                      <span className="chev"><Ic.chev /></span>
                    </button>
                    {isOpen && (
                      <div className="in">
                        {pl.kind === 'video' && <video controls autoPlay playsInline preload="metadata" src={pl.url} poster={abs(v.poster_src) || undefined} />}
                        {pl.kind === 'iframe' && <iframe src={pl.url} title={v.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
                        {v.description && <p>{v.description}</p>}
                        <Tags item={v} />
                        <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {pl.kind === 'link' && <a className="hlp-link pri" href={pl.url} target="_blank" rel="noopener noreferrer"><Ic.ext />Watch video</a>}
                          <a className="hlp-link ghost" href={supportWhatsAppUrl(v.title)} target="_blank" rel="noopener noreferrer"><Ic.wa />Ask on WhatsApp</a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {content && content.faqs.length > 0 && (
            <>
              <div className="hlp-sec">{searching ? `FAQs (${faqs.length})` : 'Frequently asked questions'}</div>
              {faqs.length === 0 && <div className="hlp-empty">No FAQ matches. Message us on WhatsApp and we’ll help.</div>}
              {faqs.map((f) => {
                const isOpen = openFaq === f.id;
                return (
                  <div key={f.id} className={`hlp-faq${isOpen ? ' open' : ''}`}>
                    <button type="button" onClick={() => setOpenFaq(isOpen ? null : f.id)}>
                      <span className="q">{f.question}{catName[f.category_id] && <small>{catName[f.category_id]}</small>}</span>
                      <span className="chev"><Ic.chev /></span>
                    </button>
                    {isOpen && <div className="a">{f.answer}<Tags item={f} /></div>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}
