# SMS Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Text couples when a night they're already signed up for becomes the group's new best night, and nudge couples who haven't set any availability, via Twilio SMS.

**Architecture:** Two triggers layered onto the existing Next.js/Supabase app. The best-night trigger runs inline at the end of `toggleAvailability` (no new infra). The reminder trigger runs on a daily Vercel Cron job hitting a new route handler. Both funnel through a shared `sendSms` primitive and reuse a new `notification_state` table + `couples.last_reminded_at` column to avoid re-notifying too often.

**Tech Stack:** Next.js (App Router, Server Actions, Route Handlers), Supabase (Postgres), Twilio REST API via `fetch` (no SDK), Vitest, Vercel Cron.

---

## File Structure

```
board-game-nights/
├── vercel.json                                  # NEW: daily cron schedule
├── .env.example                                 # MODIFIED: add Twilio + cron vars
├── supabase/
│   └── schema.sql                               # MODIFIED: phone, last_reminded_at, notification_state
├── src/
│   ├── lib/
│   │   ├── sms.ts                               # NEW: Twilio send primitive
│   │   ├── bestNights.ts                        # NEW: pure aggregation + top-night helpers
│   │   └── notifications.ts                     # NEW: pure decision rules (cooldowns/eligibility)
│   ├── actions/
│   │   ├── availability.ts                      # MODIFIED: call notifyBestNightIfChanged after toggle
│   │   ├── admin.ts                              # MODIFIED: phone field, updateCouplePhone action
│   │   └── notifications.ts                      # NEW: I/O orchestration for both triggers
│   └── app/
│       ├── dashboard/page.tsx                    # MODIFIED: use bestNights helper instead of inline loop
│       ├── admin/[secret]/client.tsx             # MODIFIED: phone input UI
│       └── api/cron/reminders/route.ts           # NEW: cron endpoint, checks CRON_SECRET
└── tests/
    ├── lib/
    │   ├── sms.test.ts                           # NEW
    │   ├── bestNights.test.ts                    # NEW
    │   └── notifications.test.ts                 # NEW
    ├── actions/
    │   ├── availability.test.ts                  # MODIFIED: mock+assert notifyBestNightIfChanged call
    │   ├── admin.test.ts                         # MODIFIED: phone field coverage
    │   └── notifications.test.ts                  # NEW: orchestration tests
    └── app/api/cron/reminders/
        └── route.test.ts                          # NEW
```

---

### Task 1: Database schema — phone numbers, reminder tracking, notification state

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `.env.example`

- [ ] **Step 1: Update the schema file**

Replace the contents of `supabase/schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT,
  last_reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE (couple_id, date)
);

CREATE TABLE notification_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE INDEX idx_availability_date ON availability(date);
CREATE INDEX idx_availability_couple_id ON availability(couple_id);
CREATE INDEX idx_couples_slug ON couples(slug);
```

- [ ] **Step 2: Apply the change to the live Supabase project**

The app already has real data in it, so don't drop/recreate tables. In the Supabase dashboard's SQL Editor, run:

```sql
ALTER TABLE couples ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE couples ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notification_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

ALTER TABLE notification_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to notification_state" ON notification_state
  FOR ALL USING (true) WITH CHECK (true);
```

This matches the existing permissive RLS policy style already used for `couples` and `availability` (no auth model — access is controlled by unguessable slugs, and the anon key needs read/write on every table).

- [ ] **Step 3: Update `.env.example`**

Replace the contents of `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ADMIN_SECRET=your-admin-secret-here
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_MESSAGING_SERVICE_SID=your-twilio-messaging-service-sid
CRON_SECRET=pick-a-random-string-here
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql .env.example
git commit -m "feat: add schema for phone numbers, reminders, and notification state"
```

---

### Task 2: Twilio SMS sending primitive

