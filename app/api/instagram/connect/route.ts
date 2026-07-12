import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { signState } from "@/lib/instagramAuth";
import { buildAuthorizeUrl } from "@/lib/instagramGraph";

const NONCE_COOKIE = "ig_oauth_nonce";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.redirect(new URL("/dashboard", req.url));

  const signedState = signState(page.id, process.env.INSTAGRAM_APP_SECRET!);
  const nonce = randomBytes(16).toString("hex");
  const state = `${signedState}.${nonce}`;

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`;
  const authorizeUrl = buildAuthorizeUrl({
    appId: process.env.INSTAGRAM_APP_ID!,
    redirectUri,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/instagram",
  });
  return response;
}
