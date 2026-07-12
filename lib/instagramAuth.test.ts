import { describe, it, expect } from "vitest";
import { signState, verifyState, needsTokenRefresh } from "@/lib/instagramAuth";

describe("signState / verifyState", () => {
  const secret = "test-secret";
  const pageId = "11111111-1111-1111-1111-111111111111";

  it("round-trips a page id", () => {
    const state = signState(pageId, secret);
    expect(verifyState(state, secret)).toBe(pageId);
  });

  it("rejects a tampered page id", () => {
    const state = signState(pageId, secret);
    const tampered = state.replace("1111", "2222");
    expect(verifyState(tampered, secret)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const state = signState(pageId, secret);
    expect(verifyState(state, "wrong-secret")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyState("not-a-valid-state", secret)).toBeNull();
  });
});

describe("needsTokenRefresh", () => {
  const now = new Date("2026-07-12T00:00:00Z");

  it("returns false when expiry is far away", () => {
    expect(needsTokenRefresh(new Date("2026-08-01T00:00:00Z"), now)).toBe(false);
  });

  it("returns true when within 7 days of expiry", () => {
    expect(needsTokenRefresh(new Date("2026-07-15T00:00:00Z"), now)).toBe(true);
  });

  it("returns true when already expired", () => {
    expect(needsTokenRefresh(new Date("2026-07-01T00:00:00Z"), now)).toBe(true);
  });
});
