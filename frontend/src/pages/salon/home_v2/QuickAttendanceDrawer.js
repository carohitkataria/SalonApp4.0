/**
 * QuickAttendanceDrawer.js — "Mark today's attendance" drawer.
 *
 * Opened from the right-side ribbon (any page) and from the Staff page. It
 * loads the chosen day's REAL attendance from /staff-attendance/day (the same
 * data the Home card, Staff calendar and Reports read), lets the admin change
 * it, and saves only the rows that changed via /attendance/mark.
 *
 * The drawer follows the salon's attendance method:
 *   - Service completion → status per staff (P / HD / A / H / L). Staff who
 *     completed a service are already Present.
 *   - Check-in / check-out → in / out times per staff, or a status
 *     (Absent / Holiday / Leave / Half day) instead of times.
 *
 * Rendered via a React portal to document.body so it stacks above the ribbon.
 */
import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { STAFF_V3_CSS } from '../redesign/StaffV3Styles';
import {
  isCheckInMode, istToday, isoToIstHHMM, fmtIstClock, STATUS_META,
  attendanceModeLabel, notifyAttendanceChanged,
} from '@/lib/attendance';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const AV_COLORS = ['#C6389E', '#12A594', '#3E93E8', '#E8952B', '#8A5CD1', '#2FA96A'];
const colorFor = (s = '') => AV_COLORS[(String(s || '?').charCodeAt(0) || 0) % AV_COLORS.length];
const initial = (s = '') => (s || 'S').trim().charAt(0).toUpperCase();

const formatApiError = (err, fallback = 'Something went wrong') => {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || '').filter(Boolean).join(', ') || fallback;
  return err?.message || fallback;
};

const ATT_CYCLE = ['present', 'half_day', 'absent', 'holiday', 'on_leave'];
// Check-in mode: "times" means the in / out times decide the status.
const CI_CHOICES = [
  { v: 'times', label: 'Times' },
  { v: 'half_day', label: 'Half day' },
  { v: 'absent', label: 'Absent' },
  { v: 'holiday', label: 'Holiday' },
  { v: 'on_leave', label: 'Leave' },
];

function useStaffV3Styles() {
  useEffect(() => {
    const id = 'staff-v3-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = STAFF_V3_CSS;
    document.head.appendChild(el);
  }, []);
}

