"""
salon_marketing_settings.py
Marketing → Settings backend module.

Implements the actual-cost pass-through wallet model with Cashfree top-ups
+ Twilio sub-account status + spend sync + SMS DLT + Email sender + sending windows.

Money is stored as integer minor units (paise). WALLET_PLATFORM_MARGIN_PERCENT=0 —
every rupee salons pay reaches Twilio (via us) 1:1.

Storage
=======
Collections created lazily (Mongo):
  * twilio_subaccounts     {salon_id, subaccount_sid, waba_id, sender_phone_e164,
                            messaging_service_sid, display_name, quality_rating,
                            messaging_tier, sender_status, updated_at}
  * wallets                {salon_id, balance_minor, currency:"INR",
                            marketing_status: "not_activated"|"active"|"paused",
                            first_recharge_at, auto_recharge,
                            recharge_threshold_minor, recharge_amount_minor,
                            low_balance_alert_minor, updated_at}
  * wallet_ledger          {id, salon_id, type: topup|debit|adjustment|refund,
                            channel, amount_minor (+/-), balance_after_minor,
                            ref, twilio_usage_key, created_at}
  * usage_sync             {id, salon_id, subaccount_sid, period_date, category,
                            count, twilio_cost_minor, billed_cost_minor, synced_at}
  * dlt_config             {salon_id, entity_id, sender_header, provider,
                            template_dlt_ids:[], registered}
  * email_sender           {salon_id, from_name, from_email, reply_to, verified}
  * send_settings          {salon_id, window_start, window_end, quiet_start,
                            quiet_end, optout_keyword, require_optin,
                            per_guest_cap_per_week}
  * payment_orders         {provider_order_id, salon_id, amount_minor, purpose,
                            status: created|credited|failed|expired, event_history:[],
                            created_at, credited_at, reference_id}
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from payment_provider import (
    CreateOrderInput,
    get_payment_provider,
)

logger = logging.getLogger(__name__)

# ------------- Injected at startup -------------
_db = None
_get_current_salon_user = None
_get_current_salon_admin = None

settings_router = APIRouter(prefix="/api", tags=["marketing-settings"])


def init_marketing_settings_router(*, db, get_current_salon_user, get_current_salon_admin):
    global _db, _get_current_salon_user, _get_current_salon_admin
    _db = db
    _get_current_salon_user = get_current_salon_user
    _get_current_salon_admin = get_current_salon_admin


# ------------- Helpers -------------

def _clean(doc):
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rupees_env(name: str, default_rupees: int) -> int:
    """Convert an env var (rupees) into minor units (paise)."""
    try:
        return int(float(os.environ.get(name, str(default_rupees))) * 100)
    except (TypeError, ValueError):
        return default_rupees * 100


def _min_first_recharge_minor() -> int:
    return _rupees_env("WALLET_MIN_FIRST_RECHARGE", 500)


def _default_low_balance_alert_minor() -> int:
    return _rupees_env("WALLET_LOW_BALANCE_ALERT", 300)


async def _require_user(request: Request) -> Dict[str, Any]:
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="Auth not initialised")
    from fastapi.security import HTTPAuthorizationCredentials
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=403, detail="Not authenticated")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header.split(" ", 1)[1])
    return await _get_current_salon_user(creds)


async def _require_admin(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    if user.get("role") not in ("salon_admin", "platform_admin", "admin", "salon", "salon_branch_manager"):
        raise HTTPException(status_code=403, detail="Admin required")
    return user


def _assert_salon_scope(user: Dict[str, Any], salon_id: str):
    if user and user.get("salon_id") and user.get("salon_id") != salon_id:
        raise HTTPException(status_code=403, detail="Cross-salon access denied")


async def _get_or_create_wallet(salon_id: str) -> Dict[str, Any]:
    doc = await _db.wallets.find_one({"salon_id": salon_id})
    if not doc:
        doc = {
            "salon_id": salon_id,
            "balance_minor": 0,
            "currency": os.environ.get("WALLET_CURRENCY", "INR"),
            "marketing_status": "not_activated",
            "first_recharge_at": None,
            "auto_recharge": False,
            "recharge_threshold_minor": 0,
            "recharge_amount_minor": 0,
            "low_balance_alert_minor": _default_low_balance_alert_minor(),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await _db.wallets.insert_one(dict(doc))
    return _clean(doc)


async def _insert_ledger(
    salon_id: str, type_: str, amount_minor: int, balance_after_minor: int,
    channel: Optional[str] = None, ref: Optional[str] = None,
    twilio_usage_key: Optional[str] = None, note: Optional[str] = None,
    actor: Optional[dict] = None,
):
    row = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        "type": type_,           # topup | debit | adjustment | refund
        "channel": channel,      # whatsapp | sms | email | null
        "amount_minor": int(amount_minor),
        "balance_after_minor": int(balance_after_minor),
        "ref": ref,
        "twilio_usage_key": twilio_usage_key,
        "note": note,
        "actor": actor,          # WS4 — who made this entry (e.g. platform owner)
        "created_at": _now_iso(),
    }
    await _db.wallet_ledger.insert_one(dict(row))
    return _clean(row)


async def _snapshot_subaccount(salon_id: str) -> Dict[str, Any]:
    """Return the salon's sub-account state, seeding a placeholder row when
    missing so the frontend can render 'Not connected' cleanly."""
    doc = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not doc:
        doc = {
            "salon_id": salon_id,
            "subaccount_sid": None,
            "friendly_name": None,
            "waba_id": None,
            "sender_phone_e164": None,
            "messaging_service_sid": None,
            "display_name": None,
            "quality_rating": None,
            "messaging_tier": None,
            "sender_status": "not_connected",  # not_connected|pending|online|paused
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
    return _clean(doc)


# ------------- Wallet / spend guard -------------

async def assert_can_send(salon_id: str, estimated_cost_minor: int):
    """Called from the campaign dispatch code path. Raises HTTPException if the
    salon can't send (no first recharge OR insufficient balance)."""
    wallet = await _get_or_create_wallet(salon_id)
    if wallet.get("marketing_status") != "active":
        raise HTTPException(status_code=402, detail="Recharge required to activate marketing")
    if int(wallet.get("balance_minor") or 0) < int(estimated_cost_minor or 0):
        raise HTTPException(status_code=402, detail="Insufficient balance — top up to continue")
    return True


