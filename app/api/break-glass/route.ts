import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { setBreakGlass } from "@/lib/data/pages";
import { listSubscriberEmails } from "@/lib/data/subscribers";
import { composeBroadcast } from "@/lib/breakGlass";
import { sendBroadcast } from "@/lib/email/resend";

const Body = z.object({ activate: z.boolean() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: page } = await serviceClient()
    .from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  let recipientCount = 0;

  if (parsed.data.activate) {
    // Only flip the page to active once the broadcast has actually gone out and
    // the event is recorded, so we never leave the page silently toggled with no
    // trace of a broadcast that never happened.
    try {
      const emails = await listSubscriberEmails(page.id);
      const msg = composeBroadcast({ creatorName: page.creator_name, realHandle: page.real_handle });
      const result = await sendBroadcast({ to: emails, subject: msg.subject, body: msg.body });
      recipientCount = result.sent;

      await serviceClient().from("break_glass_events")
        .insert({ page_id: page.id, activated: true, recipient_count: recipientCount });

      await setBreakGlass(page.id, true);
    } catch (err) {
      console.error("break-glass activation failed", err);
      return NextResponse.json({ ok: false, reason: "send_failed" }, { status: 500 });
    }
  } else {
    await setBreakGlass(page.id, false);
    await serviceClient().from("break_glass_events")
      .insert({ page_id: page.id, activated: false, recipient_count: 0 });
  }

  return NextResponse.json({ ok: true, recipientCount });
}