**Files:**
- Create: `src/lib/sms.ts`
- Create: `tests/lib/sms.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/sms.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms } from "@/lib/sms";

describe("sendSms", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret-token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG456");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts to the Twilio Messages API with Basic Auth and a form-encoded body", async () => {
    await sendSms("+15559876543", "Hello!");

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:secret-token").toString("base64")}`
    );

    const body = options.body as URLSearchParams;
    expect(body.get("To")).toBe("+15559876543");
    expect(body.get("MessagingServiceSid")).toBe("MG456");
    expect(body.get("Body")).toBe("Hello!");
  });

  it("logs and does not throw when the Twilio request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Invalid number",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendSms("+15559876543", "Hello!")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs and does not throw when fetch itself rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendSms("+15559876543", "Hello!")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs and skips the request when Twilio env vars are missing", async () => {
    vi.unstubAllEnvs();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendSms("+15559876543", "Hello!");

    expect(fetch).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/sms.test.ts`
Expected: FAIL — module `@/lib/sms` not found.

- [ ] **Step 3: Implement `sendSms`**

Create `src/lib/sms.ts`:

```typescript
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    console.error("sendSms: missing Twilio environment variables, skipping send");
    return;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          MessagingServiceSid: messagingServiceSid,
          Body: body,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`sendSms: Twilio request failed (${response.status}): ${text}`);
    }
  } catch (err) {
    console.error("sendSms: failed to send message", err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/sms.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms.ts tests/lib/sms.test.ts
git commit -m "feat: add Twilio SMS sending primitive"
```

---

### Task 3: Shared best-night aggregation helper

**Files:**
- Create: `src/lib/bestNights.ts`
- Create: `tests/lib/bestNights.test.ts`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/bestNights.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeAvailabilityCounts, getTopNight, type AvailabilityRow } from "@/lib/bestNights";

describe("computeAvailabilityCounts", () => {
  it("counts how many couples are available per date and lists their names", () => {
    const rows: AvailabilityRow[] = [
      { date: "2026-07-25", couple_id: "1", couples: { name: "The Smiths" } },
      { date: "2026-07-25", couple_id: "2", couples: { name: "The Joneses" } },
      { date: "2026-07-26", couple_id: "1", couples: { name: "The Smiths" } },
    ];

    const { counts, attendees } = computeAvailabilityCounts(rows);

    expect(counts).toEqual({ "2026-07-25": 2, "2026-07-26": 1 });
    expect(attendees).toEqual({
      "2026-07-25": ["The Smiths", "The Joneses"],
      "2026-07-26": ["The Smiths"],
    });
  });

  it("returns empty counts and attendees for no rows", () => {
    const { counts, attendees } = computeAvailabilityCounts([]);
    expect(counts).toEqual({});
    expect(attendees).toEqual({});
  });
});

describe("getTopNight", () => {
  it("returns the date with the highest count", () => {
    const top = getTopNight({ "2026-07-25": 2, "2026-07-26": 5, "2026-07-27": 3 });
    expect(top).toBe("2026-07-26");
  });

  it("breaks ties by choosing the earliest date", () => {
    const top = getTopNight({ "2026-07-27": 3, "2026-07-25": 3, "2026-07-26": 3 });
    expect(top).toBe("2026-07-25");
  });

  it("returns null when there are no dates", () => {
    expect(getTopNight({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/bestNights.test.ts`
Expected: FAIL — module `@/lib/bestNights` not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/bestNights.ts`:

```typescript
export interface AvailabilityRow {
  date: string;
  couple_id: string;
  couples: { name: string };
}

export interface AvailabilityCounts {
  counts: Record<string, number>;
  attendees: Record<string, string[]>;
}

export function computeAvailabilityCounts(rows: AvailabilityRow[]): AvailabilityCounts {
  const counts: Record<string, number> = {};
  const attendees: Record<string, string[]> = {};

  for (const row of rows) {
    counts[row.date] = (counts[row.date] ?? 0) + 1;
    if (!attendees[row.date]) attendees[row.date] = [];
    attendees[row.date].push(row.couples.name);
  }

  return { counts, attendees };
}

export function getTopNight(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  entries.sort(([dateA, countA], [dateB, countB]) => {
    if (countB !== countA) return countB - countA;
    return dateA.localeCompare(dateB);
  });

  return entries[0][0];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/bestNights.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Refactor the dashboard to use the shared helper**

Replace the contents of `src/app/dashboard/page.tsx`:

```typescript
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getRollingWindow } from "@/lib/dates";
import { computeAvailabilityCounts, type AvailabilityRow } from "@/lib/bestNights";
import { CalendarGrid } from "@/components/CalendarGrid";
import { HeatLegend } from "@/components/HeatLegend";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const window = getRollingWindow();
  const today = window[0];
  const endDate = window[window.length - 1];

  const { data: couples } = await supabase
    .from("couples")
    .select("id, name, slug")
    .order("name");

  const { data: availability } = await supabase
    .from("availability")
    .select("date, couple_id, couples(name)")
    .gte("date", today)
    .lte("date", endDate);

  const totalCouples = couples?.length ?? 0;

  const { counts, attendees } = computeAvailabilityCounts(
    (availability ?? []) as unknown as AvailabilityRow[]
  );

  const bestNights = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Board Game Night
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {totalCouples} couples in the group
        </p>

        {bestNights.length > 0 && (
          <div className="mb-6 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700">Best Nights</h2>
            {bestNights.map(([date, count]) => (
              <div key={date} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-sm text-green-600 font-semibold">
                    {count}/{totalCouples} available
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {attendees[date]?.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}

        <CalendarGrid
          availableDates={[]}
          readOnly
          counts={counts}
          totalCouples={totalCouples}
          attendees={attendees}
        />

        <div className="mt-4 flex justify-center">
          <HeatLegend />
        </div>

        {couples && couples.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Your Page</h2>
            <div className="space-y-2">
              {couples.map((couple) => (
                <Link
                  key={couple.id}
                  href={`/c/${couple.slug}`}
                  className="block bg-white rounded-lg p-3 shadow-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                >
                  {couple.name} &rarr;
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bestNights.ts tests/lib/bestNights.test.ts src/app/dashboard/page.tsx
git commit -m "refactor: extract shared best-night aggregation helper"
```

---

### Task 4: Pure notification decision rules

**Files:**
- Create: `src/lib/notifications.ts`
- Create: `tests/lib/notifications.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/notifications.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { shouldNotifyBestNight, getCouplesDueForReminder } from "@/lib/notifications";

describe("shouldNotifyBestNight", () => {
  const now = new Date("2026-07-24T18:00:00Z");

  it("returns false when there is no top date", () => {
    expect(shouldNotifyBestNight(null, { date: null, notifiedAt: null }, now)).toBe(false);
  });

  it("returns false when the top date matches the last notified date", () => {
    const state = { date: "2026-07-25", notifiedAt: "2026-07-23T18:00:00Z" };
    expect(shouldNotifyBestNight("2026-07-25", state, now)).toBe(false);
  });

  it("returns true when the top date changed and nothing has been notified yet", () => {
    const state = { date: null, notifiedAt: null };
    expect(shouldNotifyBestNight("2026-07-25", state, now)).toBe(true);
  });

  it("returns true when the top date changed and the 24h cooldown has passed", () => {
    const state = { date: "2026-07-20", notifiedAt: "2026-07-23T17:00:00Z" };
    expect(shouldNotifyBestNight("2026-07-25", state, now)).toBe(true);
  });

  it("returns false when the top date changed but the 24h cooldown is still active", () => {
    const state = { date: "2026-07-20", notifiedAt: "2026-07-24T01:00:00Z" };
    expect(shouldNotifyBestNight("2026-07-25", state, now)).toBe(false);
  });
});

describe("getCouplesDueForReminder", () => {
  const now = new Date("2026-07-24T18:00:00Z");

  it("excludes couples without a phone number", () => {
    const couples = [{ id: "1", phone: null, last_reminded_at: null }];
    expect(getCouplesDueForReminder(couples, new Set(), now)).toEqual([]);
  });

  it("excludes couples who already have availability set in the window", () => {
    const couples = [{ id: "1", phone: "+15551234567", last_reminded_at: null }];
    expect(getCouplesDueForReminder(couples, new Set(["1"]), now)).toEqual([]);
  });

  it("includes a couple who has never been reminded", () => {
    const couples = [{ id: "1", phone: "+15551234567", last_reminded_at: null }];
    expect(getCouplesDueForReminder(couples, new Set(), now)).toEqual(couples);
  });

  it("excludes a couple reminded less than 7 days ago", () => {
    const couples = [
      { id: "1", phone: "+15551234567", last_reminded_at: "2026-07-20T18:00:00Z" },
    ];
    expect(getCouplesDueForReminder(couples, new Set(), now)).toEqual([]);
  });

  it("includes a couple reminded more than 7 days ago", () => {
    const couples = [
      { id: "1", phone: "+15551234567", last_reminded_at: "2026-07-10T18:00:00Z" },
    ];
    expect(getCouplesDueForReminder(couples, new Set(), now)).toEqual(couples);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/notifications.test.ts`
Expected: FAIL — module `@/lib/notifications` not found.

- [ ] **Step 3: Implement the decision rules**

Create `src/lib/notifications.ts`:

```typescript
export interface BestNightState {
  date: string | null;
  notifiedAt: string | null;
}

const BEST_NIGHT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldNotifyBestNight(
  currentTopDate: string | null,
  state: BestNightState,
  now: Date
): boolean {
  if (currentTopDate === null) return false;
  if (currentTopDate === state.date) return false;
  if (state.notifiedAt === null) return true;

  const elapsed = now.getTime() - new Date(state.notifiedAt).getTime();
  return elapsed >= BEST_NIGHT_COOLDOWN_MS;
}

export interface CoupleForReminder {
  id: string;
  phone: string | null;
  last_reminded_at: string | null;
}

export function getCouplesDueForReminder(
  couples: CoupleForReminder[],
  coupleIdsWithAvailability: Set<string>,
  now: Date
): CoupleForReminder[] {
  return couples.filter((couple) => {
    if (!couple.phone) return false;
    if (coupleIdsWithAvailability.has(couple.id)) return false;
    if (couple.last_reminded_at === null) return true;

    const elapsed = now.getTime() - new Date(couple.last_reminded_at).getTime();
    return elapsed >= REMINDER_COOLDOWN_MS;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/notifications.test.ts`
Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts tests/lib/notifications.test.ts
git commit -m "feat: add pure decision rules for notification cooldowns"
```

---

### Task 5: Admin phone number support

**Files:**
- Modify: `src/actions/admin.ts`
- Modify: `tests/actions/admin.test.ts`
- Modify: `src/app/admin/[secret]/client.tsx`

- [ ] **Step 1: Update the failing/changed tests first**

Replace the contents of `tests/actions/admin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  supabase: mockSupabase,
}));

