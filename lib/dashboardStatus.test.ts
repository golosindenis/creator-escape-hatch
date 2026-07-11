import { describe, it, expect } from "vitest";
import { protectionLabel, subscriberCountLabel, secondaryAlertsLabel } from "@/lib/dashboardStatus";

describe("protectionLabel", () => {
  it("shows protection active when break-glass is off", () => {
    expect(protectionLabel(false)).toBe("🟢 Protection active");
  });
  it("shows break-glass active when on", () => {
    expect(protectionLabel(true)).toBe("🔴 Break-glass active — subscribers alerted");
  });
});

describe("subscriberCountLabel", () => {
  it("pluralizes for zero", () => { expect(subscriberCountLabel(0)).toBe("0 subscribers"); });
  it("does not pluralize for one", () => { expect(subscriberCountLabel(1)).toBe("1 subscriber"); });
  it("pluralizes for many", () => { expect(subscriberCountLabel(142)).toBe("142 subscribers"); });
});

describe("secondaryAlertsLabel", () => {
  it("is on when an email is set", () => { expect(secondaryAlertsLabel("a@b.com")).toBe("Secondary alerts: on"); });
  it("is off when null", () => { expect(secondaryAlertsLabel(null)).toBe("Secondary alerts: off"); });
  it("is off when empty string", () => { expect(secondaryAlertsLabel("")).toBe("Secondary alerts: off"); });
});
