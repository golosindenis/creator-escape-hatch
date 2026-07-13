import { describe, it, expect } from "vitest";
import { hasActiveAccess, billingStatusLabel } from "@/lib/billing";

describe("hasActiveAccess", () => {
  it("returns true when subscriptionStatus is active", () => {
    expect(hasActiveAccess({ subscriptionStatus: "active", comped: false })).toBe(true);
  });

  it("returns true when comped, regardless of subscriptionStatus", () => {
    expect(hasActiveAccess({ subscriptionStatus: "none", comped: true })).toBe(true);
  });

  it("returns false when subscriptionStatus is none and not comped", () => {
    expect(hasActiveAccess({ subscriptionStatus: "none", comped: false })).toBe(false);
  });

  it("returns false when subscriptionStatus is expired and not comped", () => {
    expect(hasActiveAccess({ subscriptionStatus: "expired", comped: false })).toBe(false);
  });
});

describe("billingStatusLabel", () => {
  it("returns Comped when comped is true", () => {
    expect(billingStatusLabel({ subscriptionStatus: "none", comped: true })).toBe("Comped");
  });

  it("returns Active when subscriptionStatus is active and not comped", () => {
    expect(billingStatusLabel({ subscriptionStatus: "active", comped: false })).toBe("Active");
  });

  it("returns Not subscribed otherwise", () => {
    expect(billingStatusLabel({ subscriptionStatus: "expired", comped: false })).toBe("Not subscribed");
  });
});
