/**
 * Platform Admin — Help Center tab.
 * Manage help videos (upload or link), FAQs and categories, each tagged with
 * the sections (audiences) it shows in and hashtags for search.
 * Only the salon Help drawer reads this today; customer, supplier and
 * homepage help are placeholders that will use the same content later.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Loader2, LifeBuoy, Plus, RefreshCw, Edit3, Trash2, Video, HelpCircle, FolderTree,
  Upload, Link2, Eye, EyeOff, Download, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { HELP_TOPICS, GENERAL_FAQS } from '@/lib/helpContent';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AUDIENCES = [
  { id: 'salon', label: 'Salon', live: true },
  { id: 'customer', label: 'Customer', live: false },
  { id: 'supplier', label: 'Supplier', live: false },
  { id: 'homepage', label: 'Homepage', live: false },
];
const audLabel = (id) => AUDIENCES.find((a) => a.id === id)?.label || id;
const errMsg = (e, fb) => e?.response?.data?.detail || fb;
const fmtMB = (n) => (n ? `${(n / (1024 * 1024)).toFixed(1)} MB` : '');
const tagsToText = (t) => (t || []).map((x) => `#${x}`).join(' ');
const textToTags = (s) => String(s || '').split(/[\s,]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean);

function AudiencePicker({ value, onChange }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {AUDIENCES.map((a) => (
        <button key={a.id} type="button" onClick={() => toggle(a.id)} data-testid={`help-aud-${a.id}`}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${value.includes(a.id)
            ? 'bg-primary/15 border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          {a.label}{!a.live && <span className="ml-1 font-normal opacity-70">(soon)</span>}
        </button>
      ))}
    </div>
  );
}

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>}
  </label>
);

const selectCls = 'w-full bg-background border border-border text-foreground text-sm rounded-md px-3 h-10';
const areaCls = 'w-full bg-background border border-border text-foreground text-sm rounded-md px-3 py-2';

function TaggingFields({ form, set, categories }) {
  return (
    <>
      <Field label="Show in">
        <AudiencePicker value={form.audiences} onChange={(v) => set('audiences', v)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category">
          <select className={selectCls} value={form.category_id || ''} onChange={(e) => set('category_id', e.target.value || null)} data-testid="help-form-category">
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Order" hint="Lower numbers show first.">
          <Input type="number" value={form.order} onChange={(e) => set('order', Number(e.target.value) || 0)} className="bg-background border-border" />
        </Field>
      </div>
      <Field label="Hashtags" hint="Separate with spaces or commas, e.g. #billing #gst #invoice">
        <Input value={form.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="#billing #gst" className="bg-background border-border" data-testid="help-form-tags" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} data-testid="help-form-published" />
        Published (visible in the selected sections)
      </label>
    </>
  );
}

const blankTagged = { audiences: ['salon'], category_id: null, tagsText: '', published: true, order: 0 };
const taggedPayload = (f) => ({ audiences: f.audiences, category_id: f.category_id || null, hashtags: textToTags(f.tagsText), published: f.published, order: f.order });

function VideoForm({ open, onClose, initial, categories, headers, onSaved }) {
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [poster, setPoster] = useState(null);
  const [mode, setMode] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setFile(null); setPoster(null); setPct(0);
    setMode(initial?.video_url && !initial?.video_file_id ? 'link' : 'upload');
    setForm(initial ? {
      title: initial.title || '', description: initial.description || '', video_url: initial.video_url || '',
      audiences: initial.audiences || ['salon'], category_id: initial.category_id || null,
      tagsText: tagsToText(initial.hashtags), published: initial.published !== false, order: initial.order || 0,
    } : { ...blankTagged, title: '', description: '', video_url: '' });
  }, [open, initial]);

  if (!form) return null;
  const save = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.audiences.length) return toast.error('Pick at least one section');
    setBusy(true);
    try {
      const body = { title: form.title, description: form.description, video_url: mode === 'link' ? (form.video_url || null) : null, ...taggedPayload(form) };
      let v = initial?.id
        ? (await axios.put(`${API}/platform/help/videos/${initial.id}`, body, { headers })).data
        : (await axios.post(`${API}/platform/help/videos`, body, { headers })).data;
      if (mode === 'link' && v.video_file_id) {
        v = (await axios.delete(`${API}/platform/help/videos/${v.id}/file`, { headers })).data;
      }
      if (mode === 'upload' && file) {
        const fd = new FormData(); fd.append('file', file);
        v = (await axios.post(`${API}/platform/help/videos/${v.id}/file`, fd, {
          headers, onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)),
        })).data;
      }
      if (poster) {
        const fd = new FormData(); fd.append('file', poster);
        v = (await axios.post(`${API}/platform/help/videos/${v.id}/poster`, fd, { headers })).data;
      }
      toast.success('Video saved');
      onSaved(); onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Could not save the video'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial?.id ? 'Edit help video' : 'Add help video'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} className="bg-background border-border" data-testid="help-video-title" /></Field>
          <Field label="Description"><textarea rows={3} className={areaCls} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Video">
            <div className="flex gap-2 mb-2">
              {[['upload', Upload, 'Upload file'], ['link', Link2, 'Paste a link']].map(([m, Ic, l]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold border ${mode === m ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
                  <Ic className="w-3.5 h-3.5" />{l}
                </button>
              ))}
            </div>
            {mode === 'upload' ? (
              <div className="space-y-1">
                <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="help-video-file" />
                <span className="block text-[11px] text-muted-foreground/70">
                  {initial?.video_filename ? `Current: ${initial.video_filename} ${fmtMB(initial.video_size)} · choose a file to replace it. ` : ''}MP4 recommended, up to 150 MB.
                </span>
                {busy && file && <div className="h-1.5 bg-border rounded"><div className="h-1.5 bg-primary rounded" style={{ width: `${pct}%` }} /></div>}
              </div>
            ) : (
              <Input value={form.video_url} onChange={(e) => set('video_url', e.target.value)} placeholder="https://youtube.com/watch?v=… or https://…/video.mp4" className="bg-background border-border" />
            )}
          </Field>
          <Field label="Poster image (optional)" hint="Shown before the video plays. JPG, PNG or WebP up to 5 MB.">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPoster(e.target.files?.[0] || null)} />
          </Field>
          <TaggingFields form={form} set={set} categories={categories} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-primary text-primary-foreground font-bold" data-testid="help-video-save">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{busy && file ? `Uploading ${pct}%` : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FaqForm({ open, onClose, initial, categories, headers, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (!open) return;
    setForm(initial ? {
      question: initial.question, answer: initial.answer, audiences: initial.audiences || ['salon'],
      category_id: initial.category_id || null, tagsText: tagsToText(initial.hashtags), published: initial.published !== false, order: initial.order || 0,
    } : { ...blankTagged, question: '', answer: '' });
  }, [open, initial]);
  if (!form) return null;
  const save = async () => {
    if (form.question.trim().length < 3 || !form.answer.trim()) return toast.error('Question and answer are required');
    if (!form.audiences.length) return toast.error('Pick at least one section');
    setBusy(true);
    try {
      const body = { question: form.question, answer: form.answer, ...taggedPayload(form) };
      if (initial?.id) await axios.put(`${API}/platform/help/faqs/${initial.id}`, body, { headers });
      else await axios.post(`${API}/platform/help/faqs`, body, { headers });
      toast.success('FAQ saved'); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e, 'Could not save the FAQ')); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial?.id ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="Question"><Input value={form.question} onChange={(e) => set('question', e.target.value)} className="bg-background border-border" data-testid="help-faq-question" /></Field>
          <Field label="Answer"><textarea rows={5} className={areaCls} value={form.answer} onChange={(e) => set('answer', e.target.value)} data-testid="help-faq-answer" /></Field>
          <TaggingFields form={form} set={set} categories={categories} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-primary text-primary-foreground font-bold" data-testid="help-faq-save">Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ open, onClose, initial, headers, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (open) setForm({ name: initial?.name || '', description: initial?.description || '', audiences: initial?.audiences || ['salon'], order: initial?.order || 0 });
  }, [open, initial]);
  if (!form) return null;
  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setBusy(true);
    try {
      if (initial?.id) await axios.put(`${API}/platform/help/categories/${initial.id}`, form, { headers });
      else await axios.post(`${API}/platform/help/categories`, form, { headers });
      toast.success('Category saved'); onSaved(); onClose();
    } catch (e) { toast.error(errMsg(e, 'Could not save the category')); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle>{initial?.id ? 'Edit category' : 'Add category'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Field label="Name"><Input value={form.name} onChange={(e) => set('name', e.target.value)} className="bg-background border-border" data-testid="help-cat-name" /></Field>
          <Field label="Description (optional)"><Input value={form.description} onChange={(e) => set('description', e.target.value)} className="bg-background border-border" /></Field>
          <Field label="Show in"><AudiencePicker value={form.audiences} onChange={(v) => set('audiences', v)} /></Field>
          <Field label="Order"><Input type="number" value={form.order} onChange={(e) => set('order', Number(e.target.value) || 0)} className="bg-background border-border" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="bg-primary text-primary-foreground font-bold" data-testid="help-cat-save">Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const Chips = ({ item, catName }) => (
  <div className="flex flex-wrap gap-1 mt-1">
    {(item.audiences || []).map((a) => <span key={a} className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">{audLabel(a)}</span>)}
    {catName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-background border border-border text-foreground/80">{catName}</span>}
    {(item.hashtags || []).map((t) => <span key={t} className="text-[10px] text-sky-400">#{t}</span>)}
  </div>
);

const IconBtn = ({ title, onClick, danger, children, testid }) => (
  <button type="button" onClick={onClick} title={title} data-testid={testid}
    className={`p-1.5 rounded ${danger ? 'hover:bg-rose-500/15 text-rose-400' : 'hover:bg-primary/15 text-primary'}`}>{children}</button>
);

export default function HelpCenterTab({ headers }) {
  const [data, setData] = useState({ categories: [], videos: [], faqs: [] });
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('videos');
  const [aud, setAud] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null); // {kind, item}
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.get(`${API}/platform/help`, { headers })).data); }
    catch (e) { toast.error(errMsg(e, 'Failed to load help content')); }
    finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const catName = useMemo(() => Object.fromEntries(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const match = useCallback((item, text) => {
    if (aud && !(item.audiences || []).includes(aud)) return false;
    const needle = q.trim().toLowerCase().replace(/^#/, '');
    return !needle || `${text} ${(item.hashtags || []).join(' ')} ${catName[item.category_id] || ''}`.toLowerCase().includes(needle);
  }, [aud, q, catName]);

  const videos = data.videos.filter((v) => match(v, `${v.title} ${v.description || ''}`));
  const faqs = data.faqs.filter((f) => match(f, `${f.question} ${f.answer}`));
  const cats = data.categories.filter((c) => match(c, `${c.name} ${c.description || ''}`));

  const remove = async (kind, item) => {
    const label = kind === 'videos' ? item.title : kind === 'faqs' ? item.question : item.name;
    if (!window.confirm(`Delete “${label}”?${kind === 'categories' ? ' Its videos and FAQs stay, without a category.' : ''}`)) return;
    try { await axios.delete(`${API}/platform/help/${kind}/${item.id}`, { headers }); toast.success('Deleted'); load(); }
    catch (e) { toast.error(errMsg(e, 'Delete failed')); }
  };
  const togglePublish = async (kind, item) => {
    const body = kind === 'videos'
      ? { title: item.title, description: item.description, video_url: item.video_file_id ? null : item.video_url }
      : { question: item.question, answer: item.answer };
    try {
      await axios.put(`${API}/platform/help/${kind}/${item.id}`, {
        ...body, audiences: item.audiences, category_id: item.category_id, hashtags: item.hashtags, order: item.order, published: !item.published,
      }, { headers });
      load();
    } catch (e) { toast.error(errMsg(e, 'Update failed')); }
  };

  // One-click starter content: a category per guide topic, its FAQs, and a
  // draft (unpublished) video entry per topic ready for an upload.
  const importStarter = async () => {
    setImporting(true);
    try {
      const tags = (t) => t.keywords.split(' ').slice(0, 5);
      const res = (await axios.post(`${API}/platform/help/import`, {
        categories: [...HELP_TOPICS.map((t) => ({ name: t.title, description: t.summary })), { name: 'General' }],
        faqs: [
          ...HELP_TOPICS.flatMap((t) => t.faqs.map((f) => ({ question: f.q, answer: f.a, category: t.title, hashtags: tags(t) }))),
          ...GENERAL_FAQS.map((f) => ({ question: f.q, answer: f.a, category: 'General', hashtags: ['support'] })),
        ],
      }, { headers })).data;
      const fresh = (await axios.get(`${API}/platform/help`, { headers })).data;
      const byName = Object.fromEntries(fresh.categories.map((c) => [c.name, c.id]));
      const haveTitles = new Set(fresh.videos.map((v) => v.title.toLowerCase()));
      let vids = 0;
      for (const [i, t] of HELP_TOPICS.entries()) {
        if (haveTitles.has(t.title.toLowerCase())) continue;
        await axios.post(`${API}/platform/help/videos`, {
          title: t.title, description: t.summary, audiences: ['salon'], category_id: byName[t.title] || null,
          hashtags: tags(t), published: false, order: i,
        }, { headers });
        vids += 1;
      }
      toast.success(`Imported ${res.categories_created} categories, ${res.faqs_created} FAQs and ${vids} draft videos`);
      load();
    } catch (e) { toast.error(errMsg(e, 'Import failed')); } finally { setImporting(false); }
  };

  const SECTIONS = [
    { id: 'videos', label: 'Videos', icon: Video, n: data.videos.length },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle, n: data.faqs.length },
    { id: 'categories', label: 'Categories', icon: FolderTree, n: data.categories.length },
  ];
  const empty = !loading && !data.videos.length && !data.faqs.length && !data.categories.length;

  return (
    <div className="space-y-4" data-testid="help-center-tab">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-primary" /> Help Center</h2>
          <p className="text-xs text-muted-foreground/80">Videos, FAQs and categories shown in the Help section. Choose which sections each item appears in.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importStarter} disabled={importing} data-testid="help-import-starter">
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}Import starter content
          </Button>
          <Button onClick={() => setEdit({ kind: section, item: null })} className="bg-primary text-primary-foreground font-bold" data-testid="help-add-btn">
            <Plus className="w-4 h-4 mr-1" /> Add {section === 'videos' ? 'video' : section === 'faqs' ? 'FAQ' : 'category'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
        <b className="text-foreground">Live in:</b> Salon app (Help icon on the right ribbon).{' '}
        <b className="text-foreground">Coming soon:</b> Customer, Supplier and Homepage help — content tagged for them is saved now and appears there once those pages launch.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)} data-testid={`help-section-${s.id}`}
              className={`px-3 h-10 text-xs font-bold flex items-center gap-1.5 ${section === s.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <s.icon className="w-3.5 h-3.5" />{s.label}<span className="opacity-60">{s.n}</span>
            </button>
          ))}
        </div>
        <select value={aud} onChange={(e) => setAud(e.target.value)} className="bg-background border border-border text-foreground text-sm rounded-md px-3 h-10" data-testid="help-filter-audience">
          <option value="">All sections</option>
          {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}{a.live ? '' : ' (soon)'}</option>)}
        </select>
        <Input placeholder="Search title, text, category or #hashtag…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] bg-background border-border text-foreground" />
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>

      <div className="bg-card/60 border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : empty ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <LifeBuoy className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            No help content yet. Click <b>Import starter content</b> to add the standard categories, FAQs and draft video slots, then upload the videos.
          </div>
        ) : section === 'videos' ? (
          videos.length ? videos.map((v) => (
            <div key={v.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0" data-testid={`help-video-row-${v.id}`}>
              <div className="w-28 h-[70px] rounded-lg bg-background border border-border overflow-hidden flex-none grid place-items-center">
                {v.poster_src ? <img src={`${BACKEND_URL}${v.poster_src}`} alt="" className="w-full h-full object-cover" />
                  : <Video className={`w-6 h-6 ${v.video_src ? 'text-primary' : 'text-muted-foreground/40'}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground text-sm flex items-center gap-2 flex-wrap">
                  {v.title}
                  {!v.published && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-500/15 text-muted-foreground">Draft</span>}
                  {!v.video_src && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">No video yet</span>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {v.video_file_id ? `${v.video_filename || 'Uploaded'} ${fmtMB(v.video_size)}` : v.video_url || 'Upload a file or paste a link'} · {v.views || 0} plays
                </div>
                <Chips item={v} catName={catName[v.category_id]} />
              </div>
              <div className="flex gap-1">
                <IconBtn title={v.published ? 'Unpublish' : 'Publish'} onClick={() => togglePublish('videos', v)}>{v.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</IconBtn>
                <IconBtn title="Edit / upload" onClick={() => setEdit({ kind: 'videos', item: v })} testid={`help-video-edit-${v.id}`}><Edit3 className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => remove('videos', v)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
              </div>
            </div>
          )) : <div className="py-12 text-center text-sm text-muted-foreground">No videos match.</div>
        ) : section === 'faqs' ? (
          faqs.length ? faqs.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0">
              <HelpCircle className="w-4 h-4 text-primary mt-0.5 flex-none" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground text-sm">{f.question}
                  {!f.published && <span className="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-500/15 text-muted-foreground">Draft</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.answer}</div>
                <Chips item={f} catName={catName[f.category_id]} />
              </div>
              <div className="flex gap-1">
                <IconBtn title={f.published ? 'Unpublish' : 'Publish'} onClick={() => togglePublish('faqs', f)}>{f.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</IconBtn>
                <IconBtn title="Edit" onClick={() => setEdit({ kind: 'faqs', item: f })}><Edit3 className="w-3.5 h-3.5" /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => remove('faqs', f)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
              </div>
            </div>
          )) : <div className="py-12 text-center text-sm text-muted-foreground">No FAQs match.</div>
        ) : (
          cats.length ? cats.map((c) => {
            const nv = data.videos.filter((v) => v.category_id === c.id).length;
            const nf = data.faqs.filter((f) => f.category_id === c.id).length;
            return (
              <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0">
                <FolderTree className="w-4 h-4 text-primary mt-0.5 flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-sm">{c.name} <span className="text-[11px] font-normal text-muted-foreground">· {nv} videos · {nf} FAQs</span></div>
                  {c.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.description}</div>}
                  <Chips item={c} />
                </div>
                <div className="flex gap-1">
                  <IconBtn title="Edit" onClick={() => setEdit({ kind: 'categories', item: c })}><Edit3 className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Delete" danger onClick={() => remove('categories', c)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                </div>
              </div>
            );
          }) : <div className="py-12 text-center text-sm text-muted-foreground">No categories match.</div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1"><Hash className="w-3 h-3" />Hashtags and categories power the search in the Help section.</p>

      <VideoForm open={edit?.kind === 'videos'} initial={edit?.item} categories={data.categories} headers={headers} onClose={() => setEdit(null)} onSaved={load} />
      <FaqForm open={edit?.kind === 'faqs'} initial={edit?.item} categories={data.categories} headers={headers} onClose={() => setEdit(null)} onSaved={load} />
      <CategoryForm open={edit?.kind === 'categories'} initial={edit?.item} headers={headers} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}