# ========================================================
# GET  /api/salons/{salon_id}/marketing/settings  (full snapshot)
# ========================================================

@settings_router.get("/salons/{salon_id}/marketing/settings/full")
async def get_settings_full(salon_id: str, request: Request):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)

    subaccount = await _snapshot_subaccount(salon_id)
    wallet = await _get_or_create_wallet(salon_id)

    dlt = _clean(await _db.dlt_config.find_one({"salon_id": salon_id})) or {}
    email_cfg = _clean(await _db.email_sender.find_one({"salon_id": salon_id})) or {}
    send_settings = _clean(await _db.send_settings.find_one({"salon_id": salon_id})) or {}

    # Spend this month
    now = datetime.now(timezone.utc)
    period_prefix = now.strftime("%Y-%m")
    spend = {"total_minor": 0, "channels": {"whatsapp": {"count": 0, "cost_minor": 0},
                                            "sms": {"count": 0, "cost_minor": 0},
                                            "email": {"count": 0, "cost_minor": 0}}}
    async for u in _db.usage_sync.find({"salon_id": salon_id, "period_date": {"$regex": f"^{period_prefix}"}}):
        cat = (u.get("category") or "whatsapp").lower()
        if cat not in spend["channels"]:
            spend["channels"][cat] = {"count": 0, "cost_minor": 0}
        spend["channels"][cat]["count"] += int(u.get("count") or 0)
        spend["channels"][cat]["cost_minor"] += int(u.get("billed_cost_minor") or 0)
        spend["total_minor"] += int(u.get("billed_cost_minor") or 0)

    # Environment hints for the frontend (Cashfree env)
    env_hints = {
        "cashfree_env": (os.environ.get("CASHFREE_ENV") or "sandbox"),
        "meta_app_id": (os.environ.get("META_APP_ID") or ""),
        "wallet_currency": (os.environ.get("WALLET_CURRENCY") or "INR"),
        "min_first_recharge_minor": _min_first_recharge_minor(),
        "twilio_whatsapp_sender": os.environ.get("TWILIO_WHATSAPP_SENDER"),
    }

    return {
        "salon_id": salon_id,
        "subaccount": subaccount,
        "wallet": wallet,
        "dlt": dlt,
        "email_sender": email_cfg,
        "send_settings": send_settings,
        "spend_month": spend,
        "env": env_hints,
    }


# ========================================================
# GET  /api/salons/{salon_id}/wallet
# ========================================================

@settings_router.get("/salons/{salon_id}/wallet")
async def get_wallet(salon_id: str, request: Request):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    w = await _get_or_create_wallet(salon_id)
    return {
        "salon_id": salon_id,
        "balance_minor": w.get("balance_minor") or 0,
        "currency": w.get("currency") or "INR",
        "marketing_status": w.get("marketing_status") or "not_activated",
        "first_recharge_at": w.get("first_recharge_at"),
        "auto_recharge": bool(w.get("auto_recharge")),
        "recharge_threshold_minor": w.get("recharge_threshold_minor") or 0,
        "recharge_amount_minor": w.get("recharge_amount_minor") or 0,
        "low_balance_alert_minor": w.get("low_balance_alert_minor") or _default_low_balance_alert_minor(),
    }


# ========================================================
# GET  /api/salons/{salon_id}/wallet/ledger
# ========================================================

@settings_router.get("/salons/{salon_id}/wallet/ledger")
async def get_wallet_ledger(salon_id: str, request: Request, limit: int = 100):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    out: List[Dict[str, Any]] = []
    limit = max(1, min(int(limit or 100), 500))
    async for row in _db.wallet_ledger.find({"salon_id": salon_id}).sort("created_at", -1).limit(limit):
        out.append(_clean(row))
    return {"entries": out}


# ========================================================
# POST /api/salons/{salon_id}/wallet/topup
# ========================================================

class TopupIn(BaseModel):
    amount_minor: int = Field(..., ge=1)
    return_url: Optional[str] = None


