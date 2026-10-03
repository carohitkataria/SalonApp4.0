"""
End-to-end attendance tests that run in-process (no live server needed).

The real FastAPI app is driven through httpx's ASGI transport against an
in-memory MongoDB (mongomock-motor), so every endpoint, permission check and
helper below is the production code path.

Covers the two attendance methods and the surfaces that must stay in sync:
  • Service completion — completing a service marks the staff present; all
    check-in / check-out actions are refused.
  • Check-in / check-out — staff self check-in (geo-fence, self check-in
    switch), admin / branch-manager on-behalf check-in, admin time edits.
  • Home card + right-ribbon drawer (/staff-attendance/day, home-kpis),
    Staff → Attendance calendar (/month), Staff Portal (/attendance/today),
    Reports → Staff → Attendance (/report).
  • Guardrails: other salons, other staff, branch scope, locked months,
    leave, future dates.

Run:  pip install mongomock-motor pytest-asyncio
      cd backend && python -m pytest tests/test_attendance_sync.py -q
"""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest

pytest.importorskip("mongomock_motor")
import pytest_asyncio  # noqa: E402
import httpx  # noqa: E402
import motor.motor_asyncio  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "attendance_sync_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

IST = timezone(timedelta(hours=5, minutes=30))
SALON = "salon-a"
OTHER_SALON = "salon-b"
B1, B2 = "barber-1", "barber-2"
LAT, LNG = 28.6139, 77.2090


@pytest.fixture(scope="module")
def server():
    motor.motor_asyncio.AsyncIOMotorClient = lambda *a, **k: AsyncMongoMockClient()
    import server as srv  # noqa: WPS433 — imported after the DB patch on purpose
    return srv


def _tok(srv, **payload):
    return {"Authorization": f"Bearer {srv.create_access_token(payload)}"}


@pytest.fixture(scope="module")
def auth(server):
    return {
        "admin": _tok(server, role="salon_admin", salon_id=SALON, sub=SALON, user_id="admin-1", name="Owner"),
        "staff1": _tok(server, role="salon_staff", salon_id=SALON, staff_id=B1, user_id="u-b1", permissions={}),
        "staff2": _tok(server, role="salon_staff", salon_id=SALON, staff_id=B2, user_id="u-b2", permissions={}),
        "manager": _tok(server, role="salon_branch_manager", salon_id=SALON, user_id="bm-1",
                        assigned_branch_ids=["br-1"]),
        "other_admin": _tok(server, role="salon_admin", salon_id=OTHER_SALON, sub=OTHER_SALON, user_id="admin-2"),
    }


def today():
    return datetime.now(IST).strftime("%Y-%m-%d")


