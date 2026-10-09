"""
Editing a staff member's contact details (in-process, in-memory MongoDB).

The mobile number is also the staff login number, so changing it must keep
the linked login account in step and stay unique.

Run:  pip install mongomock-motor pytest-asyncio
      cd backend && python -m pytest tests/test_staff_profile_edit.py -q
"""
import os
import sys

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
os.environ.setdefault("DB_NAME", "staff_profile_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

SALON, OTHER = "salon-p", "salon-q"


@pytest.fixture(scope="module")
def server():
    motor.motor_asyncio.AsyncIOMotorClient = lambda *a, **k: AsyncMongoMockClient()
    import server as srv  # noqa: WPS433 — imported after the DB patch on purpose
    return srv


def _h(srv, **p):
    return {"Authorization": f"Bearer {srv.create_access_token(p)}"}


@pytest_asyncio.fixture(loop_scope="session")
async def api(server):
    db = server.db
    for name in ("barbers", "salon_users", "salons"):
        await db[name].delete_many({})
    await db.salons.insert_many([{"id": SALON, "status": "active"}, {"id": OTHER, "status": "active"}])
    await db.barbers.insert_many([
        {"id": "b1", "salon_id": SALON, "name": "Asha", "mobile": "+919000000001", "is_active": True},
        {"id": "b2", "salon_id": SALON, "name": "Ravi", "mobile": "+919000000002", "is_active": True},
    ])
    await db.salon_users.insert_one({"id": "u1", "salon_id": SALON, "staff_id": "b1",
                                     "mobile": "+919000000001", "login_id": "asha.k", "status": "active"})
    transport = httpx.ASGITransport(app=server.fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


ADMIN_PW = "owner-pass-1"


@pytest.mark.asyncio
async def test_mobile_edit_is_contact_only(api, server):
    admin = _h(server, role="salon_admin", salon_id=SALON, sub=SALON)
    r = await api.put("/api/barbers/b1", headers=admin,
                      json={"mobile": "98765 43210", "emergency_contact": "+919111111111"})
    assert r.status_code == 200, r.text
    assert r.json()["mobile"] == "+919876543210"
    assert r.json()["emergency_contact"] == "+919111111111"
    user = await server.db.salon_users.find_one({"id": "u1"})
    assert user["mobile"] == "+919000000001" and user["login_id"] == "asha.k"  # login untouched
    r = await api.put("/api/barbers/b1", headers=admin, json={"mobile": "12345"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_other_salon_cannot_edit_staff(api, server):
    other = _h(server, role="salon_admin", salon_id=OTHER, sub=OTHER)
    r = await api.put("/api/barbers/b1", headers=other, json={"mobile": "9876500000"})
    assert r.status_code == 403
    assert (await server.db.barbers.find_one({"id": "b1"}))["mobile"] == "+919000000001"


@pytest.mark.asyncio
async def test_access_login_id_is_the_only_staff_login(api, server):
    admin = _h(server, role="salon_admin", salon_id=SALON, sub=SALON)
    # Ravi has no access yet: creating it needs a login ID.
    r = await api.put(f"/api/salons/{SALON}/barbers/b2/credentials", headers=admin,
                      json={"password": "ravi-pass-1"})
    assert r.status_code == 400
    r = await api.put(f"/api/salons/{SALON}/barbers/b2/credentials", headers=admin,
                      json={"login_id": "ravi.stylist", "password": "ravi-pass-1"})
    assert r.status_code == 200, r.text
    acct = await server.db.salon_users.find_one({"staff_id": "b2"})
    assert acct["login_id"] == "ravi.stylist" and acct["role"] == "staff"

    login = lambda ident, pw: api.post("/api/salon/users/login", json={"identifier": ident, "password": pw})
    ok = await login("Ravi.Stylist", "ravi-pass-1")               # login ID, any case
    assert ok.status_code == 200, ok.text
    assert ok.json()["staff_id"] == "b2"
    assert (await login("9000000002", "ravi-pass-1")).status_code == 404   # staff mobile is not a login
    assert (await login("ravi.stylist", "wrong-pass")).status_code == 401

    # Login IDs are unique platform-wide.
    r = await api.put(f"/api/salons/{SALON}/barbers/b1/credentials", headers=admin,
                      json={"login_id": "RAVI.stylist"})
    assert r.status_code == 409

    # Deactivated staff can no longer sign in.
    await api.put("/api/barbers/b2", headers=admin, json={"is_active": False})
    r = await login("ravi.stylist", "ravi-pass-1")
    assert r.status_code == 403 and "inactive" in r.json()["detail"]


@pytest.mark.asyncio
async def test_owner_still_signs_in_with_salon_mobile(api, server):
    await server.db.salon_users.insert_one({
        "id": "owner", "salon_id": SALON, "login_id": "admin", "mobile": "+919999900000",
        "role": "admin", "status": "active", "name": "Owner",
        "password_hash": server.pwd_context.hash(ADMIN_PW), "permissions": {},
    })
    r = await api.post("/api/salon/users/login", json={"identifier": "9999900000", "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
