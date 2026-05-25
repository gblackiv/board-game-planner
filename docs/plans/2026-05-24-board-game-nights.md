# Board Game Night Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-friction web app where couples toggle availability on a 4-week rolling calendar and a shared dashboard shows the best nights for board game meetups.

**Architecture:** Next.js App Router with server actions for data mutations, Supabase Postgres for storage, deployed on Vercel. No auth — access controlled by unique URL slugs per couple and an env-var admin secret.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Supabase (postgres-js client), Tailwind CSS, Vercel hosting

---

## File Structure

```
board-game-nights/
├── .env.local                    # Supabase URL, anon key, admin secret
├── .env.example                  # Template showing required env vars
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── supabase/
│   └── schema.sql                # DDL for couples + availability tables
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (Tailwind, fonts)
│   │   ├── page.tsx              # Redirect to /dashboard
│   │   ├── c/
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Couple calendar page
│   │   ├── dashboard/
│   │   │   └── page.tsx          # Group dashboard
│   │   └── admin/
│   │       └── [secret]/
│   │           └── page.tsx      # Admin panel
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client singleton
│   │   ├── dates.ts              # Rolling window date helpers
│   │   └── slugs.ts              # Slug generation utility
│   ├── actions/
│   │   ├── availability.ts       # Server actions: toggle availability
│   │   └── admin.ts              # Server actions: CRUD couples
│   └── components/
│       ├── CalendarGrid.tsx       # Shared calendar grid (interactive or read-only)
│       ├── DayCell.tsx            # Individual day cell (tappable or display)
│       └── HeatLegend.tsx        # Color legend for dashboard
├── tests/
│   ├── lib/
│   │   ├── dates.test.ts         # Date helper tests
│   │   └── slugs.test.ts         # Slug generation tests
│   ├── actions/
│   │   ├── availability.test.ts  # Availability toggle tests
│   │   └── admin.test.ts         # Admin action tests
│   └── components/
│       ├── CalendarGrid.test.tsx  # Calendar grid rendering tests
│       └── DayCell.test.tsx       # Day cell interaction tests
└── docs/
    ├── specs/
    │   └── 2026-05-24-board-game-nights-design.md
    └── plans/
        └── 2026-05-24-board-game-nights.md
```

---

### Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.env.example`, `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

Run:
```bash
cd ~/personal-projects/board-game-nights
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

When prompted for options, accept defaults. This creates the full scaffold including `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, and the `src/app/` directory.

- [ ] **Step 2: Add test dependencies**

Run:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `tests/setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script to package.json**

Add to `scripts` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create .env.example**

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ADMIN_SECRET=your-admin-secret-here
```

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:
```
.env.local
```

- [ ] **Step 7: Verify setup**

Run:
```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, TypeScript, and Vitest"
```

---

### Task 2: Database Schema & Supabase Client

**Files:**
- Create: `supabase/schema.sql`, `src/lib/supabase.ts`

- [ ] **Step 1: Write database schema**

Create `supabase/schema.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  UNIQUE (couple_id, date)
);

CREATE INDEX idx_availability_date ON availability(date);
CREATE INDEX idx_availability_couple_id ON availability(couple_id);
CREATE INDEX idx_couples_slug ON couples(slug);
```

- [ ] **Step 2: Install Supabase client**

Run:
```bash
npm install @supabase/supabase-js
```

- [ ] **Step 3: Create Supabase client singleton**

Create `src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql src/lib/supabase.ts
git commit -m "feat: add database schema and Supabase client"
```

---

### Task 3: Date Utility Helpers

**Files:**
- Create: `src/lib/dates.ts`, `tests/lib/dates.test.ts`

- [ ] **Step 1: Write failing tests for date helpers**

