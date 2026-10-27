# Coding rules for this repo

These apply to every change, by people or by Claude.

## Idempotency: safe to repeat

Anything that can be retried must give the same result when it runs twice:
a double-tapped button, a network retry, a webhook that arrives again,
a migration that runs on every startup.

- **Creating money or booking records** (payments, invoices, appointments,
  tokens, wallet debits/credits): the client sends an `idempotency_key`.
  Back it with a unique index and return the existing record when the key
  repeats, instead of creating a second one.
- **Webhooks** (payment provider, WhatsApp/Meta, Twilio): store the
  provider's event/message ID with a unique index and skip events already
  processed.
- **Updates**: prefer setting values (`$set`, upserts keyed by a natural
  key) over relative changes (`$inc`, `$push`) unless the operation is
  guarded by a key as above.
- **Migrations, seeders, scheduled jobs** (e.g. leave accrual): check
  before writing, so running them again changes nothing. See
  `backend/migrate_service_categories.py` and `backend/leave_tracker.py`.
- **CSV import**: match rows to existing records (by ID or name) and update
  them; never blindly insert duplicates.

## Indexing: index what you query

- Every new MongoDB query used by an API route needs an index that covers
  its filter (and sort). Add it to the index list in
  `startup_event()` in `backend/server.py`.
- Start compound indexes with `salon_id`; almost every query is per salon.
- Anything that must be unique (idempotency keys, webhook event IDs,
  login IDs, category slugs) gets a `unique=True` index. That is what makes
  the idempotency rules above hold under concurrent requests.
- Don't index fields nobody filters or sorts on; each index slows writes
  and uses memory.
- `create_index` is itself idempotent, so adding to the startup list is
  safe on every deploy.
