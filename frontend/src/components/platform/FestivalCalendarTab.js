/**
 * Platform Admin — Festival calendar.
 * Festivals with changing (lunar) dates shown in every salon's Marketing →
 * Calendar. Seeded drafts carry estimated dates: confirm the date, then publish.
 * Fixed-date occasions (New Year, Valentine's, Mother's Day…) are built in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, CalendarDays, Plus, Download, Trash2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const THEMES = ['festive', 'diwali', 'holi', 'love', 'fresh', 'bold', 'minimal'];
const errMsg = (e, fb) => e?.response?.data?.detail || fb;

export default function FestivalCalendarTab({ headers }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: '', date: '', theme: 'festive' });
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.get(`${API}/platform/marketing/occasions`, { headers })).data.occasions || []); }
    catch (e) { toast.error(errMsg(e, 'Failed to load festivals')); } finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const save = async (o, patch) => {
    setBusy(o.id);
    try {
      const body = { name: o.name, date: o.date, theme: o.theme, idea: o.idea, message: o.message, published: o.published, ...patch };
      await axios.put(`${API}/platform/marketing/occasions/${o.id}`, body, { headers });
      load();
    } catch (e) { toast.error(errMsg(e, 'Save failed')); } finally { setBusy(''); }
  };
  const add = async () => {
    if (!draft.name.trim() || !draft.date) return toast.error('Name and date are required');
    try {
      await axios.post(`${API}/platform/marketing/occasions`, { ...draft, published: true }, { headers });
      setDraft({ name: '', date: '', theme: 'festive' }); load();
    } catch (e) { toast.error(errMsg(e, 'Could not add')); }
  };
  const seed = async () => {
    setBusy('seed');
    try { const r = await axios.post(`${API}/platform/marketing/occasions/seed`, {}, { headers }); toast.success(`Added ${r.data.created} festival drafts`); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not add festivals')); } finally { setBusy(''); }
  };
  const remove = async (o) => {
    if (!window.confirm(`Delete ${o.name}?`)) return;
    await axios.delete(`${API}/platform/marketing/occasions/${o.id}`, { headers }).catch(() => {});
    load();
  };
  const toVerify = rows.filter((r) => r.needs_verification).length;

  return (
    <div className="space-y-4" data-testid="festival-calendar-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Festival calendar</h2>
          <p className="text-xs text-muted-foreground/80">Festivals shown in every salon's Marketing → Calendar, with one-click posters and campaigns. Fixed-date occasions (New Year, Valentine's, Mother's Day…) are built in.</p>
        </div>
        <Button variant="outline" onClick={seed} disabled={busy === 'seed'} data-testid="festival-seed">
          {busy === 'seed' ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}Add festival list
        </Button>
      </div>
      {toVerify > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-none" />
          {toVerify} festival{toVerify > 1 ? 's have' : ' has'} an estimated date. Check each date against your local calendar, correct it if needed, then click <b className="mx-1">Confirm &amp; publish</b>. Salons only see published festivals.
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Festival name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-56 bg-background border-border" />
        <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-44 bg-background border-border" />
        <select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })} className="bg-background border border-border text-foreground text-sm rounded-md px-3 h-10">
          {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button onClick={add} className="bg-primary text-primary-foreground font-bold"><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
      <div className="bg-card/60 border border-border rounded-2xl overflow-hidden">
        {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          : rows.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">No festivals yet. Click <b>Add festival list</b> to start.</div>
          : rows.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-0 flex-wrap" data-testid={`festival-row-${o.id}`}>
              <div className="flex-1 min-w-[160px]">
                <div className="font-bold text-sm text-foreground">{o.name}</div>
                <div className="text-[11px] text-muted-foreground">{o.idea}</div>
              </div>
              <Input type="date" defaultValue={o.date} onBlur={(e) => e.target.value && e.target.value !== o.date && save(o, { date: e.target.value, published: o.published })} className="w-44 bg-background border-border" />
              <select defaultValue={o.theme} onChange={(e) => save(o, { theme: e.target.value })} className="bg-background border border-border text-foreground text-sm rounded-md px-2 h-9">
                {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {o.needs_verification ? (
                <Button size="sm" onClick={() => save(o, { published: true })} disabled={busy === o.id} className="bg-emerald-600 hover:bg-emerald-500 text-white" data-testid={`festival-confirm-${o.id}`}>
                  <Check className="w-3.5 h-3.5 mr-1" />Confirm &amp; publish
                </Button>
              ) : (
                <label className="flex items-center gap-1.5 text-xs text-foreground/80">
                  <input type="checkbox" checked={!!o.published} onChange={(e) => save(o, { published: e.target.checked })} /> Published
                </label>
              )}
              <button type="button" onClick={() => remove(o)} className="p-1.5 rounded hover:bg-rose-500/15 text-rose-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
      </div>
    </div>
  );
}
