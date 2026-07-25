# SMS Notifications — Design Spec

## Overview

Add text message notifications so couples don't have to keep checking the dashboard. Two triggers: an alert when a night the couple is already signed up for becomes the group's new best night, and a gentle weekly nudge for couples who haven't set any availability yet.

## Goals

- Notify couples already available for a date when it becomes the #1 best night — without spamming as people toggle availability throughout the day.
- Nudge couples with zero availability set, on a cadence that doesn't feel naggy.
- Keep the trust model consistent with the rest of the app: no new accounts, phone numbers are entered by the admin.

## Non-Goals

- Opt-in/opt-out UI (Twilio handles STOP replies automatically; the admin can remove a number manually).
- DST-aware cron scheduling (a ~1hr drift twice a year is an accepted tradeoff, not fixed).
- Any channel besides SMS (web push, email were considered and set aside in favor of texting).

## Architecture

### New dependency: Twilio

No SDK — plain `fetch` calls to Twilio's REST API to avoid adding a dependency for what's a single API call.

New environment variables:

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Twilio auth secret (Basic Auth) |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service the number is attached to |
| `CRON_SECRET` | Shared secret so only Vercel Cron can trigger the reminder route |

### Schema changes (`supabase/schema.sql`)

**`couples` — new columns:**

| Column | Type | Purpose |
|--------|------|---------|
| phone | text, nullable | Couple's phone number, entered via admin panel |
| last_reminded_at | timestamptz, nullable | Last time an availability reminder was sent |

**New table `notification_state`:**

| Column | Type | Purpose |
|--------|------|---------|
| key | text (PK) | State key, e.g. `'best_night'` |
| value | jsonb | Arbitrary state payload |

Single row for now: `key = 'best_night'`, `value = { "date": "2026-07-25", "notified_at": "2026-07-24T18:00:00Z" }` (or absent if never notified). A generic key-value table is used rather than a single-purpose one so future notification types can add state without another migration.

### `src/lib/sms.ts`

```
sendSms(to: string, body: string): Promise<void>
```

POSTs to `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` with Basic Auth and `To` / `MessagingServiceSid` / `Body` form fields. Catches and logs errors internally — **never throws**. A failed send must not break the caller: a couple's availability toggle, or another couple's reminder in the same cron loop.

### Shared helper: `src/lib/bestNights.ts`

The counts/attendees aggregation currently written inline in `dashboard/page.tsx` gets extracted into pure functions:

- `computeAvailabilityCounts(rows)` → `{ counts, attendees }`
- `getTopNight(counts)` → the single highest-count date (ties broken by earliest date), or `null`

Both the dashboard page and the new best-night trigger use these, instead of duplicating the aggregation logic.

## Trigger 1: New best night found

**When it runs:** inline, at the end of `toggleAvailability` (`src/actions/availability.ts`), right after the availability row is written. No schedule needed — the underlying data only changes at that moment.

**Logic:**

1. Recompute counts for the rolling window using `computeAvailabilityCounts` / `getTopNight`.
2. Read the `notification_state` row for `best_night`, i.e. its `value.date` and `value.notified_at` fields.
3. Fire only if **both**:
   - the current top night differs from `value.date`, **and**
   - `value.notified_at` is null or more than 24 hours ago.
4. If firing: look up the couples who currently have an availability row for that top date — this is the audience (couples already signed up for that night, not the whole group) — filter to those with a phone number, and text each:
   > 🎲 Board Game Night: Sat, Jul 25 is looking like the best night (5/7 available)!
5. Update `notification_state`: set `value.date` to the top date just notified about, `value.notified_at` to now.
6. If not firing (cooldown active), the stored state is left untouched.

**Why this avoids spamming:** because the stored `lastDate` only advances when a notification actually sends, any number of changes to the #1 spot within a 24-hour window collapse into at most one text, reflecting whichever date is #1 at the moment the cooldown lifts — not every intermediate flip.

## Trigger 2: Weekly availability reminder

**When it runs:** Vercel Cron, configured in `vercel.json`, calling `src/app/api/cron/reminders/route.ts` **daily** at `01:00 UTC` (6pm Pacific during PDT; drifts to 5pm during PST).

The cron itself runs daily so a couple added mid-week doesn't wait for a fixed weekly slot — but each couple is only actually texted at most once every 7 days, via the per-couple check below.

**Logic**, for each couple with a phone number:

1. Skip if they have any availability row within the current rolling window (i.e., they have at least one active day set).
2. Skip if `last_reminded_at` is set and less than 7 days ago.
3. Otherwise, send a reminder (e.g. "Don't forget to set your availability for the next few weeks!") and set `last_reminded_at` = now.

**Security:** the route checks a header against `CRON_SECRET` and returns 401 on mismatch, so it can't be triggered by outside requests.

## Testing

- `sendSms`: mock `fetch`; assert the request shape (URL, auth, body) and that thrown/rejected fetches are caught and logged, not propagated.
- `bestNights.ts` helpers: pure-function tests for aggregation and top-night selection, including tie-breaking.
- Best-night trigger firing decision ("did the top date change, and is the cooldown clear"): pure-function tests using fixed `now` + state fixtures — no real DB or Twilio calls.
- Reminder eligibility ("who's due for a reminder" given couples + availability + `last_reminded_at` + `now`): pure-function tests.
- Cron route: test that a missing/incorrect `CRON_SECRET` returns 401 before any sends happen.

## Hosting & Deployment additions

- Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `CRON_SECRET` to Vercel env vars.
- Add a `vercel.json` with a daily cron entry pointing at `/api/cron/reminders`.
