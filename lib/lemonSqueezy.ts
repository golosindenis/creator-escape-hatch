import { createHmac, timingSafeEqual } from "crypto";

const LEMONSQUEEZY_API = "https://api.lemonsqueezy.com/v1";

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type SubscriptionEvent = {
  pageId: string;
  status: "active" | "expired";
  customerId: string;
  subscriptionId: string;
  renewsAt: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "on_trial"]);

export function parseSubscriptionEvent(payload: unknown): SubscriptionEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const meta = p.meta as Record<string, unknown> | undefined;
  const data = p.data as Record<string, unknown> | undefined;
  const attributes = data?.attributes as Record<string, unknown> | undefined;
  const customData = meta?.custom_data as Record<string, unknown> | undefined;

  const pageId = typeof customData?.page_id === "string" ? customData.page_id : null;
  if (!pageId || !attributes) return null;

  const lsStatus = typeof attributes.status === "string" ? attributes.status : null;
  if (!lsStatus) return null;

  const customerId =
    typeof attributes.customer_id === "number" || typeof attributes.customer_id === "string"
      ? String(attributes.customer_id)
      : null;
  const subscriptionId = typeof data?.id === "string" ? data.id : null;
  if (!customerId || !subscriptionId) return null;

  const renewsAt = typeof attributes.renews_at === "string" ? attributes.renews_at : null;

  return {
    pageId,
    status: ACTIVE_STATUSES.has(lsStatus) ? "active" : "expired",
    customerId,
    subscriptionId,
    renewsAt,
  };
}

export async function createCheckout(input: { pageId: string }): Promise<string> {
  const res = await fetch(`${LEMONSQUEEZY_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY!}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: { checkout_data: { custom: { page_id: input.pageId } } },
        relationships: {
          store: { data: { type: "stores", id: process.env.LEMONSQUEEZY_STORE_ID! } },
          variant: { data: { type: "variants", id: process.env.LEMONSQUEEZY_VARIANT_ID! } },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`LemonSqueezy checkout creation failed: ${res.status}`);
  const json = await res.json();
  return json.data.attributes.url as string;
}

export async function getSubscriptionPortalUrl(subscriptionId: string): Promise<string> {
  const res = await fetch(`${LEMONSQUEEZY_API}/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY!}`,
      Accept: "application/vnd.api+json",
    },
  });
  if (!res.ok) throw new Error(`LemonSqueezy subscription fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data.attributes.urls.customer_portal as string;
}
