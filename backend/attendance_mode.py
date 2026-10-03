"""
Module 4 — Attendance Criteria Selection (Mode A / Mode B) + Geo-Check-in.

Two mutually exclusive attendance modes per salon:
  • "service_completion" (Mode A — existing behaviour, kept verbatim in
    `server.calculate_barber_attendance_for_date`).
  • "geo_checkin" (Mode B — geo-fenced check-in / check-out, this module).

Switching modes is non-destructive:
  • Both Mode A and Mode B raw fields live on the same `attendance` doc.
  • `attendance_mode_history` on the salon records every switch.
  • Each attendance day is stamped with `computed_under_mode` so historical
    days keep the status they were computed under — switching modes does
    NOT silently rewrite last month's attendance.

This file owns:
  • PUT  /api/salons/{salon_id}/attendance-mode
  • POST /api/salons/{salon_id}/staff-attendance/check-in
  • POST /api/salons/{salon_id}/staff-attendance/check-out
  • PUT  /api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}
  • Helpers consumed by server.py:
       - resolve_mode_for_date(salon, date_str)
       - compute_mode_b_status(salon, barber_id, date_str, attendance_doc)
       - is_attendance_locked(db, salon_id, barber_id, date_str)
       - haversine_meters(lat1, lng1, lat2, lng2)
       - default_geo_settings() / current_ist_date()
       - auto_close_open_checkins_job(db)
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

# Module globals injected by init_attendance_mode().
_db = None
_get_current_salon_user = None
_get_current_salon_admin = None
_has_module_permission = None

IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_GEO_SETTINGS = {
    "check_in_radius_meters": 50,
    # New unified threshold fields (preferred).
    "late_mark_threshold_min": 15,       # mins after salon opening_time before "late"
    "required_hours_per_day": 8.0,       # working hours required to count as full day
    "auto_absent_cutoff_hour": 23,       # 0-23 IST; open check-ins auto-closed after this
    "allow_admin_override": True,
    # Legacy fields (kept for backward-compat with existing salon docs).
    "max_check_in_time": "10:30",
    "min_daily_minutes": 480,
    "auto_close_at": "23:59",
}


# Map of weekday-index → operational_hours sub-doc key.
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def _opening_time_for_date(salon: dict, date_str: str) -> str:
    """Return the opening_time (HH:MM) configured for the given date.
    Falls back to "09:00" if operational_hours not set."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        day_key = _WEEKDAYS[d.weekday()]
        hours = (salon.get("operational_hours") or {}).get(day_key) or {}
        return hours.get("opening_time") or "09:00"
    except Exception:
        return "09:00"


# ============================================================
# Helpers (also imported by server.py for salary / attendance refactor)
# ============================================================

def current_ist_date() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")


def current_ist_iso() -> str:
    return datetime.now(IST).isoformat()


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def default_geo_settings() -> dict:
    return DEFAULT_GEO_SETTINGS.copy()


SERVICE_MODE = "service_completion"
CHECKIN_MODE = "geo_checkin"
# Older UIs saved the check-in method under other names; treat them all as
# check-in / check-out so a salon never silently falls back to service mode.
_CHECKIN_ALIASES = {"geo_checkin", "checkinout", "check_in_out", "checkin", "geo"}


def normalize_mode(mode: Optional[str]) -> str:
    """Map any stored attendance-method value to SERVICE_MODE or CHECKIN_MODE."""
    return CHECKIN_MODE if (mode or "").strip().lower() in _CHECKIN_ALIASES else SERVICE_MODE


# Settings → Staff & Attendance stores these rule fields on the salon doc;
# the older Staff Settings page stores the same rules inside `geo_settings`.
# Saving either page writes both places (see mirror_rule_fields) so the two
# pages, the engine and the UI never disagree.
RULE_FIELD_TO_GEO = {
    "grace_period_min": "late_mark_threshold_min",
    "min_hours_full_day": "required_hours_per_day",
}


def mirror_rule_fields(update: dict, salon: dict) -> dict:
    """Return extra `$set` fields that keep top-level rule fields and
    `geo_settings` in step after `update` is applied to `salon`."""
    extra: dict[str, Any] = {}
    geo = dict(update.get("geo_settings") or salon.get("geo_settings") or DEFAULT_GEO_SETTINGS)
    geo_changed = False
    for top_key, geo_key in RULE_FIELD_TO_GEO.items():
        if update.get(top_key) is not None:
            geo[geo_key] = update[top_key]
            geo_changed = True
        elif "geo_settings" in update and geo.get(geo_key) is not None:
            extra[top_key] = geo[geo_key]
    if geo_changed:
        extra["geo_settings"] = geo
    return extra


