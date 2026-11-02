"""
marketing_studio.py — Marketing Studio: posters, photo campaigns, festival
calendar and Instagram.

  * Marketing media hosting — images (posters, gallery photos) stored in the
    GridFS bucket "marketing_media" and served from a PUBLIC absolute URL, which
    Meta needs for WhatsApp image headers and Instagram needs for publishing.
  * Posters — saved poster designs + their rendered PNG (rendered in the browser).
  * Photo template — one-click "offer_with_photo" WhatsApp template (IMAGE header)
    created as a draft for the salon; the existing /submit endpoint sends it to Meta.
  * Calendar — built-in occasions (fixed / rule-based dates), festivals managed by
    the platform team (lunar dates are confirmed by an admin before salons see
    them), the salon's own events, scheduled campaigns and guest birthdays.
  * Instagram (Instagram API with Instagram Login) — connect, recent posts,
    publish a poster to the feed or story, schedule posts. Needs INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET and Meta app review for instagram_business_content_publish.

Collections:
  marketing_posters        {id, salon_id, title, size, design, media_id, url, created_at}
  marketing_occasions      {id, name, date, idea, message, theme, published, needs_verification}
  salon_marketing_events   {id, salon_id, title, date, note}
  salon_instagram          {salon_id, ig_user_id, username, access_token, expires_at, media_cache}
  instagram_oauth_states   {state, salon_id, created_at}
  instagram_posts          {id, salon_id, kind, image_url, caption, status, schedule_at, ...}
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import RedirectResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field, field_validator

import marketing as mk
from platform_admin import get_current_platform_admin as require_platform_admin

logger = logging.getLogger(__name__)

_db = None
_bucket: Optional[AsyncIOMotorGridFSBucket] = None

router = APIRouter(prefix="/api", tags=["marketing-studio"])

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
IG_GRAPH = "https://graph.instagram.com/v21.0"
IG_SCOPES = "instagram_business_basic,instagram_business_content_publish"
PHOTO_TEMPLATE_NAME = "offer_with_photo"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: Optional[datetime] = None) -> str:
    return (d or _now()).isoformat()


def _public_base(request: Optional[Request] = None) -> str:
    for k in ("BACKEND_PUBLIC_URL", "PUBLIC_BACKEND_URL", "PUBLIC_BASE_URL", "APP_BASE_URL"):
        v = (os.environ.get(k) or "").strip().rstrip("/")
        if v:
            return v
    return str(request.base_url).rstrip("/") if request else ""


def _frontend_base() -> str:
    for k in ("APP_BASE_URL", "PUBLIC_APP_URL", "FRONTEND_PUBLIC_URL", "PUBLIC_BASE_URL"):
        v = (os.environ.get(k) or "").strip().rstrip("/")
        if v:
            return v
    return ""


def _media_url(media_id: str, request: Optional[Request] = None) -> str:
    return f"{_public_base(request)}/api/public/marketing-media/{media_id}"


def _oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Not found")


async def _user(request: Request, salon_id: str, admin: bool = False) -> Dict[str, Any]:
    user = await (mk._require_admin(request) if admin else mk._require_user(request))
    mk._assert_salon_scope(user, salon_id)
    return user


# ================================================================
# Media hosting
# ================================================================

async def _store_image(file: UploadFile, salon_id: str, kind: str) -> str:
    ctype = (file.content_type or "").lower()
    if ctype not in IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG or WebP image")
    stream = _bucket.open_upload_stream(file.filename or f"{kind}.png",
                                        metadata={"content_type": ctype, "salon_id": salon_id, "kind": kind})
    size = 0
    try:
        while True:
            chunk = await file.read(512 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="Image is larger than 8 MB")
            await stream.write(chunk)
        await stream.close()
    except BaseException:
        await stream.abort()
        raise
    return str(stream._id)


async def _delete_media(media_id: Optional[str]):
    if media_id:
        try:
            await _bucket.delete(_oid(media_id))
        except Exception:
            logger.info("marketing media %s already removed", media_id)


@router.post("/salons/{salon_id}/marketing/media")
async def upload_marketing_media(salon_id: str, request: Request, file: UploadFile = File(...)):
    """Host an image publicly (for WhatsApp image headers / Instagram)."""
    await _user(request, salon_id)
    mid = await _store_image(file, salon_id, "photo")
    return {"media_id": mid, "url": _media_url(mid, request)}


@router.get("/public/marketing-media/{media_id}")
async def get_marketing_media(media_id: str):
    try:
        g = await _bucket.open_download_stream(_oid(media_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")
    ctype = (g.metadata or {}).get("content_type") or "image/png"

    async def body():
        while True:
            chunk = await g.readchunk()
            if not chunk:
                break
            yield chunk

    # Always send CORS headers: an <img> preview (no CORS) and a later canvas /
    # fetch() read (CORS) share one cached response, so it must carry them.
    return StreamingResponse(body(), media_type=ctype, headers={
        "Content-Length": str(g.length), "Cache-Control": "public, max-age=604800",
        "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin"})


# ================================================================
# Posters
# ================================================================

@router.get("/salons/{salon_id}/marketing/posters")
async def list_posters(salon_id: str, request: Request):
    await _user(request, salon_id)
    rows = await _db.marketing_posters.find({"salon_id": salon_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        r["url"] = _media_url(r["media_id"], request)
    return {"posters": rows}


@router.post("/salons/{salon_id}/marketing/posters")
async def create_poster(salon_id: str, request: Request, file: UploadFile = File(...),
                        title: str = Query("Poster"), size: str = Query("square")):
    """Save a poster: the browser-rendered PNG plus its title/size."""
    await _user(request, salon_id)
    mid = await _store_image(file, salon_id, "poster")
    doc = {"id": str(uuid.uuid4()), "salon_id": salon_id, "title": title[:120] or "Poster",
           "size": size if size in ("square", "story", "wide") else "square",
           "media_id": mid, "created_at": _iso()}
    await _db.marketing_posters.insert_one({**doc})
    return {**doc, "url": _media_url(mid, request)}


@router.delete("/salons/{salon_id}/marketing/posters/{poster_id}")
async def delete_poster(salon_id: str, poster_id: str, request: Request):
    await _user(request, salon_id)
    p = await _db.marketing_posters.find_one({"id": poster_id, "salon_id": salon_id})
    if not p:
        raise HTTPException(status_code=404, detail="Poster not found")
    await _delete_media(p.get("media_id"))
    await _db.marketing_posters.delete_one({"id": poster_id})
    return {"ok": True}


# ================================================================
# One-click photo template (WhatsApp image header)
# ================================================================

class PhotoTemplateIn(BaseModel):
    sample_url: str                      # a hosted poster/photo URL
    sample_handle: Optional[str] = None  # Meta upload handle of the same image (needed for review)


@router.post("/salons/{salon_id}/marketing/photo-template")
async def ensure_photo_template(salon_id: str, body: PhotoTemplateIn, request: Request):
    """Create (once) the salon's ready-made image template as a draft.
    The UI then calls the existing /marketing/templates/{id}/submit."""
    await _user(request, salon_id, admin=True)
    existing = await _db.marketing_templates.find_one({"salon_id": salon_id, "name": PHOTO_TEMPLATE_NAME}, {"_id": 0})
    if existing:
        if body.sample_handle and existing.get("approval_status") in ("draft", "rejected"):
            await _db.marketing_templates.update_one({"id": existing["id"]}, {"$set": {
                "header_handle": body.sample_handle, "header_sample_url": body.sample_url}})
            existing.update(header_handle=body.sample_handle, header_sample_url=body.sample_url)
        return existing
    doc = {
        "id": str(uuid.uuid4()), "salon_id": salon_id, "name": PHOTO_TEMPLATE_NAME,
        "friendly_name": "Offer with photo", "category": "marketing", "lang_code": "en",
        "body": "Hi {{1}}, {{2}}\n\nReply STOP to opt out.",
        "header_format": "IMAGE", "header_sample_url": body.sample_url, "header_handle": body.sample_handle,
        "example_values": {"1": "Priya", "2": "this Diwali enjoy 20% off on all hair services. Book now!"},
        "provider": None, "provider_sid": None, "approval_status": "draft",
        "created_at": _iso(), "created_by": "marketing-studio",
    }
    await _db.marketing_templates.insert_one({**doc})
    return doc


async def _wa_creds(salon_id: str) -> Dict[str, Any]:
    """WhatsApp account for this salon's templates: its own connected WABA when
    live, else the platform WABA from env, else mock (dev / not connected)."""
    conn = await _db.salon_channel_connections.find_one({"salon_id": salon_id, "provider": "meta"}, {"_id": 0}) or {}
    tok = str(conn.get("access_token") or "")
    if conn.get("waba_id") and tok and not tok.startswith("mock"):
        return {"waba_id": conn["waba_id"], "token": tok, "source": "salon"}
    waba, tok = os.environ.get("META_WA_BUSINESS_ACCOUNT_ID"), os.environ.get("META_WA_ACCESS_TOKEN")
    if waba and tok and not tok.startswith("mock"):
        return {"waba_id": waba, "token": tok, "source": "platform"}
    return {"source": "mock"}


def _graph() -> str:
    return f"https://graph.facebook.com/{os.environ.get('META_WA_API_VERSION') or os.environ.get('META_GRAPH_API_VERSION') or 'v21.0'}"


@router.post("/salons/{salon_id}/marketing/photo-template/submit")
async def submit_photo_template(salon_id: str, request: Request):
    """Send the photo template to the WhatsApp account this salon sends from."""
    await _user(request, salon_id, admin=True)
    t = await _db.marketing_templates.find_one({"salon_id": salon_id, "name": PHOTO_TEMPLATE_NAME}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Photo template not created yet")
    if not t.get("header_handle"):
        raise HTTPException(status_code=400, detail="Sample photo missing — choose a photo and try again")
    ex = t.get("example_values") or {}
    payload = {"name": PHOTO_TEMPLATE_NAME, "category": "MARKETING", "language": t.get("lang_code") or "en", "components": [
        {"type": "HEADER", "format": "IMAGE", "example": {"header_handle": [t["header_handle"]]}},
        {"type": "BODY", "text": t["body"], "example": {"body_text": [[ex.get("1", "Priya"), ex.get("2", "20% off this week")]]}},
    ]}
    cr = await _wa_creds(salon_id)
    if cr["source"] == "mock":
        status, extra = "pending", {"mock": True}
    else:
        async with httpx.AsyncClient(timeout=25) as c:
            r = await c.post(f"{_graph()}/{cr['waba_id']}/message_templates", params={"access_token": cr["token"]}, json=payload)
        data = r.json() if r.content else {}
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"WhatsApp: {(data.get('error') or {}).get('error_user_msg') or (data.get('error') or {}).get('message') or r.text[:200]}")
        status, extra = (data.get("status") or "PENDING").lower(), {"meta_template_id": data.get("id")}
    await _db.marketing_templates.update_one({"id": t["id"]}, {"$set": {
        "approval_status": status, "provider": "meta", "wa_account": cr["source"], "submitted_at": _iso(), **extra}})
    return {"id": t["id"], "approval_status": status, "account": cr["source"]}


@router.get("/salons/{salon_id}/marketing/photo-template/status")
async def photo_template_status(salon_id: str, request: Request):
    """Refresh the photo template's approval status from WhatsApp."""
    await _user(request, salon_id)
    t = await _db.marketing_templates.find_one({"salon_id": salon_id, "name": PHOTO_TEMPLATE_NAME}, {"_id": 0})
    if not t:
        return {"exists": False}
    cr = await _wa_creds(salon_id)
    status = t.get("approval_status") or "draft"
    if cr["source"] != "mock" and status not in ("draft",):
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(f"{_graph()}/{cr['waba_id']}/message_templates",
                                params={"access_token": cr["token"], "name": PHOTO_TEMPLATE_NAME, "fields": "name,status"})
            rows = (r.json() or {}).get("data") or []
            if rows:
                status = str(rows[0].get("status") or status).lower()
                await _db.marketing_templates.update_one({"id": t["id"]}, {"$set": {"approval_status": status, "last_synced_at": _iso()}})
        except Exception as e:
            logger.warning("photo template status check failed: %s", e)
    return {"exists": True, "id": t["id"], "approval_status": status}


