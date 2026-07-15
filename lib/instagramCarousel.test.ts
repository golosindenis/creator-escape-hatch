import { describe, it, expect } from "vitest";
import { buildChildInsertPlan } from "@/lib/instagramCarousel";
import type { GraphMediaItem } from "@/lib/instagramGraph";

describe("buildChildInsertPlan", () => {
  const child = (overrides: Partial<GraphMediaItem>): GraphMediaItem => ({
    id: "child-1",
    media_type: "IMAGE",
    media_url: "https://example.com/1.jpg",
    ...overrides,
  });

  it("assigns position by array order", () => {
    const plan = buildChildInsertPlan([child({ id: "a" }), child({ id: "b" }), child({ id: "c" })], new Set());
    expect(plan.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(plan.map((p) => p.igMediaId)).toEqual(["a", "b", "c"]);
  });

  it("falls back to thumbnail_url when media_url is missing (video children)", () => {
    const plan = buildChildInsertPlan(
      [child({ id: "v1", media_type: "VIDEO", media_url: undefined, thumbnail_url: "https://example.com/thumb.jpg" })],
      new Set(),
    );
    expect(plan[0].sourceUrl).toBe("https://example.com/thumb.jpg");
  });

  it("prefers media_url over thumbnail_url when both are present", () => {
    const plan = buildChildInsertPlan(
      [child({ media_url: "https://example.com/full.jpg", thumbnail_url: "https://example.com/thumb.jpg" })],
      new Set(),
    );
    expect(plan[0].sourceUrl).toBe("https://example.com/full.jpg");
  });

  it("carries mediaType through unchanged", () => {
    const plan = buildChildInsertPlan([child({ media_type: "VIDEO", media_url: "https://example.com/v.mp4" })], new Set());
    expect(plan[0].mediaType).toBe("VIDEO");
  });

  it("filters out children whose id is already in existingChildIds, keeping position from the original array", () => {
    const plan = buildChildInsertPlan(
      [child({ id: "a" }), child({ id: "b" }), child({ id: "c" })],
      new Set(["b"]),
    );
    expect(plan.map((p) => p.igMediaId)).toEqual(["a", "c"]);
    expect(plan.map((p) => p.position)).toEqual([0, 2]);
  });
});