@settings_router.post("/salons/{salon_id}/wallet/topup")
async def create_wallet_topup(salon_id: str, body: TopupIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    wallet = await _get_or_create_wallet(salon_id)
    is_first_recharge = wallet.get("first_recharge_at") is None
    min_minor = _min_first_recharge_minor()
    if is_first_recharge and int(body.amount_minor) < min_minor:
        raise HTTPException(
            status_code=400,
            detail=f"First recharge must be at least ₹{min_minor // 100:,} to activate marketing.",
        )

    # Get salon for customer_details
    salon = await _db.salons.find_one({"id": salon_id}) or {}
    provider = get_payment_provider()
    idem_key = f"tl_{salon_id[:8]}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

    result = provider.create_order(CreateOrderInput(
        salon_id=salon_id,
        amount_minor=int(body.amount_minor),
        currency=os.environ.get("WALLET_CURRENCY", "INR"),
        purpose="wallet_topup",
        customer_id=user.get("user_id") or salon_id,
        customer_name=(salon.get("name") or user.get("name") or "Salon Owner")[:60],
        customer_email=(salon.get("email") or user.get("email") or "owner@example.com"),
        customer_phone=(salon.get("phone") or user.get("phone") or "9999999999"),
        return_url=body.return_url or (os.environ.get("APP_BASE_URL", "").rstrip("/") + "/salon/dashboard?tab=marketing"),
        idempotency_key=idem_key,
    ))

    # Persist the order for idempotent webhook credit + reconciliation.
    await _db.payment_orders.insert_one({
        "provider_order_id": result.provider_order_id,
        "payment_session_id": result.payment_session_id,
        "salon_id": salon_id,
        "amount_minor": result.amount_minor,
        "currency": result.currency,
        "purpose": "wallet_topup",
        "status": "created",
        "event_history": [{"event": "created", "at": _now_iso()}],
        "created_at": _now_iso(),
        "user_id": user.get("user_id"),
    })

    return {
        "provider_order_id": result.provider_order_id,
        "payment_session_id": result.payment_session_id,
        "amount_minor": result.amount_minor,
        "currency": result.currency,
        "cashfree_env": (os.environ.get("CASHFREE_ENV") or "sandbox"),
    }


# ========================================================
# POST /api/webhooks/cashfree  (raw body — signature verified)
# ========================================================

@settings_router.post("/webhooks/cashfree")
async def cashfree_webhook(request: Request):
    raw = await request.body()
    headers = dict(request.headers)
    provider = get_payment_provider()
    result = provider.verify_webhook(raw, headers)

    if not result.valid:
        # Log for debugging + return 401 to prevent silent replay attacks.
        logger.warning("Cashfree webhook signature invalid: %s", result.event)
        raise HTTPException(status_code=401, detail="Signature invalid")

    # Always ack non-success events so Cashfree stops retrying.
    if result.event != "payment.success":
        # Best-effort audit trail.
        await _db.payment_orders.update_one(
            {"provider_order_id": result.provider_order_id},
            {"$push": {"event_history": {"event": result.event, "at": _now_iso()}}}
        )
        return {"ok": True}

    order = await _db.payment_orders.find_one({"provider_order_id": result.provider_order_id})
    if not order:
        logger.warning("Cashfree webhook for unknown order %s", result.provider_order_id)
        return {"ok": True}  # ack

    if order.get("status") == "credited":
        return {"ok": True, "idempotent": True}  # replay

    salon_id = order["salon_id"]
    credit_amount = int(order.get("amount_minor") or result.amount_minor)

    wallet = await _get_or_create_wallet(salon_id)
    new_balance = int(wallet.get("balance_minor") or 0) + credit_amount

    is_first = wallet.get("first_recharge_at") is None
    updates = {
        "balance_minor": new_balance,
        "updated_at": _now_iso(),
        "marketing_status": "active",
    }
    if is_first:
        updates["first_recharge_at"] = _now_iso()

    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    await _insert_ledger(
        salon_id=salon_id, type_="topup", channel=None,
        amount_minor=credit_amount, balance_after_minor=new_balance,
        ref=result.provider_order_id, note="Cashfree top-up",
    )

    await _db.payment_orders.update_one(
        {"provider_order_id": result.provider_order_id},
        {"$set": {"status": "credited", "credited_at": _now_iso(), "reference_id": result.reference_id},
         "$push": {"event_history": {"event": "credited", "at": _now_iso(), "reference_id": result.reference_id}}}
    )
    return {"ok": True}


# ========================================================
# POST /api/salons/{salon_id}/wallet/simulate-credit  (DEV ONLY — bypasses PG)
# ========================================================

class SimulateCreditIn(BaseModel):
    provider_order_id: str
    amount_minor: Optional[int] = None


@settings_router.post("/salons/{salon_id}/wallet/simulate-credit")
async def simulate_credit(salon_id: str, body: SimulateCreditIn, request: Request):
    """Dev-only helper — pretends a Cashfree webhook fired for the given order id.
    Never enabled in production (CASHFREE_ENV=production disables this)."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    if (os.environ.get("CASHFREE_ENV") or "sandbox").lower() == "production":
        raise HTTPException(status_code=403, detail="simulate-credit is disabled in production")

    order = await _db.payment_orders.find_one({"provider_order_id": body.provider_order_id, "salon_id": salon_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "credited":
        return {"ok": True, "idempotent": True}

    amount = int(body.amount_minor or order.get("amount_minor") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount_minor missing")

    wallet = await _get_or_create_wallet(salon_id)
    new_balance = int(wallet.get("balance_minor") or 0) + amount
    is_first = wallet.get("first_recharge_at") is None
    updates = {"balance_minor": new_balance, "updated_at": _now_iso(), "marketing_status": "active"}
    if is_first:
        updates["first_recharge_at"] = _now_iso()

    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    await _insert_ledger(
        salon_id=salon_id, type_="topup", channel=None,
        amount_minor=amount, balance_after_minor=new_balance,
        ref=body.provider_order_id, note="Simulated top-up (dev)",
    )
    await _db.payment_orders.update_one(
        {"provider_order_id": body.provider_order_id},
        {"$set": {"status": "credited", "credited_at": _now_iso()},
         "$push": {"event_history": {"event": "credited-simulated", "at": _now_iso()}}}
    )
    return {"ok": True, "balance_minor": new_balance}


# ========================================================
# POST /api/salons/{salon_id}/wallet/auto-recharge  (config only)
# ========================================================

class AutoRechargeIn(BaseModel):
    auto_recharge: bool
    recharge_threshold_minor: int = Field(default=0, ge=0)
    recharge_amount_minor: int = Field(default=0, ge=0)
    low_balance_alert_minor: Optional[int] = None


@settings_router.post("/salons/{salon_id}/wallet/auto-recharge")
async def save_auto_recharge(salon_id: str, body: AutoRechargeIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    await _get_or_create_wallet(salon_id)
    updates = {
        "auto_recharge": bool(body.auto_recharge),
        "recharge_threshold_minor": int(body.recharge_threshold_minor),
        "recharge_amount_minor": int(body.recharge_amount_minor),
        "updated_at": _now_iso(),
    }
    if body.low_balance_alert_minor is not None:
        updates["low_balance_alert_minor"] = int(body.low_balance_alert_minor)
    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    return {"ok": True, **updates}


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/waba/embedded-signup-complete
# ========================================================

class ESCompleteIn(BaseModel):
    # Phase 2 — real Meta Embedded Signup completion payload.
    code: Optional[str] = None            # short-lived OAuth exchange code from FB.login
    waba_id: str
    phone_number_id: Optional[str] = None  # from the WA_EMBEDDED_SIGNUP event
    phone: Optional[str] = None            # optional display E.164
    display_name: Optional[str] = None


class ManualConnectIn(BaseModel):
    # Part 1 — manual "Connect WhatsApp" (no Embedded Signup / App Review needed).
    waba_id: str
    phone_number_id: str
    access_token: str
    sender_phone_e164: Optional[str] = None
    display_name: Optional[str] = None


class WabaRequestIn(BaseModel):
    # PART 4 — the "Connect own WhatsApp number" form only sends the number +
    # display name; the platform owner fills the technical WABA creds later. So
    # here sender_phone_e164 is required and the WABA creds are optional (using
    # the strict ManualConnectIn caused a 422 that crashed the page).
    sender_phone_e164: str
    display_name: Optional[str] = None
    waba_id: Optional[str] = None
    phone_number_id: Optional[str] = None
    access_token: Optional[str] = None


def _meta_enabled() -> bool:
    """True only when the platform Meta app credentials are present."""
    return bool(os.environ.get("META_APP_ID") and os.environ.get("META_APP_SECRET"))


def _graph_base() -> str:
    api = os.environ.get("META_WA_API_VERSION") or os.environ.get("META_GRAPH_API_VERSION") or "v21.0"
    return f"https://graph.facebook.com/{api}"


def _conn_is_live(conn: Dict[str, Any]) -> bool:
    """B1 — A connection is LIVE whenever it holds a REAL (non-`mock_`) access
    token + phone_number_id. This is independent of `_meta_enabled()` (the
    platform app secret), which is only needed for embedded-signup's OAuth code
    exchange — NOT for sending or template provisioning."""
    if not conn:
        return False
    tok = str(conn.get("access_token") or "")
    return bool(tok and conn.get("phone_number_id") and not tok.startswith("mock"))


def _token_is_live(access_token: Optional[str]) -> bool:
    """Real (non-mock) token check used by provisioning paths."""
    tok = str(access_token or "")
    return bool(tok and not tok.startswith("mock"))


async def _subscribe_app_to_waba(waba_id: str, access_token: str) -> Dict[str, Any]:
    """B2 — Subscribe OUR app to the salon's WABA so Meta POSTs inbound events to
    our webhook. Best-effort: never raise (retry-able); just log and return the
    result. Skipped for mock tokens / missing ids."""
    if not (waba_id and _token_is_live(access_token)):
        return {"skipped": True}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{_graph_base()}/{waba_id}/subscribed_apps",
                params={"access_token": access_token},
            )
        try:
            body = r.json()
        except Exception:
            body = {"text": r.text}
        logger.info(f"[WA subscribe] waba={waba_id} http={r.status_code} resp={body}")
        return {"http_status": r.status_code, "resp": body}
    except Exception as e:
        logger.warning(f"[WA subscribe] waba={waba_id} failed: {e}")
        return {"error": str(e)}


async def provision_templates_for_waba(waba_id: str, access_token: str) -> List[Dict[str, Any]]:
    """Phase 3.3 — push the platform's standard template library onto a salon's
    WABA. Called on WABA connect and from the library "Use" action. Returns a
    list of {name, status, resp} so the caller can surface approval state.

    Safe in mock mode: if Meta creds are absent we simulate a 'mock' provision
    so the flow still completes without network calls.
    """
    out: List[Dict[str, Any]] = []
    try:
        lib = await _db.platform_template_library.find(
            {"auto_provision": True}, {"_id": 0}
        ).to_list(100)
    except Exception:
        lib = []
    if not lib:
        return out
    base = _graph_base()
    if not _token_is_live(access_token):
        # Mock provision — no network calls. Only for mock_ tokens (B1: a real
        # token provisions for real even without the platform app secret).
        for t in lib:
            out.append({"name": t.get("name"), "status": "mock", "resp": {"mock": True}})
        return out
    async with httpx.AsyncClient(timeout=25) as c:
        for t in lib:
            try:
                r = await c.post(
                    f"{base}/{waba_id}/message_templates",
                    params={"access_token": access_token},
                    json=t.get("meta_payload") or {},
                )
                out.append({"name": t.get("name"), "status": r.status_code, "resp": r.json()})
            except Exception as e:
                out.append({"name": t.get("name"), "status": "error", "resp": {"error": str(e)}})
    return out


@settings_router.post("/salons/{salon_id}/marketing/settings/waba/embedded-signup-complete")
async def embedded_signup_complete(salon_id: str, body: ESCompleteIn, request: Request):
    """Phase 2 — complete Meta's Embedded Signup for THIS salon.

    Real path (when META_APP_ID/SECRET present and a code is supplied):
      1) exchange the code for a business access token,
      2) subscribe OUR app to the salon's WABA,
      3) register the salon's phone number for Cloud API,
      4) persist the connection in salon_channel_connections (used by the
         per-salon sender in whatsapp_service),
      5) auto-provision the standard template library onto the WABA.

    Mock/fallback path (no creds or no code): records the intent in
    salon_channel_connections with verified=False so the UI + wider system work
    without live Meta credentials.
    """
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    now = _now_iso()

    access_token: Optional[str] = None
    # PART 5 — if the salon actually attempted a real Embedded Signup (a code was
    # returned by FB.login) but the platform Meta app isn't configured, say so
    # clearly with a 400 instead of silently mocking or 500-ing. The UI then falls
    # back to Manual connect.
    if body.code and not _meta_enabled():
        raise HTTPException(
            status_code=400,
            detail="Embedded signup is not configured on this server — use Manual connect instead.")
    mock = not (_meta_enabled() and body.code)

    if not mock:
        app_id = os.environ["META_APP_ID"]
        app_secret = os.environ["META_APP_SECRET"]
        base = _graph_base()
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                # 1) exchange code -> business token
                tok = (await c.get(
                    f"{base}/oauth/access_token",
                    params={"client_id": app_id, "client_secret": app_secret, "code": body.code},
                )).json()
                access_token = tok.get("access_token")
                if not access_token:
                    raise HTTPException(status_code=400, detail=f"Token exchange failed: {tok}")
                # 2) subscribe OUR app to the salon's WABA
                await c.post(
                    f"{base}/{body.waba_id}/subscribed_apps",
                    params={"access_token": access_token},
                )
                # 3) register the phone number for Cloud API (only if we have the id)
                if body.phone_number_id:
                    await c.post(
                        f"{base}/{body.phone_number_id}/register",
                        params={"access_token": access_token},
                        json={"messaging_product": "whatsapp", "pin": "000000"},
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Meta onboarding failed: {e}")
    else:
        # Mock token so the connection row + provisioning simulate cleanly.
        access_token = f"mock_token_{uuid.uuid4().hex[:12]}"

    conn = {
        "salon_id": salon_id,
        "provider": "meta",
        "waba_id": body.waba_id,
        "phone_number_id": body.phone_number_id,
        "access_token": access_token,
        "sender_phone_e164": body.phone,
        "display_name": body.display_name,
        "verified": not mock,
        "mock": mock,
        "connected_at": now,
        "updated_at": now,
    }
    await _db.salon_channel_connections.update_one(
        {"salon_id": salon_id, "provider": "meta"},
        {"$set": conn, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # 4) provision the standard template library onto this WABA (Phase 3.3)
    provisioned = await provision_templates_for_waba(body.waba_id, access_token)

    return {
        "ok": True,
        "mock": mock,
        "waba_id": body.waba_id,
        "phone_number_id": body.phone_number_id,
        "verified": not mock,
        "templates_provisioned": provisioned,
    }


# ========================================================
# Part 1 (revised) — Meta-only. The SALON only submits its Number + Display name.
# The platform owner fills the technical WABA credentials from the owner console.
# ========================================================
@settings_router.post("/salons/{salon_id}/marketing/settings/waba/request")
async def waba_request(salon_id: str, body: WabaRequestIn, request: Request):
    """Salon requests WhatsApp for its own number. Only `sender_phone_e164` and
    `display_name` are accepted here — the platform owner supplies the WABA ID,
    Phone Number ID and access token later. Sets status='pending' until then
    (or keeps 'connected' if the owner already provisioned it)."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    if not (body.sender_phone_e164 or "").strip():
        raise HTTPException(status_code=400, detail="WhatsApp number is required")

    now = _now_iso()
    existing = await _db.salon_channel_connections.find_one(
        {"salon_id": salon_id, "provider": "meta"}, {"_id": 0}) or {}
    already_connected = bool(existing.get("waba_id") and existing.get("phone_number_id"))
    conn = {
        "salon_id": salon_id,
        "provider": "meta",
        "sender_phone_e164": (body.sender_phone_e164 or "").strip(),
        "display_name": (body.display_name or "").strip() or None,
        "status": "connected" if already_connected else "pending",
        "requested_at": existing.get("requested_at") or now,
        "updated_at": now,
    }
    await _db.salon_channel_connections.update_one(
        {"salon_id": salon_id, "provider": "meta"},
        {"$set": conn, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"ok": True, "status": conn["status"],
            "sender_phone_e164": conn["sender_phone_e164"], "display_name": conn["display_name"]}


@settings_router.post("/salons/{salon_id}/marketing/settings/waba/manual-connect")
async def waba_manual_connect(salon_id: str, body: ManualConnectIn, request: Request):
    """PART 5 — Manually connect a salon's OWN WhatsApp Cloud API number using its
    WABA ID, Phone Number ID and a (permanent) access token — no Embedded Signup /
    App Review required.

    The credentials are verified against the Meta Graph API. On ANY problem we
    return a structured HTTP 400 with the real reason (never a 500), so the UI can
    show it inline as a form error and keep the Manual-connect option usable.
    """
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    waba_id = (body.waba_id or "").strip()
    phone_number_id = (body.phone_number_id or "").strip()
    access_token = (body.access_token or "").strip()
    if not (waba_id and phone_number_id and access_token):
        raise HTTPException(
            status_code=400,
            detail="WABA ID, Phone Number ID and access token are all required.")

    now = _now_iso()
    verified = False
    mock = False
    sender = (body.sender_phone_e164 or "").strip() or None
    display = (body.display_name or "").strip() or None

    if access_token.startswith("mock"):
        # Preview / dev token — accept without a live Meta call.
        mock = True
    else:
        base = _graph_base()
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(
                    f"{base}/{phone_number_id}",
                    params={"access_token": access_token,
                            "fields": "display_phone_number,verified_name,quality_rating"},
                )
            try:
                data = r.json()
            except Exception:
                data = {}
            if r.status_code != 200 or (isinstance(data, dict) and data.get("error")):
                err = ((data.get("error") or {}).get("message")
                       if isinstance(data, dict) else None) \
                    or f"Meta verification failed (HTTP {r.status_code})."
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not verify WhatsApp credentials: {err}")
            verified = True
            sender = sender or data.get("display_phone_number")
            display = display or data.get("verified_name")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Could not reach Meta to verify credentials: {e}")

    conn = {
        "salon_id": salon_id,
        "provider": "meta",
        "waba_id": waba_id,
        "phone_number_id": phone_number_id,
        "access_token": access_token,
        "sender_phone_e164": sender,
        "display_name": display,
        "status": "connected",
        "verified": verified,
        "mock": mock,
        "connected_via": "manual",
        "connected_at": now,
        "updated_at": now,
    }
    await _db.salon_channel_connections.update_one(
        {"salon_id": salon_id, "provider": "meta"},
        {"$set": conn, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    # B2 — subscribe OUR app to the salon's WABA so inbound events reach our
    # webhook. Best-effort; a failure here must not fail the connect.
    subscribe_resp = await _subscribe_app_to_waba(waba_id, access_token)

    provisioned = []
    try:
        provisioned = await provision_templates_for_waba(waba_id, access_token)
    except Exception:
        provisioned = []

    return {
        "ok": True,
        "mock": mock,
        "verified": verified,
        "status": "connected",
        "waba_id": waba_id,
        "phone_number_id": phone_number_id,
        "sender_phone_e164": sender,
        "display_name": display,
        "templates_provisioned": provisioned,
        "subscribed": subscribe_resp,
    }



@settings_router.get("/salons/{salon_id}/marketing/settings/waba/status")
async def waba_status(salon_id: str, request: Request):
    """Return the salon's current WhatsApp (Meta) connection status.
    connected == the platform owner has provisioned WABA + Phone Number ID."""
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    conn = await _db.salon_channel_connections.find_one(
        {"salon_id": salon_id, "provider": "meta"}, {"_id": 0}
    )
    if not conn:
        return {"connected": False, "status": "none"}
    connected = bool(conn.get("waba_id") and conn.get("phone_number_id"))
    status = "connected" if connected else (conn.get("status") or "pending")
    return {
        "connected": connected,
        "status": status,
        "waba_id": conn.get("waba_id"),
        "phone_number_id": conn.get("phone_number_id"),
        "sender_phone_e164": conn.get("sender_phone_e164"),
        "display_name": conn.get("display_name"),
        "verified": bool(conn.get("verified")),
        "mock": bool(conn.get("mock")),
        "connected_via": conn.get("connected_via") or "manual",
        "connected_at": conn.get("connected_at"),
    }


@settings_router.delete("/salons/{salon_id}/marketing/settings/waba")
async def waba_disconnect(salon_id: str, request: Request):
    """Disconnect the salon's WhatsApp (Meta) connection."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    res = await _db.salon_channel_connections.delete_one(
        {"salon_id": salon_id, "provider": "meta"}
    )
    return {"ok": True, "removed": res.deleted_count}


@settings_router.get("/salons/{salon_id}/marketing/settings/meta-spend")
async def waba_meta_spend(salon_id: str, request: Request):
    """WhatsApp (Meta) conversation spend for the salon's OWN WABA. When live,
    this would read Meta conversation-analytics; in mock mode it returns a small
    illustrative snapshot so the salon sees where the data will appear.
    Billing for WhatsApp is charged by Meta directly to the salon's WABA."""
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    conn = await _db.salon_channel_connections.find_one(
        {"salon_id": salon_id, "provider": "meta"}, {"_id": 0}) or {}
    connected = bool(conn.get("waba_id") and conn.get("phone_number_id"))
    if not connected:
        return {"connected": False, "status": conn.get("status") or "none"}
    live = _conn_is_live(conn)
    # Best-effort: sent conversations from our own message log this month.
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    sent = await _db.marketing_messages.count_documents(
        {"salon_id": salon_id, "provider": "meta", "sent_at": {"$gte": month_start}})
    return {
        "connected": True,
        "mock": not live,
        "waba_id": conn.get("waba_id"),
        "currency": "INR",
        "month": now.strftime("%B %Y"),
        "conversations_sent": sent,
        "note": "Billed by Meta to your WABA. View full breakdown in Meta Business Manager.",
    }


# ========================================================
# Phase 3.2 — salon self-serve: use a platform library template
# POST /api/salons/{salon_id}/marketing/templates/library/{lib_id}/use
# ========================================================
@settings_router.post("/salons/{salon_id}/marketing/templates/library/{lib_id}/use")
async def use_library_template(salon_id: str, lib_id: str, request: Request):
    """Create a platform-library template on THIS salon's WABA and record its
    per-salon approval status. Works in mock mode (no live Meta creds)."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    lib = await _db.platform_template_library.find_one({"id": lib_id}, {"_id": 0})
    if not lib:
        raise HTTPException(status_code=404, detail="Library template not found")

    conn = await _db.salon_channel_connections.find_one(
        {"salon_id": salon_id, "provider": "meta"}, {"_id": 0}
    )
    if not conn or not conn.get("waba_id"):
        raise HTTPException(status_code=400, detail="Connect WhatsApp (WABA) first")

    access_token = conn.get("access_token")
    waba_id = conn.get("waba_id")
    now = _now_iso()

    live = _token_is_live(access_token)
    if not live:
        status = "mock"
        resp: Dict[str, Any] = {"mock": True}
    else:
        try:
            async with httpx.AsyncClient(timeout=25) as c:
                r = await c.post(
                    f"{_graph_base()}/{waba_id}/message_templates",
                    params={"access_token": access_token},
                    json=lib.get("meta_payload") or {},
                )
                status = r.status_code
                resp = r.json()
        except Exception as e:
            status = "error"
            resp = {"error": str(e)}

    await _db.salon_templates.update_one(
        {"salon_id": salon_id, "name": lib.get("name")},
        {"$set": {
            "salon_id": salon_id,
            "name": lib.get("name"),
            "friendly_name": lib.get("friendly_name"),
            "category": lib.get("category"),
            "lang_code": lib.get("lang_code"),
            "source": "library",
            "library_id": lib_id,
            "meta_status": "in_review" if live else "mock",
            "last_provision_resp": resp,
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now, "id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {"ok": True, "mock": not live, "name": lib.get("name"), "status": status, "resp": resp}


# ========================================================
# Part 2B — salon adopts a library template (only enabled-for-salons ones)
# POST /api/salons/{salon_id}/marketing/settings/library/{lib_id}/adopt
# ========================================================
@settings_router.post("/salons/{salon_id}/marketing/settings/library/{lib_id}/adopt")
async def adopt_library_template(salon_id: str, lib_id: str, request: Request):
    """Create the chosen owner-curated sample on THIS salon's WABA and submit it
    for approval. Only templates the owner marked `enabled_for_salons` can be
    adopted. Works in mock mode."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    lib = await _db.platform_template_library.find_one(
        {"id": lib_id, "enabled_for_salons": True}, {"_id": 0})
    if not lib:
        raise HTTPException(status_code=404, detail="Template not available")

    conn = await _db.salon_channel_connections.find_one(
        {"salon_id": salon_id, "provider": "meta"}, {"_id": 0})
    if not conn or not conn.get("waba_id"):
        raise HTTPException(status_code=400, detail="Connect WhatsApp first.")

    access_token = conn.get("access_token")
    waba_id = conn.get("waba_id")
    now = _now_iso()
    live = _token_is_live(access_token)
    if not live:
        status: Any = "mock"
        resp: Dict[str, Any] = {"mock": True}
    else:
        try:
            async with httpx.AsyncClient(timeout=25) as c:
                r = await c.post(
                    f"{_graph_base()}/{waba_id}/message_templates",
                    params={"access_token": access_token},
                    json=lib.get("meta_payload") or {},
                )
                status = r.status_code
                resp = r.json()
        except Exception as e:
            status = "error"
            resp = {"error": str(e)}

    await _db.salon_templates.update_one(
        {"salon_id": salon_id, "name": lib.get("name")},
        {"$set": {
            "salon_id": salon_id,
            "name": lib.get("name"),
            "friendly_name": lib.get("friendly_name"),
            "category": lib.get("category"),
            "lang_code": lib.get("lang_code"),
            "group": lib.get("group"),
            "source": "library",
            "library_id": lib_id,
            "meta_status": "in_review" if live else "mock",
            "last_provision_resp": resp,
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now, "id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {"ok": True, "mock": not live, "name": lib.get("name"), "status": status, "resp": resp}


# ========================================================
# Part 2D — per-event template binding
# GET/PUT /api/salons/{salon_id}/marketing/settings/event-templates
# ========================================================
EVENT_KEYS = ["invoice", "booking_confirmation", "queue_followup", "reminder"]


class EventTemplatesIn(BaseModel):
    invoice: Optional[str] = None
    booking_confirmation: Optional[str] = None
    queue_followup: Optional[str] = None
    reminder: Optional[str] = None


@settings_router.get("/salons/{salon_id}/marketing/settings/event-templates")
async def get_event_templates(salon_id: str, request: Request):
    """Return the salon's event→template map plus the salon's approved templates
    (candidates for binding)."""
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    s = await _db.marketing_settings.find_one(
        {"salon_id": salon_id}, {"_id": 0, "salon_event_templates": 1}) or {}
    mapping = s.get("salon_event_templates") or {}
    # Candidate templates = the salon's own templates (library-adopted + custom).
    approved: List[Dict[str, Any]] = []
    async for t in _db.salon_templates.find({"salon_id": salon_id}, {"_id": 0}):
        approved.append({
            "name": t.get("name"),
            "friendly_name": t.get("friendly_name") or t.get("name"),
            "meta_status": t.get("meta_status"),
            "group": t.get("group"),
        })
    return {"events": EVENT_KEYS, "salon_event_templates": mapping, "templates": approved}


@settings_router.put("/salons/{salon_id}/marketing/settings/event-templates")
async def put_event_templates(salon_id: str, body: EventTemplatesIn, request: Request):
    """Bind an approved template to each app event. Only provided keys are set."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    now = _now_iso()
    await _db.marketing_settings.update_one(
        {"salon_id": salon_id},
        {"$set": {f"salon_event_templates.{k}": v for k, v in patch.items()} | {"updated_at": now},
         "$setOnInsert": {"salon_id": salon_id, "created_at": now}},
        upsert=True,
    )
    s = await _db.marketing_settings.find_one(
        {"salon_id": salon_id}, {"_id": 0, "salon_event_templates": 1}) or {}
    return {"ok": True, "salon_event_templates": s.get("salon_event_templates") or {}}

@settings_router.post("/salons/{salon_id}/marketing/settings/waba/sync")
async def waba_sync(salon_id: str, request: Request):
    """Poll Twilio for the sender status. With DUMMY credentials we just bump
    the updated_at timestamp so the UI shows the sync happened."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    doc = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sub-account not configured yet")
    await _db.twilio_subaccounts.update_one(
        {"salon_id": salon_id}, {"$set": {"updated_at": _now_iso()}}
    )
    return _clean({**doc, "updated_at": _now_iso()})


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/usage-sync
# ========================================================

@settings_router.post("/salons/{salon_id}/marketing/settings/usage-sync")
async def usage_sync_manual(salon_id: str, request: Request):
    """On-demand refresh of Twilio Usage Records for this salon's sub-account.
    With DUMMY credentials we produce a small MOCK entry so the UI shows the
    'synced N min ago' state and channel-breakdown bars render."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    subaccount = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not subaccount:
        raise HTTPException(status_code=400, detail="Connect WhatsApp sender first")

    # ---- MOCK sync (no real Twilio call yet) ----
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    # Count today's outbound WhatsApp messages recorded in our own logs.
    wa_count = await _db.marketing_messages.count_documents({"salon_id": salon_id})
    # Assume ₹0.85 per WhatsApp utility message (Twilio + Meta) for the placeholder.
    per_msg_minor = 85
    cost_minor = wa_count * per_msg_minor

    await _db.usage_sync.update_one(
        {"salon_id": salon_id, "period_date": today, "category": "whatsapp"},
        {"$set": {
            "salon_id": salon_id,
            "subaccount_sid": subaccount.get("subaccount_sid"),
            "period_date": today,
            "category": "whatsapp",
            "count": wa_count,
            "twilio_cost_minor": cost_minor,
            "billed_cost_minor": cost_minor,   # pass-through, no margin
            "synced_at": _now_iso(),
        }},
        upsert=True,
    )

    return {
        "synced_at": _now_iso(),
        "records_updated": 1,
        "detail": "MOCKED — DUMMY Twilio credentials. Real Usage Records API call goes here.",
    }


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/dlt
# ========================================================

class DLTConfigIn(BaseModel):
    entity_id: str
    sender_header: str
    provider: Optional[str] = None
    template_dlt_ids: Optional[List[str]] = None


@settings_router.post("/salons/{salon_id}/marketing/settings/dlt")
async def save_dlt(salon_id: str, body: DLTConfigIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {**body.model_dump(), "salon_id": salon_id, "registered": True, "updated_at": _now_iso()}
    await _db.dlt_config.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/email
# ========================================================

class EmailSenderIn(BaseModel):
    from_name: str
    from_email: str
    reply_to: Optional[str] = None


@settings_router.post("/salons/{salon_id}/marketing/settings/email")
async def save_email_sender(salon_id: str, body: EmailSenderIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {
        **body.model_dump(),
        "salon_id": salon_id,
        "verified": True,   # MOCKED until real provider verification lands
        "updated_at": _now_iso(),
    }
    await _db.email_sender.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/sending-windows
# ========================================================

class SendingWindowsIn(BaseModel):
    window_start: str = "10:00"
    window_end: str = "21:00"
    quiet_start: str = "22:00"
    quiet_end: str = "09:00"
    optout_keyword: str = "STOP"
    require_optin: bool = True
    per_guest_cap_per_week: int = 3


@settings_router.post("/salons/{salon_id}/marketing/settings/sending-windows")
async def save_sending_windows(salon_id: str, body: SendingWindowsIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {**body.model_dump(), "salon_id": salon_id, "updated_at": _now_iso()}
    await _db.send_settings.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)