# ================================================================
# Calendar
# ================================================================

def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """n-th weekday (0=Mon) of a month."""
    first = date(year, month, 1)
    shift = (weekday - first.weekday()) % 7
    return first + timedelta(days=shift + 7 * (n - 1))


# Built-in occasions: fixed or rule-based dates only (always correct).
def _builtin_occasions(year: int) -> List[Dict[str, Any]]:
    O = lambda key, name, d, theme, idea, msg: {  # noqa: E731
        "id": f"builtin-{key}-{year}", "name": name, "date": d.isoformat(), "theme": theme,
        "idea": idea, "message": msg, "source": "builtin"}
    return [
        O("newyear", "New Year", date(year, 1, 1), "bold", "New year, new look — party & glow packages",
          "Start the new year looking your best! Enjoy special New Year offers at {salon}."),
        O("republic", "Republic Day", date(year, 1, 26), "fresh", "Long-weekend grooming offer",
          "Celebrate Republic Day with a fresh look. Special offers this weekend at {salon}."),
        O("valentine", "Valentine's Day", date(year, 2, 14), "love", "Couple packages & date-night styling",
          "Get date-night ready! Couple packages and styling offers at {salon} this Valentine's."),
        O("womensday", "Women's Day", date(year, 3, 8), "love", "Pamper packages for women",
          "Happy Women's Day! Treat yourself to a pampering session at {salon}."),
        O("mothersday", "Mother's Day", _nth_weekday(year, 5, 6, 2), "love", "Gift a spa day to mom",
          "This Mother's Day, gift her some me-time. Spa & beauty packages at {salon}."),
        O("fathersday", "Father's Day", _nth_weekday(year, 6, 6, 3), "bold", "Grooming packages for dads",
          "Treat Dad to a sharp new look this Father's Day at {salon}."),
        O("friendship", "Friendship Day", _nth_weekday(year, 8, 6, 1), "fresh", "Bring a friend offer",
          "Bring your best friend and both get a special offer at {salon}!"),
        O("independence", "Independence Day", date(year, 8, 15), "fresh", "Freedom offer",
          "Celebrate Independence Day with special offers at {salon}."),
        O("teachers", "Teachers' Day", date(year, 9, 5), "minimal", "Thank-you offer for teachers",
          "Happy Teachers' Day! Special pampering offers for teachers at {salon}."),
        O("childrens", "Children's Day", date(year, 11, 14), "fresh", "Kids' haircut offer",
          "Happy Children's Day! Fun haircuts and kids' offers at {salon}."),
        O("christmas", "Christmas", date(year, 12, 25), "festive", "Party-season styling",
          "Merry Christmas! Get party-ready with festive looks at {salon}."),
        O("nye", "New Year's Eve", date(year, 12, 31), "bold", "Party makeup & styling slots",
          "Book your New Year's Eve party look now at {salon} — slots fill fast!"),
    ]


