import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { syncInstagramMedia } from "@/lib/instagramBackup";
import { hasActiveAccess } from "@/lib/billing";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: page } = await serviceClient()
    .from("pages").select("id, subscription_status, comped").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });
  if (!hasActiveAccess({ subscriptionStatus: page.subscription_status, comped: page.comped })) {
    return NextResponse.json({ ok: false, reason: "payment_required" }, { status: 402 });
  }

  const result = await syncInstagramMedia(page.id);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
