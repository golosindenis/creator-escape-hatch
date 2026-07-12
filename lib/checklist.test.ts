import { describe, it, expect } from "vitest";
import { CHECKLIST_ITEMS, isValidChecklistKey, isValidChecklistCompleted } from "@/lib/checklist";

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
