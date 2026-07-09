import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Fan@Example.COM ")).toBe("fan@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a normal address", () => { expect(isValidEmail("fan@example.com")).toBe(true); });
  it("rejects missing @", () => { expect(isValidEmail("fan.example.com")).toBe(false); });
  it("rejects empty", () => { expect(isValidEmail("")).toBe(false); });
});