def yesterday():
    return (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")


@pytest_asyncio.fixture(loop_scope="session")
async def api(server):
    db = server.db
    for name in ("salons", "barbers", "attendance", "tokens", "leave_records", "salary_records",
                 "staff_attendance", "salon_holidays", "salon_users", "branches"):
        await db[name].delete_many({})
    await db.salons.insert_many([
        {"id": SALON, "salon_name": "A", "latitude": LAT, "longitude": LNG,
         "owner_name": "O", "phone": "+910000000000", "address": "X", "payment_timing": "after",
         "created_at": "2026-01-01T00:00:00+00:00",
         "attendance_mode": "service_completion", "status": "active",
         # Deterministic rules: never late, 8h full day.
         "shift_start": "00:00", "grace_period_min": 1439, "min_hours_full_day": 8},
        {"id": OTHER_SALON, "salon_name": "B", "status": "active"},
    ])
    await db.barbers.insert_many([
        {"id": B1, "salon_id": SALON, "name": "Asha", "is_active": True, "is_barber": True, "branch_id": "br-1"},
        {"id": B2, "salon_id": SALON, "name": "Ravi", "is_active": True, "is_barber": True, "branch_id": "br-2"},
    ])
    transport = httpx.ASGITransport(app=server.fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def set_mode(api, auth, value, **extra):
    r = await api.put(f"/api/salons/{SALON}", headers=auth["admin"],
                      json={"attendance_mode": value, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def row(day, barber_id):
    return next(r for r in day["rows"] if r["barber_id"] == barber_id)


# ---------------------------------------------------------------------------
# Service completion
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_service_mode_blocks_check_in_everywhere(api, auth):
    for who in ("admin", "staff1"):
        r = await api.post(f"/api/salons/{SALON}/home/staff-attendance/toggle",
                           headers=auth[who], json={"barber_id": B1, "action": "in"})
        assert r.status_code == 409, (who, r.text)
        assert "service completion" in r.json()["detail"]
    r = await api.post(f"/api/salons/{SALON}/staff-attendance/check-in", headers=auth["admin"],
                       json={"barber_id": B1, "method": "admin_on_behalf"})
    assert r.status_code == 409
    r = await api.put(f"/api/salons/{SALON}/staff-attendance/check-edit/{B1}/{yesterday()}",
                      headers=auth["admin"], json={"check_in_at": f"{yesterday()}T09:00:00+05:30"})
    assert r.status_code == 409

    r = await api.get(f"/api/salons/{SALON}/barbers/{B1}/attendance/today", headers=auth["staff1"])
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "service_completion"
    assert body["can_check_in_out"] is False


@pytest.mark.asyncio
async def test_completed_service_marks_present_on_every_surface(api, auth, server):
    token_id = str(uuid.uuid4())
    await server.db.tokens.insert_one({
        "id": token_id, "salon_id": SALON, "barber_id": B1, "date": today(),
        "status": "in_progress", "token_number": 1, "shift": "Morning",
        "payment_confirmed": True, "payment_status": "paid",
    })
    r = await api.post(f"/api/tokens/{token_id}/complete", headers=auth["admin"])
    assert r.status_code == 200, r.text

    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["admin"])).json()
    assert day["mode"] == "service_completion"
    assert row(day, B1)["status"] == "present"
    assert row(day, B1)["services_completed"] == 1
    assert row(day, B2)["status"] == ""          # today, nothing yet → pending, not absent

    month = (await api.get(f"/api/salons/{SALON}/staff-attendance/month/{today()[:7]}",
                           headers=auth["admin"])).json()
    b1 = next(b for b in month["barbers"] if b["barber_id"] == B1)
    assert any(a["date"] == today() and a["status"] == "present" for a in b1["attendance"])

    kpis = (await api.get(f"/api/salons/{SALON}/home-kpis", headers=auth["admin"])).json()
    assert kpis["attendance_mode"] == "service_completion"
    assert row({"rows": kpis["staff_attendance"]}, B1)["status"] == "present"

    rep = (await api.get(f"/api/salons/{SALON}/staff-attendance/report",
                         params={"start_date": yesterday(), "end_date": today()},
                         headers=auth["admin"])).json()
    by = {(x["staff_id"], x["date"]): x for x in rep["rows"]}
    assert by[(B1, today())]["status"] == "P"
    assert by[(B1, today())]["services_completed"] == 1
    assert by[(B1, today())]["mode"] == "service_completion"
    assert by[(B1, yesterday())]["status"] == "A"   # past day, no services


@pytest.mark.asyncio
async def test_direct_invoice_style_completion_syncs_calendar(api, auth, server):
    await server.db.tokens.insert_one({"id": "t2", "salon_id": SALON, "barber_id": B2,
                                       "date": today(), "status": "completed"})
    await server.sync_service_attendance(SALON, B2, today())
    doc = await server.db.attendance.find_one({"id": f"{SALON}_{B2}_{today()}"})
    assert doc["status"] == "present" and doc["auto_calculated"] is True


# ---------------------------------------------------------------------------
# Switching the method from Settings
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_settings_checkinout_value_is_normalised_and_logged(api, auth, server):
    await set_mode(api, auth, "checkinout", grace_period_min=1439)
    salon = await server.db.salons.find_one({"id": SALON})
    assert salon["attendance_mode"] == "geo_checkin"
    assert [h["mode"] for h in salon["attendance_mode_history"]] == ["geo_checkin"]
    assert salon["geo_settings"]["late_mark_threshold_min"] == 1439
    # Saving the same method again is a no-op for the history.
    await set_mode(api, auth, "geo_checkin")
    salon = await server.db.salons.find_one({"id": SALON})
    assert len(salon["attendance_mode_history"]) == 1


# ---------------------------------------------------------------------------
# Check-in / check-out
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_staff_self_check_in_guardrails(api, auth, server):
    await set_mode(api, auth, "geo_checkin", allow_self_checkin=True, geofence_required=True)
    url = f"/api/salons/{SALON}/home/staff-attendance/toggle"

    r = await api.post(url, headers=auth["staff1"], json={"barber_id": B1, "action": "in"})
    assert r.status_code == 400 and "Location" in r.json()["detail"]
    r = await api.post(url, headers=auth["staff1"],
                       json={"barber_id": B1, "action": "in", "latitude": LAT + 1, "longitude": LNG})
    assert r.status_code == 409 and "geo-fence" in r.json()["detail"]
    # Staff can't bypass the fence by claiming an admin method.
    r = await api.post(f"/api/salons/{SALON}/staff-attendance/check-in", headers=auth["staff1"],
                       json={"barber_id": B1, "latitude": LAT + 1, "longitude": LNG,
                             "method": "admin_on_behalf"})
    assert r.status_code == 409
    # Staff can't check in a colleague.
    r = await api.post(url, headers=auth["staff1"], json={"barber_id": B2, "action": "in"})
    assert r.status_code == 403

    r = await api.post(url, headers=auth["staff1"],
                       json={"barber_id": B1, "action": "in", "latitude": LAT, "longitude": LNG})
    assert r.status_code == 200, r.text
    assert r.json()["record"]["sessions"][0]["ci_method"] == "self"
    # Repeating the tap is a no-op.
    r = await api.post(url, headers=auth["staff1"],
                       json={"barber_id": B1, "action": "in", "latitude": LAT, "longitude": LNG})
    assert r.status_code == 200 and r.json()["already_in"] is True

    # Every surface sees the same check-in.
    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["admin"])).json()
    assert day["mode"] == "geo_checkin"
    assert row(day, B1)["is_checked_in"] is True and row(day, B1)["status"] == "present"
    portal = (await api.get(f"/api/salons/{SALON}/barbers/{B1}/attendance/today",
                            headers=auth["staff1"])).json()
    assert portal["is_checked_in"] is True and portal["can_check_in_out"] is True
    assert portal["geofence_required"] is True
    month = (await api.get(f"/api/salons/{SALON}/staff-attendance/month/{today()[:7]}",
                           headers=auth["staff1"])).json()
    assert month["attendance_mode"] == "geo_checkin"
    assert month["barbers"][0]["attendance"][0]["sessions"]

    r = await api.post(url, headers=auth["staff1"], json={"barber_id": B1, "action": "out"})
    assert r.status_code == 200, r.text
    rep = (await api.get(f"/api/salons/{SALON}/staff-attendance/report",
                         params={"start_date": today(), "end_date": today()},
                         headers=auth["admin"])).json()
    b1 = next(x for x in rep["rows"] if x["staff_id"] == B1)
    assert b1["check_in"] and b1["check_out"] and b1["mode"] == "geo_checkin"
    assert b1["status"] == "H"  # a few seconds worked < 8h full day
    assert b1["marked_by_label"] == "Staff"  # self check-in is attributed to the staff


