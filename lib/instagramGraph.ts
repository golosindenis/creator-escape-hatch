const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE = "https://graph.instagram.com";

export function buildAuthorizeUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "instagram_business_basic");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeCodeForShortLivedToken(input: {
  appId: string; appSecret: string; redirectUri: string; code: string;
}): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`Instagram token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; user_id: number };
  return { accessToken: json.access_token, userId: String(json.user_id) };
}

export async function exchangeForLongLivedToken(input: {
  appSecret: string; accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("access_token", input.accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram long-lived token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export async function refreshLongLivedToken(input: {
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", input.accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export async function fetchInstagramUsername(input: { accessToken: string }): Promise<string> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set("fields", "username");
  url.searchParams.set("access_token", input.accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram user fetch failed: ${res.status}`);
  const json = (await res.json()) as { username: string };
  return json.username;
}

export type GraphMediaItem = {
  id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string;
  permalink: string; like_count?: number; comments_count?: number; timestamp: string;
};

export async function fetchMediaPage(input: {
  accessToken: string; after?: string;
}): Promise<{ items: GraphMediaItem[]; nextAfter: string | null }> {
  const url = new URL(`${GRAPH_BASE}/me/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp");
  url.searchParams.set("access_token", input.accessToken);
  if (input.after) url.searchParams.set("after", input.after);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram media fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    data: GraphMediaItem[];
    paging?: { cursors?: { after?: string }; next?: string };
  };
  return { items: json.data, nextAfter: json.paging?.next ? (json.paging.cursors?.after ?? null) : null };
}