Create `tests/lib/dates.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { getRollingWindow, isWithinWindow, formatDate } from "@/lib/dates";

describe("getRollingWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 28 dates starting from today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01"));

    const window = getRollingWindow();

    expect(window).toHaveLength(28);
    expect(window[0]).toBe("2026-06-01");
    expect(window[27]).toBe("2026-06-28");
  });

  it("formats dates as YYYY-MM-DD strings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-30"));

    const window = getRollingWindow();

    expect(window[0]).toBe("2026-12-30");
    expect(window[2]).toBe("2027-01-01");
  });
});

describe("isWithinWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for dates within the 28-day window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01"));

    expect(isWithinWindow("2026-06-01")).toBe(true);
    expect(isWithinWindow("2026-06-28")).toBe(true);
  });

  it("returns false for dates outside the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01"));

    expect(isWithinWindow("2026-05-31")).toBe(false);
    expect(isWithinWindow("2026-06-29")).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats a Date object to YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: FAIL — module `@/lib/dates` not found.

- [ ] **Step 3: Implement date helpers**

Create `src/lib/dates.ts`:
```typescript
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getRollingWindow(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function isWithinWindow(dateStr: string): boolean {
  const window = getRollingWindow();
  return window.includes(dateStr);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/dates.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts tests/lib/dates.test.ts
git commit -m "feat: add rolling 4-week date window helpers"
```

---

### Task 4: Slug Generation Utility

**Files:**
- Create: `src/lib/slugs.ts`, `tests/lib/slugs.test.ts`

- [ ] **Step 1: Write failing tests for slug generation**

Create `tests/lib/slugs.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { generateSlug } from "@/lib/slugs";

describe("generateSlug", () => {
  it("includes a lowercase version of the name", () => {
    const slug = generateSlug("The Smiths");
    expect(slug).toMatch(/^the-smiths-/);
  });

  it("appends a random suffix", () => {
    const slug = generateSlug("The Smiths");
    const suffix = slug.replace("the-smiths-", "");
    expect(suffix).toMatch(/^[a-z0-9]{6}$/);
  });

  it("produces unique slugs for the same name", () => {
    const slug1 = generateSlug("Jones Family");
    const slug2 = generateSlug("Jones Family");
    expect(slug1).not.toBe(slug2);
  });

  it("handles special characters in names", () => {
    const slug = generateSlug("O'Brien & Co.");
    expect(slug).toMatch(/^obrien-co-[a-z0-9]{6}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/slugs.test.ts`
Expected: FAIL — module `@/lib/slugs` not found.

- [ ] **Step 3: Implement slug generation**

Create `src/lib/slugs.ts`:
```typescript
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/slugs.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slugs.ts tests/lib/slugs.test.ts
git commit -m "feat: add slug generation utility"
```

---

### Task 5: Availability Server Actions

**Files:**
- Create: `src/actions/availability.ts`, `tests/actions/availability.test.ts`

- [ ] **Step 1: Write failing tests for availability actions**

Create `tests/actions/availability.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  from: vi.fn(),
};

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
  });

  it("rejects dates outside the rolling window", async () => {
    const result = await toggleAvailability("couple-123", "2025-01-01");

    expect(result).toEqual({ error: "Date is outside the valid window" });
    expect(mockSupabase.from).not.toHaveBeenCalled();
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/actions/availability.test.ts`
Expected: FAIL — module `@/actions/availability` not found.

- [ ] **Step 3: Implement availability actions**

Create `src/actions/availability.ts`:
```typescript
"use server";

import { supabase } from "@/lib/supabase";
import { isWithinWindow } from "@/lib/dates";

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

  if (existing) {
    await supabase
      .from("availability")
      .delete()
      .eq("couple_id", coupleId)
      .eq("date", date);
    return { available: false };
  } else {
    await supabase.from("availability").insert({
      couple_id: coupleId,
      date,
    });
    return { available: true };
  }
}

export async function getAvailability(coupleId: string): Promise<string[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("availability")
    .select("date")
    .eq("couple_id", coupleId)
    .gte("date", today);

  return (data ?? []).map((row) => row.date);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/actions/availability.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability.ts tests/actions/availability.test.ts
git commit -m "feat: add availability toggle and query server actions"
```

---

### Task 6: Admin Server Actions

**Files:**
- Create: `src/actions/admin.ts`, `tests/actions/admin.test.ts`

- [ ] **Step 1: Write failing tests for admin actions**

Create `tests/actions/admin.test.ts`:
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

import { addCouple, removeCouple, listCouples, regenerateSlug } from "@/actions/admin";

describe("addCouple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a new couple with generated slug", async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "new-id", name: "Test Name", slug: "test-name-abc123", created_at: "2026-06-01" },
          error: null,
        }),
      }),
    });

    mockSupabase.from.mockReturnValue({ insert: insertMock });

    const result = await addCouple("Test Name");

    expect(insertMock).toHaveBeenCalledWith({
      name: "Test Name",
      slug: "test-name-abc123",
    });
    expect(result).toEqual({
      id: "new-id",
      name: "Test Name",
      slug: "test-name-abc123",
      created_at: "2026-06-01",
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/actions/admin.test.ts`
Expected: FAIL — module `@/actions/admin` not found.

- [ ] **Step 3: Implement admin actions**

Create `src/actions/admin.ts`:
```typescript
"use server";

import { supabase } from "@/lib/supabase";
import { generateSlug } from "@/lib/slugs";

export interface Couple {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export async function addCouple(name: string): Promise<Couple> {
  const slug = generateSlug(name);

  const { data } = await supabase
    .from("couples")
    .insert({ name, slug })
    .select()
    .single();

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/actions/admin.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/admin.ts tests/actions/admin.test.ts
git commit -m "feat: add admin CRUD server actions for couples"
```

---

### Task 7: Calendar Grid & Day Cell Components

**Files:**
- Create: `src/components/CalendarGrid.tsx`, `src/components/DayCell.tsx`, `tests/components/CalendarGrid.test.tsx`, `tests/components/DayCell.test.tsx`

- [ ] **Step 1: Write failing tests for DayCell**

Create `tests/components/DayCell.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DayCell } from "@/components/DayCell";

describe("DayCell", () => {
  it("renders the day number", () => {
    render(<DayCell date="2026-06-15" available={false} onToggle={() => {}} />);
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows available styling when available is true", () => {
    render(<DayCell date="2026-06-15" available={true} onToggle={() => {}} />);
    const cell = screen.getByRole("button");
    expect(cell).toHaveClass("bg-green-500");
  });

  it("shows default styling when available is false", () => {
    render(<DayCell date="2026-06-15" available={false} onToggle={() => {}} />);
    const cell = screen.getByRole("button");
    expect(cell).not.toHaveClass("bg-green-500");
  });

  it("calls onToggle with the date when tapped", () => {
    const onToggle = vi.fn();
    render(<DayCell date="2026-06-15" available={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("2026-06-15");
  });

  it("renders as non-interactive in readOnly mode", () => {
    render(<DayCell date="2026-06-15" available={true} readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows count when provided", () => {
    render(<DayCell date="2026-06-15" available={false} readOnly count={7} totalCouples={10} />);
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/DayCell.test.tsx`
Expected: FAIL — module `@/components/DayCell` not found.

- [ ] **Step 3: Implement DayCell**

Create `src/components/DayCell.tsx`:
```typescript
"use client";

interface DayCellProps {
  date: string;
  available: boolean;
  onToggle?: (date: string) => void;
  readOnly?: boolean;
  count?: number;
  totalCouples?: number;
}

export function DayCell({ date, available, onToggle, readOnly, count, totalCouples }: DayCellProps) {
  const day = new Date(date + "T12:00:00").getDate();

  if (readOnly) {
    const intensity = count && totalCouples ? count / totalCouples : 0;
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg p-2 min-h-[3.5rem] ${
          intensity > 0.7
            ? "bg-green-600 text-white"
            : intensity > 0.4
            ? "bg-green-400 text-white"
            : intensity > 0
            ? "bg-green-200 text-gray-800"
            : "bg-gray-100 text-gray-400"
        }`}
      >
        <span className="text-xs font-medium">{day}</span>
        {count !== undefined && totalCouples !== undefined && (
          <span className="text-xs">{count}/{totalCouples}</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggle?.(date)}
      className={`flex items-center justify-center rounded-lg p-2 min-h-[3.5rem] transition-colors ${
        available
          ? "bg-green-500 text-white font-bold"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      <span className="text-sm">{day}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run DayCell tests to verify they pass**

Run: `npx vitest run tests/components/DayCell.test.tsx`
Expected: All 6 tests PASS.

- [ ] **Step 5: Write failing tests for CalendarGrid**

Create `tests/components/CalendarGrid.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarGrid } from "@/components/CalendarGrid";

vi.mock("@/lib/dates", () => ({
  getRollingWindow: () => [
    "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04",
    "2026-06-05", "2026-06-06", "2026-06-07", "2026-06-08",
    "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12",
    "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16",
    "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20",
    "2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24",
    "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28",
  ],
}));

describe("CalendarGrid", () => {
  it("renders 28 day cells", () => {
    render(
      <CalendarGrid
        availableDates={[]}
        onToggle={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(28);
  });

  it("marks available dates correctly", () => {
    render(
      <CalendarGrid
        availableDates={["2026-06-01", "2026-06-10"]}
        onToggle={() => {}}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveClass("bg-green-500");
    expect(buttons[1]).not.toHaveClass("bg-green-500");
    expect(buttons[9]).toHaveClass("bg-green-500");
  });

  it("renders day-of-week headers", () => {
    render(
      <CalendarGrid
        availableDates={[]}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run CalendarGrid tests to verify they fail**

Run: `npx vitest run tests/components/CalendarGrid.test.tsx`
Expected: FAIL — module `@/components/CalendarGrid` not found.

- [ ] **Step 7: Implement CalendarGrid**

Create `src/components/CalendarGrid.tsx`:
```typescript
"use client";

import { getRollingWindow } from "@/lib/dates";
import { DayCell } from "./DayCell";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarGridProps {
  availableDates: string[];
  onToggle?: (date: string) => void;
  readOnly?: boolean;
  counts?: Record<string, number>;
  totalCouples?: number;
}

export function CalendarGrid({ availableDates, onToggle, readOnly, counts, totalCouples }: CalendarGridProps) {
  const dates = getRollingWindow();
  const availableSet = new Set(availableDates);

  const firstDate = new Date(dates[0] + "T12:00:00");
  const startDayOfWeek = firstDate.getDay();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            available={availableSet.has(date)}
            onToggle={onToggle}
            readOnly={readOnly}
            count={counts?.[date]}
            totalCouples={totalCouples}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run all component tests**

Run: `npx vitest run tests/components/`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/ tests/components/
git commit -m "feat: add CalendarGrid and DayCell components"
```

---

### Task 8: Couple Calendar Page

**Files:**
- Create: `src/app/c/[slug]/page.tsx`

- [ ] **Step 1: Implement the couple calendar page**

Create `src/app/c/[slug]/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAvailability } from "@/actions/availability";
import { CoupleCalendarClient } from "./client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CoupleCalendarPage({ params }: PageProps) {
  const { slug } = await params;

  const { data: couple } = await supabase
    .from("couples")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!couple) {
    notFound();
  }

  const availableDates = await getAvailability(couple.id);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          {couple.name}
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Tap days you&apos;re available for board game night
        </p>
        <CoupleCalendarClient coupleId={couple.id} initialDates={availableDates} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the client component**

Create `src/app/c/[slug]/client.tsx`:
```typescript
"use client";

import { useOptimistic, useTransition } from "react";
import { CalendarGrid } from "@/components/CalendarGrid";
import { toggleAvailability } from "@/actions/availability";

interface CoupleCalendarClientProps {
  coupleId: string;
  initialDates: string[];
}

export function CoupleCalendarClient({ coupleId, initialDates }: CoupleCalendarClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDates, setOptimisticDates] = useOptimistic(
    initialDates,
    (current: string[], date: string) => {
      if (current.includes(date)) {
        return current.filter((d) => d !== date);
      }
      return [...current, date];
    }
  );

  function handleToggle(date: string) {
    startTransition(async () => {
      setOptimisticDates(date);
      await toggleAvailability(coupleId, date);
    });
  }

  return (
    <div className={isPending ? "opacity-90" : ""}>
      <CalendarGrid availableDates={optimisticDates} onToggle={handleToggle} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd ~/personal-projects/board-game-nights && npm run build`
Expected: Build succeeds (pages may show dynamic route warnings, which is fine).

- [ ] **Step 4: Commit**

```bash
git add src/app/c/
git commit -m "feat: add couple calendar page with optimistic toggle"
```

---

### Task 9: Dashboard Page

**Files:**
- Create: `src/app/dashboard/page.tsx`, `src/components/HeatLegend.tsx`

- [ ] **Step 1: Implement HeatLegend component**

Create `src/components/HeatLegend.tsx`:
```typescript
export function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Less</span>
      <div className="w-4 h-4 rounded bg-gray-100" />
      <div className="w-4 h-4 rounded bg-green-200" />
      <div className="w-4 h-4 rounded bg-green-400" />
      <div className="w-4 h-4 rounded bg-green-600" />
      <span>More</span>
    </div>
  );
}
```

- [ ] **Step 2: Implement the dashboard page**

Create `src/app/dashboard/page.tsx`:
```typescript
import { supabase } from "@/lib/supabase";
import { getRollingWindow } from "@/lib/dates";
import { CalendarGrid } from "@/components/CalendarGrid";
import { HeatLegend } from "@/components/HeatLegend";

interface AvailabilityRow {
  date: string;
  couple_id: string;
  couples: { name: string };
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const window = getRollingWindow();
  const today = window[0];
  const endDate = window[window.length - 1];

  const { data: couples } = await supabase
    .from("couples")
    .select("id, name");

  const { data: availability } = await supabase
    .from("availability")
    .select("date, couple_id, couples(name)")
    .gte("date", today)
    .lte("date", endDate);

  const totalCouples = couples?.length ?? 0;

  const counts: Record<string, number> = {};
  const attendees: Record<string, string[]> = {};

  for (const row of (availability ?? []) as AvailabilityRow[]) {
    counts[row.date] = (counts[row.date] ?? 0) + 1;
    if (!attendees[row.date]) attendees[row.date] = [];
    attendees[row.date].push(row.couples.name);
  }

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
        />

        <div className="mt-4 flex justify-center">
          <HeatLegend />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update root page to redirect to dashboard**

Replace `src/app/page.tsx` content:
```typescript
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 4: Verify build**

Run: `cd ~/personal-projects/board-game-nights && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/ src/components/HeatLegend.tsx src/app/page.tsx
git commit -m "feat: add group dashboard with heat map and best nights"
```

---

### Task 10: Admin Page

**Files:**
- Create: `src/app/admin/[secret]/page.tsx`, `src/app/admin/[secret]/client.tsx`

- [ ] **Step 1: Implement the admin page (server component)**

Create `src/app/admin/[secret]/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { listCouples } from "@/actions/admin";
import { AdminClient } from "./client";

interface PageProps {
  params: Promise<{ secret: string }>;
}

export default async function AdminPage({ params }: PageProps) {
  const { secret } = await params;

  if (secret !== process.env.ADMIN_SECRET) {
    notFound();
  }

  const couples = await listCouples();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
          Admin Panel
        </h1>
        <AdminClient initialCouples={couples} adminSecret={secret} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement the admin client component**

Create `src/app/admin/[secret]/client.tsx`:
```typescript
"use client";

import { useState } from "react";
import { addCouple, removeCouple, regenerateSlug, type Couple } from "@/actions/admin";

interface AdminClientProps {
  initialCouples: Couple[];
  adminSecret: string;
}

export function AdminClient({ initialCouples, adminSecret }: AdminClientProps) {
  const [couples, setCouples] = useState<Couple[]>(initialCouples);
  const [newName, setNewName] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const couple = await addCouple(newName.trim());
    setCouples([...couples, couple].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
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
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Couple name (e.g. The Smiths)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Add
        </button>
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
            <div className="flex items-center gap-2">
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

- [ ] **Step 3: Verify build**

Run: `cd ~/personal-projects/board-game-nights && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin page for managing couples and links"
```

---

### Task 11: Setup Supabase & End-to-End Verification

**Files:**
- Create: `.env.local`

- [ ] **Step 1: Create Supabase project**

1. Go to supabase.com, sign in or create account
2. Create a new project (free tier)
3. Note the project URL and anon key from Settings → API

- [ ] **Step 2: Run the schema migration**

In the Supabase SQL editor (Dashboard → SQL Editor), paste and run the contents of `supabase/schema.sql`.

- [ ] **Step 3: Create .env.local**

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
ADMIN_SECRET=pick-a-random-string-here
```

- [ ] **Step 4: Configure Supabase RLS (Row Level Security)**

In the Supabase SQL editor, run:
```sql
ALTER TABLE couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to couples" ON couples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to availability" ON availability FOR ALL USING (true) WITH CHECK (true);
```

Note: Since there's no auth and access is controlled by unguessable slugs, we use permissive policies. The anon key can read/write both tables.

- [ ] **Step 5: Start dev server and test**

Run: `cd ~/personal-projects/board-game-nights && npm run dev`

Test flow:
1. Go to `http://localhost:3000/admin/your-admin-secret` — add a couple
2. Copy their link, open it — toggle some days
3. Go to `http://localhost:3000/dashboard` — verify the heat map shows data

- [ ] **Step 6: Run all tests**

Run: `cd ~/personal-projects/board-game-nights && npm test`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example supabase/schema.sql
git commit -m "docs: add RLS policies to schema and finalize setup instructions"
```

---

### Task 12: Deploy to Vercel

- [ ] **Step 1: Create GitHub repo**

```bash
cd ~/personal-projects/board-game-nights
gh repo create board-game-nights --private --source=. --push
```

- [ ] **Step 2: Deploy via Vercel**

1. Go to vercel.com, sign in with GitHub
2. Import the `board-game-nights` repository
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ADMIN_SECRET`
4. Deploy

- [ ] **Step 3: Verify production**

1. Visit the deployed URL's `/admin/your-secret` — add a test couple
2. Open their link — toggle availability
3. Check `/dashboard` — confirm data shows

- [ ] **Step 4: Share links with friends**

Send each couple their unique `/c/slug` URL and share the `/dashboard` link in the group chat.
