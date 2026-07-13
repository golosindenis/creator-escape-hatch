import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature, parseSubscriptionEvent } from "@/lib/lemonSqueezy";

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ hello: "world" });

  it("accepts a correctly signed body", () => {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body + "x", signature, secret)).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const signature = createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });
});

describe("parseSubscriptionEvent", () => {
  function payload(overrides: { status?: string; customData?: Record<string, unknown> } = {}) {
    return {
      meta: {
        event_name: "subscription_updated",
        custom_data: overrides.customData ?? { page_id: "page-1" },
      },
      data: {
        id: "sub-1",
        attributes: {
          status: overrides.status ?? "active",
          customer_id: 42,
          renews_at: "2027-07-13T00:00:00Z",
        },
      },
    };
  }

  it("parses an active subscription event", () => {
    expect(parseSubscriptionEvent(payload())).toEqual({
      pageId: "page-1",
      status: "active",
      customerId: "42",
      subscriptionId: "sub-1",
      renewsAt: "2027-07-13T00:00:00Z",
    });
  });

  it("maps a cancelled status to expired", () => {
    expect(parseSubscriptionEvent(payload({ status: "cancelled" }))?.status).toBe("expired");
  });

  it("maps an on_trial status to active", () => {
    expect(parseSubscriptionEvent(payload({ status: "on_trial" }))?.status).toBe("active");
  });

  it("returns null when custom_data has no page_id", () => {
    expect(parseSubscriptionEvent(payload({ customData: {} }))).toBeNull();
  });

  it("returns null for a malformed payload", () => {
    expect(parseSubscriptionEvent({ not: "a valid payload" })).toBeNull();
  });
});
