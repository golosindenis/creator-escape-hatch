import { describe, it, expect } from "vitest";
import { needsChildBackfill, buildChildInsertPlan } from "@/lib/instagramCarousel";
import type { GraphMediaItem } from "@/lib/instagramGraph";

describe("needsChildBackfill", () => {
  it("returns true for a carousel with no children yet", () => {
    expect(needsChildBackfill("CAROUSEL_ALBUM", 0)).toBe(true);
  });

  it("returns false for a carousel that already has children", () => {
    expect(needsChildBackfill("CAROUSEL_ALBUM", 3)).toBe(false);
  });

  it("returns false for a non-carousel item, regardless of child count", () => {
    expect(needsChildBackfill("IMAGE", 0)).toBe(false);
  });
});

describe("buildChildInsertPlan", () => {
  const child = (overrides: Partial<GraphMediaItem>): GraphMediaItem => ({
    id: "child-1",
    media_type: "IMAGE",
    media_url: "https://example.com/1.jpg",
    ...overrides,
  });

  it("assigns position by array order", () => {
    const plan = buildChildInsertPlan([child({ id: "a" }), child({ id: "b" }), child({ id: "c" })]);
    expect(plan.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(plan.map((p) => p.igMediaId)).toEqual(["a", "b", "c"]);
  });

  it("falls back to thumbnail_url when media_url is missing (video children)", () => {
    const plan = buildChildInsertPlan([
      child({ id: "v1", media_type: "VIDEO", media_url: undefined, thumbnail_url: "https://example.com/thumb.jpg" }),
    ]);
    expect(plan[0].sourceUrl).toBe("https://example.com/thumb.jpg");
  });

  it("prefers media_url over thumbnail_url when both are present", () => {
    const plan = buildChildInsertPlan([
      child({ media_url: "https://example.com/full.jpg", thumbnail_url: "https://example.com/thumb.jpg" }),
    ]);
    expect(plan[0].sourceUrl).toBe("https://example.com/full.jpg");
  });

  it("carries mediaType through unchanged", () => {
    const plan = buildChildInsertPlan([child({ media_type: "VIDEO", media_url: "https://example.com/v.mp4" })]);
    expect(plan[0].mediaType).toBe("VIDEO");
  });
});
