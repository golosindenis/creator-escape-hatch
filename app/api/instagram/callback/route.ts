import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/instagramAuth";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramUsername,
} from "@/lib/instagramGraph";
import { upsertConnection } from "@/lib/data/instagram";
import { syncInstagramMedia } from "@/lib/instagramBackup";

const NONCE_COOKIE = "ig_oauth_nonce";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorRedirect = NextResponse.redirect(`${origin}/dashboard?instagram_error=1`);

  if (!code || !state) return errorRedirect;

  const combined = verifyState(state, process.env.INSTAGRAM_APP_SECRET!);
  if (!combined) return errorRedirect;

  const sepIdx = combined.lastIndexOf(":");
  if (sepIdx === -1) return errorRedirect;
  const pageId = combined.slice(0, sepIdx);
  const nonce = combined.slice(sepIdx + 1);

  const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
  if (!cookieNonce || cookieNonce !== nonce) return errorRedirect;

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
