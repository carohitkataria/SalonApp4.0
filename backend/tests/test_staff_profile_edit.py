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


@pytest.mark.asyncio
async def test_admin_can_change_mobile_and_login_follows(api, server):
    admin = _h(server, role="salon_admin", salon_id=SALON, sub=SALON)
    r = await api.put("/api/barbers/b1", headers=admin,
                      json={"mobile": "98765 43210", "emergency_contact": "+919111111111"})
    assert r.status_code == 200, r.text
    assert r.json()["mobile"] == "+919876543210"
    assert r.json()["emergency_contact"] == "+919111111111"
    user = await server.db.salon_users.find_one({"id": "u1"})
    assert user["mobile"] == "+919876543210"   # staff can log in with the new number
    assert user["login_id"] == "asha.k"         # custom login ID untouched


@pytest.mark.asyncio
async def test_mobile_must_be_valid_and_unique(api, server):
    admin = _h(server, role="salon_admin", salon_id=SALON, sub=SALON)
    r = await api.put("/api/barbers/b1", headers=admin, json={"mobile": "12345"})
    assert r.status_code == 400
    r = await api.put("/api/barbers/b1", headers=admin, json={"mobile": "9000000002"})
    assert r.status_code == 409 and "Another staff" in r.json()["detail"]
    await server.db.salon_users.insert_one({"id": "u9", "salon_id": OTHER, "mobile": "+919000000099",
                                            "login_id": "x.y", "status": "active"})
    r = await api.put("/api/barbers/b1", headers=admin, json={"mobile": "9000000099"})
    assert r.status_code == 409 and "another login" in r.json()["detail"]
    # Saving the unchanged number is fine.
    r = await api.put("/api/barbers/b1", headers=admin, json={"mobile": "+919000000001", "name": "Asha K"})
    assert r.status_code == 200 and r.json()["name"] == "Asha K"


@pytest.mark.asyncio
async def test_other_salon_cannot_edit_staff(api, server):
    other = _h(server, role="salon_admin", salon_id=OTHER, sub=OTHER)
    r = await api.put("/api/barbers/b1", headers=other, json={"mobile": "9876500000"})
    assert r.status_code == 403
    assert (await server.db.barbers.find_one({"id": "b1"}))["mobile"] == "+919000000001"