vi.mock("@/lib/slugs", () => ({
  generateSlug: () => "test-name-abc123",
}));

import {
  addCouple,
  removeCouple,
  listCouples,
  regenerateSlug,
  updateCouplePhone,
} from "@/actions/admin";

describe("addCouple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new couple with generated slug and no phone by default", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "new-id",
            name: "Test Name",
            slug: "test-name-abc123",
            phone: null,
            created_at: "2026-06-01",
          },
          error: null,
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ insert: insertMock });

    const result = await addCouple("Test Name");

    expect(insertMock).toHaveBeenCalledWith({
      name: "Test Name",
      slug: "test-name-abc123",
      phone: null,
    });
    expect(result).toEqual({
      id: "new-id",
      name: "Test Name",
      slug: "test-name-abc123",
      phone: null,
      created_at: "2026-06-01",
    });
  });

  it("inserts a new couple with a phone number when provided", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "new-id",
            name: "Test Name",
            slug: "test-name-abc123",
            phone: "+15551234567",
            created_at: "2026-06-01",
          },
          error: null,
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ insert: insertMock });

    await addCouple("Test Name", "+15551234567");

    expect(insertMock).toHaveBeenCalledWith({
      name: "Test Name",
      slug: "test-name-abc123",
      phone: "+15551234567",
    });
  });
});

