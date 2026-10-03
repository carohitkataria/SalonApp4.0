import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_OPTIONS = [
  { value: 'auto', label: 'Auto', hint: 'Compute from times' },
  { value: 'present', label: 'Present' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'absent', label: 'Absent' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'on_leave', label: 'On Leave' },
];

// IST offset — the app is India-only and the backend computes everything in IST.
const IST_OFFSET = '+05:30';
const IST_OFFSET_MINUTES = 330; // +5h30m

// Convert ISO datetime → "HH:MM" in IST (the salon's timezone)
function isoToTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Shift the absolute instant into IST and read its wall-clock hours/minutes.
    const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
    const hh = String(ist.getUTCHours()).padStart(2, '0');
    const mm = String(ist.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

// Combine date "YYYY-MM-DD" + "HH:MM" into an ISO instant in IST.
// Building the string with the offset avoids browser-TZ leakage (the previous
// `new Date().setHours().toISOString()` flow misread UTC browsers as IST).
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return `${dateStr}T${timeStr}:00${IST_OFFSET}`;
}

export default function AttendanceCellDialog({
  open,
  onOpenChange,
  salonId,
  barberId,
  barberName,
  dateStr,
  attendanceRecord,    // raw attendance doc (or null)
  leaveRecord,         // active leave record on this date (or null)
  onSaved,             // () => refresh parent
  token,
  checkInMode = true,  // false → salon uses service completion: no time fields
}) {
  const [loading, setLoading] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [status, setStatus] = useState('auto');
  const [leaveTypeCode, setLeaveTypeCode] = useState('CL');
  const [leaveHalfDay, setLeaveHalfDay] = useState(false);
  const [note, setNote] = useState('');

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  // Reset form whenever dialog opens with new context
  useEffect(() => {
    if (!open) return;
    setCheckInTime(isoToTime(attendanceRecord?.check_in_at));
    setCheckOutTime(isoToTime(attendanceRecord?.check_out_at));
    if (leaveRecord) {
      setStatus('on_leave');
      setLeaveTypeCode(leaveRecord.leave_type_code || 'CL');
      setLeaveHalfDay(!!leaveRecord.half_day);
      setNote(leaveRecord.note || '');
    } else {
      const s = attendanceRecord?.status;
      setStatus(s && ['present', 'half_day', 'absent', 'holiday', 'on_leave'].includes(s) ? s : 'auto');
      setLeaveTypeCode('CL');
      setLeaveHalfDay(false);
      setNote(attendanceRecord?.override_note || '');
    }
  }, [open, attendanceRecord, leaveRecord]);

  // Load leave types when dialog opens
  useEffect(() => {
    if (!open || !salonId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(
          `${API}/salons/${salonId}/leave-types-config`,
          authHeaders
        );
        if (!cancelled) {
          const items = (res.data?.items || []).filter((t) => t.is_active);
          setLeaveTypes(items.length ? items : [
            { code: 'CL', display_name: 'Casual Leave' },
            { code: 'SL', display_name: 'Sick Leave' },
            { code: 'PL', display_name: 'Privilege Leave' },
            { code: 'UL', display_name: 'Unpaid Leave' },
          ]);
        }
      } catch (e) {
        if (!cancelled) {
          setLeaveTypes([
            { code: 'CL', display_name: 'Casual Leave' },
            { code: 'SL', display_name: 'Sick Leave' },
            { code: 'PL', display_name: 'Privilege Leave' },
            { code: 'UL', display_name: 'Unpaid Leave' },
          ]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, salonId, authHeaders]);

  const cancelExistingLeave = useCallback(async () => {
    if (!leaveRecord?.id) return;
    await axios.delete(
      `${API}/salons/${salonId}/leave-records/${leaveRecord.id}`,
      authHeaders
    );
  }, [leaveRecord, salonId, authHeaders]);

  const handleSave = async () => {
    if (!dateStr) return;
    setLoading(true);
    try {
      const ci = checkInTime ? combineDateTime(dateStr, checkInTime) : null;
      const co = checkOutTime ? combineDateTime(dateStr, checkOutTime) : null;

      // --- ON LEAVE branch ---
      if (status === 'on_leave') {
        // If a leave-record already exists, cancel before creating new one
        // (handles leave_type or half_day changes)
        if (leaveRecord) {
          await cancelExistingLeave();
        }
        await axios.post(
          `${API}/salons/${salonId}/leave-records`,
          {
            barber_id: barberId,
            leave_type_code: leaveTypeCode,
            date: dateStr,
            half_day: leaveHalfDay,
            note: note || undefined,
          },
          authHeaders
        );
        toast.success(`Leave (${leaveTypeCode}${leaveHalfDay ? ' · half day' : ''}) saved for ${dateStr}`);
      } else {
        // Switching FROM on_leave → cancel old leave record first
        if (leaveRecord) {
          await cancelExistingLeave();
        }

        // If both times present → use check-edit so backend can auto-compute & store times.
        if (ci || co) {
          const payload = {
            check_in_at: ci || undefined,
            check_out_at: co || undefined,
            note: note || undefined,
          };
          if (status !== 'auto') {
            payload.status = status;
          }
          await axios.put(
            `${API}/salons/${salonId}/staff-attendance/check-edit/${barberId}/${dateStr}`,
            payload,
            authHeaders
          );
        } else if (status !== 'auto') {
          // Manual status only (no times) → use the simpler override endpoint
          await axios.put(
            `${API}/salons/${salonId}/staff-attendance/override/${barberId}/${dateStr}`,
            { status, note: note || undefined },
            authHeaders
          );
        } else {
          // No times, no manual status → clear the override
          try {
            await axios.delete(
              `${API}/salons/${salonId}/staff-attendance/override/${barberId}/${dateStr}`,
              authHeaders
            );
          } catch (e) {
            // ignore missing
          }
        }
        toast.success(`Attendance saved for ${dateStr}`);
      }

      onSaved && onSaved();
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to save attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!dateStr) return;
    if (!window.confirm(`Clear attendance & leave for ${dateStr}?`)) return;
    setLoading(true);
    try {
      if (leaveRecord) await cancelExistingLeave();
      try {
        await axios.delete(
          `${API}/salons/${salonId}/staff-attendance/override/${barberId}/${dateStr}`,
          authHeaders
        );
      } catch (e) {
        // Ignore 404s — nothing to clear is fine
      }
      toast.success('Cleared');
      onSaved && onSaved();
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to clear');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="attendance-cell-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-gold" />
            Edit Attendance · {dateStr}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{barberName}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Time inputs — only when the salon uses check-in / check-out */}
          {checkInMode && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> Check-in
              </Label>
              <Input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                disabled={status === 'on_leave'}
                data-testid="attn-check-in-time"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" /> Check-out
              </Label>
              <Input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                disabled={status === 'on_leave'}
                data-testid="attn-check-out-time"
              />
            </div>
          </div>
          )}

          {/* Status picker */}
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  data-testid={`attn-status-${opt.value}`}
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-all ${
                    status === opt.value
                      ? 'border-gold bg-gold/15 text-foreground'
                      : 'border-border hover:border-gold/40 text-muted-foreground'
                  }`}
                >
                  {opt.label}
                  {opt.hint && status === opt.value && (
                    <div className="text-[10px] opacity-70 mt-0.5">{opt.hint}</div>
                  )}
                </button>
              ))}
            </div>
            {status === 'auto' && (
              <p className="text-[11px] text-muted-foreground">
                {checkInMode
                  ? "Status will be derived from the times above using the salon's check-in rules (late mark & full-day hours)."
                  : 'Status will follow completed services: present if at least one service was completed that day.'}
              </p>
            )}
          </div>

          {/* Leave type picker - only when on_leave */}
          {status === 'on_leave' && (
            <div className="space-y-3 p-3 rounded-md border border-blue-500/30 bg-blue-500/5">
              <div className="space-y-1">
                <Label className="text-xs">Leave Type</Label>
                <Select value={leaveTypeCode} onValueChange={setLeaveTypeCode}>
                  <SelectTrigger data-testid="attn-leave-type-select">
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((t) => (
                      <SelectItem
                        key={t.code}
                        value={t.code}
                        data-testid={`attn-leave-type-${t.code}`}
                      >
                        <span className="font-mono mr-2">{t.code}</span>
                        {t.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={leaveHalfDay}
                  onCheckedChange={(v) => setLeaveHalfDay(!!v)}
                  data-testid="attn-leave-half-day"
                />
                <span>Half day leave</span>
              </label>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Forgot to check out, on-site visit, etc."
              data-testid="attn-note"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={loading}
            className="text-rose-600 hover:bg-rose-500/10 border-rose-500/40"
            data-testid="attn-clear-btn"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Clear
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              data-testid="attn-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="bg-gold text-black hover:bg-gold/90"
              data-testid="attn-save-btn"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