def effective_rules(salon: dict) -> dict:
    """The check-in / check-out rules the engine actually applies."""
    geo = salon.get("geo_settings") or {}

    def _pick(top_key: str, geo_key: str, default):
        for v in (salon.get(top_key), geo.get(geo_key)):
            if v is not None and v != "":
                return v
        return default

    return {
        "shift_start": salon.get("shift_start") or None,
        "late_after_min": int(_pick("grace_period_min", "late_mark_threshold_min", 15)),
        "full_day_minutes": int(float(_pick("min_hours_full_day", "required_hours_per_day", 8)) * 60),
        "radius_m": int(geo.get("check_in_radius_meters") or DEFAULT_GEO_SETTINGS["check_in_radius_meters"]),
        "allow_self_checkin": salon.get("allow_self_checkin", True) is not False,
        # Unset → enforced (the original behaviour of the check-in endpoint).
        "geofence_required": salon.get("geofence_required", True) is not False,
        "auto_checkout": salon.get("auto_checkout", True) is not False,
        "auto_checkout_time": salon.get("auto_checkout_time") or "21:00",
    }


def resolve_mode_for_date(salon: dict, date_str: str) -> str:
    """Look up which mode was active on the given date.

    The salon's `attendance_mode_history` is a list of
        {mode, changed_by, changed_at, effective_from_date}
    entries (newest at the end, but we sort defensively).  We pick the
    latest entry whose `effective_from_date <= date_str`.  If no history
    exists, we fall back to the current `attendance_mode` (or
    "service_completion" by default — preserves legacy behaviour).
    """
    # Today (and later) always follows the salon's current setting, even if the
    # history list is stale (older settings screens changed the mode without
    # appending a history entry).
    if date_str >= current_ist_date():
        return normalize_mode(salon.get("attendance_mode"))
    hist = salon.get("attendance_mode_history") or []
    hist_sorted = sorted(
        [h for h in hist if h.get("effective_from_date")],
        key=lambda h: h["effective_from_date"],
    )
    active = None
    for entry in hist_sorted:
        if entry["effective_from_date"] <= date_str:
            active = entry.get("mode")
    if active:
        return normalize_mode(active)
    if hist_sorted:
        # Before the first recorded switch the salon was on the original
        # default, service completion.
        return SERVICE_MODE
    return normalize_mode(salon.get("attendance_mode"))