describe("removeCouple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a couple by id", async () => {
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from.mockReturnValue({ delete: deleteMock });

    await removeCouple("couple-id");

    expect(deleteMock).toHaveBeenCalled();
  });
});

describe("listCouples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all couples ordered by name", async () => {
    const selectMock = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "1", name: "Adams", slug: "adams-xyz", created_at: "2026-01-01" },
          { id: "2", name: "Baker", slug: "baker-abc", created_at: "2026-01-02" },
        ],
        error: null,
      }),
    });

    mockSupabase.from.mockReturnValue({ select: selectMock });

    const result = await listCouples();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Adams");
  });
});

describe("regenerateSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a couple's slug", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "1", name: "Test", slug: "test-name-abc123", created_at: "2026-01-01" },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ update: updateMock });

    const result = await regenerateSlug("1", "Test");

    expect(updateMock).toHaveBeenCalledWith({ slug: "test-name-abc123" });
    expect(result.slug).toBe("test-name-abc123");
  });
});

describe("updateCouplePhone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a couple's phone number", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "1",
              name: "Test",
              slug: "test-slug",
              phone: "+15551234567",
              created_at: "2026-01-01",
            },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ update: updateMock });

    const result = await updateCouplePhone("1", "+15551234567");

    expect(updateMock).toHaveBeenCalledWith({ phone: "+15551234567" });
    expect(result.phone).toBe("+15551234567");
  });

  it("allows clearing a couple's phone number", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "1",
              name: "Test",
              slug: "test-slug",
              phone: null,
              created_at: "2026-01-01",
            },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ update: updateMock });

    const result = await updateCouplePhone("1", null);

    expect(updateMock).toHaveBeenCalledWith({ phone: null });
    expect(result.phone).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/admin.test.ts`
Expected: FAIL — `addCouple` insert assertion mismatch (missing `phone` key) and `updateCouplePhone` not exported.

- [ ] **Step 3: Implement the admin action changes**

Replace the contents of `src/actions/admin.ts`:

```typescript
"use server";

import { supabase } from "@/lib/supabase";
import { generateSlug } from "@/lib/slugs";

