import { describe, it, expect } from "vitest";
import { classifyAlert, composeAlertNotice } from "@/lib/breachAlert";

describe("classifyAlert", () => {
  it("detects a new-login email from Instagram", () => {
    const result = classifyAlert({
      from: "security@mail.instagram.com",
      subject: "New login to your Instagram account",
      body: "We noticed a new login to your account from a new device.",
    });
    expect(result).toEqual({ type: "new_login" });
  });

  it("detects a password-changed email from Facebookmail", () => {
    const result = classifyAlert({
      from: "notify@facebookmail.com",
      subject: "Your Instagram password was changed",
      body: "Your password was changed on July 9.",
    });
    expect(result).toEqual({ type: "password_changed" });
  });

  it("ignores mail from a non-Meta sender", () => {
    const result = classifyAlert({
      from: "someone@example.com",
      subject: "New login to your Instagram account",
      body: "We noticed a new login to your account.",
    });
    expect(result).toBeNull();
  });

  it("ignores Meta mail that isn't a security notice", () => {
    const result = classifyAlert({
      from: "security@mail.instagram.com",
      subject: "See what's new this week",
      body: "Check out these new features.",
    });
    expect(result).toBeNull();
  });
});

describe("composeAlertNotice", () => {
  const notice = composeAlertNotice({
    creatorName: "Iryna",
    alertType: "new_login",
    dashboardUrl: "https://example.com/dashboard",
  });

  it("names the creator", () => {
    expect(notice.subject).toContain("Iryna");
  });

  it("links to the dashboard", () => {
    expect(notice.body).toContain("https://example.com/dashboard");
  });

  it("never promises account recovery", () => {
    expect(notice.body.toLowerCase()).not.toMatch(/recover|get (it|the account) back|restore/);
  });

  it("contains no auth token query params", () => {
    expect(notice.body).not.toMatch(/[?&]token=/);
  });
});
