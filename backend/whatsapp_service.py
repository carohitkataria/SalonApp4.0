"""
whatsapp_service.py — Dual-provider WhatsApp abstraction.

Design goals:
  * OTP messages continue to route through Twilio ALWAYS (never Meta) to keep
    login/signup working exactly as today. `send_whatsapp_otp` in twilio_service
    is called directly by all send-otp endpoints.
  * Non-OTP messages (booking confirmations, marketing campaigns, invoice with
    reward links, etc.) go through this router. When
    WHATSAPP_PROVIDER=twilio (default) → uses twilio_service.send_whatsapp_message.
    When WHATSAPP_PROVIDER=meta → uses Meta WhatsApp Cloud API.
  * The Meta call is a thin async httpx wrapper over Graph API
    `POST /{PHONE_NUMBER_ID}/messages` — text + template send.
  * Placeholders are honoured — if META creds are empty the function short-
    circuits to `status='mock'` so we can still build/test the wider system.

env vars used (see /app/backend/.env):
  WHATSAPP_PROVIDER               (twilio | meta)  — default twilio
  META_WA_PHONE_NUMBER_ID
  META_WA_ACCESS_TOKEN
  META_WA_API_VERSION             (default v21.0)
  META_WA_APP_SECRET              — for webhook signature verification
  META_WA_WEBHOOK_VERIFY_TOKEN    — for GET /webhooks/whatsapp challenge
"""

from __future__ import annotations

import hmac
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------- Per-salon DB accessor (Phase 1 — multi-tenant Meta) ----------
# server.py calls configure_db(db) at import so the credential resolver can
# look up a salon's own Meta connection. Kept optional so the module still
# imports/works (env fallback) if the DB isn't wired.
_DB = None


def configure_db(db) -> None:
    global _DB
    _DB = db


async def _resolve_meta_creds(salon_id: Optional[str] = None):
    """Return (phone_number_id, access_token, waba_id) for a salon's OWN Meta
    connection when present, else the platform-owned env credentials.

    Per-salon config lives in salon_channel_connections
    {salon_id, provider:'meta', phone_number_id, access_token, waba_id, ...}.
    Falls back to env (your own salon / pilots) so existing sends never break.
    """
    if salon_id and _DB is not None:
        try:
            conn = await _DB.salon_channel_connections.find_one(
                {"salon_id": salon_id, "provider": "meta"}, {"_id": 0}
            )
            if conn and conn.get("phone_number_id") and conn.get("access_token"):
                return (
                    conn["phone_number_id"],
                    conn["access_token"],
                    conn.get("waba_id"),
                )
        except Exception as _e:
            logger.warning(f"[Meta WA] per-salon creds lookup failed for {salon_id}: {_e}")
    # Fallback = platform-owned number (env)
    return (
        os.environ.get("META_WA_PHONE_NUMBER_ID"),
        os.environ.get("META_WA_ACCESS_TOKEN"),
        os.environ.get("META_WA_BUSINESS_ACCOUNT_ID"),
    )


# ---------- Provider selection ----------

def get_active_provider() -> str:
    provider = (os.environ.get("WHATSAPP_PROVIDER") or "twilio").strip().lower()
    if provider not in ("twilio", "meta"):
        provider = "twilio"
    return provider


def is_meta_configured() -> bool:
    return bool(
        os.environ.get("META_WA_PHONE_NUMBER_ID")
        and os.environ.get("META_WA_ACCESS_TOKEN")
    )


async def has_meta_connection(salon_id: Optional[str] = None) -> bool:
    """Part 4 guardrail — True only when a REAL Meta connection exists for this
    salon (or platform env), i.e. a phone_number_id + a non-mock access token.
    Used to fail loudly (no silent mock / Twilio fallback) when a salon hasn't
    connected its WhatsApp."""
    try:
        pnid, token, _waba = await _resolve_meta_creds(salon_id)
    except Exception:
        return False
    return bool(pnid and token and not str(token).startswith("mock"))


# ---------- Helpers ----------

def _normalize_e164(phone: str) -> str:
    """Return phone in E.164 (+countrycode…) format. Assumes India (+91) when
    the caller passed a bare 10-digit number."""
    if not phone:
        return phone
    p = str(phone).strip()
    # Strip whatsapp: prefix if present
    if p.lower().startswith("whatsapp:"):
        p = p.split(":", 1)[1]
    # Keep leading +, strip anything else non-digit
    if p.startswith("+"):
        p = "+" + "".join(ch for ch in p[1:] if ch.isdigit())
    else:
        digits = "".join(ch for ch in p if ch.isdigit())
        if len(digits) == 10:
            p = "+91" + digits
        else:
            p = "+" + digits
    return p