export interface Couple {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  created_at: string;
}

export async function addCouple(name: string, phone?: string): Promise<Couple> {
  const slug = generateSlug(name);

  const { data, error } = await supabase
    .from("couples")
    .insert({ name, slug, phone: phone ?? null })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add couple: ${error.message}`);
  }

  return data as Couple;
}

export async function removeCouple(id: string): Promise<void> {
  await supabase.from("couples").delete().eq("id", id);
}

export async function listCouples(): Promise<Couple[]> {
  const { data } = await supabase
    .from("couples")
    .select("*")
    .order("name");

  return (data ?? []) as Couple[];
}

export async function regenerateSlug(id: string, name: string): Promise<Couple> {
  const slug = generateSlug(name);

  const { data } = await supabase
    .from("couples")
    .update({ slug })
    .eq("id", id)
    .select()
    .single();

  return data as Couple;
}

export async function updateCouplePhone(id: string, phone: string | null): Promise<Couple> {
  const { data, error } = await supabase
    .from("couples")
    .update({ phone })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update phone: ${error.message}`);
  }

  return data as Couple;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/admin.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Add phone number UI to the admin panel**

Replace the contents of `src/app/admin/[secret]/client.tsx`:

```typescript
"use client";

import { useState } from "react";
import {
  addCouple,
  removeCouple,
  regenerateSlug,
  updateCouplePhone,
  type Couple,
} from "@/actions/admin";

interface AdminClientProps {
  initialCouples: Couple[];
  adminSecret: string;
}

export function AdminClient({ initialCouples, adminSecret }: AdminClientProps) {
  const [couples, setCouples] = useState<Couple[]>(initialCouples);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const couple = await addCouple(newName.trim(), newPhone.trim() || undefined);
    setCouples([...couples, couple].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setNewPhone("");
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this couple? Their availability data will be deleted.")) return;
    await removeCouple(id);
    setCouples(couples.filter((c) => c.id !== id));
  }

  async function handleRegenerate(id: string, name: string) {
    if (!confirm("Generate a new link? The old link will stop working.")) return;
    const updated = await regenerateSlug(id, name);
    setCouples(couples.map((c) => (c.id === id ? updated : c)));
  }

  async function handleSavePhone(id: string) {
    const draft = phoneDrafts[id]?.trim() ?? "";
    const updated = await updateCouplePhone(id, draft || null);
    setCouples(couples.map((c) => (c.id === id ? updated : c)));
  }

  function getCoupleUrl(slug: string) {
    return `${window.location.origin}/c/${slug}`;
  }

  async function handleCopy(slug: string) {
    await navigator.clipboard.writeText(getCoupleUrl(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="flex flex-col gap-2 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Couple name (e.g. The Smiths)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            Add
          </button>
        </div>
        <input
          type="tel"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          placeholder="Phone number (optional, e.g. +15551234567)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
      </form>

      <div className="space-y-3">
        {couples.map((couple) => (
          <div key={couple.id} className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">{couple.name}</span>
              <button
                onClick={() => handleRemove(couple.id)}
                className="text-red-500 text-xs hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 truncate">
                /c/{couple.slug}
              </code>
              <button
                onClick={() => handleCopy(couple.slug)}
                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                {copiedSlug === couple.slug ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={() => handleRegenerate(couple.id, couple.name)}
                className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
              >
                New Link
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneDrafts[couple.id] ?? couple.phone ?? ""}
                onChange={(e) =>
                  setPhoneDrafts({ ...phoneDrafts, [couple.id]: e.target.value })
                }
                placeholder="Phone number"
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-900"
              />
              <button
                onClick={() => handleSavePhone(couple.id)}
                className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      {couples.length === 0 && (
        <p className="text-center text-gray-400 text-sm">
          No couples added yet. Add one above to get started.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`, then visit `http://localhost:3000/admin/<your-admin-secret>`.
Expected: The add-couple form has a phone field, and each existing couple has an editable phone input with a "Save" button that persists on click.

- [ ] **Step 7: Commit**

```bash
git add src/actions/admin.ts tests/actions/admin.test.ts src/app/admin/
git commit -m "feat: add phone number field to admin panel"
```

---

### Task 6: Notification orchestration

