import { serviceClient } from "@/lib/supabase/server";
import { needsTokenRefresh } from "@/lib/instagramAuth";
import { needsChildBackfill, buildChildInsertPlan } from "@/lib/instagramCarousel";
import {
  getConnectionByPageId,
  updateConnectionToken,
  updateLastSyncedAt,
  getBackedUpMediaIds,
  insertBackedUpMedia,
  countMediaChildren,
} from "@/lib/data/instagram";
import { refreshLongLivedToken, fetchMediaPage, fetchCarouselChildren } from "@/lib/instagramGraph";

type SyncResult =
  | { ok: true; synced: number; total: number }
  | { ok: false; reason: "not_connected" | "token_expired" | "sync_failed" };

async function backUpCarouselChildren(input: {
  pageId: string; parentMediaId: string; igMediaId: string; accessToken: string;
}): Promise<void> {
  let children;
  try {
    children = await fetchCarouselChildren({ mediaId: input.igMediaId, accessToken: input.accessToken });
  } catch {
    return;
  }

  for (const planned of buildChildInsertPlan(children)) {
    if (!planned.sourceUrl) continue;

    try {
      const mediaRes = await fetch(planned.sourceUrl);
      if (!mediaRes.ok) continue;
      const bytes = new Uint8Array(await mediaRes.arrayBuffer());
      const storagePath = `${input.pageId}/${input.igMediaId}/${planned.igMediaId}`;
      const contentType = mediaRes.headers.get("content-type") ?? undefined;

      const { error: uploadError } = await serviceClient()
        .storage.from("instagram-backups")
        .upload(storagePath, bytes, { upsert: true, contentType });
      if (uploadError) continue;

      await insertBackedUpMedia(input.pageId, {
        igMediaId: planned.igMediaId,
        mediaType: planned.mediaType,
        caption: null,
        likeCount: null,
        commentsCount: null,
        permalink: null,
        storagePath,
        postedAt: null,
        parentMediaId: input.parentMediaId,
        position: planned.position,
      });
    } catch {
      continue;
    }
  }
}

export async function syncInstagramMedia(pageId: string): Promise<SyncResult> {
  const connection = await getConnectionByPageId(pageId);
  if (!connection) return { ok: false, reason: "not_connected" };

  let accessToken = connection.accessToken;
  if (needsTokenRefresh(new Date(connection.tokenExpiresAt), new Date())) {
    try {
      const refreshed = await refreshLongLivedToken({ accessToken });
      accessToken = refreshed.accessToken;
      const expiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();
      await updateConnectionToken(pageId, accessToken, expiresAt);
    } catch {
      return { ok: false, reason: "token_expired" };
    }
  }

  const existingIds = await getBackedUpMediaIds(pageId);
  let synced = 0;
  let total = 0;
  let pagesFetched = 0;

  let after: string | undefined;
  do {
    let page;
    try {
      page = await fetchMediaPage({ accessToken, after });
    } catch {
      // A later page failing (rate limit, transient error) shouldn't discard
      // progress already made on earlier pages — stop here and keep it.
      if (pagesFetched === 0) return { ok: false, reason: "sync_failed" };
      break;
    }
    pagesFetched += 1;

    for (const item of page.items) {
      total += 1;
      const existingRowId = existingIds.get(item.id);

      if (existingRowId) {
        // Already backed up. A carousel whose cover was stored before this
        // slice shipped has no children yet — backfill them now. Only
        // carousels ever need this check, so non-carousel items (the
        // overwhelming majority on a repeat sync) skip straight past
        // without an extra DB round trip.
        if (item.media_type === "CAROUSEL_ALBUM") {
          try {
            const childCount = await countMediaChildren(existingRowId);
            if (needsChildBackfill(item.media_type, childCount)) {
              await backUpCarouselChildren({ pageId, parentMediaId: existingRowId, igMediaId: item.id, accessToken });
            }
          } catch {
            // Leave this carousel as a backfill candidate for the next sync.
          }
        }
        continue;
      }

      const sourceUrl = item.media_url ?? item.thumbnail_url;
      if (!sourceUrl) continue;

      try {
        const mediaRes = await fetch(sourceUrl);
        if (!mediaRes.ok) continue;
        const bytes = new Uint8Array(await mediaRes.arrayBuffer());
        const storagePath = `${pageId}/${item.id}`;
        const contentType = mediaRes.headers.get("content-type") ?? undefined;

        const { error: uploadError } = await serviceClient()
          .storage.from("instagram-backups")
          .upload(storagePath, bytes, { upsert: true, contentType });
        if (uploadError) continue;

        const insertedId = await insertBackedUpMedia(pageId, {
          igMediaId: item.id,
          mediaType: item.media_type,
          caption: item.caption ?? null,
          likeCount: item.like_count ?? null,
          commentsCount: item.comments_count ?? null,
          permalink: item.permalink ?? null,
          storagePath,
          postedAt: item.timestamp ?? null,
        });
        synced += 1;

        if (item.media_type === "CAROUSEL_ALBUM") {
          await backUpCarouselChildren({ pageId, parentMediaId: insertedId, igMediaId: item.id, accessToken });
        }
      } catch {
        continue;
      }
    }
    after = page.nextAfter ?? undefined;
  } while (after);

  await updateLastSyncedAt(pageId);
  return { ok: true, synced, total };
}
