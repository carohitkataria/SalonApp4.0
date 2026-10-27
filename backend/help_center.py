"""
Help Center — platform-managed help videos, FAQs and categories.

Platform admins manage the content from the platform console; each item is
tagged with the audiences (sections) it shows in: salon, customer, supplier,
homepage. Only the salon Help drawer reads it today — the other sections are
placeholders that will read the same public endpoint later.

Collections:
  help_categories   {id, name, description, audiences[], order}
  help_videos       {id, title, description, audiences[], category_id, hashtags[],
                     video_file_id | video_url, poster_file_id, published, order, views}
  help_faqs         {id, question, answer, audiences[], category_id, hashtags[],
                     published, order}
  GridFS bucket "help_media" holds uploaded video files and poster images.

Endpoints:
  Platform admin (mounted under /api/platform/help):
    GET    /                          everything (incl. unpublished) for the console
    POST   /categories                create        PUT/DELETE /categories/{id}
    POST   /videos                    create        PUT/DELETE /videos/{id}
    POST   /videos/{id}/file          upload video (multipart)   DELETE removes it
    POST   /videos/{id}/poster        upload poster image (multipart)
    POST   /faqs                      create        PUT/DELETE /faqs/{id}
    POST   /import                    bulk-create starter categories + FAQs
  Public (mounted under /api/help):
    GET    ?audience=salon            published content for one section
    GET    /media/{file_id}           stream a video / poster (supports Range)
    POST   /videos/{id}/view          count a play
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field, field_validator

from platform_admin import get_current_platform_admin as require_platform_admin

logger = logging.getLogger(__name__)

# Injected at startup by server.py via init_help_center(...)
_db = None
_bucket: Optional[AsyncIOMotorGridFSBucket] = None

admin_router = APIRouter(prefix="/api/platform/help", tags=["platform-help-center"])
public_router = APIRouter(prefix="/api/help", tags=["help-center"])

AUDIENCES = ["salon", "customer", "supplier", "homepage"]
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_VIDEO_BYTES = 150 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
CHUNK = 256 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_audiences(v: Optional[List[str]]) -> List[str]:
    out = [a for a in (v or []) if a in AUDIENCES]
    return list(dict.fromkeys(out)) or ["salon"]


def _clean_hashtags(v: Optional[List[str]]) -> List[str]:
    out = []
    for raw in v or []:
        tag = re.sub(r"[^a-z0-9\-]+", "-", str(raw).strip().lstrip("#").lower()).strip("-")
        if tag and tag not in out:
            out.append(tag[:40])
    return out[:20]


# ---------- Models ----------

class _Tagged(BaseModel):
    audiences: List[str] = Field(default_factory=lambda: ["salon"])
    category_id: Optional[str] = None
    hashtags: List[str] = Field(default_factory=list)
    published: bool = True
    order: int = 0

    @field_validator("audiences")
    @classmethod
    def _aud(cls, v):
        return _clean_audiences(v)

    @field_validator("hashtags")
    @classmethod
    def _tags(cls, v):
        return _clean_hashtags(v)


class CategoryIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    audiences: List[str] = Field(default_factory=lambda: ["salon"])
    order: int = 0

    @field_validator("audiences")
    @classmethod
    def _aud(cls, v):
        return _clean_audiences(v)


class VideoIn(_Tagged):
    title: str = Field(..., min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=2000)
    video_url: Optional[str] = Field(default=None, max_length=500)  # YouTube / Vimeo / MP4 link


class FaqIn(_Tagged):
    question: str = Field(..., min_length=3, max_length=300)
    answer: str = Field(..., min_length=1, max_length=4000)


class ImportCategory(BaseModel):
    name: str
    description: Optional[str] = None
    audiences: List[str] = Field(default_factory=lambda: ["salon"])


class ImportFaq(BaseModel):
    question: str
    answer: str
    category: Optional[str] = None  # category name
    hashtags: List[str] = Field(default_factory=list)
    audiences: List[str] = Field(default_factory=lambda: ["salon"])


class ImportIn(BaseModel):
    categories: List[ImportCategory] = Field(default_factory=list)
    faqs: List[ImportFaq] = Field(default_factory=list)


# ---------- Helpers ----------

def _oid(file_id: str) -> ObjectId:
    try:
        return ObjectId(file_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="File not found")


async def _delete_file(file_id: Optional[str]):
    if not file_id:
        return
    try:
        await _bucket.delete(_oid(file_id))
    except Exception:  # already gone
        logger.info("help media %s already removed", file_id)


async def _store_upload(file: UploadFile, allowed: set, max_bytes: int, kind: str) -> dict:
    ctype = (file.content_type or "").lower()
    if ctype not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported {kind} type: {ctype or 'unknown'}")
    stream = _bucket.open_upload_stream(file.filename or kind, metadata={"content_type": ctype, "kind": kind})
    size = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(status_code=413, detail=f"{kind.capitalize()} is larger than {max_bytes // (1024 * 1024)} MB")
            await stream.write(chunk)
        await stream.close()
    except BaseException:
        await stream.abort()
        raise
    return {"file_id": str(stream._id), "filename": file.filename, "size": size, "content_type": ctype}


async def _get_or_404(coll, item_id: str) -> dict:
    doc = await _db[coll].find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


def _public_video(v: dict) -> dict:
    out = {k: v.get(k) for k in ("id", "title", "description", "audiences", "category_id", "hashtags", "order", "video_url")}
    if v.get("video_file_id"):
        out["video_src"] = f"/api/help/media/{v['video_file_id']}"
    elif v.get("video_url"):
        out["video_src"] = v["video_url"]
    out["poster_src"] = f"/api/help/media/{v['poster_file_id']}" if v.get("poster_file_id") else None
    return out


SORT = [("order", 1), ("created_at", 1)]


# ---------- Platform admin ----------

@admin_router.get("")
async def admin_overview(admin=Depends(require_platform_admin)):
    cats = await _db.help_categories.find({}, {"_id": 0}).sort(SORT).to_list(500)
    vids = await _db.help_videos.find({}, {"_id": 0}).sort(SORT).to_list(1000)
    faqs = await _db.help_faqs.find({}, {"_id": 0}).sort(SORT).to_list(2000)
    return {"audiences": AUDIENCES, "categories": cats, "videos": [{**v, **_public_video(v)} for v in vids], "faqs": faqs}


@admin_router.post("/categories")
async def create_category(body: CategoryIn, admin=Depends(require_platform_admin)):
    if await _db.help_categories.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}}):
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "name": body.name.strip(), "created_at": _now(), "updated_at": _now()}
    await _db.help_categories.insert_one({**doc})
    return doc


@admin_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryIn, admin=Depends(require_platform_admin)):
    await _get_or_404("help_categories", cat_id)
    await _db.help_categories.update_one({"id": cat_id}, {"$set": {**body.model_dump(), "name": body.name.strip(), "updated_at": _now()}})
    return await _get_or_404("help_categories", cat_id)


@admin_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, admin=Depends(require_platform_admin)):
    await _get_or_404("help_categories", cat_id)
    # items in the category stay, just uncategorised
    for coll in ("help_videos", "help_faqs"):
        await _db[coll].update_many({"category_id": cat_id}, {"$set": {"category_id": None}})
    await _db.help_categories.delete_one({"id": cat_id})
    return {"ok": True}


@admin_router.post("/videos")
async def create_video(body: VideoIn, admin=Depends(require_platform_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "video_file_id": None, "poster_file_id": None,
           "views": 0, "created_at": _now(), "updated_at": _now()}
    await _db.help_videos.insert_one({**doc})
    return {**doc, **_public_video(doc)}


@admin_router.put("/videos/{video_id}")
async def update_video(video_id: str, body: VideoIn, admin=Depends(require_platform_admin)):
    await _get_or_404("help_videos", video_id)
    await _db.help_videos.update_one({"id": video_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    v = await _get_or_404("help_videos", video_id)
    return {**v, **_public_video(v)}


@admin_router.delete("/videos/{video_id}")
async def delete_video(video_id: str, admin=Depends(require_platform_admin)):
    v = await _get_or_404("help_videos", video_id)
    await _delete_file(v.get("video_file_id"))
    await _delete_file(v.get("poster_file_id"))
    await _db.help_videos.delete_one({"id": video_id})
    return {"ok": True}


@admin_router.post("/videos/{video_id}/file")
async def upload_video_file(video_id: str, file: UploadFile = File(...), admin=Depends(require_platform_admin)):
    v = await _get_or_404("help_videos", video_id)
    info = await _store_upload(file, VIDEO_TYPES, MAX_VIDEO_BYTES, "video")
    await _delete_file(v.get("video_file_id"))
    await _db.help_videos.update_one({"id": video_id}, {"$set": {
        "video_file_id": info["file_id"], "video_filename": info["filename"], "video_size": info["size"],
        "video_url": None, "updated_at": _now()}})
    v = await _get_or_404("help_videos", video_id)
    return {**v, **_public_video(v)}


@admin_router.delete("/videos/{video_id}/file")
async def delete_video_file(video_id: str, admin=Depends(require_platform_admin)):
    v = await _get_or_404("help_videos", video_id)
    await _delete_file(v.get("video_file_id"))
    await _db.help_videos.update_one({"id": video_id}, {"$set": {
        "video_file_id": None, "video_filename": None, "video_size": None, "updated_at": _now()}})
    v = await _get_or_404("help_videos", video_id)
    return {**v, **_public_video(v)}


@admin_router.post("/videos/{video_id}/poster")
async def upload_poster(video_id: str, file: UploadFile = File(...), admin=Depends(require_platform_admin)):
    v = await _get_or_404("help_videos", video_id)
    info = await _store_upload(file, IMAGE_TYPES, MAX_IMAGE_BYTES, "image")
    await _delete_file(v.get("poster_file_id"))
    await _db.help_videos.update_one({"id": video_id}, {"$set": {"poster_file_id": info["file_id"], "updated_at": _now()}})
    v = await _get_or_404("help_videos", video_id)
    return {**v, **_public_video(v)}


@admin_router.post("/faqs")
async def create_faq(body: FaqIn, admin=Depends(require_platform_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": _now(), "updated_at": _now()}
    await _db.help_faqs.insert_one({**doc})
    return doc


@admin_router.put("/faqs/{faq_id}")
async def update_faq(faq_id: str, body: FaqIn, admin=Depends(require_platform_admin)):
    await _get_or_404("help_faqs", faq_id)
    await _db.help_faqs.update_one({"id": faq_id}, {"$set": {**body.model_dump(), "updated_at": _now()}})
    return await _get_or_404("help_faqs", faq_id)


@admin_router.delete("/faqs/{faq_id}")
async def delete_faq(faq_id: str, admin=Depends(require_platform_admin)):
    await _get_or_404("help_faqs", faq_id)
    await _db.help_faqs.delete_one({"id": faq_id})
    return {"ok": True}


@admin_router.post("/import")
async def import_content(body: ImportIn, admin=Depends(require_platform_admin)):
    """Create starter categories and FAQs; existing names / questions are skipped."""
    by_name = {c["name"].lower(): c["id"] for c in await _db.help_categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    made_c = made_f = 0
    for i, c in enumerate(body.categories):
        key = c.name.strip().lower()
        if not key or key in by_name:
            continue
        cid = str(uuid.uuid4())
        await _db.help_categories.insert_one({"id": cid, "name": c.name.strip(), "description": c.description,
                                              "audiences": _clean_audiences(c.audiences), "order": i,
                                              "created_at": _now(), "updated_at": _now()})
        by_name[key] = cid
        made_c += 1
    existing_q = {f["question"].strip().lower() for f in await _db.help_faqs.find({}, {"_id": 0, "question": 1}).to_list(5000)}
    for i, f in enumerate(body.faqs):
        key = f.question.strip().lower()
        if not key or key in existing_q:
            continue
        await _db.help_faqs.insert_one({"id": str(uuid.uuid4()), "question": f.question.strip(), "answer": f.answer,
                                        "category_id": by_name.get((f.category or "").strip().lower()),
                                        "hashtags": _clean_hashtags(f.hashtags), "audiences": _clean_audiences(f.audiences),
                                        "published": True, "order": i, "created_at": _now(), "updated_at": _now()})
        existing_q.add(key)
        made_f += 1
    return {"categories_created": made_c, "faqs_created": made_f}


# ---------- Public ----------

@public_router.get("")
async def public_help(audience: str = Query("salon")):
    if audience not in AUDIENCES:
        raise HTTPException(status_code=400, detail="Unknown audience")
    q = {"published": True, "audiences": audience}
    vids = await _db.help_videos.find(q, {"_id": 0}).sort(SORT).to_list(500)
    vids = [v for v in vids if v.get("video_file_id") or v.get("video_url")]
    faqs = await _db.help_faqs.find(q, {"_id": 0, "id": 1, "question": 1, "answer": 1, "category_id": 1, "hashtags": 1, "order": 1}).sort(SORT).to_list(2000)
    used = {x.get("category_id") for x in vids + faqs if x.get("category_id")}
    cats = await _db.help_categories.find({"$or": [{"audiences": audience}, {"id": {"$in": list(used)}}]}, {"_id": 0}).sort(SORT).to_list(500)
    return {"audience": audience, "categories": cats, "videos": [_public_video(v) for v in vids], "faqs": faqs}


@public_router.get("/media/{file_id}")
async def stream_media(file_id: str, request: Request):
    try:
        grid_out = await _bucket.open_download_stream(_oid(file_id))
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    size = grid_out.length
    ctype = (grid_out.metadata or {}).get("content_type") or "application/octet-stream"
    start, end = 0, size - 1
    status = 200
    rng = request.headers.get("range")
    if rng:
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        if m:
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            elif m.group(2):  # suffix range: last N bytes
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            if start > end or start >= size:
                raise HTTPException(status_code=416, detail="Range not satisfiable")
            status = 206
    grid_out.seek(start)
    length = end - start + 1

    async def body():
        left = length
        while left > 0:
            chunk = await grid_out.read(min(CHUNK, left))
            if not chunk:
                break
            left -= len(chunk)
            yield chunk

    headers = {"Accept-Ranges": "bytes", "Content-Length": str(length), "Cache-Control": "public, max-age=86400"}
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(body(), status_code=status, media_type=ctype, headers=headers)


@public_router.post("/videos/{video_id}/view")
async def count_view(video_id: str):
    await _db.help_videos.update_one({"id": video_id}, {"$inc": {"views": 1}})
    return {"ok": True}


def init_help_center(*, db):
    global _db, _bucket
    _db = db
    _bucket = AsyncIOMotorGridFSBucket(db, bucket_name="help_media")
    return admin_router, public_router
