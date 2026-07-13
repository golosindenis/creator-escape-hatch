import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, parseSubscriptionEvent } from "@/lib/lemonSqueezy";
import { getPageById, setBillingStatus } from "@/lib/data/pages";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  if (!verifyWebhookSignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET!)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("billing webhook: request body was not valid JSON");
    return NextResponse.json({ ok: true });
  }

  const event = parseSubscriptionEvent(payload);
  if (!event) {
    console.warn("billing webhook: could not parse subscription event");
    return NextResponse.json({ ok: true });
  }

  const page = await getPageById(event.pageId);
  if (!page) {
    console.warn("billing webhook: no page found for id", { pageId: event.pageId });
    return NextResponse.json({ ok: true });
  }

  await setBillingStatus(event.pageId, {
    subscriptionStatus: event.status,
    lemonsqueezyCustomerId: event.customerId,
    lemonsqueezySubscriptionId: event.subscriptionId,
    lemonsqueezyRenewsAt: event.renewsAt,
  });

  return NextResponse.json({ ok: true });
}