# Lunar festivals change every year. These are seeded as DRAFTS that the
# platform team must confirm (date + publish) before salons see them.
FESTIVAL_DRAFTS = [
    ("Dhanteras", "2026-11-06", "festive"), ("Diwali", "2026-11-08", "festive"),
    ("Bhai Dooj", "2026-11-11", "festive"), ("Chhath Puja", "2026-11-15", "festive"),
    ("Guru Nanak Jayanti", "2026-11-24", "minimal"),
    ("Lohri", "2027-01-13", "festive"), ("Makar Sankranti / Pongal", "2027-01-14", "fresh"),
    ("Vasant Panchami", "2027-02-11", "fresh"), ("Maha Shivaratri", "2027-03-06", "minimal"),
    ("Eid ul-Fitr", "2027-03-10", "festive"), ("Holi", "2027-03-22", "holi"),
    ("Ugadi / Gudi Padwa", "2027-04-07", "fresh"), ("Baisakhi", "2027-04-14", "festive"),
    ("Ram Navami", "2027-04-15", "minimal"), ("Akshaya Tritiya", "2027-05-09", "festive"),
    ("Eid al-Adha", "2027-05-17", "festive"), ("Raksha Bandhan", "2027-08-17", "love"),
    ("Janmashtami", "2027-08-25", "festive"), ("Ganesh Chaturthi", "2027-09-04", "festive"),
    ("Onam", "2027-09-12", "fresh"), ("Navratri begins", "2027-09-30", "festive"),
    ("Dussehra", "2027-10-09", "festive"), ("Karva Chauth", "2027-10-18", "love"),
    ("Dhanteras", "2027-10-27", "festive"), ("Diwali", "2027-10-29", "festive"),
]


