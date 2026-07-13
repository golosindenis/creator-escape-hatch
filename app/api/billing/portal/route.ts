import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { getSubscriptionPortalUrl } from "@/lib/lemonSqueezy";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: page } = await serviceClient()
    .from("pages")
    .select("lemonsqueezy_subscription_id")
    .eq("owner", user.id)
    .maybeSingle();
  if (!page?.lemonsqueezy_subscription_id) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const portalUrl = await getSubscriptionPortalUrl(page.lemonsqueezy_subscription_id);
  return NextResponse.redirect(portalUrl);
}