async def _get_branch_center(salon: dict, barber: dict) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Return (lat, lng, source) for the geo-fence centre of this barber's
    branch.  Falls back to the salon's own lat/lng if no branch is set or
    the branch has no coordinates.  `source` is a human-readable label
    used in 409 errors."""
    branch_id = barber.get("branch_id")
    if branch_id and _db is not None:
        branch = await _db.branches.find_one({"id": branch_id}, {"_id": 0})
        if branch and branch.get("latitude") is not None and branch.get("longitude") is not None:
            return float(branch["latitude"]), float(branch["longitude"]), f"branch:{branch_id}"
    # Fallback: main salon coordinates.
    if salon.get("latitude") is not None and salon.get("longitude") is not None:
        return float(salon["latitude"]), float(salon["longitude"]), "salon"
    return None, None, None


def _parse_hhmm_to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def compute_mode_b_status(salon: dict, attendance_doc: dict, *, day_has_passed: bool, on_leave: bool) -> dict:
    """Compute the {status, half_day_reason, total_minutes} for Mode B
    from the raw check-in/out fields already present on `attendance_doc`.

    Inputs:
      • salon              — salon doc (for geo_settings + operational_hours).
      • attendance_doc     — raw doc with check_in_at / check_out_at /
                             check_in_*, check_out_* (may be partial).
      • day_has_passed     — True if the date_str is strictly before today IST.
      • on_leave           — True if the barber has an active leave record
                             on that date (leave overrides everything).

    Returns: {status, half_day_reason, total_minutes}.
    """
    if on_leave:
        return {"status": "absent", "half_day_reason": None, "total_minutes": 0}

    geo = (salon.get("geo_settings") or {})
    rules = effective_rules(salon)
    has_new_late_rule = salon.get("grace_period_min") is not None or geo.get("late_mark_threshold_min") is not None

    # --- Late-mark cutoff (minutes-into-day in IST) ---
    # Grace minutes after the shift start (Settings → Staff & Attendance) or,
    # when no shift start is set, after the day's opening_time.  Salons that
    # only have the legacy max_check_in_time HH:MM keep using it.
    if has_new_late_rule or rules["shift_start"]:
        base = rules["shift_start"] or _opening_time_for_date(salon, attendance_doc.get("date") or "")
        try:
            base_min = _parse_hhmm_to_minutes(base)
        except Exception:
            base_min = _parse_hhmm_to_minutes("09:00")
        max_in_min = base_min + rules["late_after_min"]
    else:
        max_in_min = _parse_hhmm_to_minutes(
            geo.get("max_check_in_time") or DEFAULT_GEO_SETTINGS["max_check_in_time"]
        )

    # --- Minimum daily minutes ---
    if salon.get("min_hours_full_day") is not None or geo.get("required_hours_per_day") is not None:
        min_day_minutes = rules["full_day_minutes"]
    else:
        min_day_minutes = int(geo.get("min_daily_minutes") or DEFAULT_GEO_SETTINGS["min_daily_minutes"])

    # --- Sessions-aware total minutes (multi check-in/out per day) ---
    # If `sessions` array is present, sum durations across ALL closed sessions
    # plus any currently-open one (up to "now" for in-progress days).
    # Falls back to legacy single check_in_at / check_out_at pair.
    ci = attendance_doc.get("check_in_at")
    co = attendance_doc.get("check_out_at")
    sessions = attendance_doc.get("sessions") or []

    def _iso_to_dt(iso_str):
        try:
            dt = datetime.fromisoformat(iso_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    if not ci and not sessions:
        # No check-in at all.
        if day_has_passed:
            return {"status": "absent", "half_day_reason": None, "total_minutes": 0}
        # Same day, no check-in yet → undetermined; we still record "absent"
        # so the calendar can render a red cell; it'll flip on check-in.
        return {"status": "absent", "half_day_reason": None, "total_minutes": 0}

    # Late check-in test — use the FIRST check-in (either sessions[0].ci or
    # legacy check_in_at).
    first_ci = ci
    if sessions:
        first_ci = sessions[0].get("ci") or ci
    try:
        ci_dt = datetime.fromisoformat(first_ci)
        if ci_dt.tzinfo is None:
            ci_dt = ci_dt.replace(tzinfo=timezone.utc)
        ci_ist = ci_dt.astimezone(IST)
        ci_minutes_into_day = ci_ist.hour * 60 + ci_ist.minute
    except Exception:
        ci_minutes_into_day = max_in_min  # benign default → not "late"

    # Compute total_minutes across all sessions (or legacy pair).
    def _sum_session_minutes(day_passed):
        total = 0
        for s in sessions:
            s_ci = _iso_to_dt(s.get("ci"))
            if not s_ci:
                continue
            s_co = _iso_to_dt(s.get("co")) or (
                None if day_passed else datetime.now(timezone.utc)
            )
            if not s_co:
                continue
            total += max(0, int((s_co - s_ci).total_seconds() // 60))
        return total

    # If day still in progress AND no check-out logged AND no closed sessions
    # → pending status.
    day_over = day_has_passed
    has_open_session = any((s.get("ci") and not s.get("co")) for s in sessions)
    has_closed_session = any((s.get("ci") and s.get("co")) for s in sessions)

    # No check-out logged yet (legacy `co` empty AND no closed sessions)
    if not co and not has_closed_session:
        if day_over and not has_open_session:
            return {"status": "absent", "half_day_reason": None, "total_minutes": 0}
        # Day in progress OR still-open session: partial minutes if we have sessions
        partial = _sum_session_minutes(day_over) if sessions else 0
        if ci_minutes_into_day > max_in_min:
            return {"status": "half_day", "half_day_reason": "late_checkin", "total_minutes": partial}
        return {"status": "present", "half_day_reason": None, "total_minutes": partial}

    # Compute total minutes.
    if sessions:
        total_minutes = _sum_session_minutes(day_over)
    else:
        # Legacy single-pair path
        try:
            co_dt = datetime.fromisoformat(co)
            if co_dt.tzinfo is None:
                co_dt = co_dt.replace(tzinfo=timezone.utc)
            total_minutes = max(0, int((co_dt - ci_dt).total_seconds() // 60))
        except Exception:
            total_minutes = 0

    if ci_minutes_into_day > max_in_min:
        return {"status": "half_day", "half_day_reason": "late_checkin", "total_minutes": total_minutes}
    if total_minutes < min_day_minutes:
        return {"status": "half_day", "half_day_reason": "short_hours", "total_minutes": total_minutes}
    return {"status": "present", "half_day_reason": None, "total_minutes": total_minutes}


async def is_attendance_locked(db, salon_id: str, barber_id: str, date_str: str) -> Optional[str]:
    """Return the month (YYYY-MM) of the paid salary record that locks
    this date, or None if not locked."""
    month = date_str[:7] if date_str and len(date_str) >= 7 else None
    if not month:
        return None
    salary = await db.salary_records.find_one(
        {"salon_id": salon_id, "barber_id": barber_id, "month": month, "is_paid": True},
        {"_id": 0, "month": 1, "is_paid": 1},
    )
    return month if salary else None


# ============================================================
# Pydantic payloads
# ============================================================

class GeoSettingsPayload(BaseModel):
    check_in_radius_meters: Optional[int] = Field(default=None, ge=10, le=2000)
    # New unified threshold fields
    late_mark_threshold_min: Optional[int] = Field(default=None, ge=0, le=240)
    required_hours_per_day: Optional[float] = Field(default=None, ge=1.0, le=16.0)
    auto_absent_cutoff_hour: Optional[int] = Field(default=None, ge=0, le=23)
    # Legacy fields (still accepted)
    max_check_in_time: Optional[str] = None  # "HH:MM"
    min_daily_minutes: Optional[int] = Field(default=None, ge=30, le=24 * 60)
    allow_admin_override: Optional[bool] = None
    auto_close_at: Optional[str] = None  # "HH:MM"

    @field_validator("max_check_in_time", "auto_close_at")
    @classmethod
    def _v_hhmm(cls, v):
        if v is None:
            return v
        try:
            _parse_hhmm_to_minutes(v)
        except Exception:
            raise ValueError("Time must be in 'HH:MM' format")
        return v


class AttendanceModeUpdate(BaseModel):
    mode: str
    geo_settings: Optional[GeoSettingsPayload] = None
    effective_from_date: Optional[str] = None  # internal: defaults to today IST

    @field_validator("mode")
    @classmethod
    def _v_mode(cls, v):
        if v not in {"service_completion", "geo_checkin"}:
            raise ValueError("mode must be 'service_completion' or 'geo_checkin'")
        return v


class CheckInPayload(BaseModel):
    barber_id: str
    # Location is only needed for a staff member's own check-in when the
    # salon requires the geo-fence.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Only honoured for admins / managers ("self" = test the geo-fence as if
    # the staff were checking in).  Staff always check in as "self"; the
    # server never lets them claim an on-behalf or override method.
    method: Optional[str] = None
    self_override_reason: Optional[str] = None


class CheckOutPayload(BaseModel):
    barber_id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    method: Optional[str] = None


class CheckEditPayload(BaseModel):
    check_in_at: Optional[str] = None  # ISO datetime
    check_out_at: Optional[str] = None
    status: Optional[str] = None  # force final status
    half_day_reason: Optional[str] = None
    note: Optional[str] = None


# ============================================================
# Router
# ============================================================

attendance_mode_router = APIRouter()


def _assert_salon(user: dict, salon_id: str):
    token_salon = user.get("salon_id") or user.get("sub")
    if token_salon != salon_id:
        raise HTTPException(status_code=403, detail="Salon mismatch")


def _is_admin(user: dict) -> bool:
    return user.get("role") in ("salon_admin", "salon", "admin")


def _is_branch_manager(user: dict) -> bool:
    return user.get("role") == "salon_branch_manager"


async def _barber_in_manager_scope(user: dict, salon_id: str, barber_id: str) -> bool:
    assigned = user.get("assigned_branch_ids") or []
    barber = await _db.barbers.find_one({"id": barber_id, "salon_id": salon_id}, {"_id": 0, "branch_id": 1})
    return bool(barber and barber.get("branch_id") in assigned)


async def actor_relation(user: dict, salon_id: str, barber_id: str) -> Optional[str]:
    """How the caller relates to this staff member for attendance actions.

    "manager" — salon admin, a branch manager of the staff's branch, or a
                staff user granted staff.attendance + staff.view_all.
    "self"    — the staff member acting on their own record.
    None      — not allowed.
    """
    if _is_admin(user):
        return "manager"
    if _is_branch_manager(user):
        return "manager" if await _barber_in_manager_scope(user, salon_id, barber_id) else None
    if user.get("role") == "salon_staff":
        if user.get("staff_id") == barber_id:
            return "self"
        if (_has_module_permission is not None
                and _has_module_permission(user, "staff", "attendance")
                and _has_module_permission(user, "staff", "view_all")):
            return "manager"
    return None


async def _user_can_act_for_barber(user: dict, salon_id: str, barber_id: str) -> bool:
    return (await actor_relation(user, salon_id, barber_id)) is not None


@attendance_mode_router.put("/api/salons/{salon_id}/attendance-mode")
async def update_attendance_mode(salon_id: str, payload: AttendanceModeUpdate,
                                  user: dict = Depends(lambda: None)):
    # Lazy dep — real dep is patched in init.
    raise NotImplementedError  # replaced below


# --------------- the real handlers (will be re-registered in init) -----------


def mode_change_fields(salon: dict, new_mode: str, user: dict, *,
                       effective_from_date: Optional[str] = None) -> dict:
    """`$set` fields for switching the salon's attendance mode.

    Always stores the canonical value.  A history entry is appended only when
    the mode actually changes, so saving the same setting twice is a no-op.
    """
    mode = normalize_mode(new_mode)
    out: dict[str, Any] = {"attendance_mode": mode}
    if normalize_mode(salon.get("attendance_mode")) == mode and salon.get("attendance_mode") == mode:
        return out
    history = list(salon.get("attendance_mode_history") or [])
    if normalize_mode(salon.get("attendance_mode")) != mode:
        history.append({
            "id": str(uuid.uuid4()),
            "mode": mode,
            "changed_by": user.get("user_id") or user.get("id") or user.get("sub"),
            "changed_at": current_ist_iso(),
            "effective_from_date": effective_from_date or current_ist_date(),
        })
        out["attendance_mode_history"] = history
    return out


async def _update_attendance_mode_impl(salon_id: str, payload: AttendanceModeUpdate, user: dict):
    _assert_salon(user, salon_id)
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only salon admins can change attendance mode")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    update_doc: dict[str, Any] = mode_change_fields(
        salon, payload.mode, user, effective_from_date=payload.effective_from_date)

    # Merge geo_settings (additive — keep prior keys).
    if payload.geo_settings is not None:
        existing_geo = dict(salon.get("geo_settings") or DEFAULT_GEO_SETTINGS)
        for k, v in payload.geo_settings.model_dump(exclude_none=True).items():
            existing_geo[k] = v
        update_doc["geo_settings"] = existing_geo
    elif not salon.get("geo_settings"):
        # First time: seed defaults so the UI has something to render.
        update_doc["geo_settings"] = DEFAULT_GEO_SETTINGS.copy()

    update_doc.update(mirror_rule_fields(update_doc, salon))
    await _db.salons.update_one({"id": salon_id}, {"$set": update_doc})
    fresh = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    return {
        "ok": True,
        "attendance_mode": fresh.get("attendance_mode"),
        "attendance_mode_history": fresh.get("attendance_mode_history") or [],
        "geo_settings": fresh.get("geo_settings") or DEFAULT_GEO_SETTINGS.copy(),
    }


async def _precheck_check_action(salon_id: str, barber_id: str, user: dict, verb: str):
    """Shared guardrails for check-in and check-out.

    Returns (salon, barber, relation, rules, today).  Raises the right HTTP
    error when the action is not allowed.
    """
    _assert_salon(user, salon_id)
    relation = await actor_relation(user, salon_id, barber_id)
    if relation is None:
        raise HTTPException(status_code=403, detail=f"Not allowed to check {verb} for this staff")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    today = current_ist_date()
    if resolve_mode_for_date(salon, today) != CHECKIN_MODE:
        raise HTTPException(
            status_code=409,
            detail="Check-in / check-out is off: this salon records attendance by service completion",
        )

    rules = effective_rules(salon)
    if relation == "self" and not rules["allow_self_checkin"]:
        raise HTTPException(
            status_code=403,
            detail="Self check-in is turned off for this salon. Ask your manager to check you in.",
        )

    barber = await _db.barbers.find_one({"id": barber_id, "salon_id": salon_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Staff not found")
    if barber.get("is_active") is False:
        raise HTTPException(status_code=409, detail="This staff member is inactive")

    locked = await is_attendance_locked(_db, salon_id, barber_id, today)
    if locked:
        raise HTTPException(status_code=423, detail=f"Salary for {locked} is already paid; attendance is locked")
    return salon, barber, relation, rules, today


def _actor_fields(user: dict, prefix: str) -> dict:
    return {
        f"{prefix}_by": user.get("user_id") or user.get("id") or user.get("sub"),
        f"{prefix}_by_role": user.get("role"),
    }


async def _check_in_impl(salon_id: str, payload: CheckInPayload, user: dict):
    salon, barber, relation, rules, today = await _precheck_check_action(
        salon_id, payload.barber_id, user, "in")

    # Staff always check in as themselves.  Managers check in on the staff's
    # behalf (no geo-fence) unless they explicitly ask for a "self"-style
    # fenced check-in with coordinates.
    if relation == "self":
        method = "self"
    elif payload.method == "self" and payload.latitude is not None and payload.longitude is not None:
        method = "self"
    else:
        method = "admin_on_behalf"

    distance = None
    if payload.latitude is not None and payload.longitude is not None:
        centre_lat, centre_lng, source = await _get_branch_center(salon, barber)
        if centre_lat is not None:
            distance = haversine_meters(payload.latitude, payload.longitude, centre_lat, centre_lng)
    if method == "self" and rules["geofence_required"]:
        if payload.latitude is None or payload.longitude is None:
            raise HTTPException(status_code=400, detail="Location is required to check in (geo-fence is on)")
        centre_lat, centre_lng, source = await _get_branch_center(salon, barber)
        if centre_lat is None:
            raise HTTPException(
                status_code=409,
                detail="Salon location is not set. Set it in Settings, or turn off 'Require geo-fence'.",
            )
        radius = rules["radius_m"]
        if distance > radius:
            raise HTTPException(
                status_code=409,
                detail=f"You are {int(distance)}m from the {source}; geo-fence radius is {radius}m",
            )

    on_leave = bool(await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": payload.barber_id, "date": today,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0, "id": 1}))
    if on_leave or today in (barber.get("leave_dates") or []):
        raise HTTPException(status_code=409, detail=f"{barber.get('name') or 'Staff'} is on leave today")

    now_iso = current_ist_iso()
    record_id = f"{salon_id}_{payload.barber_id}_{today}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0})
    if existing and existing.get("status") in ("holiday", "on_leave") and existing.get("auto_calculated") is False:
        raise HTTPException(status_code=409, detail=f"Today is marked {existing['status'].replace('_', ' ')} for this staff")

    existing_sessions = list((existing or {}).get("sessions") or [])
    has_open_session = any((s.get("ci") and not s.get("co")) for s in existing_sessions)
    legacy_open = bool(
        existing
        and existing.get("check_in_at")
        and not existing.get("check_out_at")
        and not existing_sessions
    )
    if has_open_session or legacy_open:
        raise HTTPException(status_code=409, detail="Please check out first before checking in again")

    new_session = {
        "ci": now_iso,
        "ci_lat": payload.latitude,
        "ci_lng": payload.longitude,
        "ci_distance_meters": int(distance) if distance is not None else None,
        "ci_method": method,
        **_actor_fields(user, "ci"),
    }
    if payload.self_override_reason and relation == "manager":
        new_session["ci_override_reason"] = payload.self_override_reason

    if existing and existing.get("check_in_at") and not existing_sessions:
        existing_sessions.append({
            "ci": existing.get("check_in_at"),
            "co": existing.get("check_out_at"),
            "ci_lat": existing.get("check_in_lat"),
            "ci_lng": existing.get("check_in_lng"),
            "ci_distance_meters": existing.get("check_in_distance_meters"),
            "ci_method": existing.get("check_in_method"),
            "co_lat": existing.get("check_out_lat"),
            "co_lng": existing.get("check_out_lng"),
            "co_method": existing.get("check_out_method"),
        })
    existing_sessions.append(new_session)

    first_ci_iso = existing.get("check_in_at") if (existing and existing.get("check_in_at")) else now_iso
    first_ci_lat = existing.get("check_in_lat") if (existing and existing.get("check_in_at")) else payload.latitude
    first_ci_lng = existing.get("check_in_lng") if (existing and existing.get("check_in_at")) else payload.longitude

    doc = {
        "id": record_id,
        "salon_id": salon_id,
        "barber_id": payload.barber_id,
        "date": today,
        "check_in_at": first_ci_iso,      # first check-in of the day
        "check_in_lat": first_ci_lat,
        "check_in_lng": first_ci_lng,
        "check_in_distance_meters": (existing.get("check_in_distance_meters") if existing and existing.get("check_in_at")
                                     else (int(distance) if distance is not None else None)),
        "check_in_method": (existing.get("check_in_method") if existing and existing.get("check_in_at") else method),
        "check_out_at": None,             # day is active again
        "sessions": existing_sessions,
        "computed_under_mode": CHECKIN_MODE,
        "auto_calculated": True,
        "created_at": (existing or {}).get("created_at") or now_iso,
        "updated_at": now_iso,
    }
    computed = compute_mode_b_status(
        salon, {**(existing or {}), **doc},
        day_has_passed=False, on_leave=False,
    )
    doc.update(computed)

    await _db.attendance.update_one({"id": record_id}, {"$set": doc, "$setOnInsert": {"bookings_count": 0}}, upsert=True)
    return {"ok": True, "record": (await _db.attendance.find_one({"id": record_id}, {"_id": 0}))}


async def _check_out_impl(salon_id: str, payload: CheckOutPayload, user: dict):
    salon, barber, relation, rules, today = await _precheck_check_action(
        salon_id, payload.barber_id, user, "out")
    method = "self" if relation == "self" else "admin_on_behalf"

    record_id = f"{salon_id}_{payload.barber_id}_{today}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0})
    if not existing or not existing.get("check_in_at"):
        raise HTTPException(status_code=409, detail="No active check-in found for today")

    existing_sessions = list((existing or {}).get("sessions") or [])
    open_idx = -1
    for i, s in enumerate(existing_sessions):
        if s.get("ci") and not s.get("co"):
            open_idx = i
    legacy_open = (
        existing.get("check_in_at")
        and not existing.get("check_out_at")
        and not existing_sessions
    )
    if open_idx < 0 and not legacy_open:
        raise HTTPException(status_code=409, detail="No active check-in — please check in first")

    now_iso = current_ist_iso()
    if open_idx >= 0:
        sess = existing_sessions[open_idx]
        sess["co"] = now_iso
        if payload.latitude is not None:
            sess["co_lat"] = payload.latitude
        if payload.longitude is not None:
            sess["co_lng"] = payload.longitude
        sess["co_method"] = method
        sess.update(_actor_fields(user, "co"))
    else:
        existing_sessions = [{
            "ci": existing.get("check_in_at"),
            "co": now_iso,
            "ci_lat": existing.get("check_in_lat"),
            "ci_lng": existing.get("check_in_lng"),
            "ci_distance_meters": existing.get("check_in_distance_meters"),
            "ci_method": existing.get("check_in_method"),
            "co_lat": payload.latitude,
            "co_lng": payload.longitude,
            "co_method": method,
            **_actor_fields(user, "co"),
        }]

    merged = {**existing, "check_out_at": now_iso, "sessions": existing_sessions, "check_out_method": method}
    computed = compute_mode_b_status(salon, merged, day_has_passed=False, on_leave=False)
    set_doc = {
        "check_out_at": now_iso,
        "check_out_method": method,
        "sessions": existing_sessions,
        "status": computed["status"],
        "half_day_reason": computed["half_day_reason"],
        "total_minutes": computed["total_minutes"],
        "computed_under_mode": CHECKIN_MODE,
        "updated_at": now_iso,
    }
    if payload.latitude is not None:
        set_doc["check_out_lat"] = payload.latitude
    if payload.longitude is not None:
        set_doc["check_out_lng"] = payload.longitude

    await _db.attendance.update_one({"id": record_id}, {"$set": set_doc})
    return {"ok": True, "record": (await _db.attendance.find_one({"id": record_id}, {"_id": 0}))}


def hhmm_to_ist_iso(date_str: str, hhmm: str) -> str:
    """'2026-10-03' + '09:30' → ISO timestamp at that IST wall-clock time."""
    h, m = (int(x) for x in hhmm.split(":"))
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return datetime(d.year, d.month, d.day, h, m, tzinfo=IST).isoformat()


def _parse_iso(v: Optional[str]) -> Optional[datetime]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def write_manual_times(salon: dict, barber_id: str, date: str,
                             check_in_at: Optional[str], check_out_at: Optional[str],
                             user: dict, *, forced_status: Optional[str] = None,
                             half_day_reason: Optional[str] = None,
                             note: Optional[str] = None) -> dict:
    """Admin-entered check-in / check-out for one staff on one day.

    Replaces the day's sessions with a single admin-edited session so the
    hours, status, Home card, calendar and report all read the same thing.
    Caller is responsible for permission, lock and mode checks.
    """
    salon_id = salon["id"]
    ci_dt, co_dt = _parse_iso(check_in_at), _parse_iso(check_out_at)
    if check_in_at and not ci_dt:
        raise HTTPException(status_code=400, detail="Invalid check-in time")
    if check_out_at and not co_dt:
        raise HTTPException(status_code=400, detail="Invalid check-out time")
    if co_dt and not ci_dt:
        raise HTTPException(status_code=400, detail="Check-out needs a check-in time")
    if ci_dt and co_dt and co_dt <= ci_dt:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    now = datetime.now(IST)
    if ci_dt and ci_dt > now:
        raise HTTPException(status_code=400, detail="Check-in can't be in the future")
    if co_dt and co_dt > now:
        raise HTTPException(status_code=400, detail="Check-out can't be in the future")

    record_id = f"{salon_id}_{barber_id}_{date}"
    existing = await _db.attendance.find_one({"id": record_id}, {"_id": 0}) or {}
    now_iso = current_ist_iso()
    actor = user.get("user_id") or user.get("id") or user.get("sub")
    sessions = []
    if check_in_at:
        sessions = [{"ci": check_in_at, "co": check_out_at, "ci_method": "admin_edit",
                     "co_method": "admin_edit" if check_out_at else None,
                     "ci_by": actor, "ci_by_role": user.get("role")}]
    set_doc: dict[str, Any] = {
        "id": record_id, "salon_id": salon_id, "barber_id": barber_id, "date": date,
        "check_in_at": check_in_at or None,
        "check_out_at": check_out_at or None,
        "check_in_method": "admin_edit" if check_in_at else None,
        "check_out_method": "admin_edit" if check_out_at else None,
        "sessions": sessions,
        "auto_calculated": False,
        "override_by": actor,
        "marked_by_role": user.get("role"),
        "marked_by_name": user.get("name") or user.get("identifier"),
        "override_note": note,
        "computed_under_mode": CHECKIN_MODE,
        "updated_at": now_iso,
    }
    on_leave = bool(await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": barber_id, "date": date,
        "status": {"$ne": "cancelled"},
    }, {"_id": 0, "id": 1}))
    computed = compute_mode_b_status(
        salon, {**existing, **set_doc},
        day_has_passed=date < current_ist_date(), on_leave=on_leave,
    )
    set_doc.update(computed)
    if forced_status:
        set_doc["status"] = forced_status
        set_doc["half_day_reason"] = half_day_reason
    await _db.attendance.update_one(
        {"id": record_id},
        {"$set": set_doc, "$setOnInsert": {"created_at": now_iso, "bookings_count": 0}},
        upsert=True,
    )
    return await _db.attendance.find_one({"id": record_id}, {"_id": 0})


async def _check_edit_impl(salon_id: str, barber_id: str, date: str,
                             payload: CheckEditPayload, user: dict):
    _assert_salon(user, salon_id)
    if await actor_relation(user, salon_id, barber_id) != "manager":
        raise HTTPException(status_code=403, detail="Admin / branch-manager access required")
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    if date > current_ist_date():
        raise HTTPException(status_code=400, detail="Can't edit attendance for a future date")

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if resolve_mode_for_date(salon, date) != CHECKIN_MODE:
        raise HTTPException(
            status_code=409,
            detail="Check-in / check-out times don't apply: this day is recorded by service completion",
        )

    locked = await is_attendance_locked(_db, salon_id, barber_id, date)
    if locked:
        raise HTTPException(status_code=423, detail=f"Salary for {locked} is already paid; attendance is locked")

    if payload.status and payload.status not in ("present", "half_day", "absent", "holiday", "on_leave"):
        raise HTTPException(status_code=400, detail="Invalid status")

    existing = await _db.attendance.find_one({"id": f"{salon_id}_{barber_id}_{date}"}, {"_id": 0}) or {}
    ci = payload.check_in_at if payload.check_in_at is not None else existing.get("check_in_at")
    co = payload.check_out_at if payload.check_out_at is not None else existing.get("check_out_at")
    record = await write_manual_times(
        salon, barber_id, date, ci or None, co or None, user,
        forced_status=payload.status, half_day_reason=payload.half_day_reason,
        note=payload.note,
    )
    return {"ok": True, "record": record}


# ============================================================
# Auto-close job
# ============================================================

async def auto_close_open_checkins_job(db):
    """Close check-ins that were never checked out.

    • Auto check-out ON (Settings → Staff & Attendance, the default): the
      open session is closed at `auto_checkout_time` on that day and the
      status is recomputed from the hours worked.
    • Auto check-out OFF: the day is marked Absent once the cutoff hour
      (`geo_settings.auto_absent_cutoff_hour`, legacy) has passed.

    Always handles yesterday (safe day-rollover) and handles today once the
    relevant time has passed.  Safe to re-run: closed sessions are skipped.
    Skips months whose salary is already paid.
    """
    salons = await db.salons.find(
        {"attendance_mode": {"$in": sorted(_CHECKIN_ALIASES)}}, {"_id": 0},
    ).to_list(length=10_000)
    closed = 0
    now_ist = datetime.now(IST)
    today_str = now_ist.strftime("%Y-%m-%d")
    for s in salons:
        rules = effective_rules(s)
        geo = s.get("geo_settings") or {}
        if rules["auto_checkout"]:
            try:
                cutoff_min = _parse_hhmm_to_minutes(rules["auto_checkout_time"])
            except Exception:
                cutoff_min = 21 * 60
        else:
            cutoff_hour = geo.get("auto_absent_cutoff_hour")
            if cutoff_hour is None:
                try:
                    cutoff_hour = _parse_hhmm_to_minutes(
                        geo.get("auto_close_at") or DEFAULT_GEO_SETTINGS["auto_close_at"]
                    ) // 60
                except Exception:
                    cutoff_hour = 23
            cutoff_min = int(cutoff_hour) * 60

        dates_to_close = [(now_ist.date() - timedelta(days=1)).strftime("%Y-%m-%d")]
        if now_ist.hour * 60 + now_ist.minute >= cutoff_min:
            dates_to_close.append(today_str)

        for date_str in dates_to_close:
            if resolve_mode_for_date(s, date_str) != CHECKIN_MODE:
                continue
            open_recs = await db.attendance.find({
                "salon_id": s["id"], "date": date_str,
                "check_in_at": {"$ne": None}, "check_out_at": None,
            }, {"_id": 0}).to_list(length=10_000)
            for r in open_recs:
                if await is_attendance_locked(db, s["id"], r["barber_id"], date_str):
                    continue
                now_iso = datetime.now(IST).isoformat()
                if not rules["auto_checkout"]:
                    await db.attendance.update_one(
                        {"id": r["id"]},
                        {"$set": {
                            "status": "absent",
                            "half_day_reason": None,
                            "computed_under_mode": CHECKIN_MODE,
                            "auto_calculated": True,
                            "updated_at": now_iso,
                        }},
                    )
                    closed += 1
                    continue
                sessions = list(r.get("sessions") or [])
                if not sessions:
                    sessions = [{"ci": r.get("check_in_at"), "ci_method": r.get("check_in_method")}]
                cutoff_dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
                    hour=cutoff_min // 60, minute=cutoff_min % 60, tzinfo=IST)
                changed = False
                for sess in sessions:
                    if sess.get("ci") and not sess.get("co"):
                        ci_dt = _parse_iso(sess["ci"])
                        co_dt = max(cutoff_dt, ci_dt) if ci_dt else cutoff_dt
                        sess["co"] = co_dt.isoformat()
                        sess["co_method"] = "auto"
                        changed = True
                if not changed:
                    continue
                merged = {**r, "sessions": sessions, "check_out_at": sessions[-1]["co"]}
                computed = compute_mode_b_status(
                    s, merged, day_has_passed=date_str < today_str, on_leave=False)
                await db.attendance.update_one(
                    {"id": r["id"]},
                    {"$set": {
                        "sessions": sessions,
                        "check_out_at": sessions[-1]["co"],
                        "check_out_method": "auto",
                        **computed,
                        "computed_under_mode": CHECKIN_MODE,
                        "updated_at": now_iso,
                    }},
                )
                closed += 1
    return {"closed": closed}


# ============================================================
# init
# ============================================================

def init_attendance_mode(*, db, get_current_salon_user, get_current_salon_admin,
                         has_module_permission=None):
    """Wire the router into the main app.  Called from server.py."""
    global _db, _get_current_salon_user, _get_current_salon_admin, _has_module_permission
    _db = db
    _has_module_permission = has_module_permission
    _get_current_salon_user = get_current_salon_user
    _get_current_salon_admin = get_current_salon_admin

    # Re-register routes with the real dependency now that the auth deps
    # are available.  We drop the placeholder route added at import time.
    attendance_mode_router.routes.clear()

    @attendance_mode_router.put("/api/salons/{salon_id}/attendance-mode")
    async def _r_update_mode(salon_id: str, payload: AttendanceModeUpdate,
                              user: dict = Depends(get_current_salon_user)):
        return await _update_attendance_mode_impl(salon_id, payload, user)

    @attendance_mode_router.post("/api/salons/{salon_id}/staff-attendance/check-in")
    async def _r_check_in(salon_id: str, payload: CheckInPayload,
                            user: dict = Depends(get_current_salon_user)):
        return await _check_in_impl(salon_id, payload, user)

    @attendance_mode_router.post("/api/salons/{salon_id}/staff-attendance/check-out")
    async def _r_check_out(salon_id: str, payload: CheckOutPayload,
                             user: dict = Depends(get_current_salon_user)):
        return await _check_out_impl(salon_id, payload, user)

    @attendance_mode_router.put("/api/salons/{salon_id}/staff-attendance/check-edit/{barber_id}/{date}")
    async def _r_check_edit(salon_id: str, barber_id: str, date: str,
                              payload: CheckEditPayload,
                              user: dict = Depends(get_current_salon_user)):
        return await _check_edit_impl(salon_id, barber_id, date, payload, user)

    return attendance_mode_router
