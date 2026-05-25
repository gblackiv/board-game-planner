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
