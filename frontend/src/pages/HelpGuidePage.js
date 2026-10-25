/**
 * HelpGuidePage.js — full illustrated SalonHub user guide at /help/guide.
 *
 * Renders every topic from '@/lib/helpContent' with its annotated screenshots
 * (/help/img/*.jpg — red boxes and numbered arrows match the numbered steps),
 * tips and FAQs. Print-friendly: each topic starts on a new page, which is how
 * /help/SalonHub-User-Guide.pdf is produced. Deep links: /help/guide#invoice.
 */
import React, { useEffect } from 'react';
import {
  HELP_TOPICS, GENERAL_FAQS, GUIDE_PDF, supportWhatsAppUrl, topicVideo,
} from '@/lib/helpContent';

const CSS = `
.hg{--pri:#6C4FE0;--ink:#211a3d;--mut:#6E6890;--line:#ECE9F6;--red:#E11D2E;background:#F6F5FB;min-height:100vh;color:var(--ink);font-family:'Inter',system-ui,sans-serif;line-height:1.6}
.hg *{box-sizing:border-box}
.hg-bar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.hg-bar .w{max-width:1080px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.hg-bar b{font-size:15px;font-weight:800;flex:1;min-width:160px}
.hg-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid var(--line);background:#fff;color:#3B2F7A;cursor:pointer;font-family:inherit}
.hg-btn.wa{background:#E8F8EE;border-color:#C9EBD6;color:#137A3C}
.hg-btn.pri{background:var(--pri);border-color:var(--pri);color:#fff}
.hg main{max-width:1080px;margin:0 auto;padding:24px 16px 60px}
.hg-cover{background:linear-gradient(135deg,#6C4FE0,#9A6BFF);color:#fff;border-radius:22px;padding:40px 36px;margin-bottom:22px}
.hg-cover h1{font-size:34px;line-height:1.15;margin:0 0 8px;font-weight:800;letter-spacing:-.5px}
.hg-cover p{margin:0;opacity:.92;font-size:15px;max-width:640px}
.hg-cover .meta{margin-top:18px;font-size:12.5px;opacity:.85}
.hg-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px 28px;margin-bottom:22px}
.hg-toc ol{margin:6px 0 0;padding-left:22px;columns:2;column-gap:36px}
.hg-toc li{margin-bottom:6px;break-inside:avoid}
.hg-toc a{color:var(--pri);font-weight:650;text-decoration:none}
.hg h2{font-size:24px;margin:0 0 4px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:12px}
.hg h2 .num{width:34px;height:34px;border-radius:10px;background:#F1EEFF;color:var(--pri);display:grid;place-items:center;font-size:16px;flex:none}
.hg .sum{color:var(--mut);margin:0 0 18px}
.hg .vid{margin:0 0 8px;max-width:720px}
.hg .vid video{display:block;width:100%;border-radius:12px;background:#1c1830;aspect-ratio:16/10}
.hg .vid span{display:block;font-size:12.5px;color:var(--mut);margin-top:6px}
.hg h3{font-size:16.5px;margin:22px 0 10px;font-weight:800}
.hg h3 .st{color:var(--pri);margin-right:6px}
.hg figure{margin:0 0 12px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fafafa}
.hg figure img{display:block;width:100%;height:auto}
.hg ol.steps{margin:0 0 6px;padding:0;list-style:none;counter-reset:s}
.hg ol.steps li{counter-increment:s;position:relative;padding:4px 0 4px 36px;margin-bottom:2px}
.hg ol.steps li::before{content:counter(s);position:absolute;left:0;top:5px;width:24px;height:24px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center}
.hg .note{background:#FFF8E6;border:1px solid #F6E3B0;border-radius:10px;padding:9px 13px;font-size:13.5px;margin:8px 0 0}
.hg .tips{background:#F4F1FF;border-radius:12px;padding:14px 18px;margin-top:18px}
.hg .tips b{display:block;margin-bottom:4px}
.hg .tips ul{margin:0;padding-left:18px}
.hg .faq{margin:0}
.hg .faq dt{font-weight:750;margin-top:12px}
.hg .faq dd{margin:2px 0 0;color:#4A4466}
.hg .help{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px dashed var(--line);font-size:13.5px;color:var(--mut)}
.hg-legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13.5px;color:var(--mut);margin-top:10px}
.hg-legend span{display:inline-flex;align-items:center;gap:8px}
.hg-legend i{display:inline-block;width:22px;height:14px;border:3px solid var(--red);border-radius:3px}
.hg-legend em{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--pri);color:#fff;font-style:normal;font-size:11px;font-weight:800}
@media(max-width:640px){.hg-cover{padding:28px 20px}.hg-cover h1{font-size:26px}.hg-card{padding:18px 16px}.hg-toc ol{columns:1}}
@media print{
  @page{size:A4;margin:12mm}
  .hg{background:#fff}
  .hg-bar,.hg .help,.hg .vid{display:none}
  .hg main{padding:0;max-width:none}
  .hg-card{border:none;padding:0;margin:0 0 10px}
  .hg-topic{break-before:page}
  .hg-part{break-inside:avoid}
  .hg figure img{max-height:92mm;width:auto;max-width:100%;margin:0 auto}
  .hg figure{border:1px solid #ddd}
  .hg-cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hg ol.steps li::before,.hg .tips,.hg .note,.hg h2 .num,.hg-legend i,.hg-legend em{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

export default function HelpGuidePage() {
  useEffect(() => {
    document.title = 'SalonHub User Guide';
    const id = window.location.hash.slice(1);
    if (!id) return undefined;
    // Wait for images above the anchor to take their space before scrolling.
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="hg">
      <style>{CSS}</style>
      <div className="hg-bar">
        <div className="w">
          <b>SalonHub User Guide</b>
          <a className="hg-btn wa" href={supportWhatsAppUrl()} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
          <a className="hg-btn" href={GUIDE_PDF} download>Download PDF</a>
          <button type="button" className="hg-btn pri" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      <main>
        <section className="hg-cover">
          <h1>SalonHub User Guide</h1>
          <p>Step-by-step instructions with screenshots for the everyday tasks in your SalonHub dashboard: billing, services and prices, staff, guests, attendance, WhatsApp, memberships, coupons and templates.</p>
          <div className="meta">Need help? WhatsApp us at +91 75030 70727 · Open Help (?) on the right ribbon of the app any time.</div>
        </section>

        <section className="hg-card hg-toc">
          <h2 style={{ fontSize: 19 }}>Contents</h2>
          <ol>
            {HELP_TOPICS.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.title}</a></li>)}
            <li><a href="#general">General questions</a></li>
          </ol>
          <div className="hg-legend">
            <span><i />Red box: the button or field to use</span>
            <span><em>1</em>Numbered label + arrow: matches the step number below the screenshot</span>
          </div>
        </section>

        {HELP_TOPICS.map((t, ti) => (
          <section key={t.id} id={t.id} className="hg-card hg-topic">
            <h2><span className="num">{ti + 1}</span>{t.title}</h2>
            <p className="sum">{t.summary}</p>
            <div className="vid">
              <video controls preload="none" playsInline {...topicVideo(t.id)} />
              <span>Watch the {t.title.toLowerCase()} demo (silent, with captions).</span>
            </div>
            {t.parts.map((p, pi) => (
              <div key={p.img} className="hg-part">
                <h3><span className="st">{ti + 1}.{pi + 1}</span>{p.title}</h3>
                <figure><img src={`/help/img/${p.img}.jpg`} alt={p.title} loading="eager" /></figure>
                <ol className="steps">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {p.note && <div className="note">{p.note}</div>}
              </div>
            ))}
            {t.tips.length > 0 && (
              <div className="tips"><b>Tips</b><ul>{t.tips.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}
            <h3>FAQs</h3>
            <dl className="faq">
              {t.faqs.map((f) => <React.Fragment key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></React.Fragment>)}
            </dl>
            <div className="help">
              <span>Still stuck with “{t.title}”?</span>
              <a className="hg-btn wa" href={supportWhatsAppUrl(t.title)} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
            </div>
          </section>
        ))}

        <section id="general" className="hg-card hg-topic">
          <h2>General questions</h2>
          <dl className="faq">
            {GENERAL_FAQS.map((f) => <React.Fragment key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></React.Fragment>)}
          </dl>
        </section>
      </main>
    </div>
  );
}
