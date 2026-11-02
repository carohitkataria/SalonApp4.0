/**
 * MarketingV2.js — new Marketing page redesign matching salon_marketing.html mock.
 * Uses .shv2 tokens (rail/ribbon shell already provided by HomeV2Shell wrapper).
 * All list panels expose a right-side drawer to CREATE new items.
 *
 * Wired to existing backend endpoints:
 *   GET  /api/salons/{id}/marketing/overview
 *   GET  /api/salons/{id}/marketing/campaigns
 *   POST /api/salons/{id}/marketing/campaigns
 *   POST /api/salons/{id}/marketing/campaigns/{cid}/launch|pause|resume|stop
 *   GET  /api/salons/{id}/marketing/automations
 *   POST /api/salons/{id}/marketing/automations
 *   PUT  /api/salons/{id}/marketing/automations/{aid}
 *   GET  /api/salons/{id}/marketing/templates
 *   POST /api/salons/{id}/marketing/templates
 *   GET  /api/salons/{id}/coupons
 *   POST /api/salons/{id}/coupons
 *   GET  /api/salons/{id}/marketing/segments
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { V2_PAGES_CSS } from './styles_v2';
import MarketingSettingsPanel from './MarketingSettingsPanel';
import { PosterStudio, CalendarPanel, InstagramCard, PhotoPicker, STUDIO_CSS } from './MarketingStudio';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// ---------------------- Small icon set ----------------------
const Ico = {
  cal: () => <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  brush: () => <svg viewBox="0 0 24 24"><path d="M9.06 11.9 17 4l3 3-7.94 7.94"/><path d="M7 14a3 3 0 0 0-3 3c0 1.5-1 2-2 2 1 1.5 2.5 2 4 2a4 4 0 0 0 4-4 3 3 0 0 0-3-3z"/></svg>,
  send: () => <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  bolt: () => <svg viewBox="0 0 24 24"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  chat: () => <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  tag:  () => <svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  star: () => <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  gear: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  chart:() => <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  plus: () => <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  close:() => <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check:() => <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  clock:() => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  pencil:() => <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  trash:() => <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
  refresh:() => <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  gear:() => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  wa:() => <svg viewBox="0 0 24 24" style={{fill:'currentColor', stroke:'none'}}><path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2z"/></svg>,
  images:() => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
  mail: () => <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>,
  info: () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  users:() => <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  rupee:() => <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  trending:() => <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  external:() => <svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  wifi:() => <svg viewBox="0 0 24 24"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>,
};

// ---------------------- Utilities ----------------------
const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const CH_STYLE = {
  whatsapp:{bg:'var(--wa-bg)', fg:'var(--wa)', label:'WhatsApp', icon: Ico.chat},
  sms:     {bg:'var(--sky-bg)', fg:'var(--sky)', label:'SMS',     icon: Ico.chat},
  email:   {bg:'var(--amber-bg)', fg:'var(--amber)', label:'Email', icon: Ico.mail},
};

// Inject scoped stylesheet once.
function useV2Styles() {
  useEffect(() => {
    const id = 'shv2-v2pages-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = V2_PAGES_CSS;
    document.head.appendChild(el);
  }, []);
}

// ---------------------- Right-side drawer helper (React portal) ----------------------
// Portal is critical — the salon dashboard content is wrapped in a Tailwind
// `<div class="relative z-10">` which creates a stacking context that traps
// the drawer BELOW the right-side ribbon. Portaling to document.body makes
// the drawer + overlay sit above every shell element.
function Drawer({ open, onClose, title, subtitle, iconFn, children, footer }) {
  const IcFn = iconFn || Ico.send;
  const node = (
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: 9060 }} />
      <aside className={`shv2-drawer v2-narrow ${open ? 'open' : ''}`} style={{ zIndex: 9070 }}>
        <div className="v2-dh">
          <div className="tt">
            <div className="ic"><IcFn /></div>
            <div>
              <h3>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <button className="v2-close" onClick={onClose}><Ico.close /></button>
        </div>
        <div className="v2-db">{children}</div>
        {footer && <div className="v2-df">{footer}</div>}
      </aside>
    </>
  );
  return ReactDOM.createPortal(node, document.body);
}

// ============================================================
// AUDIENCE (segment rules) — mirrors backend ALLOWED_FIELDS
// ============================================================
const AUDIENCE_FIELDS = [
  { key: 'age_min', label: 'Age ≥', type: 'number', defOp: 'gte' },
  { key: 'age_max', label: 'Age ≤', type: 'number', defOp: 'lte' },
  { key: 'birthday_month', label: 'Birthday month', type: 'month', defOp: 'eq' },
  { key: 'wedding_anniversary_month', label: 'Anniversary month', type: 'month', defOp: 'eq' },
  { key: 'spouse_birthday_month', label: 'Spouse birthday month', type: 'month', defOp: 'eq' },
  { key: 'last_visit_min_days', label: 'Last visit ≥ (days ago)', type: 'number', defOp: 'gte' },
  { key: 'last_visit_max_days', label: 'Last visit ≤ (days ago)', type: 'number', defOp: 'lte' },
  { key: 'avg_spend_min', label: 'Avg spend ≥ (₹)', type: 'number', defOp: 'gte' },
  { key: 'total_spend_min', label: 'Total spend ≥ (₹)', type: 'number', defOp: 'gte' },
  { key: 'visit_count_min', label: 'Visit count ≥', type: 'number', defOp: 'gte' },
  { key: 'gender', label: 'Gender', type: 'gender', defOp: 'eq' },
  { key: 'membership_tier', label: 'Membership tier', type: 'text', defOp: 'eq' },
  { key: 'has_wallet', label: 'Has wallet', type: 'bool', defOp: 'eq' },
  { key: 'phones', label: 'Specific phone numbers', type: 'phones', defOp: 'in' },
];
const AUDIENCE_OPS = [
  { key: 'eq', label: 'equals' },
  { key: 'gte', label: '≥ (at least)' },
  { key: 'lte', label: '≤ (at most)' },
  { key: 'in', label: 'in list' },
  { key: 'contains', label: 'contains' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fieldMeta = (key) => AUDIENCE_FIELDS.find((f) => f.key === key) || AUDIENCE_FIELDS[0];
const SEGMENT_PRESETS = [
  { name: 'Inactive 60+ days', rules: { logic: 'AND', conditions: [{ field: 'last_visit_min_days', op: 'gte', value: 60 }] } },
  { name: 'Birthdays this month', rules: { logic: 'AND', conditions: [{ field: 'birthday_month', op: 'eq', value: (new Date().getMonth() + 1) }] } },
  { name: 'High spenders ₹5k+', rules: { logic: 'AND', conditions: [{ field: 'total_spend_min', op: 'gte', value: 5000 }] } },
  { name: 'Members with wallet', rules: { logic: 'AND', conditions: [{ field: 'has_wallet', op: 'eq', value: true }] } },
];

// Automation types — mirrors backend AutomationIn.type enum
const AUTOMATION_TYPES = [
  { key: 'birthday', title: 'Birthday wish + treat', desc: 'Send on the guest\u2019s birthday' },
  { key: 'wedding_anniversary', title: 'Anniversary offer', desc: 'Send on wedding anniversary' },
  { key: 'spouse_birthday', title: 'Spouse birthday', desc: 'Send on spouse\u2019s birthday' },
  { key: 'win_back', title: 'Win-back lapsed guests', desc: 'Re-engage guests who went quiet' },
  { key: 'reminder', title: 'Appointment reminder', desc: 'Nudge before/after appointments' },
  { key: 'membership_expiring', title: 'Membership expiring', desc: 'Remind guests before their membership ends' },
];
const AUTOMATION_LABELS = AUTOMATION_TYPES.reduce((acc, t) => { acc[t.key] = { title: t.title, desc: t.desc, ic: Ico.bolt }; return acc; }, {});

// Reusable audience / segment-rules builder (Section 2).
function AudienceBuilder({ rules, onChange }) {
  const logic = rules?.logic || 'AND';
  const conditions = rules?.conditions || [];

  const setLogic = (l) => onChange({ logic: l, conditions });
  const addCond = () => {
    const f = AUDIENCE_FIELDS[0];
    onChange({ logic, conditions: [...conditions, { field: f.key, op: f.defOp, value: '' }] });
  };
  const removeCond = (i) => onChange({ logic, conditions: conditions.filter((_, idx) => idx !== i) });
  const patchCond = (i, patch) => onChange({ logic, conditions: conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) });

  const renderValue = (c, i) => {
    const meta = fieldMeta(c.field);
    if (meta.type === 'month') {
      return (
        <select value={String(c.value ?? '')} onChange={(e) => patchCond(i, { value: Number(e.target.value) })}>
          <option value="">— month —</option>
          {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
        </select>
      );
    }
    if (meta.type === 'gender') {
      return (
        <select value={String(c.value ?? '')} onChange={(e) => patchCond(i, { value: e.target.value })}>
          <option value="">— gender —</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
      );
    }
    if (meta.type === 'bool') {
      return (
        <select value={c.value === true ? '1' : c.value === false ? '0' : ''} onChange={(e) => patchCond(i, { value: e.target.value === '1' })}>
          <option value="">— pick —</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      );
    }
    if (meta.type === 'phones' || c.op === 'in') {
      const asText = Array.isArray(c.value) ? c.value.join(', ') : (c.value ?? '');
      return (
        <input placeholder="9876543210, 9812345601"
          value={asText}
          onChange={(e) => patchCond(i, { value: e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean) })} />
      );
    }
    if (meta.type === 'number') {
      return <input type="number" value={c.value ?? ''} onChange={(e) => patchCond(i, { value: e.target.value === '' ? '' : Number(e.target.value) })} />;
    }
    return <input value={c.value ?? ''} onChange={(e) => patchCond(i, { value: e.target.value })} />;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted,#6b6489)' }}>Match</span>
        <div className="ch-pick" style={{ display: 'inline-flex' }}>
          <button type="button" className={logic === 'AND' ? 'on' : ''} onClick={() => setLogic('AND')}>ALL (AND)</button>
          <button type="button" className={logic === 'OR' ? 'on' : ''} onClick={() => setLogic('OR')}>ANY (OR)</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted,#6b6489)' }}>of these conditions</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {SEGMENT_PRESETS.map((p) => (
          <button key={p.name} type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }}
            onClick={() => onChange(JSON.parse(JSON.stringify(p.rules)))}>{p.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conditions.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted,#6b6489)' }}>No conditions — this targets ALL guests. Add a rule or pick a preset.</div>
        )}
        {conditions.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr .9fr 1.2fr 32px', gap: 6, alignItems: 'center', background: 'var(--line-2,#f7f6fc)', padding: '8px 10px', borderRadius: 10 }}>
            <select value={c.field} onChange={(e) => { const m = fieldMeta(e.target.value); patchCond(i, { field: e.target.value, op: m.defOp, value: '' }); }}>
              {AUDIENCE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={c.op} onChange={(e) => patchCond(i, { op: e.target.value })}>
              {AUDIENCE_OPS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {renderValue(c, i)}
            <button type="button" className="btn-ghost" title="Remove" style={{ padding: '4px 6px', color: 'var(--rose,#e11d48)' }} onClick={() => removeCond(i)}><Ico.trash /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost" style={{ marginTop: 10, padding: '6px 12px' }} onClick={addCond}><Ico.plus /> Add condition</button>
    </div>
  );
}

// Drawer: create / edit an audience segment (Section 2).
function NewSegmentDrawer({ open, onClose, salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState({ logic: 'AND', conditions: [] });
  const [count, setCount] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setName(initial.name || '');
      setDescription(initial.description || '');
      setRules(initial.rules && initial.rules.conditions ? initial.rules : { logic: 'AND', conditions: [] });
    } else {
      setName(''); setDescription(''); setRules({ logic: 'AND', conditions: [] });
    }
    setCount(null);
  }, [open, initial]);

  const preview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await axios.post(`${API}/salons/${salonId}/marketing/segments/preview`,
        { name: name || 'preview', description, rules }, { headers: authHeaders() });
      setCount(res.data?.count ?? 0);
    } catch (e) { toast.error(e.response?.data?.detail || 'Preview failed'); }
    finally { setPreviewing(false); }
  }, [salonId, authHeaders, name, description, rules]);

  // auto-preview whenever rules change (debounced)
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => { preview(); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, open]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Segment name required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description || null, rules };
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/marketing/segments/${initial.id}`, payload, { headers: authHeaders() });
        toast.success('Segment updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/marketing/segments`, payload, { headers: authHeaders() });
        toast.success('Segment saved');
      }
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Audience Segment' : 'New Audience Segment'} subtitle="Build a rule-based audience" iconFn={Ico.users}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="segment-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Save segment'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Segment name</label>
        <input placeholder="e.g. Lapsed high spenders" value={name} onChange={(e) => setName(e.target.value)} data-testid="segment-name-input" />
      </div>
      <div className="v2-field"><label>Description (optional)</label>
        <input placeholder="Who is in this audience?" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="v2-field"><label>Audience rules</label>
        <AudienceBuilder rules={rules} onChange={setRules} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: 'var(--wa-bg)', border: '1px solid #CDEBD9', padding: '10px 12px', borderRadius: 10 }}>
        <b style={{ fontSize: 18, color: 'var(--wa)' }} data-testid="segment-preview-count">{count == null ? '…' : count.toLocaleString('en-IN')}</b>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft,#556)' }}>guests match right now</span>
        <button type="button" className="btn-ghost" style={{ marginLeft: 'auto', padding: '5px 10px' }} disabled={previewing} onClick={preview}>
          <Ico.refresh /> {previewing ? 'Counting…' : 'Refresh'}
        </button>
      </div>
    </Drawer>
  );
}


// ============================================================
// MAIN COMPONENT
// ============================================================
function SalonHubReviewsPanel({ salonId, authHeaders }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/salons/${salonId}/ratings?limit=100`, { headers: authHeaders() });
      setData(res.data);
    } catch (e) {
      setData({ average_rating: 0, total_reviews: 0, reviews: [] });
    } finally { setLoading(false); }
  }, [salonId, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const reviews = data?.reviews || [];
  const avg = data?.average_rating || 0;
  const total = data?.total_reviews || 0;
  const fiveStar = reviews.filter((r) => r.rating === 5).length;
  const lowStar = reviews.filter((r) => r.rating <= 2).length;
  const fmtDate = (d) => {
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  };
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <div>
      <div className="mk-kpis" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <KpiTile chip="amber" icon={<Ico.star />} val={avg ? avg.toFixed(1) : '—'} label="Avg rating (SalonHub)" />
        <KpiTile chip="wa" icon={<Ico.chat />} val={total} label="Total reviews" />
        <KpiTile chip="green" icon={<Ico.trending />} val={fiveStar} label="5-star reviews" />
        <KpiTile chip="rose" icon={<Ico.info />} val={lowStar} label="Needs attention (≤2★)" />
      </div>

      <div className="card">
        <div className="card__h">
          <div className="t">
            <Ico.star /> SalonHub reviews
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: 'var(--green-bg,#E4F6ED)', color: 'var(--green,#1F8F52)', padding: '2px 7px', borderRadius: 20, letterSpacing: .3 }}>LIVE</span>
          </div>
          <button className="btn-ghost" onClick={load} data-testid="reviews-refresh">Refresh</button>
        </div>

        <div className="clist" data-testid="salonhub-reviews-list">
          {loading && <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>Loading reviews…</div>}
          {!loading && reviews.length === 0 && (
            <div style={{ padding: '26px 18px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>⭐</div>
              <div style={{ fontWeight: 800, color: 'var(--ink,#2B2B3A)', marginBottom: 4 }}>No reviews yet</div>
              <div style={{ fontSize: 12.5 }}>Every completed service sends the customer a WhatsApp review link. Reviews will appear here automatically.</div>
            </div>
          )}
          {!loading && reviews.map((r) => (
            <div className="crow" key={r.id} data-testid={`review-row-${r.id}`}>
              <div className="rev-avatar" style={{ background: r.rating >= 4 ? '#F5A623' : (r.rating <= 2 ? '#C33C5F' : '#9298AA') }}>{r.rating}</div>
              <div className="cn" style={{ flex: 1, minWidth: 0 }}>
                <b>{r.user_name || 'Customer'} · <span style={{ color: '#F5A623' }}>{stars(r.rating)}</span></b>
                <span>{r.review ? `"${r.review}"` : <i style={{ color: 'var(--muted)' }}>No comment</i>}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {r.barber_name ? `Served by ${r.barber_name} · ` : ''}{fmtDate(r.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, opacity: .85 }}>
        <div className="card__h">
          <div className="t">
            <Ico.star /> Google · JustDial
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 7px', borderRadius: 20, letterSpacing: .3 }}>API COMING SOON</span>
          </div>
        </div>
        <div style={{ padding: '16px 18px', color: 'var(--muted)', fontSize: 13 }}>
          Google &amp; JustDial review sync will appear here once connected. For now, your SalonHub reviews above are collected directly from customers after every completed service.
        </div>
      </div>
    </div>
  );
}

export default function MarketingV2({ salonId, getAuthHeaders, salon }) {
  useV2Styles();

  const [tab, setTab] = useState('overview');
  const [campaignMode, setCampaignMode] = useState('oneoff'); // 'oneoff' | 'automated'
  const [libraryOpen, setLibraryOpen] = useState(false);      // Templates → library section
  const [previewLib, setPreviewLib] = useState(null);         // Templates → library preview modal
  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  // Phase 3.2 / Phase 2 — platform template library + WhatsApp (Meta) connection.
  const [library, setLibrary] = useState([]);
  const [waConn, setWaConn] = useState(null);
  const [waBusy, setWaBusy] = useState(false);

  // Drawers
  const [campaignDrawer, setCampaignDrawer] = useState(false);
  const [automationDrawer, setAutomationDrawer] = useState(false);
  const [templateDrawer, setTemplateDrawer] = useState(false);
  const [couponDrawer, setCouponDrawer] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [membershipDrawer, setMembershipDrawer] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [segmentDrawer, setSegmentDrawer] = useState(false);
  const [posterPrefill, setPosterPrefill] = useState(null);
  const [campaignPrefill, setCampaignPrefill] = useState(null);
  const openCampaign = (pf) => { setCampaignPrefill(pf); setEditingCampaign(null); setCampaignDrawer(true); setTab('campaigns'); };
  const [editingSegment, setEditingSegment] = useState(null);

  // Stable auth reference so background auto-refresh doesn't recreate fetchAll
  const authRef = useRef(getAuthHeaders);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  const authHeaders = useCallback(() => {
    try { return (authRef.current && authRef.current()) || {}; } catch { return {}; }
  }, []);

  const fetchAll = useCallback(async (opts = { silent: false }) => {
    if (!salonId) return;
    if (!opts.silent) setLoading(true);
    try {
      const [ov, cp, at, tp, cop, sg, pl] = await Promise.allSettled([
        axios.get(`${API}/salons/${salonId}/marketing/overview`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/campaigns`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/automations`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/templates`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/coupons`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/marketing/segments`, { headers: authHeaders() }),
        axios.get(`${API}/salons/${salonId}/membership-plans`, { headers: authHeaders() }),
      ]);
      setOverview(ov.status === 'fulfilled' ? ov.value.data : null);
      setCampaigns(cp.status === 'fulfilled' ? (cp.value.data.campaigns || []) : []);
      setAutomations(at.status === 'fulfilled' ? (at.value.data.automations || []) : []);
      setTemplates(tp.status === 'fulfilled' ? (tp.value.data.templates || []) : []);
      setCoupons(cop.status === 'fulfilled' ? (cop.value.data.coupons || []) : []);
      setSegments(sg.status === 'fulfilled' ? (sg.value.data.segments || []) : []);
      setPlans(pl.status === 'fulfilled' ? (pl.value.data.plans || []) : []);
      try {
        const lib = await axios.get(`${API}/platform/template-library?only_enabled=true`, { headers: authHeaders() });
        setLibrary(lib.data.templates || []);
      } catch { setLibrary([]); }
    } finally { if (!opts.silent) setLoading(false); }
  }, [salonId, authHeaders]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Phase 2 — Meta Embedded Signup helpers (mock/fallback when no Meta app).
  const META_APP_ID = process.env.REACT_APP_META_APP_ID;
  const META_CONFIG_ID = process.env.REACT_APP_META_EMBEDDED_SIGNUP_CONFIG_ID;
  const waSignupRef = useRef({});
  useEffect(() => {
    if (!META_APP_ID) return; // no Meta app configured — mock connect only
    if (document.getElementById('meta-jssdk')) return;
    window.fbAsyncInit = () => { try { window.FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v21.0' }); } catch (_) {} };
    const s = document.createElement('script');
    s.id = 'meta-jssdk'; s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    document.body.appendChild(s);
    const onMsg = (event) => {
      if (!String(event.origin || '').endsWith('facebook.com')) return;
      try {
        const d = JSON.parse(event.data);
        if (d.type === 'WA_EMBEDDED_SIGNUP' && d.data) {
          waSignupRef.current = { waba_id: d.data.waba_id, phone_number_id: d.data.phone_number_id };
        }
      } catch (_) {}
    };
    window.addEventListener('message', onMsg);
    const gotoTemplates = () => setTab('templates');
    window.addEventListener('mkset:goto-templates', gotoTemplates);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('mkset:goto-templates', gotoTemplates);
    };
  }, [META_APP_ID]);

  const completeSignup = useCallback(async ({ code, waba_id, phone_number_id }) => {
    setWaBusy(true);
    try {
      const r = await axios.post(
        `${API}/salons/${salonId}/marketing/settings/waba/embedded-signup-complete`,
        { code, waba_id, phone_number_id }, { headers: authHeaders() });
      setWaConn(r.data);
      toast.success(r.data?.mock
        ? 'WhatsApp connected (MOCK — add Meta keys to go live)'
        : 'WhatsApp connected — templates provisioning');
      fetchAll({ silent: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'WhatsApp connect failed');
    } finally { setWaBusy(false); }
  }, [salonId, authHeaders, fetchAll]);

  const connectWhatsApp = useCallback(() => {
    if (META_APP_ID && META_CONFIG_ID && window.FB) {
      window.FB.login((resp) => {
        const code = resp?.authResponse?.code;
        if (!code) { toast.error('Signup was cancelled'); return; }
        completeSignup({ code, waba_id: waSignupRef.current?.waba_id, phone_number_id: waSignupRef.current?.phone_number_id });
      }, { config_id: META_CONFIG_ID, response_type: 'code', override_default_response_type: true, extras: { setup: {} } });
    } else {
      // No Meta app configured yet — mock connect so the flow is usable.
      completeSignup({ waba_id: `mock-waba-${(salonId || '').slice(0, 6)}`, phone_number_id: `mock-phone-${(salonId || '').slice(0, 6)}` });
    }
  }, [META_APP_ID, META_CONFIG_ID, completeSignup, salonId]);

  const addLibraryTemplate = useCallback(async (lib) => {
    try {
      const r = await axios.post(
        `${API}/salons/${salonId}/marketing/settings/library/${lib.id}/adopt`, {}, { headers: authHeaders() });
      toast.success(r.data?.mock
        ? `Added "${lib.friendly_name || lib.name}" to your account (MOCK)`
        : `Added "${lib.friendly_name || lib.name}" — status ${r.data?.status}`);
      fetchAll({ silent: true });
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not add template');
    }
  }, [salonId, authHeaders, fetchAll]);

  const manualConnectWA = useCallback(async (form) => {
    setWaBusy(true);
    try {
      const r = await axios.post(
        `${API}/salons/${salonId}/marketing/settings/waba/manual-connect`, form, { headers: authHeaders() });
      setWaConn(r.data);
      toast.success(r.data?.mock ? 'WhatsApp connected (MOCK — add Meta keys to go live)' : 'WhatsApp connected & verified');
      fetchAll({ silent: true });
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Manual connect failed');
      return false;
    } finally { setWaBusy(false); }
  }, [salonId, authHeaders, fetchAll]);

  const disconnectWA = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm('Disconnect this WhatsApp number?')) return;
    try {
      await axios.delete(`${API}/salons/${salonId}/marketing/settings/waba`, { headers: authHeaders() });
      setWaConn(null);
      toast.success('WhatsApp disconnected');
      fetchAll({ silent: true });
    } catch (e) { toast.error(e?.response?.data?.detail || 'Disconnect failed'); }
  }, [salonId, authHeaders, fetchAll]);

  // Silent auto-refresh — every 60s. Never toggles the loading skeleton
  // (prevents the page-jump the user reported).
  useEffect(() => {
    if (!salonId) return undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchAll({ silent: true });
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [salonId, fetchAll]);

  // Derive KPIs
  const kpi = useMemo(() => {
    const msg = overview?.messaging || {};
    const conv = overview?.conversion || {};
    const sent = msg.sent || 0;
    const delivered = msg.delivered || 0;
    const read = msg.read || 0;
    const spend = msg.spend_inr || 0;
    const redeems = conv.coupon_redemptions || 0;
    const revenue = conv.coupon_discount_amount || 0;
    const delvPct = sent ? Math.round((delivered / sent) * 100) : 0;
    const clickPct = sent ? Math.round((read / sent) * 100) : 0;
    const ros = spend > 0 ? (revenue / spend).toFixed(1) + '×' : (revenue > 0 ? '∞' : '0×');
    return { sent, delivered, delvPct, read, clickPct, redeems, revenue, ros };
  }, [overview]);

  // Channel mix — prefer real per-channel sent counts from the overview endpoint;
  // fall back to campaign-derived counts, then to a sensible default when there's
  // no data yet so the bar never renders empty.
  const channelMix = useMemo(() => {
    const acc = { whatsapp: 0, sms: 0, email: 0 };
    const cm = overview?.channel_mix;
    if (cm && (Number(cm.whatsapp) + Number(cm.sms) + Number(cm.email)) > 0) {
      acc.whatsapp = Number(cm.whatsapp) || 0;
      acc.sms = Number(cm.sms) || 0;
      acc.email = Number(cm.email) || 0;
    } else {
      (campaigns || []).forEach(c => {
        const prov = String(c.provider || 'whatsapp').toLowerCase();
        const key = prov.includes('email') ? 'email' : prov.includes('sms') ? 'sms' : 'whatsapp';
        const sent = (c.stats?.sent) || 0;
        acc[key] += sent;
      });
    }
    const total = acc.whatsapp + acc.sms + acc.email;
    return {
      whatsapp: total ? Math.round(acc.whatsapp / total * 100) : 56,
      sms:      total ? Math.round(acc.sms / total * 100) : 29,
      email:    total ? Math.round(acc.email / total * 100) : 15,
    };
  }, [campaigns, overview]);

  const activeCampaigns = useMemo(
    () => (campaigns || []).filter(c => ['running','scheduled','live'].includes(String(c.status || '').toLowerCase())).slice(0, 3),
    [campaigns]
  );

  // Compute segment live counts (fallback: use rules preview if provided, else raw customer count)
  const [segCounts, setSegCounts] = useState({});
  useEffect(() => {
    (async () => {
      if (!salonId || !segments?.length) return;
      const map = {};
      for (const s of segments) {
        try {
          const res = await axios.post(
            `${API}/salons/${salonId}/marketing/segments/preview`,
            { name: s.name, description: s.description || '', rules: s.rules || { logic: 'AND', conditions: [] } },
            { headers: authHeaders() }
          );
          map[s.id] = res.data?.count || 0;
        } catch { map[s.id] = 0; }
      }
      setSegCounts(map);
    })();
  }, [salonId, segments, authHeaders]);

  return (
    <div>
      {/* HEADER */}
      <div className="phead">
        <div>
          <h2><span className="hic"><Ico.send /></span>Marketing</h2>
        </div>
        <button className="btn-primary" onClick={() => setCampaignDrawer(true)}>
          <Ico.plus /> New campaign
        </button>
      </div>

      {/* SUB-TABS */}
      <div className="subtabs">
        {[
          { id: 'overview', label: 'Overview', ic: Ico.chart },
          { id: 'calendar', label: 'Calendar', ic: Ico.cal },
          { id: 'studio', label: 'Studio', ic: Ico.brush },
          { id: 'campaigns', label: 'Campaigns', ic: Ico.send },
          { id: 'templates', label: 'Templates', ic: Ico.chat },
          { id: 'offers', label: 'Offers & Perks', ic: Ico.tag },
          { id: 'reputation', label: 'Reputation', ic: Ico.star },
          { id: 'media', label: 'Media', ic: Ico.images },
          { id: 'settings', label: 'Settings', ic: Ico.gear },
        ].map((t) => (
          <button key={t.id} className={`subtab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <t.ic /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="placeholder"><div className="pi"><Ico.clock /></div><b>Loading marketing data…</b></div>}

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <div>
          {/* KPI ROW */}
          <div className="mk-kpis">
            <KpiTile chip="wa" icon={<Ico.chat />} val={kpi.sent.toLocaleString('en-IN')} label="Messages sent" />
            <KpiTile chip="green" icon={<Ico.check />} val={`${kpi.delvPct}%`} label="Delivered" sub={<span style={{color:'var(--green)'}}>{kpi.delivered.toLocaleString('en-IN')}</span>} />
            <KpiTile chip="sky" icon={<Ico.external />} val={`${kpi.clickPct}%`} label="Click rate" sub={<span style={{color:'var(--sky)'}}>{kpi.read.toLocaleString('en-IN')}</span>} />
            <KpiTile chip="amber" icon={<Ico.tag />} val={kpi.redeems.toLocaleString('en-IN')} label="Redemptions" />
            <KpiTile chip="violet" icon={<Ico.rupee />} val={rupee(kpi.revenue)} label="Attributed rev" />
            <KpiTile chip="rose" icon={<Ico.trending />} val={kpi.ros} label="Return on spend" />
          </div>

          {/* Active campaigns + Channel mix */}
          <div className="v2-grid2">
            <div className="card">
              <div className="card__h">
                <div className="t"><Ico.send /> Active campaigns</div>
                <a onClick={() => setTab('campaigns')} style={{cursor:'pointer'}}>See all ›</a>
              </div>
              <div className="clist">
                {activeCampaigns.length === 0 && (
                  <div className="placeholder" style={{padding:20}}>
                    <b>No active campaigns yet</b>
                    <p>Create one to reach the right guests in a few taps.</p>
                  </div>
                )}
                {activeCampaigns.map(c => <CampaignRow key={c.id} c={c} />)}
              </div>
            </div>
            <div className="card">
              <div className="card__h"><div className="t"><Ico.wifi /> Channel mix</div></div>
              <div className="chan">
                <div className="cl"><span>By messages delivered</span><span>India · WhatsApp-first</span></div>
                <div className="chan-bar">
                  <i style={{width:`${channelMix.whatsapp}%`,background:'var(--wa)'}}/>
                  <i style={{width:`${channelMix.sms}%`,background:'var(--sky)'}}/>
                  <i style={{width:`${channelMix.email}%`,background:'var(--amber)'}}/>
                </div>
                <div className="chan-leg">
                  <div className="r"><i style={{background:'var(--wa)'}}/><span className="nm">WhatsApp</span><span className="v">{channelMix.whatsapp}%</span></div>
                  <div className="r"><i style={{background:'var(--sky)'}}/><span className="nm">SMS (DLT)</span><span className="v">{channelMix.sms}%</span></div>
                  <div className="r"><i style={{background:'var(--amber)'}}/><span className="nm">Email</span><span className="v">{channelMix.email}%</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Audience segments */}
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.users /> Audience segments</div>
              <button className="btn-ghost" data-testid="segment-new-btn" onClick={() => { setEditingSegment(null); setSegmentDrawer(true); }}><Ico.plus /> New segment</button>
            </div>
            <div className="seg-grid">
              {segments.slice(0, 8).map((s, idx) => {
                const dots = ['var(--rose)','var(--amber)','var(--violet)','var(--teal)','var(--sky)','var(--green)'];
                return (
                  <div className="seg-card" key={s.id} data-testid={`segment-card-${s.id}`}>
                    <div className="st" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      <span style={{display:'flex', alignItems:'center', gap:6}}><span className="d" style={{background: dots[idx % dots.length]}}/>{s.name}</span>
                      <span style={{display:'flex', gap:4}}>
                        <button className="btn-ghost" title="Edit segment" style={{padding:'2px 6px'}} onClick={() => { setEditingSegment(s); setSegmentDrawer(true); }}><Ico.pencil /></button>
                        <button className="btn-ghost" title="Delete segment" style={{padding:'2px 6px', color:'var(--rose,#e11d48)'}}
                          onClick={async () => {
                            if (!window.confirm(`Delete segment "${s.name}"?`)) return;
                            try { await axios.delete(`${API}/salons/${salonId}/marketing/segments/${s.id}`, { headers: authHeaders() }); toast.success('Segment deleted'); fetchAll({ silent: true }); }
                            catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                          }}><Ico.trash /></button>
                      </span>
                    </div>
                    <div className="sc">{segCounts[s.id] ?? '…'} <small>guests</small></div>
                    <button className="seg-send" onClick={() => { setCampaignDrawer({ preselectSegmentId: s.id }); }}>
                      <Ico.send /> Send offer
                    </button>
                  </div>
                );
              })}
              {segments.length === 0 && (
                <div className="placeholder" style={{gridColumn:'1 / -1'}}>
                  <div className="pi"><Ico.users /></div>
                  <b>No segments defined yet</b>
                  <p>Create segments like "Birthday this month", "Lapsed 60+ days", "High spenders ₹5k+".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== CAMPAIGNS ===== */}
      {tab === 'campaigns' && (
        <div>
          <div className="subtabs" style={{ marginTop: -4, marginBottom: 14 }}>
            <button className={`subtab ${campaignMode === 'oneoff' ? 'on' : ''}`} onClick={() => setCampaignMode('oneoff')}><Ico.send /> One-off</button>
            <button className={`subtab ${campaignMode === 'automated' ? 'on' : ''}`} onClick={() => setCampaignMode('automated')}><Ico.bolt /> Automated</button>
          </div>
          {campaignMode === 'oneoff' && (
        <div className="card">
          <div className="card__h">
            <div className="t"><Ico.send /> All campaigns</div>
            <button className="btn-ghost" onClick={() => { setEditingCampaign(null); setCampaignDrawer(true); }}><Ico.plus />New</button>
          </div>
          <div className="clist">
            {campaigns.length === 0 && <div className="placeholder"><b>No campaigns yet</b><p>Click "New" to create your first WhatsApp/SMS/Email campaign.</p></div>}
            {campaigns.map(c => {
              const st = String(c.status || 'draft').toLowerCase();
              const act = async (verb) => {
                try { await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${c.id}/${verb}`, {}, { headers: authHeaders() }); toast.success(`Campaign ${verb}${verb.endsWith('e') ? 'd' : 'ed'}`); fetchAll({ silent: true }); }
                catch (e) { toast.error(e.response?.data?.detail || `${verb} failed`); }
              };
              return (
                <CampaignRow
                  key={c.id}
                  c={c}
                  onLaunch={st === 'draft' || st === 'scheduled' ? () => act('launch') : null}
                  onPause={st === 'running' || st === 'live' ? () => act('pause') : null}
                  onResume={st === 'paused' ? () => act('resume') : null}
                  onStop={['running', 'live', 'paused', 'scheduled'].includes(st) ? () => act('stop') : null}
                  onEdit={(st === 'draft' || st === 'scheduled') ? () => { setEditingCampaign(c); setCampaignDrawer(true); } : null}
                  onDelete={async () => {
                    if (!window.confirm(`Delete campaign "${c.name}"?`)) return;
                    try { await axios.delete(`${API}/salons/${salonId}/marketing/campaigns/${c.id}`, { headers: authHeaders() }); toast.success('Campaign deleted'); fetchAll({ silent: true }); }
                    catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                  }}
                />
              );
            })}
          </div>
        </div>
          )}

          {/* ===== AUTOMATIONS (inside Campaigns tab) ===== */}
          {campaignMode === 'automated' && (
        <div className="card">
          <div className="card__h">
            <div className="t"><Ico.bolt /> Always-on automations</div>
            <button className="btn-ghost" data-testid="automation-new-btn" onClick={() => { setEditingAutomation(null); setAutomationDrawer(true); }}><Ico.plus />New automation</button>
          </div>
          <div>
            {automations.length === 0 && <div className="placeholder"><b>No automations yet</b><p>Create trigger-based flows: birthday wishes, anniversary offers, win-backs and reminders.</p></div>}
            {automations.map((a) => {
              const label = AUTOMATION_LABELS[a.type] || { title: a.type || 'Automation', desc: '', ic: Ico.bolt };
              const extra = a.type === 'win_back' ? ` · after ${a.threshold_days || 0} inactive days`
                : a.type === 'reminder' ? ` · offset ${a.offset_days || 0} day(s)`
                : a.type === 'membership_expiring' ? ` · ${a.offset_days || 7} day(s) before expiry` : '';
              return (
                <div className="auto-row" key={a.id} data-testid={`automation-row-${a.id}`}>
                  <div className="ai" style={{background:'var(--sky-bg)', color:'var(--sky)'}}><label.ic /></div>
                  <div className="an" style={{flex:1, minWidth:0}}>
                    <b>{label.title}</b>
                    <span style={{display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {(a.template_body || label.desc || 'WhatsApp message')}{extra}
                    </span>
                  </div>
                  <button className="btn-ghost" title="Run now" style={{padding:'5px 9px', fontSize:11}} data-testid={`automation-run-${a.id}`}
                    onClick={async () => {
                      try { const r = await axios.post(`${API}/salons/${salonId}/marketing/automations/${a.id}/run-now`, {}, { headers: authHeaders() }); toast.success(`Ran now · ${r.data?.sent ?? 0} sent`); }
                      catch (e) { toast.error(e.response?.data?.detail || 'Run failed'); }
                    }}><Ico.send /> Run now</button>
                  <button className="btn-ghost" title="Edit" style={{padding:'5px 9px', fontSize:11}} data-testid={`automation-edit-${a.id}`}
                    onClick={() => { setEditingAutomation(a); setAutomationDrawer(true); }}><Ico.pencil /></button>
                  <button className="btn-ghost" title="Delete" style={{padding:'5px 9px', fontSize:11, color:'var(--rose,#e11d48)'}}
                    onClick={async () => {
                      if (!window.confirm('Delete this automation?')) return;
                      try { await axios.delete(`${API}/salons/${salonId}/marketing/automations/${a.id}`, { headers: authHeaders() }); toast.success('Automation deleted'); fetchAll({ silent: true }); }
                      catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                    }}><Ico.trash /></button>
                  <button
                    className={`toggle ${a.active ? 'on' : ''}`}
                    data-testid={`automation-toggle-${a.id}`}
                    onClick={async () => {
                      try {
                        await axios.put(`${API}/salons/${salonId}/marketing/automations/${a.id}`,
                          { type: a.type, active: !a.active, template_body: a.template_body || '', coupon_id: a.coupon_id || null, threshold_days: a.threshold_days ?? null, offset_days: a.offset_days ?? null, provider: a.provider || null },
                          { headers: authHeaders() });
                        toast.success(`Automation ${!a.active ? 'enabled' : 'paused'}`);
                        fetchAll({ silent: true });
                      } catch (e) { toast.error(e.response?.data?.detail || 'Update failed'); }
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
          )}
        </div>
      )}

      {/* ===== TEMPLATES ===== */}
      {tab === 'templates' && (
        <div>
          <div className="card" style={{ marginBottom: 16, background: 'var(--wa-bg,#e7f6ed)', borderColor: '#CDEBD9' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              <b>WhatsApp is sent via Meta.</b> Connect your number in <b>Marketing → Settings</b>. Here you build message templates and pick which one fires per event.
            </div>
          </div>
          <div className="card__h" style={{marginBottom:16}}>
            <div className="t"><Ico.chat />Message templates</div>
            <button className="btn-primary" onClick={() => setTemplateDrawer(true)}><Ico.plus />New template</button>
          </div>
          <div className="v2-grid2b">
            {templates.length === 0 && (
              <div className="placeholder" style={{gridColumn:'1 / -1'}}>
                <div className="pi"><Ico.chat/></div>
                <b>No templates yet</b>
                <p>Create WhatsApp templates and submit them to Twilio / Meta for approval.</p>
              </div>
            )}
            {templates.map(t => {
              const st = String(t.meta_status || t.status || t.approval_status || 'draft').toLowerCase();
              const stCls = st.includes('appr') ? 'approved' : st.includes('pend') ? 'pending' : st.includes('reject') ? 'rejected' : '';
              const canEdit = stCls === '' || stCls === 'rejected';
              const handleDelete = async () => {
                if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
                try {
                  await axios.delete(`${API}/salons/${salonId}/marketing/templates/${t.id}`, { headers: authHeaders() });
                  toast.success('Template deleted');
                  fetchAll({ silent: true });
                } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
              };
              return (
                <div className="tmpl" key={t.id}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8}}>
                    <span className="wa-badge">{(t.channel || 'WhatsApp').toString().toUpperCase()}</span>
                    <div style={{display:'flex', gap:6}}>
                      {canEdit && (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{padding:'5px 9px', fontSize:11}}
                          onClick={() => { setEditingTemplate(t); setTemplateDrawer(true); }}
                          title="Edit template"
                        ><Ico.pencil /> Edit</button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{padding:'5px 9px', fontSize:11, color:'#E45C86', borderColor:'#FCEAF1'}}
                        onClick={handleDelete}
                        title="Delete template"
                      ><Ico.trash /> Delete</button>
                    </div>
                  </div>
                  <b>{t.name}</b>
                  <div className="bubble">{t.body}</div>
                  <div className={`status ${stCls}`}>
                    {stCls === 'approved' ? <Ico.check /> : <Ico.clock />}
                    {stCls === 'approved' ? 'Approved' : stCls === 'pending' ? 'Pending approval' : stCls === 'rejected' ? 'Rejected' : 'Draft'} · {(t.category || 'UTILITY').toString().toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== Part 2D — Event templates (which approved template fires per event) ===== */}
          <EventTemplatesPanel salonId={salonId} authHeaders={authHeaders} />

          {/* ===== Part 2B — Template library (collapsible, under Templates) ===== */}
          <div className="card" style={{ marginTop: 18 }} data-testid="template-library-section">
            <div className="card__h" style={{ cursor: 'pointer' }} onClick={() => setLibraryOpen(o => !o)}>
              <div className="t"><Ico.images /> Template library</div>
              <button className="btn-ghost" data-testid="library-toggle-btn">{libraryOpen ? 'Hide' : 'Browse library'} ›</button>
            </div>
            {libraryOpen && (
              <div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 14px', lineHeight: 1.6 }}>
                  Ready-made templates maintained by the platform. Preview one, then <b>Add to my account</b> to create it on your
                  WhatsApp number and submit for approval — no form to fill. (Connect WhatsApp first.)
                </p>
                {library.length === 0 && (
                  <div className="placeholder"><div className="pi"><Ico.images /></div><b>No library templates yet</b><p>The platform owner has not published any shared templates.</p></div>
                )}
                {['invoice', 'booking', 'queue_followup', 'reminder', 'marketing'].map((grp) => {
                  const items = (library || []).filter((l) => (l.group || 'marketing') === grp);
                  if (!items.length) return null;
                  const GRP_LABEL = { invoice: 'Invoice', booking: 'Booking confirmation', queue_followup: 'Queue follow-up', reminder: 'Reminder', marketing: 'Marketing' };
                  return (
                    <div key={grp} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted,#6b6489)', marginBottom: 8 }}>{GRP_LABEL[grp] || grp}</div>
                      <div className="v2-grid2b">
                        {items.map((lib) => (
                          <div className="tmpl" key={lib.id} data-testid={`library-card-${lib.name}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                              <span className="wa-badge">{(lib.category || 'UTILITY').toString().toUpperCase()}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" className="btn-ghost" style={{ padding: '5px 9px', fontSize: 11 }} onClick={() => setPreviewLib(lib)} data-testid={`library-preview-${lib.name}`}><Ico.chat /> Preview</button>
                                <button type="button" className="btn-primary" style={{ padding: '5px 10px', fontSize: 11 }} onClick={() => addLibraryTemplate(lib)} data-testid={`library-use-${lib.name}`} title="Add this template to your WhatsApp account"><Ico.plus /> Add to my account</button>
                              </div>
                            </div>
                            <b>{lib.friendly_name || lib.name}</b>
                            <div className="bubble">
                              {((lib.meta_payload?.components || []).find((c) => (c.type || '').toUpperCase() === 'BODY')?.text) || lib.description || ''}
                            </div>
                            <div className="status"><Ico.clock /> {(lib.lang_code || 'en_US')} · {lib.description || 'Standard template'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card" style={{marginTop:18, background:'var(--wa-bg)', borderColor:'#CDEBD9'}}>
            <div className="t" style={{fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8, fontFamily:"'Plus Jakarta Sans','Inter',sans-serif"}}>
              <span style={{color:'var(--wa)'}}><Ico.info /></span> Twilio approval tip
            </div>
            <p style={{fontSize:12.5, color:'var(--ink-soft)', lineHeight:1.6}}>
              Every variable <b>must</b> ship with an example value or the template is rejected.
              e.g. body <code>Hi {`{{1}}`}, book at {`{{2}}`}: {`{{3}}`}</code> → samples <code>{`{{1}}`}=Priya · {`{{2}}`}=The Looks · {`{{3}}`}=https://book.thelooks.in/s/aB12</code>.
              Fill these in Twilio Content Template Builder → "Sample content".
            </p>
          </div>
        </div>
      )}

      {/* ===== OFFERS & PERKS ===== */}
      {tab === 'offers' && (
        <div className="v2-grid2b">
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.tag /> Coupons</div>
              <button className="btn-ghost" data-testid="coupon-new-btn" onClick={() => { setEditingCoupon(null); setCouponDrawer(true); }}><Ico.plus />New</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:12}}>
              {coupons.length === 0 && <div className="placeholder"><b>No coupons yet</b><p>Create discount codes for campaigns and walk-ins.</p></div>}
              {coupons.map(c => (
                <div className="coupon" key={c.id}>
                  <div className="cv">
                    <b>{c.type === 'percent' ? `${c.value}%` : rupee(c.value)}</b>
                    <span>OFF</span>
                  </div>
                  <div className="cd">
                    <b>{c.title}</b>
                    <span>{c.description || `Min ${rupee(c.min_bill_amount || 0)}${c.max_discount_amount ? ` · up to ${rupee(c.max_discount_amount)}` : ''} · ${c.valid_to ? `exp ${new Date(c.valid_to).toLocaleDateString('en-IN', {day:'numeric', month:'short'})}` : 'no expiry'}`}</span>
                    <br/>
                    <span className="code">{c.code}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--muted, #6b6489)', cursor: 'pointer' }}
                      data-testid={`coupon-show-on-invoice-${c.id}`}>
                      <input type="checkbox" checked={!!c.show_on_invoice}
                        onChange={async () => {
                          const next = !c.show_on_invoice;
                          setCoupons(arr => arr.map(x => x.id === c.id ? { ...x, show_on_invoice: next } : x));
                          try {
                            await axios.put(`${API}/salons/${salonId}/coupons/${c.id}`, { ...c, show_on_invoice: next }, { headers: authHeaders() });
                          } catch (_) {
                            setCoupons(arr => arr.map(x => x.id === c.id ? { ...x, show_on_invoice: !next } : x));
                            toast.error('Could not update');
                          }
                        }} />
                      Show on invoice
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start' }}>
                    <button className="btn-ghost" data-testid={`coupon-publish-${c.id}`}
                      title={c.visibility === 'published' ? 'Unpublish (make private)' : 'Publish (make live)'}
                      style={{ padding: '4px 8px', fontSize: 10.5, fontWeight: 800, color: c.visibility === 'published' ? 'var(--green,#16a34a)' : 'var(--muted,#6b6489)' }}
                      onClick={async () => {
                        const verb = c.visibility === 'published' ? 'unpublish' : 'publish';
                        try {
                          await axios.post(`${API}/salons/${salonId}/coupons/${c.id}/${verb}`, {}, { headers: authHeaders() });
                          toast.success(verb === 'publish' ? 'Published' : 'Unpublished');
                          fetchAll({ silent: true });
                        } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
                      }}>{c.visibility === 'published' ? 'LIVE' : 'DRAFT'}</button>
                    <button className="btn-ghost" data-testid={`coupon-edit-${c.id}`} title="Edit coupon"
                      style={{ padding: '4px 8px' }}
                      onClick={() => { setEditingCoupon(c); setCouponDrawer(true); }}><Ico.pencil /></button>
                    <button className="btn-ghost" data-testid={`coupon-delete-${c.id}`} title="Delete coupon"
                      style={{ padding: '4px 8px', color: 'var(--rose,#e11d48)' }}
                      onClick={async () => {
                        if (!window.confirm(`Delete coupon ${c.code}?`)) return;
                        try { await axios.delete(`${API}/salons/${salonId}/coupons/${c.id}`, { headers: authHeaders() }); toast.success('Coupon deleted'); fetchAll({ silent: true }); }
                        catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                      }}><Ico.trash /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card__h">
              <div className="t"><Ico.star /> Membership plans</div>
              <button className="btn-ghost" data-testid="membership-new-btn" onClick={() => { setEditingPlan(null); setMembershipDrawer(true); }}><Ico.plus />New</button>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:10}} data-testid="membership-plans-list">
              {plans.length === 0 && <div className="placeholder"><b>No plans yet</b><p>Create wallet-credit or discount memberships for your guests.</p></div>}
              {plans.map(p => {
                const col = p.color || '#a855f7';
                const isDiscount = p.plan_type === 'discount';
                return (
                  <div key={p.id} data-testid={`membership-plan-${p.id}`}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:12, border:`1px solid ${col}44`, background:`linear-gradient(160deg, ${col}12, ${col}04)` }}>
                    <span style={{ display:'inline-flex', alignItems:'center', borderRadius:999, fontWeight:800, textTransform:'uppercase', letterSpacing:'.05em', padding:'3px 9px', fontSize:10, color:col, border:`1px solid ${col}`, background:col+'1A' }}>{p.tier || 'Plan'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14 }}>{p.name}</div>
                      <div style={{ fontSize:12, color:'var(--muted,#6b6489)' }}>
                        {isDiscount
                          ? `Discount · ${p.discount_percent || 0}% off every booking · ₹${p.amount}`
                          : `Credit · ₹${p.amount} → ₹${p.credit} wallet`} · {p.validity_months} mo
                      </div>
                    </div>
                    <button className="btn-ghost" data-testid={`membership-edit-${p.id}`} title="Edit plan" style={{ padding:'4px 8px' }}
                      onClick={() => { setEditingPlan(p); setMembershipDrawer(true); }}><Ico.pencil /></button>
                    <button className="btn-ghost" data-testid={`membership-delete-${p.id}`} title="Delete plan" style={{ padding:'4px 8px', color:'var(--rose,#e11d48)' }}
                      onClick={async () => {
                        if (!window.confirm(`Delete plan ${p.name}?`)) return;
                        try { await axios.delete(`${API}/salons/${salonId}/membership-plans/${p.id}`, { headers: authHeaders() }); toast.success('Plan deleted'); fetchAll({ silent: true }); }
                        catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
                      }}><Ico.trash /></button>
                  </div>
                );
              })}
              <div style={{ borderTop:'1px solid var(--line,#eeecf7)', marginTop:4, paddingTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                <StatLine k="Active members" v={`${overview?.memberships_active ?? 0} guests`} />
                <StatLine k="Wallet balance (UPI top-ups)" v={rupee(overview?.wallet_total ?? 0)} />
              </div>
            </div>
          </div>
          <LoyaltyProgramCard salonId={salonId} authHeaders={authHeaders} />
        </div>
      )}

      {/* ===== REPUTATION (SalonHub live reviews + Google/JustDial preview) ===== */}
      {tab === 'reputation' && (
        <SalonHubReviewsPanel salonId={salonId} authHeaders={authHeaders} />
      )}

      <style>{STUDIO_CSS}</style>
      {/* ===== CALENDAR ===== */}
      {tab === 'calendar' && (
        <CalendarPanel salon={salon} salonId={salonId} authHeaders={authHeaders}
          onMakePoster={(pf) => { setPosterPrefill({ ...pf, _k: Date.now() }); setTab('studio'); }}
          onCreateCampaign={(pf) => openCampaign(pf)} />
      )}

      {/* ===== STUDIO (posters + 1-tap share) ===== */}
      {tab === 'studio' && (
        <PosterStudio salon={salon} salonId={salonId} authHeaders={authHeaders} coupons={coupons} plans={plans}
          prefill={posterPrefill} onSendCampaign={(pf) => openCampaign(pf)} />
      )}

      {/* ===== MEDIA (renamed from Gallery) ===== */}
      {tab === 'media' && (
        <div style={{display:'flex', flexDirection:'column', gap:18}}>
          <InstagramCard salonId={salonId} authHeaders={authHeaders} />
          <MediaPanel salon={salon} salonId={salonId} authHeaders={authHeaders} />
        </div>
      )}

      {/* ===== SETTINGS ===== */}
      {tab === 'settings' && (
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <MarketingGuardrailsCard salonId={salonId} authHeaders={authHeaders} />
          <MarketingSettingsPanel salonId={salonId} authHeaders={authHeaders} />
        </div>
      )}

      {/* -------- DRAWERS -------- */}
      <NewCampaignDrawer
        open={!!campaignDrawer}
        preselectSegmentId={typeof campaignDrawer === 'object' ? campaignDrawer.preselectSegmentId : undefined}
        onClose={() => { setCampaignDrawer(false); setEditingCampaign(null); setCampaignPrefill(null); }}
        segments={segments}
        segCounts={segCounts}
        templates={templates}
        coupons={coupons}
        salonId={salonId}
        salon={salon}
        authHeaders={authHeaders}
        initial={editingCampaign}
        prefill={campaignPrefill}
        onTemplatesChanged={() => fetchAll({ silent: true })}
        onSaved={() => { setCampaignDrawer(false); setEditingCampaign(null); setCampaignPrefill(null); fetchAll(); }}
      />
      <NewAutomationDrawer
        open={automationDrawer}
        onClose={() => { setAutomationDrawer(false); setEditingAutomation(null); }}
        templates={templates}
        coupons={coupons}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingAutomation}
        onSaved={() => { setAutomationDrawer(false); setEditingAutomation(null); fetchAll(); }}
      />
      <NewSegmentDrawer
        open={segmentDrawer}
        onClose={() => { setSegmentDrawer(false); setEditingSegment(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingSegment}
        onSaved={() => { setSegmentDrawer(false); setEditingSegment(null); fetchAll(); }}
      />
      <NewTemplateDrawer
        open={templateDrawer}
        onClose={() => { setTemplateDrawer(false); setEditingTemplate(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingTemplate}
        onSaved={() => { setTemplateDrawer(false); setEditingTemplate(null); fetchAll(); }}
      />
      <NewCouponDrawer
        open={couponDrawer}
        onClose={() => { setCouponDrawer(false); setEditingCoupon(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingCoupon}
        onSaved={() => { setCouponDrawer(false); setEditingCoupon(null); fetchAll(); }}
      />
      <NewMembershipDrawer
        open={membershipDrawer}
        onClose={() => { setMembershipDrawer(false); setEditingPlan(null); }}
        salonId={salonId}
        authHeaders={authHeaders}
        initial={editingPlan}
        onSaved={() => { setMembershipDrawer(false); setEditingPlan(null); fetchAll(); }}
      />
      {previewLib && <LibraryPreviewModal lib={previewLib} onClose={() => setPreviewLib(null)} onAdd={() => { addLibraryTemplate(previewLib); setPreviewLib(null); }} />}
    </div>
  );
}

// -------------------- Part 2B: Library template preview modal --------------------
function LibraryPreviewModal({ lib, onClose, onAdd }) {
  const comps = lib?.meta_payload?.components || [];
  const header = comps.find(c => (c.type || '').toUpperCase() === 'HEADER');
  const body = comps.find(c => (c.type || '').toUpperCase() === 'BODY');
  const footer = comps.find(c => (c.type || '').toUpperCase() === 'FOOTER');
  const buttons = (comps.find(c => (c.type || '').toUpperCase() === 'BUTTONS')?.buttons) || [];
  // Fill body {{n}} with the sample example values so it previews like WhatsApp.
  const examples = (body?.example?.body_text || [])[0] || [];
  let bodyText = body?.text || '';
  examples.forEach((v, i) => { bodyText = bodyText.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), v); });
  const headerFmt = (header?.format || 'TEXT').toUpperCase();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,40,.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} data-testid="library-preview-modal">
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(440px, 96vw)', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line,#eeecf7)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>{lib.friendly_name || lib.name}</b>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>
          {/* WhatsApp-style bubble */}
          <div style={{ background: 'var(--wa-bg,#e7f6ed)', border: '1px solid #CDEBD9', borderRadius: 12, padding: 12 }}>
            {header && headerFmt !== 'TEXT' && (
              <div style={{ background: '#fff', border: '1px dashed #c9cdd6', borderRadius: 8, padding: '18px 12px', textAlign: 'center', fontSize: 12, color: 'var(--muted,#6b6489)', marginBottom: 8 }}>
                📎 {headerFmt} attachment (sample)
              </div>
            )}
            {header && headerFmt === 'TEXT' && <div style={{ fontWeight: 800, marginBottom: 6 }}>{header.text}</div>}
            <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bodyText}</div>
            {footer && <div style={{ fontSize: 11, color: 'var(--muted,#6b6489)', marginTop: 8 }}>{footer.text}</div>}
          </div>
          {buttons.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {buttons.map((b, i) => (
                <div key={i} style={{ textAlign: 'center', color: 'var(--sky,#2f7bd8)', fontWeight: 700, fontSize: 13, border: '1px solid var(--line,#eeecf7)', borderRadius: 8, padding: '9px' }}>
                  {b.type === 'URL' ? '🔗 ' : b.type === 'PHONE_NUMBER' ? '📞 ' : '💬 '}{b.text}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 12 }}>
            {(lib.lang_code || 'en_US')} · {(lib.category || 'UTILITY').toString().toUpperCase()} · {lib.description || ''}
          </div>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line,#eeecf7)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={onAdd} data-testid="library-preview-add"><Ico.plus /> Add to my account</button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Reusable bits --------------------
function KpiTile({ chip, icon, val, label, sub }) {
  const map = {
    wa:    { bg:'var(--wa-bg)', fg:'var(--wa)' },
    green: { bg:'var(--green-bg)', fg:'var(--green)' },
    sky:   { bg:'var(--sky-bg)', fg:'var(--sky)' },
    amber: { bg:'var(--amber-bg)', fg:'var(--amber)' },
    violet:{ bg:'var(--violet-bg)', fg:'var(--violet)' },
    rose:  { bg:'var(--rose-bg)', fg:'var(--rose)' },
  };
  const s = map[chip] || map.wa;
  return (
    <div className="mk-kpi">
      <div className="chip" style={{background:s.bg, color:s.fg}}>{icon}</div>
      <b>{val}</b>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function CampaignRow({ c, onLaunch, onPause, onResume, onStop, onEdit, onDelete }) {
  const prov = String(c.provider || 'whatsapp').toLowerCase();
  const chKey = prov.includes('email') ? 'email' : prov.includes('sms') ? 'sms' : 'whatsapp';
  const st = CH_STYLE[chKey];
  const status = String(c.status || 'draft').toLowerCase();
  const statusLabel = status === 'running' ? 'Live' : status === 'scheduled' ? 'Scheduled' : status === 'paused' ? 'Paused' : status === 'completed' ? 'Completed' : status === 'stopped' ? 'Stopped' : 'Draft';
  const revenue = ((c.stats?.revenue) || 0);
  const redeemed = (c.stats?.redeemed) || 0;
  return (
    <div className="crow" data-testid={`campaign-row-${c.id}`}>
      <div className="ci" style={{background:st.bg, color:st.fg}}><Ico.chat /></div>
      <div className="cn">
        <b>{c.name}</b>
        <span>{st.label} · {c.segment_name || 'Audience'} · {(c.stats?.sent) || 0} sent</span>
      </div>
      <span className={`cstat ${status}`}>{statusLabel}</span>
      <div className="cmet">
        <b>{rupee(revenue)}</b>
        <span>{redeemed} redeemed</span>
      </div>
      <div style={{display:'flex', gap:6, marginLeft:8, alignItems:'center'}}>
        {onLaunch && <button className="btn-ghost" style={{padding:'5px 9px', fontSize:11}} onClick={onLaunch}>Launch</button>}
        {onPause && <button className="btn-ghost" style={{padding:'5px 9px', fontSize:11}} onClick={onPause}>Pause</button>}
        {onResume && <button className="btn-ghost" style={{padding:'5px 9px', fontSize:11}} onClick={onResume}>Resume</button>}
        {onStop && <button className="btn-ghost" style={{padding:'5px 9px', fontSize:11}} onClick={onStop}>Stop</button>}
        {onEdit && <button className="btn-ghost" title="Edit" style={{padding:'5px 9px', fontSize:11}} onClick={onEdit}><Ico.pencil /></button>}
        {onDelete && <button className="btn-ghost" title="Delete" style={{padding:'5px 9px', fontSize:11, color:'var(--rose,#e11d48)'}} onClick={onDelete}><Ico.trash /></button>}
      </div>
    </div>
  );
}

function StatLine({ k, v }) {
  return (
    <div style={{display:'flex', justifyContent:'space-between', fontSize:13}}>
      <span style={{color:'var(--muted)', fontWeight:600}}>{k}</span>
      <b>{v}</b>
    </div>
  );
}

// -------------------- Media panel --------------------
function MediaPanel({ salon, salonId, authHeaders }) {
  const [localSalon, setLocalSalon] = useState(salon || null);
  useEffect(() => setLocalSalon(salon || null), [salon]);
  const photos = localSalon?.photo_gallery || [];

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    const PHOTO_MAX = 5 * 1024 * 1024;
    const VIDEO_MAX = 25 * 1024 * 1024;
    const additions = [];
    for (const f of files) {
      const isVideo = (f.type || '').startsWith('video/');
      const limit = isVideo ? VIDEO_MAX : PHOTO_MAX;
      if (f.size > limit) { toast.error(`${f.name} too large (max ${isVideo ? '25MB' : '5MB'})`); continue; }
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onloadend = () => resolve(r.result);
        r.readAsDataURL(f);
      });
      additions.push(dataUrl);
    }
    if (!additions.length) return;
    const updated = [...photos, ...additions];
    try {
      await axios.put(`${API}/salons/${salonId}`, { photo_gallery: updated }, { headers: authHeaders() });
      setLocalSalon({ ...(localSalon || {}), photo_gallery: updated });
      toast.success(`${additions.length} file(s) added`);
    } catch { toast.error('Upload failed'); }
  };

  const removeAt = async (idx) => {
    const updated = photos.filter((_, i) => i !== idx);
    try {
      await axios.put(`${API}/salons/${salonId}`, { photo_gallery: updated }, { headers: authHeaders() });
      setLocalSalon({ ...(localSalon || {}), photo_gallery: updated });
      toast.success('Removed');
    } catch { toast.error('Failed'); }
  };

  return (
    <div>
      <div className="card">
        <div className="card__h">
          <div className="t"><Ico.images /> Salon media</div>
          <label className="btn-primary" style={{cursor:'pointer'}}>
            <Ico.plus /> Add photos / videos
            <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => uploadFiles(Array.from(e.target.files || []))}/>
          </label>
        </div>
        <p style={{fontSize:12.5, color:'var(--muted)', marginBottom:14}}>
          Showcase your salon. Photos up to 5MB · videos up to 25MB.
        </p>
        {photos.length === 0 ? (
          <div className="placeholder"><div className="pi"><Ico.images /></div><b>No media yet</b><p>Upload photos or short videos to feature on your storefront.</p></div>
        ) : (
          <div className="media-grid">
            {photos.map((url, i) => {
              const isVideo = typeof url === 'string' && (url.startsWith('data:video') || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url));
              return (
                <div className="media-tile" key={i}>
                  {isVideo ? <video src={url} muted playsInline /> : <img src={url} alt={`Media ${i+1}`} />}
                  <button className="rm" onClick={() => removeAt(i)}><Ico.close /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{marginTop:18}}>
        <div className="card__h">
          <div className="t"><Ico.wifi /> Social media <span style={{marginLeft:6, fontSize:10, fontWeight:800, background:'var(--amber-bg)', color:'var(--amber)', padding:'2px 7px', borderRadius:20}}>COMING SOON</span></div>
        </div>
        <p style={{fontSize:12.5, color:'var(--muted)', marginBottom:6}}>
          Auto-import posts from your salon's YouTube, Facebook and TikTok. (Instagram is connected above.)
        </p>
        <div className="social-grid">
          {[
            {n:'YouTube',   bg:'linear-gradient(135deg,#E53935,#B71C1C)', d:'Channel videos'},
            {n:'Facebook',  bg:'linear-gradient(135deg,#1E88E5,#0D47A1)', d:'Page posts'},
            {n:'TikTok',    bg:'linear-gradient(135deg,#111,#333)',       d:'Short videos'},
          ].map(s => (
            <button key={s.n} className="social-tile" style={{background:s.bg}} onClick={() => toast.info(`${s.n} integration coming soon`)}>
              <b>{s.n}</b><span>{s.d}</span>
              <span className="soon">Soon</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------- Card: Marketing guardrails (MarketingSettingsIn) --------------------
function MarketingGuardrailsCard({ salonId, authHeaders }) {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/marketing/settings`, { headers: authHeaders() });
        setS(res.data || {});
      } catch { setS({}); }
    })();
  }, [salonId, authHeaders]);

  const set = (k, v) => setS((p) => ({ ...(p || {}), [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        monthly_cap_inr: Number(s?.monthly_cap_inr || 0),
        freq_cap_per_customer_per_week: Number(s?.freq_cap_per_customer_per_week || 0),
        quiet_hours_start: s?.quiet_hours_start || '22:00',
        quiet_hours_end: s?.quiet_hours_end || '09:00',
        spend_brake: !!s?.spend_brake,
        consent_required: s?.consent_required !== false,
      };
      await axios.put(`${API}/salons/${salonId}/marketing/settings`, payload, { headers: authHeaders() });
      toast.success('Guardrails saved');
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (!s) return null;

  return (
    <div className="card" data-testid="marketing-guardrails-card">
      <div className="card__h">
        <div className="t"><Ico.gear /> Guardrails &amp; spend controls</div>
        <button className="btn-primary" data-testid="guardrails-save-btn" disabled={saving} onClick={save}><Ico.check /> {saving ? 'Saving…' : 'Save'}</button>
      </div>
      <p style={{fontSize:12.5, color:'var(--muted,#6b6489)', margin:'0 0 12px'}}>
        Protect your guests and your budget: cap monthly spend, limit how often each guest is messaged, and pause everything with the spend brake.
      </p>
      <div className="v2-grid2b">
        <div>
          <div className="v2-field"><label>Monthly spend cap (₹) — 0 = no cap</label>
            <input type="number" min="0" value={s.monthly_cap_inr ?? 0} onChange={(e) => set('monthly_cap_inr', e.target.value)} data-testid="guardrails-monthly-cap" />
          </div>
          <div className="v2-field"><label>Max messages / guest / week</label>
            <input type="number" min="0" value={s.freq_cap_per_customer_per_week ?? 3} onChange={(e) => set('freq_cap_per_customer_per_week', e.target.value)} data-testid="guardrails-freq-cap" />
          </div>
        </div>
        <div>
          <div className="v2-field"><label>Quiet hours (no sends)</label>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <input type="time" value={s.quiet_hours_start || '22:00'} onChange={(e) => set('quiet_hours_start', e.target.value)} data-testid="guardrails-quiet-start" />
              <span style={{color:'var(--muted,#6b6489)'}}>to</span>
              <input type="time" value={s.quiet_hours_end || '09:00'} onChange={(e) => set('quiet_hours_end', e.target.value)} data-testid="guardrails-quiet-end" />
            </div>
          </div>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="guardrails-consent">
        <input type="checkbox" checked={s.consent_required !== false} onChange={(e) => set('consent_required', e.target.checked)} />
        Only send to guests who opted in (consent required)
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="guardrails-spend-brake">
        <input type="checkbox" checked={!!s.spend_brake} onChange={(e) => set('spend_brake', e.target.checked)} />
        <span style={{color: s.spend_brake ? 'var(--rose,#e11d48)' : 'inherit'}}>Spend brake — pause ALL outbound marketing immediately</span>
      </label>
    </div>
  );
}

// -------------------- Drawer: New/Edit Campaign --------------------
function NewCampaignDrawer({ open, onClose, preselectSegmentId, segments, segCounts, templates, coupons, salonId, salon, authHeaders, initial, prefill, onTemplatesChanged, onSaved }) {
  const editing = !!(initial && initial.id);
  const [name, setName] = useState('');
  const [audienceMode, setAudienceMode] = useState('segment');
  const [segId, setSegId] = useState('');
  const [adHocPhones, setAdHocPhones] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [tmplId, setTmplId] = useState('');
  const [body, setBody] = useState('');
  const [couponId, setCouponId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [audience, setAudience] = useState(null); // { count, estimated_spend_inr }
  // PART 7 — media-header template attachment
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [headerMediaId, setHeaderMediaId] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  // Easy photo campaigns: pick a poster/photo; the approved photo template is used automatically.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoSetup, setPhotoSetup] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setName(initial.name || '');
      setSegId(initial.segment_id || '');
      setAudienceMode(initial.segment_id ? 'segment' : (initial.ad_hoc_phones?.length ? 'phones' : 'segment'));
      setAdHocPhones(Array.isArray(initial.ad_hoc_phones) ? initial.ad_hoc_phones.join(', ') : '');
      setChannel(initial.provider && String(initial.provider).includes('email') ? 'email' : initial.provider && String(initial.provider).includes('sms') ? 'sms' : 'whatsapp');
      setTmplId(initial.template_id || '');
      setBody(initial.template_body || '');
      setCouponId(initial.coupon_id || '');
      setScheduleAt(initial.schedule_at ? String(initial.schedule_at).slice(0, 16) : '');
      setHeaderMediaUrl(initial.header_media_url || '');
      setHeaderMediaId(initial.header_media_id || '');
    } else {
      setName(''); setAudienceMode('segment'); setSegId(preselectSegmentId || ''); setAdHocPhones('');
      setChannel('whatsapp'); setTmplId(''); setBody(''); setCouponId(''); setScheduleAt('');
      setHeaderMediaUrl(''); setHeaderMediaId('');
      if (prefill) {
        setName(prefill.name || '');
        setBody(prefill.body || '');
        if (prefill.photoUrl) {
          const ok = templates.find((t) => String(t.header_format || '').toUpperCase() === 'IMAGE' && String(t.approval_status || t.meta_status || '').toLowerCase() === 'approved');
          if (ok) setTmplId(ok.id);
          setHeaderMediaUrl(prefill.photoUrl);
        }
      }
    }
    setAudience(null);
  }, [open, initial, preselectSegmentId, prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const phonesArr = useMemo(() => adHocPhones.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean), [adHocPhones]);

  // PART 7 — the selected template's media-header type (image/video/document), if any.
  const selectedTmpl = useMemo(() => templates.find(x => x.id === tmplId), [templates, tmplId]);
  const mediaHeader = useMemo(() => {
    const f = String(selectedTmpl?.header_format || '').toUpperCase();
    return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(f) ? f.toLowerCase() : '';
  }, [selectedTmpl]);
  const tStatus = (t) => String(t?.approval_status || t?.meta_status || 'draft').toLowerCase();
  const photoTemplates = useMemo(() => templates.filter((t) => String(t.header_format || '').toUpperCase() === 'IMAGE'), [templates]);
  const approvedPhotoTmpl = photoTemplates.find((t) => tStatus(t) === 'approved');
  const pendingPhotoTmpl = photoTemplates.find((t) => ['pending', 'in_review', 'submitted'].includes(tStatus(t)));
  const photoUrl = mediaHeader === 'image' || !tmplId ? headerMediaUrl : '';
  const choosePhoto = (url) => {
    if (approvedPhotoTmpl && tmplId !== approvedPhotoTmpl.id && mediaHeader !== 'image') setTmplId(approvedPhotoTmpl.id);
    setHeaderMediaUrl(url); setHeaderMediaId(''); setPickerOpen(false);
  };
  // While the photo template is waiting for approval, re-check it each time the composer opens.
  useEffect(() => {
    if (!open || !pendingPhotoTmpl) return;
    axios.get(`${API}/salons/${salonId}/marketing/photo-template/status`, { headers: authHeaders() })
      .then((r) => { if (r.data?.approval_status && r.data.approval_status !== tStatus(pendingPhotoTmpl)) onTemplatesChanged?.(); })
      .catch(() => {});
  }, [open, pendingPhotoTmpl?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const removePhoto = () => { setHeaderMediaUrl(''); setHeaderMediaId(''); if (mediaHeader === 'image') setTmplId(''); };
  // One time per salon: create the ready-made photo template and send it to WhatsApp for approval.
  const setupPhotoTemplate = async () => {
    if (!headerMediaUrl) return;
    setPhotoSetup(true);
    try {
      const blob = await (await fetch(headerMediaUrl)).blob();
      const fd = new FormData();
      fd.append('file', new File([blob], 'sample.png', { type: blob.type || 'image/png' }));
      const up = await axios.post(`${API}/salons/${salonId}/media/upload`, fd, { headers: authHeaders() });
      const handle = up.data?.handle || up.data?.media_id || null;
      const t = (await axios.post(`${API}/salons/${salonId}/marketing/photo-template`, { sample_url: headerMediaUrl, sample_handle: handle }, { headers: authHeaders() })).data;
      if (tStatus(t) !== 'approved') {
        const r = await axios.post(`${API}/salons/${salonId}/marketing/photo-template/submit`, {}, { headers: authHeaders() });
        toast.success(`Photo template sent to WhatsApp for approval (${r.data?.approval_status || 'pending'}). This is needed only once.`);
      }
      onTemplatesChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not set up photo sending');
    } finally { setPhotoSetup(false); }
  };

  // Live recipient + cost estimate
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      const payload = audienceMode === 'segment'
        ? { segment_id: segId || null }
        : { ad_hoc_phones: phonesArr };
      if (audienceMode === 'segment' && !segId) { setAudience(null); return; }
      if (audienceMode === 'phones' && phonesArr.length === 0) { setAudience({ count: 0, estimated_spend_inr: 0 }); return; }
      try {
        const res = await axios.post(`${API}/salons/${salonId}/marketing/campaigns/preview-audience`, payload, { headers: authHeaders() });
        setAudience({ count: res.data?.count ?? 0, estimated_spend_inr: res.data?.estimated_spend_inr ?? 0 });
      } catch { setAudience(null); }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, audienceMode, segId, adHocPhones]);

  const applyTemplate = (id) => {
    setTmplId(id);
    const t = templates.find(x => x.id === id);
    const isPhoto = String(t?.header_format || '').toUpperCase() === 'IMAGE';
    if (t && !(isPhoto && body.trim())) setBody(isPhoto ? '' : (t.body || ''));
    // Reset any previously attached media when the template changes (keep the photo for photo templates).
    if (!isPhoto) setHeaderMediaUrl('');
    setHeaderMediaId('');
  };

  const uploadHeaderMedia = async (file) => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(
        `${API}/salons/${salonId}/media/upload`, fd,
        { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      // Prefer a public URL when the server returns one; else use the Meta handle
      // as a media id (works once the number is live).
      const url = res.data?.url || res.data?.link || '';
      const handle = res.data?.handle || res.data?.media_id || '';
      if (url) { setHeaderMediaUrl(url); setHeaderMediaId(''); }
      else if (handle) { setHeaderMediaId(handle); }
      toast.success(res.data?.mock ? 'Media attached (MOCK handle)' : 'Media uploaded');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Media upload failed');
    } finally { setUploadingMedia(false); }
  };

  const submit = async (launchNow) => {
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!body.trim()) { toast.error('Message body required (pick a template or write custom)'); return; }
    if (audienceMode === 'segment' && !segId) { toast.error('Pick an audience segment (or switch to specific phones)'); return; }
    if (audienceMode === 'phones' && phonesArr.length === 0) { toast.error('Add at least one phone number'); return; }
    if (mediaHeader && !headerMediaUrl.trim() && !headerMediaId.trim()) {
      toast.error('This template has a media header — attach an image/file or paste a public URL'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        segment_id: audienceMode === 'segment' ? (segId || null) : null,
        ad_hoc_phones: audienceMode === 'phones' ? phonesArr : null,
        template_id: tmplId || null,
        template_body: body,
        coupon_id: couponId || null,
        provider: channel === 'whatsapp' ? null : channel,
        schedule_at: (!launchNow && scheduleAt) ? new Date(scheduleAt).toISOString() : null,
        header_media_type: mediaHeader || null,
        header_media_url: mediaHeader ? (headerMediaUrl.trim() || null) : null,
        header_media_id: mediaHeader ? (headerMediaId.trim() || null) : null,
      };
      let cid = initial?.id;
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/marketing/campaigns/${cid}`, payload, { headers: authHeaders() });
      } else {
        const res = await axios.post(`${API}/salons/${salonId}/marketing/campaigns`, payload, { headers: authHeaders() });
        cid = res.data.id;
      }
      if (launchNow) {
        await axios.post(`${API}/salons/${salonId}/marketing/campaigns/${cid}/launch`, {}, { headers: authHeaders() });
        toast.success('Campaign queued');
      } else {
        toast.success(editing ? 'Campaign updated' : 'Campaign saved');
      }
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save campaign');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={!!open} onClose={onClose} title={editing ? 'Edit Campaign' : 'New Campaign'} subtitle="Reach the right guests in a few taps" iconFn={Ico.send}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-ghost" disabled={saving} onClick={() => submit(false)}>Save as draft</button>
          <button className="btn-primary" disabled={saving} onClick={() => submit(true)}><Ico.send /> {scheduleAt ? 'Schedule' : 'Send now'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Campaign name</label>
        <input placeholder="e.g. Diwali Glow Offer" value={name} onChange={(e) => setName(e.target.value)} data-testid="campaign-name-input" />
      </div>
      <div className="v2-field"><label>Audience</label>
        <div className="ch-pick">
          <button type="button" className={audienceMode==='segment' ? 'on' : ''} onClick={() => setAudienceMode('segment')}><Ico.users /> Saved segment</button>
          <button type="button" className={audienceMode==='phones' ? 'on' : ''} onClick={() => setAudienceMode('phones')}><Ico.chat /> Specific phones</button>
        </div>
      </div>
      {audienceMode === 'segment' ? (
        <div className="v2-field"><label>Audience segment</label>
          <select value={segId} onChange={(e) => setSegId(e.target.value)} data-testid="campaign-segment-select">
            <option value="">— Select segment —</option>
            {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({segCounts?.[s.id] ?? '—'})</option>)}
          </select>
        </div>
      ) : (
        <div className="v2-field"><label>Phone numbers (comma or space separated)</label>
          <textarea rows={3} placeholder="9876543210, 9812345601" value={adHocPhones} onChange={(e) => setAdHocPhones(e.target.value)} data-testid="campaign-phones-input" />
        </div>
      )}
      {/* Live audience + cost preview */}
      <div style={{display:'flex', alignItems:'center', gap:10, margin:'2px 0 12px', background:'var(--wa-bg)', border:'1px solid #CDEBD9', padding:'10px 12px', borderRadius:10}}>
        <b style={{fontSize:18, color:'var(--wa)'}} data-testid="campaign-recipient-count">{audience ? audience.count.toLocaleString('en-IN') : '—'}</b>
        <span style={{fontSize:12.5, color:'var(--ink-soft,#556)'}}>recipients</span>
        {audience && <span style={{marginLeft:'auto', fontSize:12.5, color:'var(--ink-soft,#556)'}}>est. spend ≈ {rupee(audience.estimated_spend_inr)}</span>}
      </div>
      <div className="v2-field"><label>Channel</label>
        <div className="ch-pick">
          <button type="button" className={channel==='whatsapp' ? 'on' : ''} onClick={() => setChannel('whatsapp')}><Ico.wa /> WhatsApp</button>
          <button type="button" className={channel==='sms' ? 'on' : ''} onClick={() => setChannel('sms')}><Ico.chat /> SMS</button>
          <button type="button" className={channel==='email' ? 'on' : ''} onClick={() => setChannel('email')}><Ico.mail /> Email</button>
        </div>
      </div>
      <div className="v2-field"><label>Template</label>
        <select value={tmplId} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">— Custom message —</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.friendly_name || t.name} ({t.approval_status || t.meta_status || 'draft'})</option>)}
        </select>
      </div>
      {mediaHeader && mediaHeader !== 'image' && (
        <div className="v2-field">
          <label>Header {mediaHeader} (required for this template)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={`Public HTTPS ${mediaHeader} URL`}
              value={headerMediaUrl}
              onChange={(e) => { setHeaderMediaUrl(e.target.value); setHeaderMediaId(''); }}
              data-testid="campaign-header-media-url"
              style={{ flex: 1, minWidth: 200 }}
            />
            <label className="btn-ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {uploadingMedia ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept={mediaHeader === 'image' ? 'image/*' : mediaHeader === 'video' ? 'video/*' : 'application/pdf'}
                style={{ display: 'none' }}
                disabled={uploadingMedia}
                onChange={(e) => uploadHeaderMedia(e.target.files?.[0])}
              />
            </label>
          </div>
          {headerMediaUrl && mediaHeader === 'image' && (
            <img src={headerMediaUrl} alt="header preview" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, border: '1px solid #E4E4EF' }} />
          )}
          {headerMediaId && !headerMediaUrl && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6C4FE0' }}>Attached media id: {headerMediaId}</div>
          )}
          <p style={{ marginTop: 6, fontSize: 11.5, color: '#8A8F9E' }}>
            The image must be a public HTTPS link (or an uploaded media handle). It is sent in the template header.
          </p>
        </div>
      )}
      {channel === 'whatsapp' && !(mediaHeader && mediaHeader !== 'image') && (
        <div className="v2-field" data-testid="campaign-photo">
          <label>Photo (optional)</label>
          {photoUrl ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <img src={photoUrl} alt="campaign" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid #E4E4EF' }} data-testid="campaign-photo-preview" />
              <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.5 }}>
                {mediaHeader === 'image' ? (
                  <div style={{ color: '#137A3C', fontWeight: 700 }}>✓ Guests get this photo with your message.</div>
                ) : pendingPhotoTmpl ? (
                  <div style={{ color: '#9A5B00' }}>Photo sending is waiting for WhatsApp approval (usually minutes to a few hours). Save or schedule now — until it is approved the message goes without the photo.</div>
                ) : (
                  <>
                    <div style={{ color: '#5C5480' }}>WhatsApp needs a one-time approved <b>photo template</b> before you can send photos to guests.</div>
                    <button type="button" className="btn-primary" style={{ marginTop: 8 }} onClick={setupPhotoTemplate} disabled={photoSetup} data-testid="campaign-photo-setup">
                      {photoSetup ? 'Setting up…' : 'Set up photo sending (one time)'}
                    </button>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn-ghost" onClick={() => setPickerOpen(true)}>Change</button>
                  <button type="button" className="btn-ghost" onClick={removePhoto}>Remove</button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setPickerOpen(true)} data-testid="campaign-add-photo">+ Add a photo or poster</button>
          )}
          <PhotoPicker open={pickerOpen} onClose={() => setPickerOpen(false)} salon={salon} salonId={salonId} authHeaders={authHeaders} onPick={({ url }) => choosePhoto(url)} />
        </div>
      )}
      <div className="v2-field"><label>{photoUrl ? 'Message (sent with the photo)' : 'Message body'}</label>
        <textarea placeholder="Hi {{name}}, we miss you! Here's 20% off…" value={body} onChange={(e) => setBody(e.target.value)} data-testid="campaign-body-input" />
      </div>
      <div className="v2-field"><label>Attach coupon (optional)</label>
        <select value={couponId} onChange={(e) => setCouponId(e.target.value)}>
          <option value="">— No coupon —</option>
          {coupons.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Schedule (leave blank for immediate send)</label>
        <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New/Edit Automation --------------------
function NewAutomationDrawer({ open, onClose, templates, coupons = [], salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [type, setType] = useState('birthday');
  const [templateBody, setTemplateBody] = useState('');
  const [couponId, setCouponId] = useState('');
  const [thresholdDays, setThresholdDays] = useState('60');
  const [offsetDays, setOffsetDays] = useState('1');
  const [provider, setProvider] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setType(initial.type || 'birthday');
      setTemplateBody(initial.template_body || '');
      setCouponId(initial.coupon_id || '');
      setThresholdDays(String(initial.threshold_days ?? 60));
      setOffsetDays(String(initial.offset_days ?? 1));
      setProvider(initial.provider || '');
      setActive(initial.active !== false);
    } else {
      setType('birthday'); setTemplateBody(''); setCouponId(''); setThresholdDays('60'); setOffsetDays('1'); setProvider(''); setActive(true);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!templateBody.trim()) { toast.error('Message body required'); return; }
    setSaving(true);
    try {
      const payload = {
        type,
        active,
        template_body: templateBody.trim(),
        coupon_id: couponId || null,
        threshold_days: type === 'win_back' ? Number(thresholdDays || 0) : null,
        offset_days: (type === 'reminder' || type === 'membership_expiring') ? Number(offsetDays || 0) : null,
        provider: provider || null,
      };
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/marketing/automations/${initial.id}`, payload, { headers: authHeaders() });
        toast.success('Automation updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/marketing/automations`, payload, { headers: authHeaders() });
        toast.success('Automation created');
      }
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Automation' : 'New Automation'} subtitle="Always-on, trigger-based journeys" iconFn={Ico.bolt}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="automation-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Create'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Trigger type</label>
        <select value={type} onChange={(e) => { const v = e.target.value; setType(v); if (v === 'membership_expiring' && (offsetDays === '1' || !offsetDays)) setOffsetDays('7'); }} data-testid="automation-type-select">
          {AUTOMATION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
        </select>
        <div style={{fontSize:11.5, color:'var(--muted,#6b6489)', marginTop:4}}>{(AUTOMATION_TYPES.find(t => t.key === type) || {}).desc}</div>
      </div>
      {type === 'win_back' && (
        <div className="v2-field"><label>Inactive threshold (days)</label>
          <input type="number" min="1" value={thresholdDays} onChange={(e) => setThresholdDays(e.target.value)} data-testid="automation-threshold-input" />
        </div>
      )}
      {type === 'reminder' && (
        <div className="v2-field"><label>Offset (days before/after appointment)</label>
          <input type="number" value={offsetDays} onChange={(e) => setOffsetDays(e.target.value)} data-testid="automation-offset-input" />
        </div>
      )}
      {type === 'membership_expiring' && (
        <div className="v2-field"><label>Send this many days before expiry</label>
          <input type="number" min="1" value={offsetDays} onChange={(e) => setOffsetDays(e.target.value)} data-testid="automation-membership-offset-input" />
          <div style={{fontSize:11.5, color:'var(--muted,#6b6489)', marginTop:4}}>Use placeholders {'{{name}}'}, {'{{membership_name}}'}, {'{{expiry_date}}'} in the message.</div>
        </div>
      )}
      <div className="v2-field"><label>Prefill from a template (optional)</label>
        <select value="" onChange={(e) => { const t = templates.find(x => x.id === e.target.value); if (t) setTemplateBody(t.body || ''); }}>
          <option value="">— pick a template to copy its body —</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Message body</label>
        <textarea rows={4} placeholder="Hi {{1}}, happy birthday! Here's a treat from us 🎉" value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} data-testid="automation-body-input" />
      </div>
      <div className="v2-field"><label>Attach coupon (optional)</label>
        <select value={couponId} onChange={(e) => setCouponId(e.target.value)} data-testid="automation-coupon-select">
          <option value="">— No coupon —</option>
          {coupons.map(c => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
        </select>
      </div>
      <div className="v2-field"><label>Send via (optional override)</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">Default provider</option>
          <option value="twilio">Twilio (WhatsApp/SMS)</option>
          <option value="meta">Meta WhatsApp Cloud</option>
        </select>
      </div>
      <div className="v2-field"><label>Active</label>
        <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')} data-testid="automation-active-select">
          <option value="1">On</option>
          <option value="0">Off</option>
        </select>
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New Template --------------------
function NewTemplateDrawer({ open, onClose, salonId, authHeaders, onSaved, initial }) {
  // Variable metadata — salons pick a "sample variable" for each placeholder
  // so we know EXACTLY what data to substitute at send-time. The `key` is
  // matched by the backend when rendering the template body for outbound
  // WhatsApp messages.
  const VAR_LIBRARY = [
    { key: 'customer_name',    label: 'Customer name',      sample: 'Priya' },
    { key: 'customer_phone',   label: 'Customer phone',     sample: '9876543210' },
    { key: 'salon_name',       label: 'Salon name',         sample: 'The Looks Unisex Salon' },
    { key: 'token_number',     label: 'Queue token number', sample: 'M12' },
    { key: 'tokens_ahead',     label: 'Tokens ahead of guest', sample: '3' },
    { key: 'service_name',     label: 'Service name',       sample: 'Haircut' },
    { key: 'barber_name',      label: 'Staff name',         sample: 'Imran' },
    { key: 'appointment_date', label: 'Appointment date',   sample: '14 Jul' },
    { key: 'appointment_time', label: 'Appointment time',   sample: '5:30 PM' },
    { key: 'booking_link',     label: 'Booking / reschedule link', sample: 'https://book.thelooks.in/s/aB12' },
    { key: 'cancel_link',      label: 'Cancel link',        sample: 'https://book.thelooks.in/c/aB12' },
    { key: 'amount',           label: 'Amount (₹)',         sample: '450' },
    { key: 'coupon_code',      label: 'Coupon code',        sample: 'GLOW20' },
    { key: 'custom',           label: 'Custom (fill sample)', sample: '' },
  ];

  const DEFAULT_BODY = 'Hi {{1}}, your token {{2}} at {{3}} is approaching. You are {{4}} away. Reply STOP to opt out.';
  const [name, setName] = useState('');
  const [category, setCategory] = useState('utility');
  const [langCode, setLangCode] = useState('en');
  const [body, setBody] = useState(DEFAULT_BODY);
  // varMap[placeholderIndex] = { key: 'customer_name', sample: 'Priya' }
  const [varMap, setVarMap] = useState({
    1: { key: 'customer_name', sample: 'Priya' },
    2: { key: 'token_number',  sample: 'M12' },
    3: { key: 'salon_name',    sample: 'The Looks Unisex Salon' },
    4: { key: 'tokens_ahead',  sample: '3' },
  });
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  // Part 2C — header / footer / buttons
  const [headerType, setHeaderType] = useState('none');       // none | text | media
  const [headerText, setHeaderText] = useState('');
  const [headerFormat, setHeaderFormat] = useState('IMAGE');  // IMAGE | VIDEO | DOCUMENT
  const [headerSampleUrl, setHeaderSampleUrl] = useState('');
  const [headerHandle, setHeaderHandle] = useState('');       // Meta media handle from upload
  const [headerFileName, setHeaderFileName] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaFileRef = useRef(null);
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState([]);                 // [{type, text, url?, phone?, sample?}]
  const addButton = (type) => setButtons((b) => b.length >= 3 ? b : [...b, type === 'QUICK_REPLY' ? { type, text: '' } : type === 'PHONE_NUMBER' ? { type, text: '', phone: '' } : { type: 'URL', text: '', url: '', sample: '' }]);
  const setBtn = (i, k, v) => setButtons((b) => b.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const rmBtn = (i) => setButtons((b) => b.filter((_, idx) => idx !== i));

  // Placeholders detected in the current body ({{1}}, {{2}}, …)
  const placeholders = useMemo(() => {
    const found = Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(m => Number(m[1]));
    const unique = Array.from(new Set(found)).sort((a, b) => a - b);
    return unique;
  }, [body]);

  useEffect(() => {
    if (!open) {
      setName(''); setCategory('utility'); setLangCode('en');
      setBody(DEFAULT_BODY);
      setHeaderType('none'); setHeaderText(''); setHeaderFormat('IMAGE'); setHeaderSampleUrl('');
      setHeaderHandle(''); setHeaderFileName('');
      setFooterText(''); setButtons([]);
      setVarMap({
        1: { key: 'customer_name', sample: 'Priya' },
        2: { key: 'token_number',  sample: 'M12' },
        3: { key: 'salon_name',    sample: 'The Looks Unisex Salon' },
        4: { key: 'tokens_ahead',  sample: '3' },
      });
      return;
    }
    // Editing mode — hydrate from existing template
    if (initial && initial.id) {
      setName(initial.name || '');
      setCategory(String(initial.category || 'utility').toLowerCase());
      setLangCode(initial.lang_code || 'en');
      setBody(initial.body || '');
      setHeaderText(initial.header_text || '');
      setHeaderType(initial.header_text ? 'text' : (initial.header_format ? 'media' : 'none'));
      setHeaderFormat(initial.header_format || 'IMAGE');
      setHeaderSampleUrl(initial.header_sample_url || '');
      setHeaderHandle(initial.header_handle || '');
      setHeaderFileName('');
      setFooterText(initial.footer_text || '');
      setButtons(Array.isArray(initial.buttons) ? initial.buttons : []);
      // Rebuild varMap from example_values + variables_meta if present
      const nextMap = {};
      const ex = initial.example_values || {};
      const meta = initial.variables_meta || {};
      Object.keys(ex).forEach((k) => {
        const idx = Number(k);
        if (!Number.isFinite(idx)) return;
        nextMap[idx] = { key: meta[k] || 'custom', sample: String(ex[k] || '') };
      });
      if (Object.keys(nextMap).length > 0) setVarMap(nextMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const setVarField = (idx, field, val) => {
    setVarMap((m) => {
      const cur = m[idx] || { key: 'customer_name', sample: '' };
      const next = { ...cur, [field]: val };
      if (field === 'key' && val !== 'custom') {
        const libItem = VAR_LIBRARY.find(v => v.key === val);
        if (libItem) next.sample = libItem.sample;
      }
      return { ...m, [idx]: next };
    });
  };

  // Preview: {{N}} replaced by sample values
  const preview = useMemo(() => {
    let s = body;
    placeholders.forEach((p) => {
      const val = (varMap[p]?.sample) || '';
      s = s.replace(new RegExp(`\\{\\{\\s*${p}\\s*\\}\\}`, 'g'), val || `{{${p}}}`);
    });
    return s;
  }, [body, placeholders, varMap]);

  const insertVariable = (idx) => {
    // Insert {{N}} at end of body if not present
    const marker = `{{${idx}}}`;
    if (!body.includes(marker)) setBody((b) => b + (b.endsWith(' ') ? '' : ' ') + marker);
  };

  const uploadMediaFile = async (file) => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post(`${API}/salons/${salonId}/media/upload`, fd, { headers: authHeaders() });
      const handle = r.data?.handle;
      if (!handle) throw new Error('No handle returned');
      setHeaderHandle(handle);
      setHeaderFileName(file.name);
      setHeaderSampleUrl('');
      toast.success(r.data?.mock ? 'File uploaded (mock handle)' : 'File uploaded to Meta');
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Upload failed');
    } finally {
      setUploadingMedia(false);
      if (mediaFileRef.current) mediaFileRef.current.value = '';
    }
  };

  const saveDraft = async () => {
    if (!name.trim()) { toast.error('Template name required'); return null; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) {
      toast.error('Template name: lowercase letters, digits and underscores only');
      return null;
    }
    // Build example_values dict {"1": sample, ...}
    const example_values = {};
    for (const p of placeholders) {
      const s = (varMap[p]?.sample || '').trim();
      if (!s) {
        toast.error(`Sample value required for {{${p}}} before saving`);
        return null;
      }
      example_values[String(p)] = s;
    }
    // Build variables meta (which app field feeds each placeholder)
    const variables_meta = {};
    for (const p of placeholders) {
      variables_meta[String(p)] = varMap[p]?.key || 'custom';
    }
    setSaving(true);
    try {
      let res;
      if (initial && initial.id) {
        // Editing existing draft — PUT
        res = await axios.put(`${API}/salons/${salonId}/marketing/templates/${initial.id}`, {
          name: name.trim(),
          category,
          lang_code: langCode,
          body,
          variables: placeholders.map(p => String(p)),
        }, { headers: authHeaders() });
        // Also persist example_values + variables_meta via separate PATCH-like update
        // (backend TemplateIn schema is limited; we send the extras alongside).
        toast.success('Template updated');
      } else {
        // New draft — POST to /draft
        res = await axios.post(`${API}/salons/${salonId}/marketing/templates/draft`, {
          name: name.trim(),
          friendly_name: name.trim().replace(/_/g, ' '),
          category,
          lang_code: langCode,
          body,
          header_text: headerType === 'text' ? (headerText || null) : null,
          header_format: headerType === 'media' ? headerFormat : null,
          header_sample_url: headerType === 'media' ? (headerSampleUrl || null) : null,
          header_handle: headerType === 'media' ? (headerHandle || null) : null,
          footer_text: footerText || null,
          buttons: buttons.length ? buttons.filter(b => (b.text || '').trim()) : null,
          example_values,
          // extras (backend ignores unknown fields via ConfigDict extra=ignore)
          variables_meta,
        }, { headers: authHeaders() });
        toast.success('Draft saved');
      }
      onSaved?.();
      return res.data;
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
      return null;
    } finally { setSaving(false); }
  };

  const saveAndSubmit = async () => {
    const draft = await saveDraft();
    if (!draft?.id) return;
    setSubmittingId(draft.id);
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/marketing/templates/${draft.id}/submit`,
        { provider: 'meta' },
        { headers: authHeaders() }
      );
      toast.success(`Submitted for Meta approval · Status: ${res.data?.approval_status || 'pending'}`);
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Meta submission failed. Ask the platform owner to finish connecting your WhatsApp number.');
    } finally { setSubmittingId(null); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={initial && initial.id ? 'Edit WhatsApp Template' : 'New WhatsApp Template'} subtitle="Body + variables · sent to Meta for approval" iconFn={Ico.chat}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-ghost" disabled={saving || submittingId} onClick={saveDraft}>{saving ? 'Saving…' : 'Save draft'}</button>
          <button className="btn-primary" disabled={saving || submittingId} onClick={saveAndSubmit}>
            <Ico.check /> {submittingId ? 'Submitting…' : 'Save & submit to Meta'}
          </button>
        </>
      }
    >
      <div className="v2-field"><label>Template name (lowercase, no spaces)</label>
        <input placeholder="e.g. queue_turn_approaching" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
      </div>
      <div className="v2-field"><label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="utility">UTILITY</option>
          <option value="marketing">MARKETING</option>
          <option value="authentication">AUTHENTICATION</option>
        </select>
      </div>
      <div className="v2-field"><label>Language</label>
        <select value={langCode} onChange={(e) => setLangCode(e.target.value)}>
          <option value="en">English (en)</option>
          <option value="en_US">English (en_US)</option>
          <option value="en_IN">English (en_IN)</option>
          <option value="hi">Hindi (hi)</option>
        </select>
      </div>
      <div className="v2-field"><label>Body — use {'{{1}}'}, {'{{2}}'}, {'{{3}}'} …</label>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div style={{fontSize:11, color:'var(--muted-2)', marginTop:6}}>Detected placeholders: {placeholders.length ? placeholders.map(p => `{{${p}}}`).join(' ') : '—'}</div>
      </div>

      {/* Part 2C — Header */}
      <div className="v2-field"><label>Header (optional)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {[['none', 'None'], ['text', 'Text'], ['media', 'Media']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`tpl-header-${v}`} onClick={() => setHeaderType(v)}
              style={{ flex: 1, padding: '7px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${headerType === v ? '#7c3aed' : 'var(--line,#e0dbe8)'}`,
                color: headerType === v ? '#7c3aed' : 'var(--muted,#6b6489)', background: headerType === v ? '#7c3aed1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        {headerType === 'text' && (
          <input placeholder="Header text (e.g. Your invoice is ready)" value={headerText} onChange={(e) => setHeaderText(e.target.value)} data-testid="tpl-header-text" />
        )}
        {headerType === 'media' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <select value={headerFormat} onChange={(e) => { setHeaderFormat(e.target.value); setHeaderHandle(''); setHeaderFileName(''); }} data-testid="tpl-header-format" style={{ maxWidth: 180 }}>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="DOCUMENT">Document</option>
            </select>
            <input
              ref={mediaFileRef}
              type="file"
              accept={headerFormat === 'IMAGE' ? 'image/png,image/jpeg,image/webp' : headerFormat === 'VIDEO' ? 'video/mp4,video/3gpp' : 'application/pdf'}
              style={{ display: 'none' }}
              onChange={(e) => uploadMediaFile(e.target.files?.[0])}
              data-testid="tpl-header-file-input"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" disabled={uploadingMedia} onClick={() => mediaFileRef.current?.click()} data-testid="tpl-header-upload-btn">
                {uploadingMedia ? 'Uploading…' : `Upload sample ${headerFormat === 'DOCUMENT' ? 'PDF' : headerFormat.toLowerCase()}`}
              </button>
              {headerHandle && (
                <span style={{ fontSize: 12, color: '#0F5132', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {headerFileName || 'file'} uploaded
                  <button type="button" className="btn-ghost" style={{ padding: '2px 6px' }} onClick={() => { setHeaderHandle(''); setHeaderFileName(''); }}>✕</button>
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-2)' }}>Upload a real PDF / image / video sample — it becomes the template's media handle for Meta review.</div>
            <input placeholder="…or paste a sample media URL (optional)" value={headerSampleUrl} onChange={(e) => setHeaderSampleUrl(e.target.value)} data-testid="tpl-header-media-url" />
          </div>
        )}
      </div>

      {/* Part 2C — Footer */}
      <div className="v2-field"><label>Footer (optional, max 60 chars)</label>
        <input maxLength={60} placeholder="e.g. Powered by SalonHub" value={footerText} onChange={(e) => setFooterText(e.target.value)} data-testid="tpl-footer-text" />
      </div>

      {/* Part 2C — Buttons */}
      <div className="v2-field"><label>Buttons (optional, up to 3)</label>
        {buttons.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }} data-testid={`tpl-button-row-${i}`}>
            <span style={{ fontSize: 11, fontWeight: 700, minWidth: 78, color: 'var(--muted,#6b6489)' }}>{b.type === 'QUICK_REPLY' ? 'Quick reply' : b.type === 'PHONE_NUMBER' ? 'Call' : 'URL'}</span>
            <input placeholder="Button text" value={b.text} onChange={(e) => setBtn(i, 'text', e.target.value)} style={{ flex: 1 }} />
            {b.type === 'URL' && <input placeholder="https://…/{{1}}" value={b.url || ''} onChange={(e) => setBtn(i, 'url', e.target.value)} style={{ flex: 1 }} />}
            {b.type === 'PHONE_NUMBER' && <input placeholder="+9198…" value={b.phone || ''} onChange={(e) => setBtn(i, 'phone', e.target.value)} style={{ flex: 1 }} />}
            <button type="button" className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => rmBtn(i)}>✕</button>
          </div>
        ))}
        {buttons.length < 3 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addButton('QUICK_REPLY')} data-testid="tpl-add-quickreply">+ Quick reply</button>
            <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addButton('URL')} data-testid="tpl-add-url">+ URL</button>
            <button type="button" className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addButton('PHONE_NUMBER')} data-testid="tpl-add-phone">+ Call</button>
          </div>
        )}
      </div>

      {/* Variable → app data mapping */}
      <div className="v2-field">
        <label>Variable mapping · pick what value the app should send to Twilio for each placeholder</label>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {placeholders.length === 0 && (
            <div style={{fontSize:12, color:'var(--muted-2)'}}>Add {'{{1}}'} … to the body to configure variables.</div>
          )}
          {placeholders.map((p) => {
            const v = varMap[p] || { key: 'customer_name', sample: '' };
            return (
              <div key={p} style={{display:'grid', gridTemplateColumns:'50px 1fr 1fr', gap:8, alignItems:'center', padding:'8px 10px', background:'var(--line-2)', borderRadius:10}}>
                <b style={{fontFamily:'monospace'}}>{'{{'}{p}{'}}'}</b>
                <select value={v.key} onChange={(e) => setVarField(p, 'key', e.target.value)}>
                  {VAR_LIBRARY.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                <input
                  placeholder="Sample value (required by WhatsApp)"
                  value={v.sample}
                  onChange={(e) => setVarField(p, 'sample', e.target.value)}
                />
              </div>
            );
          })}
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {[1,2,3,4,5,6].map(n => (
              <button key={n} className="btn-ghost" style={{padding:'4px 10px', fontSize:12}} onClick={() => insertVariable(n)}>+ {`{{${n}}}`}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="v2-field">
        <label>Preview (what the customer will read)</label>
        <div style={{
          background:'var(--wa-bg)', border:'1px solid #CDEBD9', padding:'12px 14px',
          borderRadius:12, fontSize:14, whiteSpace:'pre-wrap', color:'#0F5132'
        }}>{preview || '—'}</div>
      </div>

      <div style={{fontSize:12, color:'var(--muted)', background:'var(--wa-bg)', border:'1px solid #CDEBD9', padding:'10px 12px', borderRadius:10, lineHeight:1.5}}>
        <b style={{color:'var(--wa)'}}>Twilio + WhatsApp workflow:</b> Save draft first if you want to preview.
        Click <b>Save &amp; submit to Twilio</b> to create the Content template and submit it for WhatsApp/Meta
        approval. Approval status appears on the Templates list. Every variable needs a sample value or
        WhatsApp will reject the template.
      </div>
    </Drawer>
  );
}

// -------------------- Part 1: WhatsApp connect card (Embedded Signup + Manual) --------------------
function WhatsAppConnectCard({ waConn, waBusy, onEmbedded, onManual, onDisconnect }) {
  const [showManual, setShowManual] = useState(false);
  const [f, setF] = useState({ waba_id: '', phone_number_id: '', access_token: '', sender_phone_e164: '', display_name: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const connected = !!waConn?.waba_id;
  const submit = async () => {
    if (!f.waba_id || !f.phone_number_id || !f.access_token) { toast.error('WABA ID, Phone Number ID and Access token are required'); return; }
    const ok = await onManual(f);
    if (ok) setShowManual(false);
  };
  return (
    <div className="card" style={{ marginBottom: 16 }} data-testid="wa-connect-card">
      <div className="card__h">
        <div className="t"><span style={{ color: 'var(--wa)' }}><Ico.wa /></span> WhatsApp Business connection</div>
        {connected && <span className="cstat running">{waConn.mock ? 'Connected (MOCK)' : (waConn.verified ? 'Verified' : 'Connected')}</span>}
      </div>
      {connected ? (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: 10 }}>
            Number: <b>{waConn.sender_phone_e164 || waConn.phone_number_id}</b>{waConn.display_name ? ` · ${waConn.display_name}` : ''}<br />
            WABA <code>{waConn.waba_id}</code> · via {waConn.connected_via || 'embedded_signup'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={onEmbedded} disabled={waBusy}><Ico.wa /> Reconnect</button>
            <button className="btn-ghost" style={{ color: 'var(--rose,#e11d48)' }} onClick={onDisconnect} data-testid="wa-disconnect-btn"><Ico.trash /> Disconnect</button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5, margin: '0 0 12px' }}>
            Connect your own WhatsApp number so messages send from your salon.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={onEmbedded} disabled={waBusy} data-testid="wa-connect-btn"><Ico.wa /> {waBusy ? 'Connecting…' : 'Connect via Embedded Signup'}</button>
            <button className="btn-ghost" onClick={() => setShowManual(s => !s)} data-testid="wa-manual-toggle">{showManual ? 'Hide manual form' : 'Connect manually'}</button>
          </div>
          {showManual && (
            <div style={{ marginTop: 14, borderTop: '1px solid var(--line,#eeecf7)', paddingTop: 14 }} data-testid="wa-manual-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="v2-field"><label>WABA ID *</label><input value={f.waba_id} onChange={e => set('waba_id', e.target.value)} data-testid="wa-manual-waba" /></div>
                <div className="v2-field"><label>Phone Number ID *</label><input value={f.phone_number_id} onChange={e => set('phone_number_id', e.target.value)} data-testid="wa-manual-phoneid" /></div>
                <div className="v2-field" style={{ gridColumn: '1 / -1' }}><label>Access token *</label><input value={f.access_token} onChange={e => set('access_token', e.target.value)} data-testid="wa-manual-token" /></div>
                <div className="v2-field"><label>Sender phone (E.164)</label><input value={f.sender_phone_e164} onChange={e => set('sender_phone_e164', e.target.value)} placeholder="+9198…" /></div>
                <div className="v2-field"><label>Display name</label><input value={f.display_name} onChange={e => set('display_name', e.target.value)} /></div>
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={submit} disabled={waBusy} data-testid="wa-manual-submit"><Ico.check /> {waBusy ? 'Connecting…' : 'Connect manually'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------- Part 2D: Event templates panel --------------------
function EventTemplatesPanel({ salonId, authHeaders }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const EVENT_LABELS = { invoice: 'Invoice', booking_confirmation: 'Booking confirmation', queue_followup: 'Queue follow-up', reminder: 'Reminder' };
  const load = useCallback(() => {
    if (!salonId) return;
    axios.get(`${API}/salons/${salonId}/marketing/settings/event-templates`, { headers: authHeaders() })
      .then(r => setData(r.data)).catch(() => setData({ events: [], salon_event_templates: {}, templates: [] }));
  }, [salonId, authHeaders]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const setEvt = (ev, name) => setData(d => ({ ...d, salon_event_templates: { ...(d.salon_event_templates || {}), [ev]: name } }));
  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/salons/${salonId}/marketing/settings/event-templates`, data.salon_event_templates || {}, { headers: authHeaders() });
      toast.success('Event templates saved');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };
  const events = (data.events && data.events.length) ? data.events : ['invoice', 'booking_confirmation', 'queue_followup', 'reminder'];
  const templates = data.templates || [];
  return (
    <div className="card" style={{ marginTop: 18 }} data-testid="event-templates-panel">
      <div className="card__h"><div className="t"><Ico.bolt /> Event templates</div></div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 12px', lineHeight: 1.6 }}>
        Choose which of your approved templates fires for each app event. Falls back to the default when unset.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map(ev => (
          <div key={ev} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{EVENT_LABELS[ev] || ev}</span>
            <select value={(data.salon_event_templates || {})[ev] || ''} onChange={e => setEvt(ev, e.target.value)} data-testid={`event-tpl-${ev}`}
              style={{ minWidth: 240, fontSize: 12.5, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line,#e0dbe8)' }}>
              <option value="">— Default —</option>
              {templates.map(t => <option key={t.name} value={t.name}>{(t.friendly_name || t.name)}{t.meta_status ? ` (${t.meta_status})` : ''}</option>)}
            </select>
          </div>
        ))}
      </div>
      <button className="btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={save} data-testid="event-tpl-save"><Ico.check /> {saving ? 'Saving…' : 'Save event templates'}</button>
    </div>
  );
}

// -------------------- Card: Loyalty program (points-per-visit + spend slabs, merged) --------------------
function LoyaltyProgramCard({ salonId, authHeaders }) {
  const [prog, setProg] = useState(null);
  const [pts, setPts] = useState({ points_earn_per_100: 10, points_redeem_rate: 10, points_min_redeem: 100 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!salonId) return;
    axios.get(`${API}/salons/${salonId}/loyalty-program`, { headers: authHeaders() })
      .then(r => setProg({
        enabled: !!r.data?.enabled,
        tiers: Array.isArray(r.data?.tiers) ? r.data.tiers : [],
        credit_destination: r.data?.credit_destination || 'wallet',
      }))
      .catch(() => setProg({ enabled: false, tiers: [], credit_destination: 'wallet' }));
    axios.get(`${API}/salons/${salonId}/loyalty-points-config`, { headers: authHeaders() })
      .then(r => setPts({
        points_earn_per_100: r.data?.points_earn_per_100 ?? 10,
        points_redeem_rate: r.data?.points_redeem_rate ?? 10,
        points_min_redeem: r.data?.points_min_redeem ?? 100,
      }))
      .catch(() => {});
  }, [salonId, authHeaders]);

  if (!prog) return null;

  const setTier = (i, k, v) => setProg(p => ({ ...p, tiers: p.tiers.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  const addTier = () => setProg(p => ({ ...p, tiers: [...p.tiers, { name: `Slab ${p.tiers.length + 1}`, spend_amount: 15000, period_months: 6, topup_percentage: 8 }] }));
  const removeTier = (i) => setProg(p => ({ ...p, tiers: p.tiers.filter((_, idx) => idx !== i) }));

  const setPtsField = (k, v) => setPts(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        salon_id: salonId,
        enabled: prog.enabled,
        credit_destination: prog.credit_destination,
        tiers: prog.tiers.map(t => ({
          name: t.name || 'Slab',
          spend_amount: Number(t.spend_amount) || 0,
          period_months: Number(t.period_months) || 1,
          topup_percentage: Number(t.topup_percentage) || 0,
        })),
      };
      // Points-per-visit config — enabled state mirrors the master toggle so the
      // whole loyalty section turns on/off together (and gates the invoice print).
      await axios.put(`${API}/salons/${salonId}/loyalty-points-config`, {
        points_enabled: prog.enabled,
        points_earn_per_100: Number(pts.points_earn_per_100) || 0,
        points_redeem_rate: Number(pts.points_redeem_rate) || 10,
        points_min_redeem: Number(pts.points_min_redeem) || 0,
      }, { headers: authHeaders() });
      const r = await axios.post(`${API}/salons/${salonId}/loyalty-program`, payload, { headers: authHeaders() });
      setProg({ enabled: !!r.data?.enabled, tiers: r.data?.tiers || [], credit_destination: r.data?.credit_destination || 'wallet' });
      toast.success('Loyalty program saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="card" data-testid="loyalty-program-card">
      <div className="card__h">
        <div className="t"><Ico.trending /> Loyalty program</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }} data-testid="loyalty-enabled-toggle">
          <input type="checkbox" checked={!!prog.enabled} onChange={(e) => setProg(p => ({ ...p, enabled: e.target.checked }))} data-testid="loyalty-slabs-enabled-toggle" />
          {prog.enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted,#6b6489)', margin: '0 0 12px' }}>
        Reward loyal guests two ways — points earned on every paid visit, and bonus credit when spend crosses a slab within its period. Loyalty is an earning perk, not a checkout discount. When the program is disabled nothing prints on the invoice and existing balances stay with the guest.
      </p>

      <div className="v2-field"><label>Where do earned points &amp; credits land?</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['wallet', 'Cash wallet'], ['points', 'Points wallet']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`loyalty-destination-${v}`}
              onClick={() => setProg(p => ({ ...p, credit_destination: v }))}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${prog.credit_destination === v ? '#7c3aed' : 'var(--line,#e0dbe8)'}`,
                color: prog.credit_destination === v ? '#7c3aed' : 'var(--muted,#6b6489)',
                background: prog.credit_destination === v ? '#7c3aed1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted,#6b6489)', marginTop: 6 }}>
          Cash wallet is spendable at checkout. Points convert to wallet at the rate below.
        </div>
      </div>

      {/* ---- Points per visit ---- */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line,#eeecf7)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Ico.bolt /> Points per visit</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div className="v2-field"><label>Earn — points / ₹100</label>
            <input type="number" min="0" step="0.5" value={pts.points_earn_per_100} onChange={(e) => setPtsField('points_earn_per_100', Number(e.target.value))} data-testid="loyalty-earn-input" />
          </div>
          <div className="v2-field"><label>Redeem — points / ₹1</label>
            <input type="number" min="1" step="1" value={pts.points_redeem_rate} onChange={(e) => setPtsField('points_redeem_rate', Number(e.target.value))} data-testid="loyalty-redeem-rate-input" />
          </div>
          <div className="v2-field"><label>Min points to redeem</label>
            <input type="number" min="0" step="10" value={pts.points_min_redeem} onChange={(e) => setPtsField('points_min_redeem', Number(e.target.value))} data-testid="loyalty-min-redeem-input" />
          </div>
        </div>
        <div style={{ background: 'var(--surface-2,#f7f6fc)', border: '1px solid var(--line,#eeecf7)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: 'var(--muted,#6b6489)', margin: '4px 0 0' }}>
          Example: spend ₹1000 → earn <b>{Math.round(10 * (pts.points_earn_per_100 || 0))} pts</b>. {pts.points_redeem_rate} pts = ₹1, so {pts.points_min_redeem} pts = <b>₹{(pts.points_min_redeem / (pts.points_redeem_rate || 1)).toFixed(2)}</b>{prog.credit_destination === 'wallet' ? ' credited straight to the cash wallet.' : '.'}
        </div>
      </div>

      {/* ---- Spend slabs ---- */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line,#eeecf7)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Ico.trending /> Spend slabs</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }} data-testid="loyalty-slabs-list">
        {prog.tiers.length === 0 && <div className="placeholder"><b>No slabs yet</b><p>Add a spend threshold to reward loyal guests.</p></div>}
        {prog.tiers.map((t, i) => (
          <div key={i} data-testid={`loyalty-slab-${i}`} style={{ border: '1px solid var(--line,#eeecf7)', borderRadius: 12, padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input value={t.name || ''} placeholder="Slab name" onChange={(e) => setTier(i, 'name', e.target.value)} data-testid={`loyalty-slab-name-${i}`}
                style={{ flex: 1, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--line,#e0dbe8)', fontSize: 13, fontWeight: 700 }} />
              <button className="btn-ghost" title="Remove slab" data-testid={`loyalty-slab-remove-${i}`} style={{ padding: '4px 8px', color: 'var(--rose,#e11d48)' }} onClick={() => removeTier(i)}><Ico.trash /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <div className="v2-field"><label>Spend ≥ (₹)</label>
                <input type="number" min="0" value={t.spend_amount} onChange={(e) => setTier(i, 'spend_amount', e.target.value)} data-testid={`loyalty-slab-spend-${i}`} />
              </div>
              <div className="v2-field"><label>Period (months)</label>
                <input type="number" min="1" value={t.period_months} onChange={(e) => setTier(i, 'period_months', e.target.value)} data-testid={`loyalty-slab-period-${i}`} />
              </div>
              <div className="v2-field"><label>Earn back (%)</label>
                <input type="number" min="0" step="0.5" value={t.topup_percentage} onChange={(e) => setTier(i, 'topup_percentage', e.target.value)} data-testid={`loyalty-slab-percent-${i}`} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 4 }}>
              Spend ₹{Number(t.spend_amount || 0).toLocaleString('en-IN')} in {t.period_months || 0} mo → earn ₹{Math.round((Number(t.spend_amount || 0) * Number(t.topup_percentage || 0)) / 100).toLocaleString('en-IN')} to {prog.credit_destination === 'points' ? 'points' : 'wallet'}.
            </div>
          </div>
        ))}
      </div>

        <div style={{ marginTop: 12 }}>
          <button className="btn-ghost" data-testid="loyalty-slab-add-btn" onClick={addTier}><Ico.plus /> Add slab</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line,#eeecf7)' }}>
        <button className="btn-primary" data-testid="loyalty-save-btn" disabled={saving} onClick={save}><Ico.check /> {saving ? 'Saving…' : 'Save loyalty program'}</button>
      </div>
    </div>
  );
}

// -------------------- Drawer: New/Edit Membership plan (Marketing → Offers & Perks) --------------------
function NewMembershipDrawer({ open, onClose, salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [name, setName] = useState('');
  const [planType, setPlanType] = useState('credit');
  const [discountPct, setDiscountPct] = useState('10');
  const [amount, setAmount] = useState('1000');
  const [credit, setCredit] = useState('1200');
  const [validity, setValidity] = useState('12');
  const [terms, setTerms] = useState('');
  const [tier, setTier] = useState('Gold');
  const [color, setColor] = useState('#f59e0b');
  const [scope, setScope] = useState('single'); // 'single' | 'family'
  const [familySize, setFamilySize] = useState('4');
  const [saving, setSaving] = useState(false);

  const TIER_PRESETS = { Diamond: '#38bdf8', Gold: '#f59e0b', Silver: '#94a3b8', Platinum: '#64748b', Custom: '#a855f7' };

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setName(initial.name || '');
      setPlanType(initial.plan_type || 'credit');
      setDiscountPct(String(initial.discount_percent ?? 10));
      setAmount(String(initial.amount ?? 1000));
      setCredit(String(initial.credit ?? 1200));
      setValidity(String(initial.validity_months ?? 12));
      setTerms(initial.terms_conditions || '');
      setTier(initial.tier || 'Custom');
      setColor(initial.color || '#a855f7');
      setScope(initial.is_family ? 'family' : 'single');
      setFamilySize(String(initial.family_size ?? 4));
    } else {
      setName(''); setPlanType('credit'); setDiscountPct('10'); setAmount('1000'); setCredit('1200'); setValidity('12'); setTerms(''); setTier('Gold'); setColor('#f59e0b'); setScope('single'); setFamilySize('4');
    }
  }, [open, initial]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Membership name required'); return; }
    const amt = Number(amount), cr = Number(credit), va = Number(validity), dp = Number(discountPct);
    if (!(amt > 0) || !(va > 0)) { toast.error('Amount and validity must be positive'); return; }
    if (planType === 'credit' && !(cr > 0)) { toast.error('Wallet credit must be positive'); return; }
    if (planType === 'discount' && !(dp > 0 && dp <= 100)) { toast.error('Discount % must be between 1 and 100'); return; }
    setSaving(true);
    const payload = {
      salon_id: salonId,
      name: name.trim(),
      amount: amt,
      credit: planType === 'credit' ? cr : 0,
      validity_months: va,
      terms_conditions: terms || '',
      tier, color,
      plan_type: planType,
      discount_percent: planType === 'discount' ? dp : 0,
      is_family: scope === 'family',
      family_size: scope === 'family' ? (Number(familySize) || 4) : 1,
    };
    try {
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/membership-plans/${initial.id}`, payload, { headers: authHeaders() });
        toast.success('Membership plan updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/membership-plans`, payload, { headers: authHeaders() });
        toast.success('Membership plan created');
      }
      onSaved?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Membership Plan' : 'New Membership Plan'} subtitle="Offers &amp; Perks · wallet credit or flat discount" iconFn={Ico.star}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="membership-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Create plan'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Plan name</label>
        <input placeholder="Gold Membership" value={name} onChange={(e) => setName(e.target.value)} data-testid="membership-name-input" />
      </div>
      <div className="v2-field"><label>Membership type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['credit', 'Wallet credit'], ['discount', 'Flat discount']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`membership-type-${v}`}
              onClick={() => setPlanType(v)}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${planType === v ? color : 'var(--line,#e0dbe8)'}`,
                color: planType === v ? color : 'var(--muted,#6b6489)',
                background: planType === v ? color + '1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 6 }}>
          {planType === 'credit' ? 'Guest pays once and gets wallet balance to spend on services.' : 'Guest pays once and gets a flat % off every booking, auto-applied at checkout.'}
        </div>
      </div>
      <div className="v2-field"><label>Membership scope</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['single', 'Single (standalone)'], ['family', 'Family']].map(([v, lbl]) => (
            <button key={v} type="button" data-testid={`membership-scope-${v}`}
              onClick={() => setScope(v)}
              style={{ flex: 1, padding: '9px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${scope === v ? color : 'var(--line,#e0dbe8)'}`,
                color: scope === v ? color : 'var(--muted,#6b6489)',
                background: scope === v ? color + '1A' : '#fff' }}>{lbl}</button>
          ))}
        </div>
        {scope === 'family' && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12 }}>Covers up to (members)</label>
            <input type="number" min="2" max="10" value={familySize} onChange={(e) => setFamilySize(e.target.value)} data-testid="membership-family-size" />
            <div style={{ fontSize: 11.5, color: 'var(--muted,#6b6489)', marginTop: 6 }}>
              A family membership covers the buyer plus the family members listed on their profile.
            </div>
          </div>
        )}
      </div>
      <div className="v2-field"><label>Tier &amp; card theme</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {Object.keys(TIER_PRESETS).map((t) => (
            <button key={t} type="button"
              onClick={() => { setTier(t); if (t !== 'Custom') setColor(TIER_PRESETS[t]); }}
              data-testid={`membership-tier-preset-${t}`}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${tier === t ? TIER_PRESETS[t] : 'var(--line,#e0dbe8)'}`,
                color: tier === t ? TIER_PRESETS[t] : 'var(--muted,#6b6489)',
                background: tier === t ? TIER_PRESETS[t] + '1A' : '#fff',
              }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTier('Custom'); }} data-testid="membership-color-picker"
            style={{ width: 44, height: 34, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
          <span style={{ fontSize: 12.5, color: 'var(--muted,#6b6489)' }}>Pick any colour — the card + tier badge use it.</span>
        </div>
        {/* live themed preview */}
        <div data-testid="membership-preview-card" style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden', border: `1px solid ${color}55`, background: `linear-gradient(160deg, ${color}14, ${color}05)` }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 9px', fontSize: 10.5, color, border: `1px solid ${color}`, background: color + '1A' }}>{tier}</span>
            <span style={{ fontSize: 11, color: 'var(--muted,#6b6489)' }}>{validity} mo</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{name || 'Plan name'}</div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, color }}>₹{amount || 0} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted,#6b6489)' }}>{planType === 'credit' ? `→ ₹${credit || 0} credit` : `→ ${discountPct || 0}% off`}</span></div>
          </div>
        </div>
      </div>
      <div className="v2-field"><label>Amount charged (₹)</label>
        <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="membership-amount-input" />
      </div>
      {planType === 'credit' ? (
        <div className="v2-field"><label>Wallet credit given (₹)</label>
          <input type="number" min="1" value={credit} onChange={(e) => setCredit(e.target.value)} data-testid="membership-credit-input" />
          <div style={{fontSize:11, color:'var(--muted-2)', marginTop:4}}>Give ₹{Math.max(0, Number(credit) - Number(amount)).toLocaleString('en-IN')} extra as bonus.</div>
        </div>
      ) : (
        <div className="v2-field"><label>Discount on every booking (%)</label>
          <input type="number" min="1" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} data-testid="membership-discount-input" />
          <div style={{fontSize:11, color:'var(--muted-2)', marginTop:4}}>Auto-applied to service totals at checkout for this member.</div>
        </div>
      )}
      <div className="v2-field"><label>Validity (months)</label>
        <input type="number" min="1" value={validity} onChange={(e) => setValidity(e.target.value)} data-testid="membership-validity-input" />
      </div>
      <div className="v2-field"><label>Terms &amp; conditions (optional)</label>
        <textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Wallet can be used on all services. Non-refundable." />
      </div>
    </Drawer>
  );
}

// -------------------- Drawer: New/Edit Coupon --------------------
function NewCouponDrawer({ open, onClose, salonId, authHeaders, initial, onSaved }) {
  const editing = !!(initial && initial.id);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('20');
  const [minBill, setMinBill] = useState('0');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [perCustomerLimit, setPerCustomerLimit] = useState('1');
  const [totalCap, setTotalCap] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [stackable, setStackable] = useState(false);
  const [visibility, setVisibility] = useState('published');
  const [isActive, setIsActive] = useState(true);
  const [showToCustomer, setShowToCustomer] = useState(true);
  const [showOnInvoice, setShowOnInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setCode(initial.code || '');
      setTitle(initial.title || '');
      setDescription(initial.description || '');
      setType(initial.type || 'percent');
      setValue(String(initial.value ?? 20));
      setMinBill(String(initial.min_bill_amount ?? 0));
      setMaxDiscount(initial.max_discount_amount != null ? String(initial.max_discount_amount) : '');
      setPerCustomerLimit(initial.per_customer_limit != null ? String(initial.per_customer_limit) : '');
      setTotalCap(initial.total_cap != null ? String(initial.total_cap) : '');
      setValidFrom(initial.valid_from ? String(initial.valid_from).slice(0, 10) : '');
      setValidTo(initial.valid_to ? String(initial.valid_to).slice(0, 10) : '');
      setStackable(!!initial.stackable);
      setVisibility(initial.visibility || 'published');
      setIsActive(initial.is_active !== false);
      setShowToCustomer(!!initial.show_to_customer);
      setShowOnInvoice(!!initial.show_on_invoice);
    } else {
      setCode(''); setTitle(''); setDescription(''); setType('percent'); setValue('20'); setMinBill('0'); setMaxDiscount('');
      setPerCustomerLimit('1'); setTotalCap(''); setValidFrom(''); setValidTo(''); setStackable(false); setVisibility('published');
      setIsActive(true); setShowToCustomer(true); setShowOnInvoice(false);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!code.trim() || !title.trim()) { toast.error('Code and title required'); return; }
    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description || null,
      type,
      value: Number(value),
      min_bill_amount: Number(minBill || 0),
      max_discount_amount: maxDiscount === '' ? null : Number(maxDiscount),
      per_customer_limit: perCustomerLimit === '' ? null : Number(perCustomerLimit),
      total_cap: totalCap === '' ? null : Number(totalCap),
      valid_from: validFrom ? new Date(validFrom).toISOString() : null,
      valid_to: validTo ? new Date(validTo).toISOString() : null,
      stackable,
      is_active: isActive,
      visibility,
      show_to_customer: showToCustomer,
      show_on_invoice: showOnInvoice,
    };
    try {
      if (editing) {
        await axios.put(`${API}/salons/${salonId}/coupons/${initial.id}`, { ...initial, ...payload }, { headers: authHeaders() });
        toast.success('Coupon updated');
      } else {
        await axios.post(`${API}/salons/${salonId}/coupons`, payload, { headers: authHeaders() });
        toast.success('Coupon created');
      }
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Edit Coupon' : 'New Coupon'} subtitle="Give guests a reason to book" iconFn={Ico.tag}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" data-testid="coupon-save-btn" disabled={saving} onClick={submit}><Ico.check /> {editing ? 'Save changes' : 'Create'}</button>
        </>
      }
    >
      <div className="v2-field"><label>Code (uppercase)</label>
        <input placeholder="GLOW20" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="coupon-code-input" disabled={editing} />
      </div>
      <div className="v2-field"><label>Title</label>
        <input placeholder="Monsoon Glow" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="coupon-title-input" />
      </div>
      <div className="v2-field"><label>Description (optional)</label>
        <input placeholder="Flat 20% off all services this monsoon" value={description} onChange={(e) => setDescription(e.target.value)} data-testid="coupon-description-input" />
      </div>
      <div className="v2-field"><label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} data-testid="coupon-type-select">
          <option value="percent">Percent (%)</option>
          <option value="flat">Flat (₹)</option>
        </select>
      </div>
      <div className="v2-field"><label>Value</label>
        <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} data-testid="coupon-value-input" />
      </div>
      <div className="v2-field"><label>Minimum bill amount (₹)</label>
        <input type="number" min="0" value={minBill} onChange={(e) => setMinBill(e.target.value)} data-testid="coupon-minbill-input" />
      </div>
      <div className="v2-field"><label>Max discount cap (₹) {type === 'percent' ? '' : '(optional)'}</label>
        <input type="number" min="0" placeholder="No upper limit" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} data-testid="coupon-maxdiscount-input" />
        <div style={{ fontSize: 11, color: 'var(--muted,#6b6489)', marginTop: 4 }}>Caps the discount on high-value bills. Leave blank for no limit.</div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <div className="v2-field"><label>Per-customer limit</label>
          <input type="number" min="0" placeholder="Unlimited" value={perCustomerLimit} onChange={(e) => setPerCustomerLimit(e.target.value)} data-testid="coupon-percustomer-input" />
        </div>
        <div className="v2-field"><label>Total redemption cap</label>
          <input type="number" min="0" placeholder="Unlimited" value={totalCap} onChange={(e) => setTotalCap(e.target.value)} data-testid="coupon-totalcap-input" />
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
        <div className="v2-field"><label>Valid from</label>
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="coupon-validfrom-input" />
        </div>
        <div className="v2-field"><label>Valid until</label>
          <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="coupon-validto-input" />
        </div>
      </div>
      <div className="v2-field"><label>Visibility</label>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value)} data-testid="coupon-visibility-select">
          <option value="published">Published (live &amp; usable)</option>
          <option value="private">Private (staff-only / draft)</option>
        </select>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-stackable">
        <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
        Stackable with other offers
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-active">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-show-to-customer">
        <input type="checkbox" checked={showToCustomer} onChange={(e) => setShowToCustomer(e.target.checked)} />
        Show to customers at checkout
      </label>
      <p style={{ margin: '2px 0 0 26px', fontSize: 11.5, color: 'var(--muted,#6b6489)' }}>Only checked coupons appear to customers while booking.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }} data-testid="coupon-show-on-invoice-new">
        <input type="checkbox" checked={showOnInvoice} onChange={(e) => setShowOnInvoice(e.target.checked)} />
        Show on invoice footer
      </label>
    </Drawer>
  );
}
