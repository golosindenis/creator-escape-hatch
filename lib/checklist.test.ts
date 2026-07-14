import { describe, it, expect } from "vitest";
import {
  CHECKLIST_ITEMS,
  isValidChecklistKey,
  isValidChecklistCompleted,
  isChecklistDirty,
} from "@/lib/checklist";

describe("CHECKLIST_ITEMS", () => {
  it("has 5 items with unique keys", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(5);
    const keys = CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isValidChecklistKey", () => {
  it("returns true for a real item key", () => {
    expect(isValidChecklistKey("secure_recovery_email")).toBe(true);
  });
  it("returns false for an unknown key", () => {
    expect(isValidChecklistKey("not_a_real_key")).toBe(false);
  });
});

describe("isValidChecklistCompleted", () => {
  it("returns true for an empty array", () => {
    expect(isValidChecklistCompleted([])).toBe(true);
  });
  it("returns true when every key is valid", () => {
    expect(isValidChecklistCompleted(["secure_recovery_email", "authenticator_app_2fa"])).toBe(true);
  });
  it("returns false when any key is invalid", () => {
    expect(isValidChecklistCompleted(["secure_recovery_email", "bogus"])).toBe(false);
  });
});

describe("isChecklistDirty", () => {
  it("returns false when arrays contain the same keys", () => {
    expect(isChecklistDirty(["a", "b"], ["a", "b"])).toBe(false);
  });
  it("returns false when arrays contain the same keys in a different order", () => {
    expect(isChecklistDirty(["b", "a"], ["a", "b"])).toBe(false);
  });
  it("returns true when current has an extra key", () => {
    expect(isChecklistDirty(["a", "b"], ["a"])).toBe(true);
  });
  it("returns true when current is missing a key", () => {
    expect(isChecklistDirty(["a"], ["a", "b"])).toBe(true);
  });
  it("returns false for two empty arrays", () => {
    expect(isChecklistDirty([], [])).toBe(false);
  });
});
