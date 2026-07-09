import { describe, it, expect } from "vitest";
import { normalizeSlug, isValidSlug, generateSlugFromHandle } from "@/lib/slug";

describe("normalizeSlug", () => {
  it("lowercases and strips invalid chars", () => {
    expect(normalizeSlug("Iryna Fit!")).toBe("iryna-fit");
  });
  it("collapses repeats and trims hyphens", () => {
    expect(normalizeSlug("--a__b  c--")).toBe("a-b-c");
  });
});

describe("isValidSlug", () => {
  it("accepts a clean slug", () => { expect(isValidSlug("iryna-fit")).toBe(true); });
  it("rejects too short", () => { expect(isValidSlug("ab")).toBe(false); });
  it("rejects leading hyphen", () => { expect(isValidSlug("-abc")).toBe(false); });
  it("rejects uppercase", () => { expect(isValidSlug("Abc")).toBe(false); });
});

describe("generateSlugFromHandle", () => {
  it("strips a leading @", () => { expect(generateSlugFromHandle("@iryna.fit")).toBe("iryna-fit"); });
});
