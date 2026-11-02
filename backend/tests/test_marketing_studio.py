"""Marketing Studio: posters + public media, photo template, calendar,
platform festival list, Instagram (status/connect guard + publish job).
"""
import asyncio
import os
import struct
import uuid
import zlib
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://meta-inbound-chat.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SALON_ID_LOGIN = os.environ.get("TEST_SALON_IDENTIFIER", "admin")
SALON_PW = os.environ.get("TEST_SALON_PASSWORD", "salon123")
OWNER_MOBILE = os.environ.get("TEST_PLATFORM_MOBILE", "7503070727")
OWNER_PASSWORD = os.environ.get("TEST_PLATFORM_PASSWORD", "OwnerSecure#7503")


def _png(w=4, h=4) -> bytes:
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)  # noqa: E731
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + \
        chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def salon():
    r = requests.post(f"{API}/salon/users/login", json={"identifier": SALON_ID_LOGIN, "password": SALON_PW}, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    return {"id": b["salon_id"], "h": {"Authorization": f"Bearer {b['access_token']}"}}


@pytest.fixture(scope="module")
def owner():
    r = requests.post(f"{API}/platform/auth/login-password", json={"mobile": OWNER_MOBILE, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    b = r.json()
    return {"Authorization": f"Bearer {next(b[k] for k in ('token', 'access_token', 'jwt') if k in b)}"}


def test_poster_and_public_media(salon):
    sid, h = salon["id"], salon["h"]
    png = _png()
    r = requests.post(f"{API}/salons/{sid}/marketing/posters", headers=h, params={"title": "Diwali 20%", "size": "story"},
                      files={"file": ("p.png", png, "image/png")}, timeout=20)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["size"] == "story" and p["url"].endswith(f"/api/public/marketing-media/{p['media_id']}")
    img = requests.get(f"{API}/public/marketing-media/{p['media_id']}", timeout=15)  # public, no auth
    assert img.status_code == 200 and img.content == png and img.headers["content-type"] == "image/png"
    assert p["id"] in {x["id"] for x in requests.get(f"{API}/salons/{sid}/marketing/posters", headers=h, timeout=15).json()["posters"]}
    bad = requests.post(f"{API}/salons/{sid}/marketing/media", headers=h, files={"file": ("x.txt", b"hi", "text/plain")}, timeout=15)
    assert bad.status_code == 400
    assert requests.post(f"{API}/salons/{sid}/marketing/posters", files={"file": ("p.png", png, "image/png")}, timeout=15).status_code in (401, 403)
    assert requests.delete(f"{API}/salons/{sid}/marketing/posters/{p['id']}", headers=h, timeout=15).status_code == 200
    assert requests.get(f"{API}/public/marketing-media/{p['media_id']}", timeout=15).status_code == 404


def test_photo_template_is_created_once(salon):
    sid, h = salon["id"], salon["h"]
    a = requests.post(f"{API}/salons/{sid}/marketing/photo-template", headers=h, json={"sample_url": "https://x/y.png", "sample_handle": "4::abc"}, timeout=15).json()
    b = requests.post(f"{API}/salons/{sid}/marketing/photo-template", headers=h, json={"sample_url": "https://x/z.png"}, timeout=15).json()
    assert a["id"] == b["id"] and a["name"] == "offer_with_photo" and a["header_format"] == "IMAGE"
    assert a["header_handle"] == "4::abc" and "{{2}}" in a["body"]
    listed = requests.get(f"{API}/salons/{sid}/marketing/templates", headers=h, timeout=15).json()["templates"]
    assert a["id"] in {t["id"] for t in listed}
    sub = requests.post(f"{API}/salons/{sid}/marketing/photo-template/submit", headers=h, timeout=30)
    assert sub.status_code in (200, 502), sub.text  # 502 = WhatsApp rejected (live creds only)
    if sub.status_code == 200:
        st = requests.get(f"{API}/salons/{sid}/marketing/photo-template/status", headers=h, timeout=30).json()
        assert st["exists"] and st["approval_status"] == sub.json()["approval_status"]


def test_calendar_builtin_events_and_festivals(salon, owner):
    sid, h = salon["id"], salon["h"]
    cal = requests.get(f"{API}/salons/{sid}/marketing/calendar", headers=h, params={"start": "2027-05-01", "end": "2027-06-30"}, timeout=15).json()
    names = {o["name"]: o["date"] for o in cal["occasions"]}
    assert names["Mother's Day"] == "2027-05-09" and names["Father's Day"] == "2027-06-20"
    assert requests.get(f"{API}/salons/{sid}/marketing/calendar", headers=h, params={"start": "2027-01-01", "end": "2028-12-31"}, timeout=15).status_code == 400

    ev = requests.post(f"{API}/salons/{sid}/marketing/events", headers=h, json={"title": "Anniversary sale", "date": "2027-05-20"}, timeout=15).json()
    cal = requests.get(f"{API}/salons/{sid}/marketing/calendar", headers=h, params={"start": "2027-05-01", "end": "2027-05-31"}, timeout=15).json()
    assert ev["id"] in {e["id"] for e in cal["events"]}
    assert requests.delete(f"{API}/salons/{sid}/marketing/events/{ev['id']}", headers=h, timeout=15).status_code == 200

    # Platform festivals: seeded drafts are hidden until confirmed & published.
    first = requests.post(f"{API}/platform/marketing/occasions/seed", headers=owner, timeout=15)
    assert first.status_code == 200
    again = requests.post(f"{API}/platform/marketing/occasions/seed", headers=owner, timeout=15).json()
    assert again["created"] == 0
    rows = requests.get(f"{API}/platform/marketing/occasions", headers=owner, timeout=15).json()["occasions"]
    holi = next(o for o in rows if o["name"] == "Holi")
    assert not holi["published"]
    if first.json()["created"]:  # freshly seeded drafts must be confirmed first
        assert holi["needs_verification"]
    rng = {"start": holi["date"][:8] + "01", "end": holi["date"][:8] + "28"}
    seen = lambda: {o["name"] for o in requests.get(f"{API}/salons/{sid}/marketing/calendar", headers=h, params=rng, timeout=15).json()["occasions"]}  # noqa: E731
    assert "Holi" not in seen()
    upd = requests.put(f"{API}/platform/marketing/occasions/{holi['id']}", headers=owner, timeout=15,
                       json={"name": "Holi", "date": holi["date"], "theme": "holi", "published": True}).json()
    assert upd["published"] and not upd["needs_verification"]
    assert "Holi" in seen()
    requests.put(f"{API}/platform/marketing/occasions/{holi['id']}", headers=owner, timeout=15,
                 json={"name": "Holi", "date": holi["date"], "theme": "holi", "published": False})


def test_instagram_not_configured(salon):
    sid, h = salon["id"], salon["h"]
    st = requests.get(f"{API}/salons/{sid}/instagram/status", headers=h, timeout=15).json()
    assert st["connected"] is False
    if not st["configured"]:
        assert requests.post(f"{API}/salons/{sid}/instagram/connect", headers=h, timeout=15).status_code == 503
    assert requests.get(f"{API}/public/salons/{sid}/instagram", timeout=15).json() == {"connected": False, "items": []}
    r = requests.post(f"{API}/salons/{sid}/instagram/posts", headers=h, json={"image_url": "https://x/y.png"}, timeout=15)
    assert r.status_code == 400  # not connected


def test_instagram_scheduled_publish_job(monkeypatch):
    """In-process: a due scheduled post is published once via the Graph calls."""
    asyncio.run(_publish_job_case(monkeypatch))


async def _publish_job_case(monkeypatch):
    from motor.motor_asyncio import AsyncIOMotorClient
    import marketing_studio as ms

    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[f"test_ms_{uuid.uuid4().hex[:6]}"]
    ms.init_marketing_studio(db=db)
    calls = []

    async def fake_post(path, token, data):
        calls.append((path, data))
        return {"id": "container-1"} if path.endswith("/media") else {"id": "ig-media-9"}

    monkeypatch.setattr(ms, "_ig_post", fake_post)
    far = (datetime.now(timezone.utc) + timedelta(days=50)).isoformat()
    await db.salon_instagram.insert_one({"salon_id": "s1", "ig_user_id": "1784", "access_token": "tok", "expires_at": far})
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    await db.instagram_posts.insert_many([
        {"id": "due", "salon_id": "s1", "kind": "story", "image_url": "https://x/a.png", "caption": "c", "status": "scheduled", "schedule_at": past},
        {"id": "later", "salon_id": "s1", "kind": "feed", "image_url": "https://x/b.png", "caption": "c", "status": "scheduled", "schedule_at": future},
    ])
    try:
        await ms.run_instagram_jobs()
        await ms.run_instagram_jobs()  # second run must not publish again
        due = await db.instagram_posts.find_one({"id": "due"})
        later = await db.instagram_posts.find_one({"id": "later"})
        assert due["status"] == "published" and due["ig_media_id"] == "ig-media-9"
        assert later["status"] == "scheduled"
        assert [c[0] for c in calls] == ["/1784/media", "/1784/media_publish"]
        assert calls[0][1] == {"image_url": "https://x/a.png", "media_type": "STORIES"}
    finally:
        await db.client.drop_database(db.name)
