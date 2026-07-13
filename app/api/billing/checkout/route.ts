import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { createCheckout } from "@/lib/lemonSqueezy";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: page } = await serviceClient()
    .from("pages")
    .select("id")
    .eq("owner", user.id)
    .maybeSingle();
  if (!page) return NextResponse.redirect(new URL("/dashboard", req.url));

  const checkoutUrl = await createCheckout({ pageId: page.id });
  return NextResponse.redirect(checkoutUrl);
}
