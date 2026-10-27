"""Help Center: platform-managed help videos / FAQs / categories.

Covers admin CRUD, video upload to GridFS + Range streaming, audience
filtering and published-only output on the public endpoint, and cleanup.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://meta-inbound-chat.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OWNER_MOBILE = os.environ.get("TEST_PLATFORM_MOBILE", "7503070727")
OWNER_PASSWORD = os.environ.get("TEST_PLATFORM_PASSWORD", "OwnerSecure#7503")


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/platform/auth/login-password",
                      json={"mobile": OWNER_MOBILE, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    token = next(body[k] for k in ("token", "access_token", "jwt") if k in body)
    return {"Authorization": f"Bearer {token}"}


def test_admin_requires_platform_token():
    assert requests.get(f"{API}/platform/help", timeout=15).status_code in (401, 403)


def test_full_flow(headers):
    tag = uuid.uuid4().hex[:6]
    cat = requests.post(f"{API}/platform/help/categories", headers=headers, timeout=15,
                        json={"name": f"Billing {tag}", "audiences": ["salon"]}).json()
    dup = requests.post(f"{API}/platform/help/categories", headers=headers, timeout=15,
                        json={"name": f"billing {tag}"})
    assert dup.status_code == 409

    vid = requests.post(f"{API}/platform/help/videos", headers=headers, timeout=15, json={
        "title": f"Create an invoice {tag}", "audiences": ["salon", "nonsense"], "category_id": cat["id"],
        "hashtags": ["#Billing", "GST Help", "billing"], "published": True,
    }).json()
    assert vid["audiences"] == ["salon"]
    assert vid["hashtags"] == ["billing", "gst-help"]

    draft = requests.post(f"{API}/platform/help/videos", headers=headers, timeout=15, json={
        "title": f"Draft {tag}", "audiences": ["salon"], "published": False, "video_url": "https://youtu.be/abcdefgh"}).json()
    other = requests.post(f"{API}/platform/help/faqs", headers=headers, timeout=15, json={
        "question": f"Supplier only {tag}?", "answer": "Yes", "audiences": ["supplier"]}).json()
    faq = requests.post(f"{API}/platform/help/faqs", headers=headers, timeout=15, json={
        "question": f"Why is GST missing {tag}?", "answer": "Turn on GST registration.", "audiences": ["salon"],
        "category_id": cat["id"], "hashtags": ["gst"]}).json()

    # A video with no file and no link is not shown publicly yet.
    pub = requests.get(f"{API}/help", params={"audience": "salon"}, timeout=15).json()
    assert vid["id"] not in {v["id"] for v in pub["videos"]}

    payload = os.urandom(300_000)
    up = requests.post(f"{API}/platform/help/videos/{vid['id']}/file", headers=headers, timeout=60,
                       files={"file": ("demo.mp4", payload, "video/mp4")})
    assert up.status_code == 200, up.text
    src = up.json()["video_src"]
    assert src.startswith("/api/help/media/")

    bad = requests.post(f"{API}/platform/help/videos/{vid['id']}/file", headers=headers, timeout=15,
                        files={"file": ("x.txt", b"hello", "text/plain")})
    assert bad.status_code == 400

    full = requests.get(f"{BASE_URL}{src}", timeout=30)
    assert full.status_code == 200 and full.content == payload
    part = requests.get(f"{BASE_URL}{src}", headers={"Range": "bytes=1000-1999"}, timeout=30)
    assert part.status_code == 206
    assert part.headers["Content-Range"] == f"bytes 1000-1999/{len(payload)}"
    assert part.content == payload[1000:2000]

    pub = requests.get(f"{API}/help", params={"audience": "salon"}, timeout=15).json()
    ids = {v["id"] for v in pub["videos"]}
    assert vid["id"] in ids and draft["id"] not in ids
    qs = {f["id"] for f in pub["faqs"]}
    assert faq["id"] in qs and other["id"] not in qs
    assert cat["id"] in {c["id"] for c in pub["categories"]}
    sup = requests.get(f"{API}/help", params={"audience": "supplier"}, timeout=15).json()
    assert other["id"] in {f["id"] for f in sup["faqs"]}
    assert requests.get(f"{API}/help", params={"audience": "martians"}, timeout=15).status_code == 400

    # Deleting a category keeps its items, uncategorised.
    assert requests.delete(f"{API}/platform/help/categories/{cat['id']}", headers=headers, timeout=15).status_code == 200
    allc = requests.get(f"{API}/platform/help", headers=headers, timeout=15).json()
    assert next(f for f in allc["faqs"] if f["id"] == faq["id"])["category_id"] is None

    # Deleting the video removes its file too.
    for kind, item in (("videos", vid), ("videos", draft), ("faqs", faq), ("faqs", other)):
        assert requests.delete(f"{API}/platform/help/{kind}/{item['id']}", headers=headers, timeout=15).status_code == 200
    assert requests.get(f"{BASE_URL}{src}", timeout=15).status_code == 404


def test_import_skips_existing(headers):
    tag = uuid.uuid4().hex[:6]
    body = {"categories": [{"name": f"Imported {tag}"}],
            "faqs": [{"question": f"Imported question {tag}?", "answer": "A", "category": f"Imported {tag}", "hashtags": ["x"]}]}
    first = requests.post(f"{API}/platform/help/import", headers=headers, json=body, timeout=15).json()
    again = requests.post(f"{API}/platform/help/import", headers=headers, json=body, timeout=15).json()
    assert first == {"categories_created": 1, "faqs_created": 1}
    assert again == {"categories_created": 0, "faqs_created": 0}
    allc = requests.get(f"{API}/platform/help", headers=headers, timeout=15).json()
    cat = next(c for c in allc["categories"] if c["name"] == f"Imported {tag}")
    faq = next(f for f in allc["faqs"] if f["question"] == f"Imported question {tag}?")
    assert faq["category_id"] == cat["id"]
    requests.delete(f"{API}/platform/help/faqs/{faq['id']}", headers=headers, timeout=15)
    requests.delete(f"{API}/platform/help/categories/{cat['id']}", headers=headers, timeout=15)
