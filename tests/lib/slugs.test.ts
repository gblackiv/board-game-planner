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