**Files:**
- Create: `src/actions/notifications.ts`
- Create: `tests/actions/notifications.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/actions/notifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}));

const sendSmsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/supabase", () => ({
  supabase: mockSupabase,
}));

vi.mock("@/lib/dates", () => ({
  getRollingWindow: () => ["2026-07-24", "2026-07-25", "2026-07-26", "2026-07-27"],
}));

vi.mock("@/lib/sms", () => ({
  sendSms: sendSmsMock,
}));

import { notifyBestNightIfChanged, sendReminders } from "@/actions/notifications";

describe("notifyBestNightIfChanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("texts couples signed up for the new top night and updates state", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "availability") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === "date, couple_id, couples(name)") {
              return {
                gte: () => ({
                  lte: () =>
                    Promise.resolve({
                      data: [
                        { date: "2026-07-25", couple_id: "1", couples: { name: "The Smiths" } },
                        { date: "2026-07-25", couple_id: "2", couples: { name: "The Joneses" } },
                      ],
                      error: null,
                    }),
                }),
              };
            }
            return {
              eq: () =>
                Promise.resolve({
                  data: [
                    { couples: { name: "The Smiths", phone: "+15550000001" } },
                    { couples: { name: "The Joneses", phone: null } },
                  ],
                  error: null,
                }),
            };
          }),
        };
      }
      if (table === "notification_state") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: { date: "2026-07-20", notified_at: "2026-07-22T00:00:00Z" } },
                error: null,
              }),
            }),
          }),
          upsert: upsertMock,
        };
      }
      if (table === "couples") {
        return {
          select: () => Promise.resolve({ data: [{ id: "1" }, { id: "2" }], error: null }),
        };
      }
      return {};
    });

    await notifyBestNightIfChanged();

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith(
      "+15550000001",
      expect.stringContaining("2/2 available")
    );
    expect(upsertMock).toHaveBeenCalledWith({
      key: "best_night",
      value: { date: "2026-07-25", notified_at: expect.any(String) },
    });
  });

  it("does not text or update state when the top night hasn't changed", async () => {
    const upsertMock = vi.fn();

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "availability") {
        return {
          select: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  data: [{ date: "2026-07-25", couple_id: "1", couples: { name: "The Smiths" } }],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "notification_state") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { value: { date: "2026-07-25", notified_at: "2026-07-22T00:00:00Z" } },
                error: null,
              }),
            }),
          }),
          upsert: upsertMock,
        };
      }
      return {};
    });

    await notifyBestNightIfChanged();

    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("sendReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reminds only couples with a phone, no upcoming availability, and no recent reminder", async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "couples") {
        return {
          select: () =>
            Promise.resolve({
              data: [
                { id: "1", phone: "+15550000001", last_reminded_at: null },
                { id: "2", phone: "+15550000002", last_reminded_at: null },
                { id: "3", phone: null, last_reminded_at: null },
              ],
              error: null,
            }),
          update: updateMock,
        };
      }
      if (table === "availability") {
        return {
          select: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: [{ couple_id: "2" }], error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await sendReminders();

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith("+15550000001", expect.any(String));
    expect(updateMock).toHaveBeenCalledWith({ last_reminded_at: expect.any(String) });
    expect(updateEqMock).toHaveBeenCalledWith("id", "1");
    expect(result).toEqual({ remindedCount: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/notifications.test.ts`
Expected: FAIL — module `@/actions/notifications` not found.

- [ ] **Step 3: Implement the orchestration functions**

