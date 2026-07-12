import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { verifyState } from "@/lib/instagramAuth";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramUsername,
} from "@/lib/instagramGraph";
import { upsertConnection } from "@/lib/data/instagram";
import { syncInstagramMedia } from "@/lib/instagramBackup";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorRedirect = NextResponse.redirect(`${origin}/dashboard?instagram_error=1`);

  if (!code || !state) return errorRedirect;

  const pageId = verifyState(state, process.env.INSTAGRAM_APP_SECRET!);
  if (!pageId) return errorRedirect;

  const user = await getSessionUser();
  if (!user) return errorRedirect;

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("id", pageId).eq("owner", user.id).maybeSingle();
  if (!page) return errorRedirect;

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`;
    const shortLived = await exchangeCodeForShortLivedToken({
      appId: process.env.INSTAGRAM_APP_ID!,
      appSecret: process.env.INSTAGRAM_APP_SECRET!,
      redirectUri,
      code,
    });
    const longLived = await exchangeForLongLivedToken({
      appSecret: process.env.INSTAGRAM_APP_SECRET!,
      accessToken: shortLived.accessToken,
    });
    const username = await fetchInstagramUsername({ accessToken: longLived.accessToken });
    const tokenExpiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString();

    await upsertConnection({
      pageId,
      igUserId: shortLived.userId,
      igUsername: username,
      accessToken: longLived.accessToken,
      tokenExpiresAt,
    });
  } catch {
    return errorRedirect;
  }

  // Best-effort first sync — a hiccup here shouldn't make a successful
  // connection look like a failed one; the dashboard's "Sync now" covers retry.
  try {
    await syncInstagramMedia(pageId);
  } catch {
    // swallow — the connection itself was saved successfully above
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
