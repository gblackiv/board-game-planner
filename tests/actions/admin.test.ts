import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}));

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
