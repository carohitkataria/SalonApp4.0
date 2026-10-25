/**
 * HelpDrawer.js — right-side Help centre opened from the ribbon "?" icon.
 *
 *  • Search across every guide topic and FAQ
 *  • Topic cards: short steps + "See with screenshots" (opens /help/guide#topic)
 *  • FAQs (accordion), filtered by the search
 *  • Chat on WhatsApp with support (pre-filled with the open topic)
 *  • Download the full PDF guide
 *
 * Content lives in '@/lib/helpContent' (shared with the /help/guide page).
 * Rendered via a portal so it stacks above the ribbon, like NotificationsDrawer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  searchHelp, supportWhatsAppUrl, GUIDE_PATH, GUIDE_PDF,
} from '@/lib/helpContent';

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
.hlp-body{flex:1;overflow-y:auto;padding:6px 18px 24px}
.hlp-sec{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#8880a8;margin:16px 2px 8px}
.hlp-topic{border:1px solid #ECE9F6;border-radius:14px;margin-bottom:8px;overflow:hidden}
.hlp-topic > button{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border:none;cursor:pointer;text-align:left;font-family:inherit}
.hlp-topic > button:hover{background:#FBFAFF}
.hlp-topic .n{width:26px;height:26px;border-radius:8px;background:#F1EEFF;color:#6C4FE0;font-size:12px;font-weight:800;display:grid;place-items:center;flex:none}
.hlp-topic .t{flex:1;font-size:14px;font-weight:700;color:#211a3d}
.hlp-topic .chev{color:#A49CC4;transition:transform .2s}
.hlp-topic.open .chev{transform:rotate(90deg)}
.hlp-topic .in{padding:0 14px 14px 50px;font-size:13px;line-height:1.55;color:#4A4466}
.hlp-topic .in p{margin:0 0 8px}
.hlp-topic .in ol{margin:0 0 10px;padding-left:18px;list-style:decimal}
.hlp-topic .in li b{font-weight:700;color:#211a3d}
.hlp-topic .in li{margin-bottom:3px}
.hlp-topic .in .row{display:flex;gap:8px;flex-wrap:wrap}
.hlp-link{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;padding:7px 11px;border-radius:9px;text-decoration:none;cursor:pointer;border:none;font-family:inherit}
.hlp-link.pri{background:#6C4FE0;color:#fff}
.hlp-link.pri:hover{background:#5A3FD0}
.hlp-link.ghost{background:#E8F8EE;color:#137A3C}
.hlp-link svg{width:14px;height:14px}
.hlp-faq{border-bottom:1px solid #F0EEF7}
.hlp-faq > button{width:100%;display:flex;gap:10px;align-items:flex-start;padding:11px 2px;background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:650;color:#211a3d}
.hlp-faq > button .q{flex:1}
.hlp-faq > button small{display:block;font-size:11px;font-weight:600;color:#9A92BC;margin-top:2px}
.hlp-faq .a{padding:0 2px 12px;font-size:13px;line-height:1.55;color:#4A4466}
.hlp-faq .chev{color:#A49CC4;transition:transform .2s;margin-top:2px}
.hlp-faq.open .chev{transform:rotate(90deg)}
.hlp-empty{padding:28px 8px;text-align:center;color:#8880a8;font-size:13px}
`;

const Ic = {
  help: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  x: () => <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  search: () => <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  chev: () => <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>,
  book: () => <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5V21h16" /></svg>,
  pdf: () => <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v3h16v-3" /></svg>,
  wa: () => <svg viewBox="0 0 24 24"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z" /><path d="M9 10c0 3 2 5 5 5l1-1.5-2-1-1 .8c-.8-.4-1.4-1-1.8-1.8l.8-1-1-2z" /></svg>,
};

const openGuide = (id) => window.open(`${GUIDE_PATH}${id ? `#${id}` : ''}`, '_blank', 'noopener,noreferrer');

export default function HelpDrawer({ open, onClose }) {
  const [q, setQ] = useState('');
  const [openTopic, setOpenTopic] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const { topics, faqs } = useMemo(() => searchHelp(q), [q]);
  const searching = q.trim().length > 0;
  const activeTopic = topics.find((t) => t.id === openTopic);

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
          <div className="tt"><b>Help centre</b><span>Guides, FAQs and support</span></div>
          <button type="button" className="hlp-x" onClick={onClose} title="Close" data-testid="help-close"><Ic.x /></button>
        </div>

        <div className="hlp-search">
          <span className="mg"><Ic.search /></span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search help: invoice, coupon, attendance…"
            data-testid="help-search"
          />
        </div>

        <div className="hlp-acts">
          <a className="hlp-act wa" href={supportWhatsAppUrl(activeTopic?.title)} target="_blank" rel="noopener noreferrer" data-testid="help-whatsapp">
            <Ic.wa />Chat with us on WhatsApp
          </a>
          <button type="button" className="hlp-act" onClick={() => openGuide()} data-testid="help-open-guide"><Ic.book />Full guide</button>
          <a className="hlp-act" href={GUIDE_PDF} download data-testid="help-download-pdf"><Ic.pdf />Download PDF</a>
        </div>

        <div className="hlp-body">
          <div className="hlp-sec">{searching ? `Guides (${topics.length})` : 'Step-by-step guides'}</div>
          {topics.length === 0 && <div className="hlp-empty">No guide matches “{q}”. Try another word or chat with us on WhatsApp.</div>}
          {topics.map((t, i) => {
            const isOpen = openTopic === t.id;
            return (
              <div key={t.id} className={`hlp-topic${isOpen ? ' open' : ''}`} data-testid={`help-topic-${t.id}`}>
                <button type="button" onClick={() => setOpenTopic(isOpen ? null : t.id)}>
                  <span className="n">{i + 1}</span>
                  <span className="t">{t.title}</span>
                  <span className="chev"><Ic.chev /></span>
                </button>
                {isOpen && (
                  <div className="in">
                    <p>{t.summary}</p>
                    <ol>{t.parts.map((p) => <li key={p.img}><b>{p.title}</b> — {p.steps[0]}</li>)}</ol>
                    <div className="row">
                      <button type="button" className="hlp-link pri" onClick={() => openGuide(t.id)} data-testid={`help-guide-${t.id}`}>
                        <Ic.book />See with screenshots
                      </button>
                      <a className="hlp-link ghost" href={supportWhatsAppUrl(t.title)} target="_blank" rel="noopener noreferrer">
                        <Ic.wa />Ask on WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="hlp-sec">{searching ? `FAQs (${faqs.length})` : 'Frequently asked questions'}</div>
          {faqs.length === 0 && <div className="hlp-empty">No FAQ matches. Message us on WhatsApp and we’ll help.</div>}
          {faqs.map((f) => {
            const key = `${f.topicId || 'general'}:${f.q}`;
            const isOpen = openFaq === key;
            return (
              <div key={key} className={`hlp-faq${isOpen ? ' open' : ''}`}>
                <button type="button" onClick={() => setOpenFaq(isOpen ? null : key)}>
                  <span className="q">{f.q}<small>{f.topicTitle}</small></span>
                  <span className="chev"><Ic.chev /></span>
                </button>
                {isOpen && <div className="a">{f.a}</div>}
              </div>
            );
          })}
        </div>
      </aside>
    </>,
    document.body,
  );
}