Create `src/actions/notifications.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import { getRollingWindow } from "@/lib/dates";
import { computeAvailabilityCounts, getTopNight, type AvailabilityRow } from "@/lib/bestNights";
import {
  shouldNotifyBestNight,
  getCouplesDueForReminder,
  type CoupleForReminder,
} from "@/lib/notifications";
import { sendSms } from "@/lib/sms";

interface BestNightStateValue {
  date?: string;
  notified_at?: string;
}

export async function notifyBestNightIfChanged(): Promise<void> {
  const window = getRollingWindow();
  const today = window[0];
  const endDate = window[window.length - 1];

  const { data: availability } = await supabase
    .from("availability")
    .select("date, couple_id, couples(name)")
    .gte("date", today)
    .lte("date", endDate);

  const { counts } = computeAvailabilityCounts(
    (availability ?? []) as unknown as AvailabilityRow[]
  );
  const topDate = getTopNight(counts);

  if (topDate === null) return;

  const { data: stateRow } = await supabase
    .from("notification_state")
    .select("value")
    .eq("key", "best_night")
    .maybeSingle();

  const value = (stateRow?.value ?? null) as BestNightStateValue | null;
  const state = {
    date: value?.date ?? null,
    notifiedAt: value?.notified_at ?? null,
  };

  const now = new Date();

  if (!shouldNotifyBestNight(topDate, state, now)) return;

  const { data: allCouples } = await supabase.from("couples").select("id");
  const totalCouples = allCouples?.length ?? 0;

  const { data: recipients } = await supabase
    .from("availability")
    .select("couples(name, phone)")
    .eq("date", topDate);

  const phones = ((recipients ?? []) as unknown as { couples: { phone: string | null } }[])
    .map((row) => row.couples.phone)
    .filter((phone): phone is string => Boolean(phone));

  const dateLabel = new Date(topDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const message = `🎲 Board Game Night: ${dateLabel} is looking like the best night (${counts[topDate]}/${totalCouples} available)!`;

  await Promise.all(phones.map((phone) => sendSms(phone, message)));

  await supabase.from("notification_state").upsert({
    key: "best_night",
    value: { date: topDate, notified_at: now.toISOString() },
  });
}

export async function sendReminders(): Promise<{ remindedCount: number }> {
  const window = getRollingWindow();
  const today = window[0];
  const endDate = window[window.length - 1];

  const { data: couples } = await supabase
    .from("couples")
    .select("id, phone, last_reminded_at");

  const { data: availability } = await supabase
    .from("availability")
    .select("couple_id")
    .gte("date", today)
    .lte("date", endDate);

  const coupleIdsWithAvailability = new Set(
    (availability ?? []).map((row) => row.couple_id as string)
  );

  const now = new Date();
  const dueCouples = getCouplesDueForReminder(
    (couples ?? []) as CoupleForReminder[],
    coupleIdsWithAvailability,
    now
  );

  const message =
    "Don't forget to set your availability for the next few weeks of Board Game Night!";

  await Promise.all(
    dueCouples.map(async (couple) => {
      await sendSms(couple.phone as string, message);
      await supabase
        .from("couples")
        .update({ last_reminded_at: now.toISOString() })
        .eq("id", couple.id);
    })
  );

  return { remindedCount: dueCouples.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/notifications.test.ts`
Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/notifications.ts tests/actions/notifications.test.ts
git commit -m "feat: add best-night and reminder notification orchestration"
```

---

### Task 7: Wire the best-night trigger into toggleAvailability

**Files:**
- Modify: `src/actions/availability.ts`
- Modify: `tests/actions/availability.test.ts`

- [ ] **Step 1: Update the tests first**

Replace the contents of `tests/actions/availability.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}));

const notifyBestNightIfChangedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/supabase", () => ({
  supabase: mockSupabase,
}));

vi.mock("@/lib/dates", () => ({
  isWithinWindow: (date: string) => {
    const today = new Date("2026-06-01");
    const target = new Date(date);
    const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 28;
  },
  formatDate: () => "2026-06-01",
}));

vi.mock("@/actions/notifications", () => ({
  notifyBestNightIfChanged: notifyBestNightIfChangedMock,
}));

import { toggleAvailability, getAvailability } from "@/actions/availability";

describe("toggleAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a row when date is not currently available", async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "availability") {
        return { select: selectMock, insert: insertMock };
      }
      return {};
    });

    const result = await toggleAvailability("couple-123", "2026-06-10");

    expect(insertMock).toHaveBeenCalledWith({
      couple_id: "couple-123",
      date: "2026-06-10",
    });
    expect(result).toEqual({ available: true });
    expect(notifyBestNightIfChangedMock).toHaveBeenCalledTimes(1);
  });

  it("deletes the row when date is currently available", async () => {
    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "row-1" },
            error: null,
          }),
        }),
      }),
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "availability") {
        return { select: selectMock, delete: deleteMock };
      }
      return {};
    });

    const result = await toggleAvailability("couple-123", "2026-06-10");

    expect(deleteMock).toHaveBeenCalled();
    expect(result).toEqual({ available: false });
    expect(notifyBestNightIfChangedMock).toHaveBeenCalledTimes(1);
  });

  it("rejects dates outside the rolling window", async () => {
    const result = await toggleAvailability("couple-123", "2025-01-01");

    expect(result).toEqual({ error: "Date is outside the valid window" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(notifyBestNightIfChangedMock).not.toHaveBeenCalled();
  });
});

