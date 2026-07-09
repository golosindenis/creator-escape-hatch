import { describe, it, expect } from "vitest";
import { pageState, composeBroadcast } from "@/lib/breakGlass";

describe("pageState", () => {
  it("is normal when inactive", () => {
    expect(pageState({ breakGlassActive: false })).toBe("normal");
  });
  it("is break_glass when active", () => {
    expect(pageState({ breakGlassActive: true })).toBe("break_glass");
  });
});

describe("composeBroadcast", () => {
  const msg = composeBroadcast({ creatorName: "Iryna", realHandle: "@iryna.real" });
  it("names the creator in the subject", () => {
    expect(msg.subject).toContain("Iryna");
  });
  it("points to the real handle", () => {
    expect(msg.body).toContain("@iryna.real");
  });
  it("warns about imposters", () => {
    expect(msg.body.toLowerCase()).toContain("imposter");
  });
  it("never promises account recovery", () => {
    expect(msg.body.toLowerCase()).not.toMatch(/recover|get (it|the account) back|restore/);
  });
});
