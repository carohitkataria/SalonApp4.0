"""
seed_template_library.py — Idempotently seed the platform-level
`platform_template_library` collection with a standard set of WhatsApp
templates (invoice, booking confirmation, reminder, review request, offer).

These are the templates auto-provisioned onto every salon's WABA when they
connect via Embedded Signup (Phase 3.3), and are browsable/usable from the
Marketing → Templates "Template library" tab (Phase 3.2).

Run: python seed_template_library.py
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _body(text: str, example=None):
    comp = {"type": "BODY", "text": text}
    if example:
        comp["example"] = {"body_text": [example]}
    return comp


def _doc_header():
    """Document (PDF) header — Meta requires a sample handle/URL for review."""
    return {
        "type": "HEADER",
        "format": "DOCUMENT",
        "example": {"header_handle": ["https://salonhub.in/sample-invoice.pdf"]},
    }


def _review_button():
    """Dynamic-URL call-to-action button (review page). Button URL variables are
    numbered per-button starting at {{1}}."""
    return {
        "type": "BUTTONS",
        "buttons": [
            {"type": "URL", "text": "View & review",
             "url": "https://salonhub.in/{{1}}", "example": ["https://salonhub.in/r/abc123"]},
        ],
    }


def _text_header(text: str, example=None):
    comp = {"type": "HEADER", "format": "TEXT", "text": text}
    if example:
        comp["example"] = {"header_text": [example]}
    return comp


def _footer(text: str):
    return {"type": "FOOTER", "text": text}


def _url_button(label: str, path_example: str):
    # dynamic-URL CTA; base URL lives in the template, {{1}} is the path suffix
    return {"type": "BUTTONS", "buttons": [
        {"type": "URL", "text": label,
         "url": "https://salonhub.in/{{1}}", "example": [f"https://salonhub.in/{path_example}"]},
    ]}


def _qr_buttons(*labels: str):
    return {"type": "BUTTONS", "buttons": [{"type": "QUICK_REPLY", "text": l} for l in labels]}


def _group_for(t: dict) -> str:
    n = t.get("name", "")
    if "invoice" in n:
        return "invoice"
    if "booking" in n:
        return "booking"
    if "reminder" in n:
        return "reminder"
    if "queue" in n or "follow" in n:
        return "queue_followup"
    return "marketing"


LIBRARY = [
    {
        "name": "booking_confirmation",
        "friendly_name": "Booking confirmation",
        "category": "utility",
        "description": "Sent when a booking is confirmed.",
        "meta_payload": {
            "name": "booking_confirmation",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Hi {{1}}, your booking at {{2}} is confirmed for {{3}}. See you soon!",
                      ["Aarav", "Glam Studio", "12 Sep, 4:00 PM"]),
            ],
        },
    },
    {
        "name": "appointment_reminder",
        "friendly_name": "Appointment reminder",
        "category": "utility",
        "description": "Reminder before an upcoming appointment.",
        "meta_payload": {
            "name": "appointment_reminder",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Reminder: {{1}}, you have an appointment at {{2}} on {{3}}.",
                      ["Aarav", "Glam Studio", "tomorrow 4:00 PM"]),
            ],
        },
    },
    {
        "name": "invoice_ready",
        "friendly_name": "Invoice",
        "category": "utility",
        "description": "Sent with the invoice link after a visit.",
        "meta_payload": {
            "name": "invoice_ready",
            "category": "UTILITY",
            "language": "en_US",
            "components": [
                _body("Thanks for visiting {{1}}, {{2}}! Your invoice #{{3}} for {{4}} is ready.",
                      ["Glam Studio", "Aarav", "1042", "₹899"]),
            ],
        },
    },
    {
        "name": "review_request",
        "friendly_name": "Review request",
        "category": "marketing",
        "description": "Ask the customer to leave a review.",
        "meta_payload": {
            "name": "review_request",
            "category": "MARKETING",
            "language": "en_US",
            "components": [
                _body("Hi {{1}}, we'd love your feedback on your recent visit to {{2}}. Tap to rate us!",
                      ["Aarav", "Glam Studio"]),
            ],
        },
    },
    {
        "name": "special_offer",
        "friendly_name": "Offer",
        "category": "marketing",
        "description": "Promote an offer or discount.",
        "meta_payload": {
            "name": "special_offer",
            "category": "MARKETING",
            "language": "en_US",
            "components": [
                _body("{{1}}, enjoy {{2}} off your next visit to {{3}}. Book now!",
                      ["Aarav", "20%", "Glam Studio"]),
            ],
        },
    },
    # ---- Invoice ×3 variants (document header + review button) ----
    {
        "name": "invoice_1",
        "friendly_name": "Invoice — Classic",
        "category": "utility",
        "description": "Invoice PDF with a thank-you note and review button.",
        "meta_payload": {
            "name": "invoice_1", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("Hi {{1}}, thanks for visiting {{2}}! Your invoice #{{3}} for {{4}} is attached.",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                {"type": "FOOTER", "text": "Powered by SalonHub"},
                _review_button(),
            ],
        },
    },
    {
        "name": "invoice_2",
        "friendly_name": "Invoice — Concise",
        "category": "utility",
        "description": "Short invoice message with PDF header and review button.",
        "meta_payload": {
            "name": "invoice_2", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("{{1}}, your {{2}} invoice #{{3}} ({{4}}) is ready. Tap below to view & review.",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                _review_button(),
            ],
        },
    },
    {
        "name": "invoice_3",
        "friendly_name": "Invoice — Warm",
        "category": "utility",
        "description": "Friendly invoice message with PDF header and review button.",
        "meta_payload": {
            "name": "invoice_3", "category": "UTILITY", "language": "en_US",
            "components": [
                _doc_header(),
                _body("Thank you, {{1}}! We loved having you at {{2}}. Invoice #{{3}} for {{4}} is attached — see you again soon!",
                      ["Aarav", "Glam Studio", "1042", "₹899"]),
                {"type": "FOOTER", "text": "Powered by SalonHub"},
                _review_button(),
            ],
        },
    },
    # ---- Queue follow-up ----
    {
        "name": "queue_followup",
        "friendly_name": "Queue follow-up",
        "category": "utility",
        "description": "Sent after a walk-in leaves the queue without being served.",
        "meta_payload": {
            "name": "queue_followup", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Hi {{1}}, sorry we couldn't serve you at {{2}} today. Reply to grab a priority slot next time!",
                      ["Aarav", "Glam Studio"]),
            ],
        },
    },
]


# ---- EXTRA_LIBRARY bulk pack (appended to LIBRARY below) ----
EXTRA_LIBRARY = [

    # ============ UTILITY (transactional) ============
    {
        "name": "booking_rescheduled",
        "friendly_name": "Booking rescheduled",
        "category": "utility",
        "description": "Sent when a booking's date/time changes.",
        "meta_payload": {
            "name": "booking_rescheduled", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Hi {{1}}, your appointment at {{2}} has been moved to {{3}}. "
                      "Reply here if this time doesn't work for you.",
                      ["Aarav", "Glam Studio", "13 Sep, 5:00 PM"]),
            ],
        },
    },
    {
        "name": "booking_cancelled",
        "friendly_name": "Booking cancelled",
        "category": "utility",
        "description": "Sent when a booking is cancelled.",
        "meta_payload": {
            "name": "booking_cancelled", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Hi {{1}}, your appointment at {{2}} on {{3}} has been cancelled. "
                      "We hope to see you again soon!",
                      ["Aarav", "Glam Studio", "12 Sep, 4:00 PM"]),
                _url_button("Rebook now", "book/glam-studio"),
            ],
        },
    },
    {
        "name": "appointment_reminder_2h",
        "friendly_name": "Reminder (2 hours before)",
        "category": "utility",
        "description": "Short reminder a couple of hours before the appointment.",
        "meta_payload": {
            "name": "appointment_reminder_2h", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("See you soon, {{1}}! Your appointment at {{2}} is in about 2 hours ({{3}}).",
                      ["Aarav", "Glam Studio", "4:00 PM"]),
            ],
        },
    },
    {
        "name": "your_turn_next",
        "friendly_name": "Your turn is next",
        "category": "utility",
        "description": "Queue alert when the customer is next in line.",
        "meta_payload": {
            "name": "your_turn_next", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("💈 It's almost your turn, {{1}}! Token {{2}} is next at {{3}}. "
                      "Please head to the chair.",
                      ["Aarav", "M2", "Glam Studio"]),
            ],
        },
    },
    {
        "name": "booking_completed",
        "friendly_name": "Visit completed",
        "category": "utility",
        "description": "Sent when a visit is completed (thank-you + summary).",
        "meta_payload": {
            "name": "booking_completed", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("✅ All done! Thank you for visiting {{1}}, {{2}}.\n"
                      "🎫 Token: #{{3}}\n💈 Served by: {{4}}\n💰 Amount: {{5}}\n"
                      "We hope to see you again soon!",
                      ["Glam Studio", "Aarav", "M2", "Imran", "₹899"]),
            ],
        },
    },
    {
        "name": "token_approaching",
        "friendly_name": "Your turn is approaching",
        "category": "utility",
        "description": "Queue alert when the customer is 1–2 tokens away.",
        "meta_payload": {
            "name": "token_approaching", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("⏳ Almost your turn, {{1}}! You're {{2}} away at {{3}}.\n"
                      "🎫 Your token: #{{4}}\n💈 With: {{5}}\n⏱ Now serving: #{{6}}\n"
                      "Please start heading over so you don't miss your turn.",
                      ["Aarav", "2 tokens", "Glam Studio", "M4", "Imran", "M2"]),
            ],
        },
    },
    {
        "name": "payment_receipt",
        "friendly_name": "Payment receipt",
        "category": "utility",
        "description": "Confirmation after a payment is received.",
        "meta_payload": {
            "name": "payment_receipt", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Payment received, {{1}} — thank you! {{2}} for invoice #{{3}} at {{4}}. "
                      "See you next time!",
                      ["Aarav", "₹899", "1042", "Glam Studio"]),
            ],
        },
    },
    {
        "name": "membership_purchased",
        "friendly_name": "Membership welcome",
        "category": "utility",
        "description": "Welcome message after a membership is purchased.",
        "meta_payload": {
            "name": "membership_purchased", "category": "UTILITY", "language": "en_US",
            "components": [
                _text_header("🎉 Welcome to {{1}} Members!", "Glam Studio"),
                _body("Hi {{1}}, your {{2}} membership is now active until {{3}}. "
                      "Enjoy your member benefits on every visit!",
                      ["Aarav", "Gold", "31 Mar 2027"]),
            ],
        },
    },
    {
        "name": "membership_expiring",
        "friendly_name": "Membership expiring",
        "category": "utility",
        "description": "Reminder before a membership expires.",
        "meta_payload": {
            "name": "membership_expiring", "category": "UTILITY", "language": "en_US",
            "components": [
                _body("Hi {{1}}, your {{2}} membership at {{3}} expires on {{4}}. "
                      "Renew now to keep your benefits going.",
                      ["Aarav", "Gold", "Glam Studio", "31 Mar 2027"]),
                _url_button("Renew membership", "renew/glam-studio"),
            ],
        },
    },

    # ============ MARKETING (promotional) ============
    {
        "name": "first_visit_welcome",
        "friendly_name": "First-visit welcome",
        "category": "marketing",
        "description": "Thank a first-time guest and invite them back.",
        "meta_payload": {
            "name": "first_visit_welcome", "category": "MARKETING", "language": "en_US",
            "components": [
                _body("Thanks for your first visit to {{2}}, {{1}}! 💜 We'd love to see you again — "
                      "enjoy {{3}} off your next appointment.",
                      ["Aarav", "Glam Studio", "15%"]),
                _url_button("Book again", "book/glam-studio"),
            ],
        },
    },
    {
        "name": "winback_inactive",
        "friendly_name": "Win-back (inactive)",
        "category": "marketing",
        "description": "Re-engage a customer who hasn't visited in a while.",
        "meta_payload": {
            "name": "winback_inactive", "category": "MARKETING", "language": "en_US",
            "components": [
                _body("We miss you, {{1}}! It's been a while since your last visit to {{2}}. "
                      "Come back this week and get {{3}} off with code {{4}}.",
                      ["Aarav", "Glam Studio", "20%", "MISSYOU20"]),
                _url_button("Book now", "book/glam-studio"),
            ],
        },
    },
    {
        "name": "birthday_offer",
        "friendly_name": "Birthday wish + offer",
        "category": "marketing",
        "description": "Birthday greeting with a special offer.",
        "meta_payload": {
            "name": "birthday_offer", "category": "MARKETING", "language": "en_US",
            "components": [
                _text_header("🎂 Happy Birthday, {{1}}!", "Aarav"),
                _body("Wishing you a wonderful day from all of us at {{1}}! "
                      "Celebrate with {{2}} off any service this month. Code: {{3}}.",
                      ["Glam Studio", "25%", "BDAY25"]),
                _url_button("Claim your treat", "offer/glam-studio"),
            ],
        },
    },
    {
        "name": "anniversary_offer",
        "friendly_name": "Anniversary wish + offer",
        "category": "marketing",
        "description": "Anniversary greeting with a special offer.",
        "meta_payload": {
            "name": "anniversary_offer", "category": "MARKETING", "language": "en_US",
            "components": [
                _body("Happy anniversary, {{1}}! 🥂 Celebrate with a couples' treat at {{2}} — "
                      "{{3}} off this week. Code: {{4}}.",
                      ["Aarav", "Glam Studio", "20%", "ANNIV20"]),
                _url_button("Book your treat", "book/glam-studio"),
            ],
        },
    },
    {
        "name": "festive_offer",
        "friendly_name": "Festive / seasonal offer",
        "category": "marketing",
        "description": "Seasonal promotion (Diwali, monsoon, etc.).",
        "meta_payload": {
            "name": "festive_offer", "category": "MARKETING", "language": "en_US",
            "components": [
                _text_header("✨ {{1}} Special at {{2}}", "Diwali"),
                _body("Hi {{1}}, get festive-ready! Enjoy {{2}} off {{3}} this season at {{4}}. "
                      "Limited slots — book early.",
                      ["Aarav", "30%", "hair & spa", "Glam Studio"]),
                _url_button("Grab the offer", "offer/glam-studio"),
            ],
        },
    },
    {
        "name": "referral_invite",
        "friendly_name": "Refer a friend",
        "category": "marketing",
        "description": "Ask a happy customer to refer friends for a reward.",
        "meta_payload": {
            "name": "referral_invite", "category": "MARKETING", "language": "en_US",
            "components": [
                _body("Love your look, {{1}}? 💇 Refer a friend to {{2}} and you both get {{3}} off "
                      "your next visit. Share your code: {{4}}.",
                      ["Aarav", "Glam Studio", "₹200", "AARAV200"]),
                _url_button("Share & earn", "refer/glam-studio"),
            ],
        },
    },
    {
        "name": "new_service_announcement",
        "friendly_name": "New service announcement",
        "category": "marketing",
        "description": "Announce a newly added service.",
        "meta_payload": {
            "name": "new_service_announcement", "category": "MARKETING", "language": "en_US",
            "components": [
                _body("Something new at {{1}}! ✨ We've just added {{2}}, {{3}}. "
                      "Be among the first to try it — book your slot today.",
                      ["Glam Studio", "Keratin Treatment", "Aarav"]),
                _url_button("Book now", "book/glam-studio"),
            ],
        },
    },
]

# Merge the bulk pack into the main library so the seed upserts everything.
LIBRARY += EXTRA_LIBRARY


async def seed_platform_template_library(db) -> int:
    """Idempotently upsert every LIBRARY entry into platform_template_library.
    Reusable from the app startup (pass the shared db) or the CLI. Returns the
    number of docs inserted/updated. These entries are permanent — safe to run
    on every boot / deploy so production always has the full library."""
    now = datetime.now(timezone.utc).isoformat()
    upserts = 0
    for t in LIBRARY:
        # Part 1 — only the UTILITY (transactional) templates the app actually
        # sends are auto-provisioned onto a salon's WABA the moment keys are
        # saved. MARKETING templates stay opt-in (auto_provision=False).
        auto = t.get("auto_provision")
        if auto is None:
            auto = (str(t.get("category", "")).lower() == "utility")
        res = await db.platform_template_library.update_one(
            {"name": t["name"]},
            {"$set": {**t, "auto_provision": bool(auto),
                      "enabled_for_salons": t.get("enabled_for_salons", True),
                      "group": t.get("group") or _group_for(t),
                      "updated_at": now},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
            upsert=True,
        )
        if res.upserted_id or res.modified_count:
            upserts += 1
    return upserts


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    upserts = await seed_platform_template_library(db)
    total = await db.platform_template_library.count_documents({})
    print(f"[seed_template_library] upserted/updated {upserts}; library now has {total} templates")


if __name__ == "__main__":
    asyncio.run(main())
