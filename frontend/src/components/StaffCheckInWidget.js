/**
 * Staff Check-in / Check-out widget (Geo attendance, Mode B).
 *
 * Renders ONLY when:
 *   - the salon uses Check-in / Check-out (any alias, see lib/attendance), AND
 *   - the logged-in user is linked to a staff/barber profile (staffId present).
 *
 * Flow:
 *   - Not checked in  → "Check In" button (uses browser geolocation).
 *   - Checked in      → running timer + "Check Out" button.
 *   - Checked out      → read-only summary for the day.
 *
 * The backend enforces the geo-fence (staff outside the radius are blocked).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { MapPin, LogIn, LogOut, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isCheckInMode } from '@/lib/attendance';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// YYYY-MM-DD in IST (matches the backend's attendance record date).
function istToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatElapsed(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function StaffCheckInWidget({ salonId, staffId, staffName, getAuthHeaders }) {
  const [mode, setMode] = useState(null);            // salon attendance_mode
  const [record, setRecord] = useState(null);        // today's attendance doc
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);       // check-in/out in progress
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef(null);

  const headers = (typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) || {};

  const fetchState = useCallback(async () => {
    if (!salonId || !staffId) {
      setLoading(false);
      return;
    }
    try {
      const month = istToday().slice(0, 7);
      const [salonRes, attnRes] = await Promise.all([
        axios.get(`${API}/salons/${salonId}`).catch(() => ({ data: {} })),
        axios
          .get(`${API}/salons/${salonId}/staff-attendance/month/${month}?barber_id=${staffId}`, { headers })
          .catch(() => ({ data: {} })),
      ]);
      const salon = salonRes.data?.salon || salonRes.data || {};
      setMode(salon.attendance_mode || 'service_completion');

      const today = istToday();
      const barberData = (attnRes.data?.barbers || []).find((b) => b.barber_id === staffId);
      const todayRec = (barberData?.attendance || []).find((r) => r.date === today) || null;
      setRecord(todayRec);
    } catch (e) {
      // silent — widget just won't render
    } finally {
      setLoading(false);
    }
  }, [salonId, staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchState(); }, [fetchState]);

  // Multi-session support (#1c): a staff can check in multiple times per day.
  // The "open session" is the last one whose `co` (check-out) is missing.
  // If no open session exists, the staff CAN check in again — even after a
  // previous check-out today.
  const sessions = Array.isArray(record?.sessions) ? record.sessions : [];
  const openSession = sessions.length ? sessions[sessions.length - 1] : null;
  const hasOpenSession = !!(openSession && openSession.ci && !openSession.co);
  // Legacy fallback: pre-migration docs used check_in_at / check_out_at only.
  const legacyOpen =
    sessions.length === 0 && !!record?.check_in_at && !record?.check_out_at;
  const isCheckedIn = hasOpenSession || legacyOpen;
  // Any completed sessions today mean we're mid-day (post first check-out).
  const hasClosedSessionToday =
    sessions.some((s) => s.ci && s.co) || (!!record?.check_in_at && !!record?.check_out_at && sessions.length === 0);
  useEffect(() => {
    if (isCheckedIn) {
      timerRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }, [isCheckedIn]);

  const getPosition = () =>
    new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation is not supported by this browser.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const doAction = async (kind) => {
    setActing(true);
    try {
      let pos;
      try {
        pos = await getPosition();
      } catch (geoErr) {
        const msg =
          geoErr?.code === 1
            ? 'Location permission denied. Please allow location access to check in.'
            : 'Could not get your location. Please enable GPS/location and try again.';
        toast.error(msg);
        setActing(false);
        return;
      }
      const body = {
        barber_id: staffId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        method: 'self',
      };
      const url = `${API}/salons/${salonId}/staff-attendance/${kind === 'in' ? 'check-in' : 'check-out'}`;
      const res = await axios.post(url, body, { headers });
      setRecord(res.data?.record || null);
      toast.success(kind === 'in' ? 'Checked in successfully' : 'Checked out successfully');
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Action failed. Please try again.');
    } finally {
      setActing(false);
    }
  };

  // Render gating
  if (loading) return null;
  if (!staffId) return null;
  if (!isCheckInMode(mode)) return null;

  const checkedOut = !isCheckedIn && (hasClosedSessionToday || !!record?.check_out_at);

  // Cumulative worked time across ALL sessions today. When a session is open,
  // its elapsed portion counts against `now`.
  const sumClosedMinutes = sessions
    .filter((s) => s.ci && s.co)
    .reduce((acc, s) => {
      const ci = new Date(s.ci).getTime();
      const co = new Date(s.co).getTime();
      return acc + Math.max(0, co - ci);
    }, 0);
  const openElapsed = isCheckedIn && openSession?.ci ? (now - new Date(openSession.ci).getTime()) : 0;
  // Legacy fallback for pre-migration records.
  const legacyElapsed = sessions.length === 0 && record?.check_in_at
    ? (record.check_out_at ? new Date(record.check_out_at).getTime() : now) - new Date(record.check_in_at).getTime()
    : 0;
  const elapsed = sumClosedMinutes + openElapsed + (sessions.length === 0 ? legacyElapsed : 0);

  const fmtTime = (iso) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  // Determine which action button to show:
  //  • no open session → "Check In" (or "Check In Again" if we already worked today)
  //  • open session   → "Check Out"
  const showCheckInButton = !isCheckedIn;
  const isReCheckIn = showCheckInButton && hasClosedSessionToday;

  return (
    <div
      data-testid="staff-checkin-widget"
      className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gold/15 text-gold">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Attendance Check-in{staffName ? ` · ${staffName}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {isCheckedIn
                ? 'You are checked in — remember to check out'
                : hasClosedSessionToday
                ? 'You can check in again — total time will accumulate'
                : 'Tap below to mark your attendance for today'}
            </p>
          </div>
        </div>

        {/* Action area */}
        {showCheckInButton && (
          <Button
            onClick={() => doAction('in')}
            disabled={acting}
            data-testid={isReCheckIn ? 'staff-recheckin-btn' : 'staff-checkin-btn'}
            className="bg-gold text-black hover:bg-gold/90"
          >
            {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
            {isReCheckIn ? 'Check In Again' : 'Check In'}
          </Button>
        )}

        {isCheckedIn && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
              <Clock className="w-4 h-4 text-green-600 animate-pulse" />
              <span
                className="text-sm font-mono font-bold text-green-700 dark:text-green-400 tabular-nums"
                data-testid="staff-checkin-timer"
              >
                {formatElapsed(elapsed)}
              </span>
            </div>
            <Button
              onClick={() => doAction('out')}
              disabled={acting}
              data-testid="staff-checkout-btn"
              variant="outline"
              className="border-red-500/40 text-red-600 hover:bg-red-500/10"
            >
              {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
              Check Out
            </Button>
          </div>
        )}

        {checkedOut && showCheckInButton === false && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-foreground">
              Worked {formatElapsed(elapsed)}
            </span>
          </div>
        )}
      </div>

      {/* Session history — every ci/co pair for today */}
      {(sessions.length > 0 || record?.check_in_at) && (
        <div className="mt-3 border-t border-border pt-2 space-y-1.5">
          {(sessions.length > 0 ? sessions : [{
            ci: record?.check_in_at, co: record?.check_out_at
          }]).map((s, i) => (
            <div key={`${s.ci || i}-${i}`} className="flex items-center gap-4 text-xs text-muted-foreground" data-testid={`staff-session-row-${i}`}>
              <span className="font-mono text-[10px] uppercase text-muted-foreground/70">#{i + 1}</span>
              <span>In: <strong className="text-foreground">{fmtTime(s.ci)}</strong></span>
              <span>Out: <strong className="text-foreground">{fmtTime(s.co)}</strong></span>
              {s.ci && (
                <span className="ml-auto text-[11px]">
                  {s.co
                    ? formatElapsed(new Date(s.co).getTime() - new Date(s.ci).getTime())
                    : (isCheckedIn && i === sessions.length - 1 ? 'active' : '')}
                </span>
              )}
            </div>
          ))}
          {/* Cumulative worked & status */}
          <div className="flex items-center gap-4 text-xs pt-1">
            <span>Total worked: <strong className="text-foreground">{formatElapsed(elapsed)}</strong></span>
            {record?.status && (
              <span className="ml-auto capitalize">
                Status: <strong className="text-foreground">{String(record.status).replace('_', ' ')}</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
