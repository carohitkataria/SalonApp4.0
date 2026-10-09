/**
 * Shared attendance helpers.
 *
 * The salon picks ONE attendance method (Settings → Staff & Attendance):
 *   - 'service_completion' — staff are present once they complete a service.
 *   - 'geo_checkin'        — staff check in / check out.
 * Older screens saved the check-in method as 'checkinout'; treat every alias
 * the same so the UI never shows check-in controls in service mode (or hides
 * them in check-in mode).
 */
export const SERVICE_MODE = 'service_completion';
export const CHECKIN_MODE = 'geo_checkin';

const CHECKIN_ALIASES = ['geo_checkin', 'checkinout', 'check_in_out', 'checkin', 'geo'];

export const normalizeAttendanceMode = (mode) =>
  (CHECKIN_ALIASES.includes(String(mode || '').toLowerCase()) ? CHECKIN_MODE : SERVICE_MODE);

export const isCheckInMode = (mode) => normalizeAttendanceMode(mode) === CHECKIN_MODE;

export const attendanceModeLabel = (mode) =>
  (isCheckInMode(mode) ? 'Check-in / Check-out' : 'Service completion');

/** Today's date (YYYY-MM-DD) in IST — the day attendance records are keyed by. */
export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** ISO timestamp → "HH:MM" wall-clock time in IST ('' when empty / invalid). */
export const isoToIstHHMM = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
};

/** ISO timestamp → "10:05 am" in IST for display. */
export const fmtIstClock = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
};

export const fmtMinutes = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

export const STATUS_META = {
  present:  { lb: 'P',  full: 'Present',  bg: '#E4F6ED', fg: '#1F8F52' },
  half_day: { lb: 'HD', full: 'Half day', bg: '#F1EEFF', fg: '#6C4FE0' },
  absent:   { lb: 'A',  full: 'Absent',   bg: '#FCE4EC', fg: '#C33C5F' },
  holiday:  { lb: 'H',  full: 'Holiday',  bg: '#F1F2F6', fg: '#7C8092' },
  on_leave: { lb: 'L',  full: 'On leave', bg: '#FFF3DC', fg: '#B87A0A' },
};

/** Fired after any attendance change so every open surface refreshes. */
export const ATTENDANCE_CHANGED_EVENT = 'attendance-changed';
export const notifyAttendanceChanged = () => {
  try { window.dispatchEvent(new Event(ATTENDANCE_CHANGED_EVENT)); } catch (_) { /* noop */ }
};

/** Browser location for a staff check-in (resolves null when unavailable). */
export const getBrowserLocation = () => new Promise((resolve, reject) => {
  if (!('geolocation' in navigator)) {
    reject(new Error('This browser cannot share your location.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    (err) => reject(new Error(err?.code === 1
      ? 'Location permission denied. Allow location access to check in.'
      : 'Could not get your location. Please try again.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});