export default function QuickAttendanceDrawer({ open, onClose, salonId, getAuthHeaders }) {
  useStaffV3Styles();

  const [mode, setMode] = useState('service_completion');
  const [rows, setRows] = useState([]);         // server rows for `date`
  const [edit, setEdit] = useState({});         // { barber_id: {status, check_in, check_out} }
  const [base, setBase] = useState({});         // loaded snapshot, to send only changes
  const [selected, setSelected] = useState({}); // { barber_id: bool } for "Mark selected"
  const [date, setDate] = useState(istToday());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const authHeaders = useCallback(() => {
    try { return (getAuthHeaders && getAuthHeaders()) || {}; } catch (_) { return {}; }
  }, [getAuthHeaders]);

  const checkIn = isCheckInMode(mode);

  // Reset to today whenever the drawer is opened.
  useEffect(() => { if (open) setDate(istToday()); }, [open]);

  // Load the selected day's real attendance.
  useEffect(() => {
    if (!open || !salonId || !date) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonId}/staff-attendance/day`,
          { params: { date }, headers: authHeaders() });
        if (cancelled) return;
        const m = res.data?.mode || 'service_completion';
        const list = res.data?.rows || [];
        const snap = {};
        list.forEach((r) => {
          const ci = isCheckInMode(m);
          const timed = !!r.check_in_at;
          let status = r.status || '';
          if (ci) {
            if (timed && !(r.manual && ['absent', 'holiday', 'on_leave'].includes(r.status))) {
              status = r.manual && r.status === 'half_day' ? 'half_day' : 'times';
            } else if (!['absent', 'holiday', 'on_leave', 'half_day'].includes(status)) {
              status = 'times';
            }
          }
          snap[r.barber_id] = {
            status,
            check_in: isoToIstHHMM(r.check_in_at),
            check_out: isoToIstHHMM(r.check_out_at),
          };
        });
        setMode(m);
        setRows(list);
        setBase(snap);
        setEdit(snap);
        setSelected({});
      } catch (err) {
        if (!cancelled) toast.error(formatApiError(err, 'Could not load attendance'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, salonId, date, authHeaders]);

  const setFor = (id, patch) => setEdit((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  const selCount = rows.filter((r) => selected[r.barber_id]).length;
  const allSelected = rows.length > 0 && selCount === rows.length;
  const toggleSel = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleSelAll = () => { const m = {}; rows.forEach((r) => { m[r.barber_id] = !allSelected; }); setSelected(m); };
  const markSelected = (st) => {
    const targets = selCount ? rows.filter((r) => selected[r.barber_id]) : rows;
    setEdit((prev) => {
      const m = { ...prev };
      targets.forEach((r) => { m[r.barber_id] = { ...(m[r.barber_id] || {}), status: st }; });
      return m;
    });
  };

  const changedRows = rows.filter((r) => {
    const a = edit[r.barber_id] || {};
    const b = base[r.barber_id] || {};
    if (!checkIn) return (a.status || '') !== (b.status || '');
    if (a.status !== b.status) return true;
    return a.status !== 'absent' && a.status !== 'holiday' && a.status !== 'on_leave'
      && ((a.check_in || '') !== (b.check_in || '') || (a.check_out || '') !== (b.check_out || ''));
  });

  const save = async () => {
    if (changedRows.length === 0) { toast.success('No changes to save'); onClose?.(); return; }
    const payload = [];
    const clears = [];
    for (const r of changedRows) {
      const e = edit[r.barber_id] || {};
      if (!checkIn) {
        if (e.status) payload.push({ barber_id: r.barber_id, status: e.status });
        else clears.push(r.barber_id);
        continue;
      }
      if (e.status === 'times' || e.status === 'half_day') {
        if (!e.check_in) {
          if (e.status === 'half_day') { payload.push({ barber_id: r.barber_id, status: 'half_day' }); continue; }
          toast.error(`Enter a check-in time for ${r.name}`);
          return;
        }
        if (e.check_out && e.check_out <= e.check_in) { toast.error(`${r.name}: check-out must be after check-in`); return; }
        payload.push({ barber_id: r.barber_id, check_in: e.check_in, check_out: e.check_out || null,
          status: e.status === 'half_day' ? 'half_day' : null });
      } else {
        payload.push({ barber_id: r.barber_id, status: e.status });
      }
    }
    setBusy(true);
    try {
      let saved = 0;
      const skipped = [];
      if (payload.length) {
        const res = await axios.post(`${API}/salons/${salonId}/attendance/mark`, { rows: payload, date },
          { headers: authHeaders() });
        saved += res.data?.count ?? 0;
        (res.data?.skipped || []).forEach((s) => skipped.push(s));
      }
      for (const id of clears) {
        try {
          await axios.delete(`${API}/salons/${salonId}/staff-attendance/override/${id}/${date}`, { headers: authHeaders() });
          saved += 1;
        } catch (err) { skipped.push({ barber_id: id, reason: formatApiError(err) }); }
      }
      const whenLabel = date === istToday() ? 'today' : new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      if (saved) toast.success(`Attendance saved for ${saved} staff (${whenLabel})`);
      if (skipped.length) {
        const nameOf = (id) => rows.find((r) => r.barber_id === id)?.name || 'Staff';
        toast.error(`Not saved — ${skipped.map((s) => `${nameOf(s.barber_id)}: ${s.reason}`).join('; ')}`);
      }
      notifyAttendanceChanged();
      if (!skipped.length) onClose?.();
    } catch (err) {
      toast.error(formatApiError(err, 'Could not save attendance'));
    } finally { setBusy(false); }
  };

  const statusChoices = checkIn ? CI_CHOICES.map((c) => c.v) : ATT_CYCLE;
  const choiceLabel = (st) => (checkIn ? CI_CHOICES.find((c) => c.v === st)?.label : STATUS_META[st]?.full);
  const choiceMeta = (st) => STATUS_META[st] || { bg: '#EEF3FF', fg: '#3E6BD6' };

  const body = (
    <div className="shv2">
      <div className={`staffv3-ov ${open ? 'open' : ''}`} onClick={() => !busy && onClose?.()} />
      <aside className={`staffv3-drawer wide ${open ? 'open' : ''}`} data-testid="quick-attendance-drawer">
        <div className="dh">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
            </div>
            <div>
              <h3>{date === istToday() ? "Mark today's attendance" : 'Back-fill attendance'}</h3>
              <p>{new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · {attendanceModeLabel(mode)}</p>
            </div>
          </div>
          <button className="close" onClick={() => onClose?.()} disabled={busy}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="db-scroll" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }} data-testid="quick-attendance-date-row">
            <span style={{ fontSize: 11.5, color: '#8A8EA0', fontWeight: 700 }}>Attendance date</span>
            <input type="date" value={date} max={istToday()}
              onChange={(e) => { const v = e.target.value; if (v && v <= istToday()) setDate(v); }}
              data-testid="quick-attendance-date"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E1DDEE', fontSize: 13, fontWeight: 600, color: '#2B2B3A' }} />
            {date !== istToday() && (
              <button type="button" onClick={() => setDate(istToday())}
                style={{ fontSize: 11, fontWeight: 800, border: '1px solid #E1DDEE', background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#7C5CFC' }}>
                Back to today
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#6B6F80', background: '#F7F6FD', border: '1px solid #ECE9F9', borderRadius: 10, padding: '8px 10px', marginBottom: 12 }} data-testid="quick-attendance-mode-note">
            {checkIn
              ? 'Times are in IST. Staff who checked in themselves already show their times — change them only to correct a mistake.'
              : 'Staff who completed a service are already Present. Set a status only to record an absence, holiday or leave, or to correct the day.'}
          </div>
          {rows.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }} data-testid="mark-selected-bar">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: '#5A5F72', cursor: 'pointer' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelAll} data-testid="select-all-staff" />
                Select all
              </label>
              <span style={{ fontSize: 11.5, color: '#8A8EA0', fontWeight: 700 }}>{selCount ? `Mark selected (${selCount}):` : 'Mark everyone:'}</span>
              {statusChoices.map((st) => (
                <button key={st} onClick={() => markSelected(st)} data-testid={`mark-selected-${st}`}
                  style={{ fontSize: 11, fontWeight: 800, border: 'none', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', background: choiceMeta(st).bg, color: choiceMeta(st).fg }}>
                  {choiceLabel(st)}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <div style={{ fontSize: 12.5, color: '#8A8EA0', padding: 12 }}>Loading attendance…</div>}
            {!loading && rows.length === 0 && <div style={{ fontSize: 12.5, color: '#8A8EA0', padding: 12 }}>No active staff to mark.</div>}
            {!loading && rows.map((r) => {
              const e = edit[r.barber_id] || {};
              const changed = changedRows.includes(r);
              const sub = checkIn
                ? (r.is_checked_in ? `Checked in since ${fmtIstClock(r.check_in_at)}` : (r.sessions?.length ? `${r.sessions.length} session${r.sessions.length > 1 ? 's' : ''}` : 'Not checked in'))
                : (r.services_completed ? `${r.services_completed} service${r.services_completed > 1 ? 's' : ''} completed` : 'No services yet');
              return (
                <div key={r.barber_id} data-testid={`ribbon-staff-${r.barber_id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', border: `1px solid ${changed ? '#C9BCF5' : (selected[r.barber_id] ? '#D8CFF7' : '#ECECF3')}`, borderRadius: 12, padding: '10px 12px', background: selected[r.barber_id] ? '#FBFAFF' : '#fff' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <input type="checkbox" checked={!!selected[r.barber_id]} onChange={() => toggleSel(r.barber_id)}
                      data-testid={`select-staff-${r.barber_id}`} style={{ flex: 'none', cursor: 'pointer' }} />
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: colorFor(r.name), color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{initial(r.name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#23252F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#9298AA', fontWeight: 600 }}>{sub}</span>
                    </span>
                  </span>
                  {checkIn ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                      {(e.status === 'times' || e.status === 'half_day') ? (
                        <>
                          <input type="time" value={e.check_in || ''} onChange={(ev) => setFor(r.barber_id, { check_in: ev.target.value })}
                            data-testid={`ribbon-in-${r.barber_id}`}
                            style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 7px', fontSize: 12, fontWeight: 700 }} title="Check-in (IST)" />
                          <span style={{ color: '#9298AA', fontSize: 11 }}>→</span>
                          <input type="time" value={e.check_out || ''} onChange={(ev) => setFor(r.barber_id, { check_out: ev.target.value })}
                            data-testid={`ribbon-out-${r.barber_id}`}
                            style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 7px', fontSize: 12, fontWeight: 700 }} title="Check-out (IST)" />
                        </>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 7, padding: '4px 10px', background: choiceMeta(e.status).bg, color: choiceMeta(e.status).fg }}>{choiceLabel(e.status)}</span>
                      )}
                      <select value={e.status || 'times'} onChange={(ev) => setFor(r.barber_id, { status: ev.target.value })}
                        data-testid={`ribbon-choice-${r.barber_id}`}
                        style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: '5px 6px', fontSize: 11, fontWeight: 700 }} title="Record as">
                        {CI_CHOICES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                      </select>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 5, flex: 'none' }}>
                      {ATT_CYCLE.map((code) => {
                        const m = STATUS_META[code]; const active = e.status === code;
                        return (
                          <button key={code} onClick={() => setFor(r.barber_id, { status: active && (r.manual || !base[r.barber_id]?.status) ? '' : code })} title={m.full}
                            data-testid={`ribbon-status-${r.barber_id}-${code}`}
                            style={{ width: 34, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 900, cursor: 'pointer',
                              border: active ? `2px solid ${m.fg}` : '1px solid #ECECF3',
                              background: active ? m.bg : '#FBFBFD', color: active ? m.fg : '#9298AA' }}>
                            {m.lb}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="df" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '14px 20px', borderTop: '1px solid #F0F0F5' }}>
          <span style={{ fontSize: 12, color: '#8A7F90', marginRight: 'auto' }} data-testid="quick-attendance-changes">
            {changedRows.length ? `${changedRows.length} change${changedRows.length > 1 ? 's' : ''}` : 'No changes'}
          </span>
          <button className="btn-ghost" onClick={() => onClose?.()} disabled={busy} style={{ padding: '9px 16px' }}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy || loading || changedRows.length === 0} data-testid="quick-attendance-save"
            style={{ padding: '9px 22px', background: '#2FA96A', border: 'none' }}>{busy ? 'Saving…' : 'Save attendance'}</button>
        </div>
      </aside>
    </div>
  );

  return ReactDOM.createPortal(body, document.body);
}
