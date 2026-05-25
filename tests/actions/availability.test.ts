import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}));

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