@pytest.mark.asyncio
async def test_self_check_in_switch_and_admin_on_behalf(api, auth):
    await set_mode(api, auth, "geo_checkin", allow_self_checkin=False, geofence_required=True)
    url = f"/api/salons/{SALON}/home/staff-attendance/toggle"
    r = await api.post(url, headers=auth["staff1"],
                       json={"barber_id": B1, "action": "in", "latitude": LAT, "longitude": LNG})
    assert r.status_code == 403 and "Self check-in is turned off" in r.json()["detail"]
    portal = (await api.get(f"/api/salons/{SALON}/barbers/{B1}/attendance/today",
                            headers=auth["staff1"])).json()
    assert portal["can_check_in_out"] is False

    # Admin checks staff in from anywhere (no location needed).
    r = await api.post(url, headers=auth["admin"], json={"barber_id": B1, "action": "in"})
    assert r.status_code == 200, r.text
    assert r.json()["record"]["sessions"][-1]["ci_method"] == "admin_on_behalf"
    assert r.json()["record"]["sessions"][-1]["ci_by_role"] == "salon_admin"


@pytest.mark.asyncio
async def test_branch_manager_scope(api, auth):
    await set_mode(api, auth, "geo_checkin")
    url = f"/api/salons/{SALON}/home/staff-attendance/toggle"
    r = await api.post(url, headers=auth["manager"], json={"barber_id": B1, "action": "in"})
    assert r.status_code == 200, r.text
    r = await api.post(url, headers=auth["manager"], json={"barber_id": B2, "action": "in"})
    assert r.status_code == 403
    r = await api.put(f"/api/salons/{SALON}/staff-attendance/override/{B2}/{yesterday()}",
                      headers=auth["manager"], json={"status": "present"})
    assert r.status_code == 403
    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["manager"])).json()
    assert [x["barber_id"] for x in day["rows"]] == [B1]