describe("getAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of available date strings for a couple", async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({
          data: [{ date: "2026-06-10" }, { date: "2026-06-15" }],
          error: null,
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ select: selectMock });

    const result = await getAvailability("couple-123");

    expect(result).toEqual(["2026-06-10", "2026-06-15"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/actions/availability.test.ts`
Expected: FAIL — `notifyBestNightIfChangedMock` was never called (not wired in yet).

- [ ] **Step 3: Wire the trigger into `toggleAvailability`**

Replace the contents of `src/actions/availability.ts`:

```typescript
"use server";

import { supabase } from "@/lib/supabase";
import { isWithinWindow, formatDate } from "@/lib/dates";
import { notifyBestNightIfChanged } from "@/actions/notifications";

export async function toggleAvailability(
  coupleId: string,
  date: string
): Promise<{ available: boolean } | { error: string }> {
  if (!isWithinWindow(date)) {
    return { error: "Date is outside the valid window" };
  }

  const { data: existing } = await supabase
    .from("availability")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("date", date)
    .maybeSingle();

  let result: { available: boolean };

  if (existing) {
    await supabase
      .from("availability")
      .delete()
      .eq("couple_id", coupleId)
      .eq("date", date);
    result = { available: false };
  } else {
    await supabase.from("availability").insert({
      couple_id: coupleId,
      date,
    });
    result = { available: true };
  }

  await notifyBestNightIfChanged();

  return result;
}

export async function getAvailability(coupleId: string): Promise<string[]> {
  const today = formatDate(new Date());

  const { data } = await supabase
    .from("availability")
    .select("date")
    .eq("couple_id", coupleId)
    .gte("date", today);

  return (data ?? []).map((row) => row.date);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/actions/availability.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability.ts tests/actions/availability.test.ts
git commit -m "feat: trigger best-night notification after availability toggle"
```

---

### Task 8: Weekly reminder cron endpoint

**Files:**
- Create: `src/app/api/cron/reminders/route.ts`
- Create: `tests/app/api/cron/reminders/route.test.ts`
- Create: `vercel.json`

- [ ] **Step 1: Write the failing tests**

Create `tests/app/api/cron/reminders/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const sendRemindersMock = vi.hoisted(() => vi.fn().mockResolvedValue({ remindedCount: 2 }));

vi.mock("@/actions/notifications", () => ({
  sendReminders: sendRemindersMock,
}));

import { GET } from "@/app/api/cron/reminders/route";

describe("GET /api/cron/reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when the authorization header is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/reminders");

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sendRemindersMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the authorization header doesn't match CRON_SECRET", async () => {
    const request = new NextRequest("http://localhost/api/cron/reminders", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(sendRemindersMock).not.toHaveBeenCalled();
  });

  it("runs the reminder job and returns the count when authorized", async () => {
    const request = new NextRequest("http://localhost/api/cron/reminders", {
      headers: { authorization: "Bearer test-secret" },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sendRemindersMock).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ remindedCount: 2 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/app/api/cron/reminders/route.test.ts`
Expected: FAIL — module `@/app/api/cron/reminders/route` not found.

- [ ] **Step 3: Implement the route handler**

Create `src/app/api/cron/reminders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { sendReminders } from "@/actions/notifications";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { remindedCount } = await sendReminders();

  return NextResponse.json({ remindedCount });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/app/api/cron/reminders/route.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Add the Vercel Cron schedule**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 1 * * *"
    }
  ]
}
```

This runs daily at 01:00 UTC (6pm Pacific during PDT; drifts to 5pm during PST — an accepted tradeoff, not fixed).

- [ ] **Step 6: Verify the full build**

Run: `npm run build`
Expected: Build succeeds, including the new `/api/cron/reminders` route.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/reminders/route.ts tests/app/api/cron/reminders/route.test.ts vercel.json
git commit -m "feat: add weekly availability reminder cron endpoint"
```

---

### Task 9: Deployment configuration and end-to-end verification

**Files:** None (environment configuration + manual verification only)

- [ ] **Step 1: Add environment variables to Vercel**

In the Vercel project settings → Environment Variables, add:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `CRON_SECRET` (any random string — Vercel automatically attaches it as a Bearer token when invoking your Cron Job routes on their platform)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: All tests PASS (existing + new).

- [ ] **Step 3: Run lint and type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual smoke test**

1. `npm run dev`, visit `/admin/<secret>`, add a phone number to a test couple.
2. Visit that couple's `/c/<slug>` page and toggle a date so it becomes the new #1 best night.
3. Confirm (via server logs, since local dev has no real Twilio credentials unless you've added them to `.env.local`) that `notifyBestNightIfChanged` runs without throwing.
4. If you've added real Twilio credentials locally, confirm the SMS actually arrives on the test phone.

- [ ] **Step 5: Deploy and verify the cron job**

After pushing to `main` (auto-deploys via Vercel), check Vercel's dashboard under the project's "Cron Jobs" tab to confirm `/api/cron/reminders` is scheduled, and optionally trigger it manually from that UI to confirm it runs end-to-end against production data.
