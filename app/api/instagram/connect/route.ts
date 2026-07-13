import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { signState } from "@/lib/instagramAuth";
import { buildAuthorizeUrl } from "@/lib/instagramGraph";
import { hasActiveAccess } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: page } = await serviceClient()
    .from("pages").select("id, subscription_status, comped").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.redirect(new URL("/dashboard", req.url));
  if (!hasActiveAccess({ subscriptionStatus: page.subscription_status, comped: page.comped })) {
    return NextResponse.redirect(new URL("/pricing", req.url));
  }

  const state = signState(page.id, process.env.INSTAGRAM_APP_SECRET!);
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`;
  const authorizeUrl = buildAuthorizeUrl({
    appId: process.env.INSTAGRAM_APP_ID!,
    redirectUri,
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}