def _festival_copy(name: str) -> Dict[str, str]:
    return {"idea": f"{name} special — festive looks, packages and a limited-time offer",
            "message": f"Happy {name}! Get your festive look at {{salon}}. Book now — special offers this week."}


class OccasionIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    date: str  # YYYY-MM-DD
    theme: str = "festive"
    idea: Optional[str] = Field(default=None, max_length=300)
    message: Optional[str] = Field(default=None, max_length=1000)
    published: bool = False

    @field_validator("date")
    @classmethod
    def _d(cls, v):
        date.fromisoformat(v)
        return v


class SalonEventIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=80)
    date: str
    note: Optional[str] = Field(default=None, max_length=300)

    @field_validator("date")
    @classmethod
    def _d(cls, v):
        date.fromisoformat(v)
        return v


@router.get("/salons/{salon_id}/marketing/calendar")
async def marketing_calendar(salon_id: str, request: Request, start: str = Query(...), end: str = Query(...)):
    await _user(request, salon_id)
    try:
        d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="start/end must be YYYY-MM-DD")
    if (d1 - d0).days > 400:
        raise HTTPException(status_code=400, detail="Range too large")
    occ = [o for y in range(d0.year, d1.year + 1) for o in _builtin_occasions(y) if start <= o["date"] <= end]
    async for o in _db.marketing_occasions.find({"published": True, "date": {"$gte": start, "$lte": end}}, {"_id": 0}):
        occ.append({**o, "source": "platform"})
    events = await _db.salon_marketing_events.find(
        {"salon_id": salon_id, "date": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(500)
    camps = []
    async for c in _db.marketing_campaigns.find({"salon_id": salon_id}, {"_id": 0, "id": 1, "name": 1, "status": 1,
                                                                          "schedule_at": 1, "launched_at": 1, "created_at": 1}):
        when = (c.get("schedule_at") or c.get("launched_at") or "")[:10]
        if when and start <= when <= end:
            camps.append({**c, "date": when})
    # Guest birthdays per day (month-day match), so salons can plan wishes.
    bdays: Dict[str, int] = {}
    span = [(d0 + timedelta(days=i)) for i in range((d1 - d0).days + 1)]
    md = {d.strftime("%m-%d"): d.isoformat() for d in span}
    async for g in _db.salon_customers.find({"salon_id": salon_id, "date_of_birth": {"$nin": [None, ""]}},
                                            {"_id": 0, "date_of_birth": 1}):
        k = str(g.get("date_of_birth"))[5:10]
        if k in md:
            bdays[md[k]] = bdays.get(md[k], 0) + 1
    occ.sort(key=lambda o: o["date"])
    return {"occasions": occ, "events": events, "campaigns": camps,
            "birthdays": [{"date": k, "count": v} for k, v in sorted(bdays.items())]}


@router.post("/salons/{salon_id}/marketing/events")
async def add_salon_event(salon_id: str, body: SalonEventIn, request: Request):
    await _user(request, salon_id, admin=True)
    doc = {"id": str(uuid.uuid4()), "salon_id": salon_id, **body.model_dump(), "created_at": _iso()}
    await _db.salon_marketing_events.insert_one({**doc})
    return doc


@router.delete("/salons/{salon_id}/marketing/events/{event_id}")
async def delete_salon_event(salon_id: str, event_id: str, request: Request):
    await _user(request, salon_id, admin=True)
    r = await _db.salon_marketing_events.delete_one({"id": event_id, "salon_id": salon_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


# ---- platform: festival list ----

@router.get("/platform/marketing/occasions")
async def platform_list_occasions(admin=Depends(require_platform_admin)):
    rows = await _db.marketing_occasions.find({}, {"_id": 0}).sort("date", 1).to_list(1000)
    return {"occasions": rows}


@router.post("/platform/marketing/occasions")
async def platform_create_occasion(body: OccasionIn, admin=Depends(require_platform_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "needs_verification": False, "created_at": _iso()}
    doc.update({k: v for k, v in _festival_copy(body.name).items() if not doc.get(k)})
    await _db.marketing_occasions.insert_one({**doc})
    return doc


@router.put("/platform/marketing/occasions/{oid}")
async def platform_update_occasion(oid: str, body: OccasionIn, admin=Depends(require_platform_admin)):
    upd = {**body.model_dump(), "needs_verification": False, "updated_at": _iso()}
    r = await _db.marketing_occasions.update_one({"id": oid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Not found")
    return await _db.marketing_occasions.find_one({"id": oid}, {"_id": 0})


@router.delete("/platform/marketing/occasions/{oid}")
async def platform_delete_occasion(oid: str, admin=Depends(require_platform_admin)):
    await _db.marketing_occasions.delete_one({"id": oid})
    return {"ok": True}


@router.post("/platform/marketing/occasions/seed")
async def platform_seed_occasions(admin=Depends(require_platform_admin)):
    """Add the festival list as unpublished drafts with estimated dates
    (skips ones already present). An admin confirms each date and publishes."""
    made = 0
    for name, d, theme in FESTIVAL_DRAFTS:
        if await _db.marketing_occasions.find_one({"name": name, "date": {"$regex": f"^{d[:4]}"}}):
            continue
        await _db.marketing_occasions.insert_one({
            "id": str(uuid.uuid4()), "name": name, "date": d, "theme": theme, **_festival_copy(name),
            "published": False, "needs_verification": True, "created_at": _iso()})
        made += 1
    return {"created": made}


# ================================================================
# Instagram (Instagram API with Instagram Login)
# ================================================================

def _ig_conf() -> Dict[str, str]:
    app_id = (os.environ.get("INSTAGRAM_APP_ID") or "").strip()
    secret = (os.environ.get("INSTAGRAM_APP_SECRET") or "").strip()
    redirect = (os.environ.get("INSTAGRAM_REDIRECT_URI") or "").strip() or f"{_public_base()}/api/instagram/callback"
    return {"app_id": app_id, "secret": secret, "redirect": redirect}


def _ig_configured() -> bool:
    c = _ig_conf()
    return bool(c["app_id"] and c["secret"])


async def _ig_conn(salon_id: str) -> Dict[str, Any]:
    conn = await _db.salon_instagram.find_one({"salon_id": salon_id}, {"_id": 0})
    if not conn or not conn.get("access_token"):
        raise HTTPException(status_code=400, detail="Instagram is not connected")
    return conn


async def _ig_get(path: str, token: str, params: Optional[dict] = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{IG_GRAPH}{path}", params={**(params or {}), "access_token": token})
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Instagram: {r.json().get('error', {}).get('message', r.text)[:200]}")
    return r.json()


async def _ig_post(path: str, token: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{IG_GRAPH}{path}", data={**data, "access_token": token})
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Instagram: {r.json().get('error', {}).get('message', r.text)[:200]}")
    return r.json()


@router.get("/salons/{salon_id}/instagram/status")
async def instagram_status(salon_id: str, request: Request):
    await _user(request, salon_id)
    conn = await _db.salon_instagram.find_one({"salon_id": salon_id}, {"_id": 0, "access_token": 0, "media_cache": 0})
    return {"configured": _ig_configured(), "connected": bool(conn), **(conn or {})}


@router.post("/salons/{salon_id}/instagram/connect")
async def instagram_connect(salon_id: str, request: Request):
    await _user(request, salon_id, admin=True)
    if not _ig_configured():
        raise HTTPException(status_code=503, detail="Instagram connection is not set up on SalonHub yet")
    c = _ig_conf()
    state = secrets.token_urlsafe(24)
    await _db.instagram_oauth_states.insert_one({"state": state, "salon_id": salon_id, "created_at": _iso()})
    qs = urlencode({"client_id": c["app_id"], "redirect_uri": c["redirect"], "response_type": "code",
                    "scope": IG_SCOPES, "state": state, "enable_fb_login": "0", "force_authentication": "1"})
    return {"auth_url": f"https://www.instagram.com/oauth/authorize?{qs}"}


@router.get("/instagram/callback")
async def instagram_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    back = f"{_frontend_base()}/salon/dashboard?tab=marketing"
    st = await _db.instagram_oauth_states.find_one_and_delete({"state": state}) if state else None
    if error or not code or not st:
        return RedirectResponse(f"{back}&instagram=failed")
    c = _ig_conf()
    try:
        async with httpx.AsyncClient(timeout=20) as cl:
            r = await cl.post("https://api.instagram.com/oauth/access_token", data={
                "client_id": c["app_id"], "client_secret": c["secret"], "grant_type": "authorization_code",
                "redirect_uri": c["redirect"], "code": code.split("#")[0]})
            r.raise_for_status()
            short = r.json()
            r2 = await cl.get("https://graph.instagram.com/access_token", params={
                "grant_type": "ig_exchange_token", "client_secret": c["secret"], "access_token": short["access_token"]})
            r2.raise_for_status()
            long = r2.json()
            me = await cl.get(f"{IG_GRAPH}/me", params={"fields": "user_id,username,account_type,profile_picture_url",
                                                         "access_token": long["access_token"]})
            me.raise_for_status()
            me = me.json()
    except Exception as e:  # network / Meta error
        logger.warning("instagram oauth failed: %s", e)
        return RedirectResponse(f"{back}&instagram=failed")
    await _db.salon_instagram.update_one({"salon_id": st["salon_id"]}, {"$set": {
        "salon_id": st["salon_id"], "ig_user_id": str(me.get("user_id") or short.get("user_id")),
        "username": me.get("username"), "account_type": me.get("account_type"),
        "profile_picture_url": me.get("profile_picture_url"), "access_token": long["access_token"],
        "expires_at": _iso(_now() + timedelta(seconds=int(long.get("expires_in", 5184000)))),
        "connected_at": _iso(), "media_cache": None}}, upsert=True)
    return RedirectResponse(f"{back}&instagram=connected")


@router.delete("/salons/{salon_id}/instagram")
async def instagram_disconnect(salon_id: str, request: Request):
    await _user(request, salon_id, admin=True)
    await _db.salon_instagram.delete_one({"salon_id": salon_id})
    await _db.instagram_posts.update_many({"salon_id": salon_id, "status": "scheduled"}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


async def _recent_media(conn: Dict[str, Any], fresh: bool = False) -> List[dict]:
    cache = conn.get("media_cache") or {}
    if not fresh and cache.get("at") and (_now() - datetime.fromisoformat(cache["at"])).total_seconds() < 1800:
        return cache.get("items", [])
    data = await _ig_get(f"/{conn['ig_user_id']}/media", conn["access_token"], {
        "fields": "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp", "limit": 12})
    items = data.get("data", [])
    await _db.salon_instagram.update_one({"salon_id": conn["salon_id"]},
                                         {"$set": {"media_cache": {"at": _iso(), "items": items}}})
    return items


@router.get("/salons/{salon_id}/instagram/media")
async def instagram_media(salon_id: str, request: Request, fresh: bool = False):
    await _user(request, salon_id)
    return {"items": await _recent_media(await _ig_conn(salon_id), fresh)}


@router.get("/public/salons/{salon_id}/instagram")
async def instagram_public_feed(salon_id: str):
    """Latest posts for the salon's public page (empty when not connected)."""
    conn = await _db.salon_instagram.find_one({"salon_id": salon_id}, {"_id": 0})
    if not conn:
        return {"connected": False, "items": []}
    try:
        items = await _recent_media(conn)
    except HTTPException:
        items = (conn.get("media_cache") or {}).get("items", [])
    return {"connected": True, "username": conn.get("username"), "items": items}


class IgPostIn(BaseModel):
    image_url: str
    caption: Optional[str] = Field(default="", max_length=2200)
    kind: str = "feed"  # feed | story
    schedule_at: Optional[str] = None  # ISO datetime; empty = publish now

    @field_validator("kind")
    @classmethod
    def _k(cls, v):
        if v not in ("feed", "story"):
            raise ValueError("kind must be feed or story")
        return v


async def _publish(post: Dict[str, Any]) -> Dict[str, Any]:
    conn = await _ig_conn(post["salon_id"])
    data = {"image_url": post["image_url"]}
    if post["kind"] == "story":
        data["media_type"] = "STORIES"
    else:
        data["caption"] = post.get("caption") or ""
    created = await _ig_post(f"/{conn['ig_user_id']}/media", conn["access_token"], data)
    pub = await _ig_post(f"/{conn['ig_user_id']}/media_publish", conn["access_token"], {"creation_id": created["id"]})
    return {"ig_media_id": pub.get("id"), "status": "published", "published_at": _iso()}


@router.post("/salons/{salon_id}/instagram/posts")
async def instagram_create_post(salon_id: str, body: IgPostIn, request: Request):
    await _user(request, salon_id, admin=True)
    await _ig_conn(salon_id)
    doc = {"id": str(uuid.uuid4()), "salon_id": salon_id, **body.model_dump(), "status": "scheduled",
           "created_at": _iso(), "error": None}
    if body.schedule_at:
        try:
            when = datetime.fromisoformat(body.schedule_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="schedule_at must be an ISO date-time")
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        doc["schedule_at"] = when.astimezone(timezone.utc).isoformat()
        await _db.instagram_posts.insert_one({**doc})
        return doc
    doc.update(await _publish(doc))
    await _db.instagram_posts.insert_one({**doc})
    return doc


@router.get("/salons/{salon_id}/instagram/posts")
async def instagram_list_posts(salon_id: str, request: Request):
    await _user(request, salon_id)
    rows = await _db.instagram_posts.find({"salon_id": salon_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"posts": rows}


@router.delete("/salons/{salon_id}/instagram/posts/{post_id}")
async def instagram_cancel_post(salon_id: str, post_id: str, request: Request):
    await _user(request, salon_id, admin=True)
    r = await _db.instagram_posts.update_one({"id": post_id, "salon_id": salon_id, "status": "scheduled"},
                                             {"$set": {"status": "cancelled"}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="No scheduled post to cancel")
    return {"ok": True}


async def run_instagram_jobs():
    """Every 5 minutes: publish due scheduled posts; refresh tokens near expiry."""
    if _db is None:
        return
    now = _iso()
    async for p in _db.instagram_posts.find({"status": "scheduled", "schedule_at": {"$lte": now}}, {"_id": 0}):
        claimed = await _db.instagram_posts.update_one({"id": p["id"], "status": "scheduled"}, {"$set": {"status": "publishing"}})
        if not claimed.modified_count:
            continue
        try:
            upd = await _publish(p)
        except HTTPException as e:
            upd = {"status": "failed", "error": str(e.detail)}
        except Exception as e:  # network
            upd = {"status": "failed", "error": str(e)[:200]}
        await _db.instagram_posts.update_one({"id": p["id"]}, {"$set": upd})
    soon = _iso(_now() + timedelta(days=10))
    async for conn in _db.salon_instagram.find({"expires_at": {"$lte": soon}}, {"_id": 0, "salon_id": 1, "access_token": 1}):
        try:
            async with httpx.AsyncClient(timeout=20) as cl:
                r = await cl.get("https://graph.instagram.com/refresh_access_token",
                                 params={"grant_type": "ig_refresh_token", "access_token": conn["access_token"]})
            r.raise_for_status()
            j = r.json()
            await _db.salon_instagram.update_one({"salon_id": conn["salon_id"]}, {"$set": {
                "access_token": j["access_token"],
                "expires_at": _iso(_now() + timedelta(seconds=int(j.get("expires_in", 5184000))))}})
        except Exception as e:
            logger.warning("instagram token refresh failed for %s: %s", conn["salon_id"], e)


def init_marketing_studio(*, db):
    global _db, _bucket
    _db = db
    _bucket = AsyncIOMotorGridFSBucket(db, bucket_name="marketing_media")
    return router