# ---------- Meta Cloud API primitives ----------

async def _meta_post(payload: Dict[str, Any], salon_id: Optional[str] = None) -> Dict[str, Any]:
    """Low-level Graph API POST /{PHONE_NUMBER_ID}/messages.

    Phase 1 — resolves the SENDING salon's own phone_number_id + access_token
    (via salon_channel_connections), falling back to platform env creds when the
    salon has no connection. Short-circuits to a mock result when no creds exist
    anywhere (so the wider system still works without Meta configured).
    """
    phone_number_id, token, _waba_id = await _resolve_meta_creds(salon_id)
    if not (phone_number_id and token):
        logger.warning("[Meta WA] send skipped — no Meta creds (salon or env), returning mock")
        return {"status": "mock", "provider": "meta", "reason": "not_configured"}

    api_version = os.environ.get("META_WA_API_VERSION") or "v21.0"
    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code // 100 == 2:
            data = resp.json()
            msg_id = None
            try:
                msg_id = (data.get("messages") or [{}])[0].get("id")
            except Exception:
                msg_id = None
            return {"status": "sent", "provider": "meta", "message_id": msg_id, "raw": data}
        else:
            logger.error(
                f"[Meta WA] send FAILED HTTP {resp.status_code} — full response body: {resp.text}"
            )
            return {"status": "failed", "provider": "meta", "http_status": resp.status_code, "body": resp.text}
    except Exception as e:
        logger.error(f"[Meta WA] send exception: {e}")
        return {"status": "failed", "provider": "meta", "error": str(e)}


async def send_meta_text(to: str, body: str, salon_id: Optional[str] = None) -> Dict[str, Any]:
    """Send a plain-text WhatsApp message via Meta (only within the 24-h
    customer service window — otherwise Meta will 400 and you must use a
    template)."""
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalize_e164(to).lstrip("+"),
        "type": "text",
        "text": {"body": body[:4096]},
    }
    return await _meta_post(payload, salon_id=salon_id)


async def send_meta_template(
    to: str,
    template_name: str,
    lang_code: str = "en_US",
    body_params: Optional[List[str]] = None,
    header_params: Optional[List[Dict[str, Any]]] = None,
    button_params: Optional[List[Dict[str, Any]]] = None,
    salon_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Send an approved WhatsApp *template* via Meta.

    `body_params` is a simple list of strings that will be mapped to
    `type: text` body components. For richer payloads (media header,
    button URL suffix, etc.) pass raw `header_params` / `button_params`.
    """
    components: List[Dict[str, Any]] = []
    if header_params:
        components.append({"type": "header", "parameters": header_params})
    if body_params:
        components.append(
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(v)} for v in body_params],
            }
        )
    if button_params:
        components.extend(button_params)

    payload: Dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": _normalize_e164(to).lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": lang_code},
        },
    }
    if components:
        payload["template"]["components"] = components
    return await _meta_post(payload, salon_id=salon_id)


# ---------- Unified router ----------

async def send_whatsapp_message(
    to: str,
    text: Optional[str] = None,
    template_name: Optional[str] = None,
    template_params: Optional[List[str]] = None,
    lang_code: str = "en_US",
    force_provider: Optional[str] = None,
    salon_id: Optional[str] = None,
    header_params: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Unified sender used by non-OTP flows.

    * Chooses provider based on `WHATSAPP_PROVIDER` unless `force_provider` is
      given.
    * Text vs template:
        - If `template_name` is set → template send (Meta only; if provider is
          twilio we fall back to sending the pre-rendered `text`).
        - Else → plain text.
    * `header_params` lets a template send include a media header (image/video/
      document) — e.g. [{"type":"image","image":{"link": PUBLIC_URL}}].
    * Returns a dict {status, provider, ...}

    Meta-only (WhatsApp cutover): Twilio is no longer used for WhatsApp. Twilio
    remains ONLY for SMS/email + OTP (those live in twilio_service directly).
    `force_provider` is accepted for backwards-compatibility but ignored.
    """
    if template_name:
        return await send_meta_template(
            to,
            template_name=template_name,
            lang_code=lang_code,
            body_params=template_params or [],
            header_params=header_params,
            salon_id=salon_id,
        )
    if text:
        return await send_meta_text(to, text, salon_id=salon_id)
    return {"status": "failed", "provider": "meta", "reason": "empty_message"}


# ---------- Webhook signature verification ----------

def verify_meta_signature(app_secret: str, raw_body: bytes, header_sig: str) -> bool:
    """Verify Meta's X-Hub-Signature-256 header. Returns True when valid."""
    if not app_secret or not header_sig:
        return False
    try:
        expected = "sha256=" + hmac.new(
            app_secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, header_sig)
    except Exception:
        return False
