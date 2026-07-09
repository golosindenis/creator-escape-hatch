import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getPageById } from "@/lib/data/pages";
import { recordBreachAlert } from "@/lib/data/breachAlerts";
import { classifyAlert, composeAlertNotice } from "@/lib/breachAlert";
import { sendBroadcast } from "@/lib/email/resend";

function extractPageId(to: string[]): string | null {
  for (const addr of to) {
    const match = addr.match(/alerts\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: { data?: Record<string, unknown> };
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    event = wh.verify(payload, headers) as { data?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const data = event.data ?? {};
  const toRaw = data.to;
  const to: string[] = Array.isArray(toRaw) ? (toRaw as string[]) : typeof toRaw === "string" ? [toRaw] : [];
  const from = typeof data.from === "string" ? data.from : "";
  const subject = typeof data.subject === "string" ? data.subject : "";
  const body = typeof data.text === "string" ? data.text : typeof data.html === "string" ? data.html : "";

  const pageId = extractPageId(to);
  if (!pageId) {
    console.warn("inbound-email: no page id found in recipients", { to });
    return NextResponse.json({ ok: true });
  }

  const page = await getPageById(pageId);
  if (!page) {
    console.warn("inbound-email: no page found for id", { pageId });
    return NextResponse.json({ ok: true });
  }

  const classification = classifyAlert({ from, subject, body });
  if (!classification) {
    console.warn("inbound-email: could not classify message", { pageId, from, subject });
    return NextResponse.json({ ok: true });
  }

  await recordBreachAlert(page.id, classification.type);

  if (page.secondaryEmail) {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
    const notice = composeAlertNotice({
      creatorName: page.creatorName,
      alertType: classification.type,
      dashboardUrl,
    });
    const result = await sendBroadcast({ to: [page.secondaryEmail], subject: notice.subject, body: notice.body });
    if (result.sent === 0) {
      // Resend resolves per-email rather than rejecting, so a failed send never
      // throws. We don't retry here (retrying would re-run recordBreachAlert
      // above and duplicate the row) — just make the failure visible.
      console.error("inbound-email: breach alert notification failed to send", { pageId: page.id });
    }
  }

  return NextResponse.json({ ok: true });
}