@pytest.mark.asyncio
async def test_other_salon_and_anonymous_are_rejected(api, auth):
    other = auth["other_admin"]
    calls = [
        api.post(f"/api/salons/{SALON}/home/staff-attendance/toggle", headers=other,
                 json={"barber_id": B1, "action": "in"}),
        api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=other),
        api.get(f"/api/salons/{SALON}/staff-attendance/month/{today()[:7]}", headers=other),
        api.put(f"/api/salons/{SALON}/staff-attendance/override/{B1}/{yesterday()}", headers=other,
                json={"status": "absent"}),
        api.delete(f"/api/salons/{SALON}/staff-attendance/override/{B1}/{yesterday()}", headers=other),
        api.post(f"/api/salons/{SALON}/attendance/mark", headers=other,
                 json={"date": yesterday(), "rows": [{"barber_id": B1, "status": "absent"}]}),
        api.get(f"/api/salons/{SALON}/staff-attendance/report", headers=other,
                params={"start_date": today(), "end_date": today()}),
        api.get(f"/api/salons/{SALON}/barbers/{B1}/attendance/today", headers=other),
    ]
    for c in calls:
        r = await c
        assert r.status_code == 403, (r.request.url, r.text)
    r = await api.get(f"/api/salons/{SALON}/staff-attendance/month/{today()[:7]}")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_staff_only_sees_own_attendance(api, auth):
    r = await api.get(f"/api/salons/{SALON}/staff-attendance/month/{today()[:7]}?barber_id={B2}",
                      headers=auth["staff1"])
    assert r.status_code == 403
    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["staff1"])).json()
    assert [x["barber_id"] for x in day["rows"]] == [B1]
    r = await api.put(f"/api/salons/{SALON}/staff-attendance/override/{B1}/{yesterday()}",
                      headers=auth["staff1"], json={"status": "present"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_drawer_mark_writes_real_times(api, auth, server):
    await set_mode(api, auth, "geo_checkin")
    # Yesterday must count as check-in mode too.
    await server.db.salons.update_one({"id": SALON}, {"$set": {"attendance_mode_history": [
        {"mode": "geo_checkin", "effective_from_date": "2000-01-01"}]}})
    r = await api.post(f"/api/salons/{SALON}/attendance/mark", headers=auth["admin"], json={
        "date": yesterday(),
        "rows": [
            {"barber_id": B1, "check_in": "09:00", "check_out": "18:00"},
            {"barber_id": B2, "check_in": "18:00", "check_out": "09:00"},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["count"] == 1
    assert r.json()["skipped"][0]["barber_id"] == B2
    doc = await server.db.attendance.find_one({"id": f"{SALON}_{B1}_{yesterday()}"})
    assert doc["check_in_at"].startswith(f"{yesterday()}T09:00:00")
    assert doc["sessions"][0]["co"].startswith(f"{yesterday()}T18:00:00")
    assert doc["total_minutes"] == 540 and doc["status"] == "present"

    rep = (await api.get(f"/api/salons/{SALON}/staff-attendance/report",
                         params={"start_date": yesterday(), "end_date": yesterday()},
                         headers=auth["admin"])).json()
    by = {x["staff_id"]: x for x in rep["rows"]}
    assert by[B1]["worked_minutes"] == 540 and by[B1]["status"] == "P"
    assert by[B1]["marked_by_label"] == "Admin"
    assert by[B2]["status"] == "A"  # past check-in day with no check-in

    future = (datetime.now(IST) + timedelta(days=1)).strftime("%Y-%m-%d")
    r = await api.post(f"/api/salons/{SALON}/attendance/mark", headers=auth["admin"],
                       json={"date": future, "rows": [{"barber_id": B1, "status": "present"}]})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_admin_time_edit_updates_hours(api, auth, server):
    await set_mode(api, auth, "geo_checkin")
    await server.db.salons.update_one({"id": SALON}, {"$set": {"attendance_mode_history": [
        {"mode": "geo_checkin", "effective_from_date": "2000-01-01"}]}})
    d = yesterday()
    r = await api.put(f"/api/salons/{SALON}/staff-attendance/check-edit/{B1}/{d}", headers=auth["admin"],
                      json={"check_in_at": f"{d}T10:00:00+05:30", "check_out_at": f"{d}T14:00:00+05:30"})
    assert r.status_code == 200, r.text
    rec = r.json()["record"]
    assert rec["total_minutes"] == 240 and rec["status"] == "half_day"
    assert len(rec["sessions"]) == 1


@pytest.mark.asyncio
async def test_locked_month_and_leave_block_check_in(api, auth, server):
    await set_mode(api, auth, "geo_checkin")
    url = f"/api/salons/{SALON}/home/staff-attendance/toggle"
    await server.db.salary_records.insert_one(
        {"salon_id": SALON, "barber_id": B1, "month": today()[:7], "is_paid": True})
    r = await api.post(url, headers=auth["admin"], json={"barber_id": B1, "action": "in"})
    assert r.status_code == 423
    await server.db.leave_records.insert_one(
        {"id": "lv1", "salon_id": SALON, "barber_id": B2, "date": today(), "status": "approved"})
    r = await api.post(url, headers=auth["admin"], json={"barber_id": B2, "action": "in"})
    assert r.status_code == 409 and "leave" in r.json()["detail"]
    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["admin"])).json()
    assert row(day, B2)["status"] == "on_leave"


@pytest.mark.asyncio
async def test_switching_back_to_service_mode_hides_check_in(api, auth, server):
    await set_mode(api, auth, "geo_checkin")
    await api.post(f"/api/salons/{SALON}/home/staff-attendance/toggle", headers=auth["admin"],
                   json={"barber_id": B1, "action": "in"})
    await set_mode(api, auth, "service_completion")
    r = await api.post(f"/api/salons/{SALON}/home/staff-attendance/toggle", headers=auth["admin"],
                       json={"barber_id": B1, "action": "out"})
    assert r.status_code == 409
    day = (await api.get(f"/api/salons/{SALON}/staff-attendance/day", headers=auth["admin"])).json()
    assert day["mode"] == "service_completion"
    assert row(day, B1)["status"] == ""  # no services completed today
    hist = (await server.db.salons.find_one({"id": SALON}))["attendance_mode_history"]
    assert [h["mode"] for h in hist] == ["geo_checkin", "service_completion"]


@pytest.mark.asyncio
async def test_days_before_first_switch_stay_service_completion(api, auth, server):
    await set_mode(api, auth, "geo_checkin")   # first switch, effective today
    rep = (await api.get(f"/api/salons/{SALON}/staff-attendance/report",
                         params={"start_date": yesterday(), "end_date": today()},
                         headers=auth["admin"])).json()
    modes = {(x["staff_id"], x["date"]): x["mode"] for x in rep["rows"]}
    assert modes[(B1, yesterday())] == "service_completion"
    assert modes[(B1, today())] == "geo_checkin"


@pytest.mark.asyncio
async def test_auto_checkout_closes_open_sessions(api, auth, server):
    import attendance_mode as am
    await set_mode(api, auth, "geo_checkin", auto_checkout=True, auto_checkout_time="21:00")
    await server.db.salons.update_one({"id": SALON}, {"$set": {"attendance_mode_history": [
        {"mode": "geo_checkin", "effective_from_date": "2000-01-01"}]}})
    d = yesterday()
    await server.db.attendance.insert_one({
        "id": f"{SALON}_{B1}_{d}", "salon_id": SALON, "barber_id": B1, "date": d,
        "check_in_at": f"{d}T10:00:00+05:30", "check_out_at": None,
        "sessions": [{"ci": f"{d}T10:00:00+05:30"}], "auto_calculated": True,
    })
    res = await am.auto_close_open_checkins_job(server.db)
    assert res["closed"] >= 1
    doc = await server.db.attendance.find_one({"id": f"{SALON}_{B1}_{d}"})
    assert doc["sessions"][0]["co"].startswith(f"{d}T21:00:00")
    assert doc["total_minutes"] == 660 and doc["status"] == "present"
    # Re-running changes nothing.
    assert (await am.auto_close_open_checkins_job(server.db))["closed"] == 0


@pytest.mark.asyncio
async def test_old_toggle_records_are_migrated_once(api, server):
    await server.db.salons.update_one({"id": SALON}, {"$set": {"attendance_mode": "checkinout"}})
    await server.db.staff_attendance.insert_one({
        "salon_id": SALON, "barber_id": B2, "date": yesterday(),
        "sessions": [{"ci": f"{yesterday()}T09:00:00+00:00", "co": f"{yesterday()}T12:00:00+00:00"}],
    })
    await server.migrate_attendance_store()
    await server.migrate_attendance_store()
    assert (await server.db.salons.find_one({"id": SALON}))["attendance_mode"] == "geo_checkin"
    doc = await server.db.attendance.find_one({"id": f"{SALON}_{B2}_{yesterday()}"})
    assert len(doc["sessions"]) == 1 and doc["check_in_at"].startswith(yesterday())
