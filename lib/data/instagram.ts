import { serviceClient } from "@/lib/supabase/server";

export type InstagramConnection = {
  pageId: string;
  igUserId: string;
  igUsername: string;
  accessToken: string;
  tokenExpiresAt: string;
  lastSyncedAt: string | null;
};

type ConnectionRow = {
  page_id: string; ig_user_id: string; ig_username: string;
  access_token: string; token_expires_at: string; last_synced_at: string | null;
};

const toConnection = (r: ConnectionRow): InstagramConnection => ({
  pageId: r.page_id, igUserId: r.ig_user_id, igUsername: r.ig_username,
  accessToken: r.access_token, tokenExpiresAt: r.token_expires_at, lastSyncedAt: r.last_synced_at,
});

export async function getConnectionByPageId(pageId: string): Promise<InstagramConnection | null> {
  const { data, error } = await serviceClient()
    .from("instagram_connections").select("*").eq("page_id", pageId).maybeSingle();
  if (error) throw error;
  return data ? toConnection(data as ConnectionRow) : null;
}

export async function upsertConnection(input: {
  pageId: string; igUserId: string; igUsername: string;
  accessToken: string; tokenExpiresAt: string;
}): Promise<void> {
  const { error } = await serviceClient().from("instagram_connections").upsert(
    {
      page_id: input.pageId, ig_user_id: input.igUserId, ig_username: input.igUsername,
      access_token: input.accessToken, token_expires_at: input.tokenExpiresAt,
    },
    { onConflict: "page_id" },
  );
  if (error) throw error;
}

export async function updateConnectionToken(
  pageId: string, accessToken: string, tokenExpiresAt: string,
): Promise<void> {
  const { error } = await serviceClient()
    .from("instagram_connections")
    .update({ access_token: accessToken, token_expires_at: tokenExpiresAt })
    .eq("page_id", pageId);
  if (error) throw error;
}

export async function updateLastSyncedAt(pageId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("instagram_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("page_id", pageId);
  if (error) throw error;
}

export async function deleteConnection(pageId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("instagram_connections").delete().eq("page_id", pageId);
  if (error) throw error;
}

export type BackedUpMedia = {
  id: string; igMediaId: string; mediaType: string; caption: string | null;
  likeCount: number | null; commentsCount: number | null; permalink: string | null;
  storagePath: string; postedAt: string | null;
};

type MediaRow = {
  id: string; ig_media_id: string; media_type: string; caption: string | null;
  like_count: number | null; comments_count: number | null; permalink: string | null;
  storage_path: string; posted_at: string | null;
};

const toMedia = (r: MediaRow): BackedUpMedia => ({
  id: r.id, igMediaId: r.ig_media_id, mediaType: r.media_type, caption: r.caption,
  likeCount: r.like_count, commentsCount: r.comments_count, permalink: r.permalink,
  storagePath: r.storage_path, postedAt: r.posted_at,
});

export async function listBackedUpMedia(pageId: string, limit = 24): Promise<BackedUpMedia[]> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("*").eq("page_id", pageId).is("parent_media_id", null)
    .order("posted_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toMedia(r as MediaRow));
}

export async function countBackedUpMedia(pageId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("backed_up_media").select("*", { count: "exact", head: true }).eq("page_id", pageId).is("parent_media_id", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getBackedUpMediaIds(pageId: string): Promise<Map<string, string>> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("id, ig_media_id").eq("page_id", pageId);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => {
      const row = r as { id: string; ig_media_id: string };
      return [row.ig_media_id, row.id] as const;
    }),
  );
}

export async function insertBackedUpMedia(pageId: string, input: {
  igMediaId: string; mediaType: string; caption: string | null;
  likeCount: number | null; commentsCount: number | null; permalink: string | null;
  storagePath: string; postedAt: string | null;
  parentMediaId?: string; position?: number;
}): Promise<string> {
  const { data, error } = await serviceClient().from("backed_up_media").insert({
    page_id: pageId, ig_media_id: input.igMediaId, media_type: input.mediaType,
    caption: input.caption, like_count: input.likeCount, comments_count: input.commentsCount,
    permalink: input.permalink, storage_path: input.storagePath, posted_at: input.postedAt,
    parent_media_id: input.parentMediaId ?? null, position: input.position ?? null,
  }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getMediaChildIds(parentMediaId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("ig_media_id").eq("parent_media_id", parentMediaId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { ig_media_id: string }).ig_media_id));
}

export async function getSignedMediaUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await serviceClient()
    .storage.from("instagram-backups").createSignedUrls(paths, 3600);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}
