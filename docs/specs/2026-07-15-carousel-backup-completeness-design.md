# Carousel Backup Completeness — Design Spec

**Date:** 2026-07-15
**Status:** Approved

## 1. Problem

Instagram backup (`docs/specs/2026-07-12-instagram-backup-design.md`) deliberately deferred carousel child media: `syncInstagramMedia` only stores a carousel post's cover image, never its other slides. This is fine as a standalone backup — but it blocks the upcoming "restore to new account" feature (next spec) from ever reconstructing a true multi-image carousel post, since the source data for slides 2+ was never captured.

This slice is foundational, backend-only work: make carousel backups complete before building anything that publishes from them.

## 2. Goals

- When a carousel post is backed up, store every child image/video, not just the cover.
- Backfill children for carousels already backed up in production (Denis's account currently has 949 synced posts, some of which are carousels with cover-only backups today).
- Keep the dashboard gallery and "N posts backed up" count exactly as they render today — this is purely additive to what's stored, not a UI change.

## 3. Out of scope (this slice)

- **Restoring/publishing content.** Covered by the next spec, "Restore to new account."
- **Dashboard UI changes.** The gallery keeps showing one tile per top-level post (the cover), same as today.
- **Backfilling pages with an expired/disconnected token.** Those pages simply won't backfill until the creator reconnects — same as normal sync behavior today; not a new limitation introduced here.

## 4. Design

### 4.1 Data model

New migration, additive to the existing `backed_up_media` table (`supabase/migrations/0004_instagram_backup.sql`):

```sql
alter table backed_up_media
  add column parent_media_id uuid references backed_up_media(id) on delete cascade,
  add column position int;

create index backed_up_media_parent_idx on backed_up_media (parent_media_id);
```

Both columns are nullable. Top-level posts (images, videos, and carousel covers) keep them null, exactly as every row does today. A carousel child gets its own row: its real Instagram `ig_media_id` (children have distinct ids from the Graph API), `parent_media_id` pointing at the carousel's cover row, and `position` (0-indexed, in the order Instagram returns them).

No RLS changes needed — child rows carry the same `page_id` as every other row, so the existing `backed_up_media_owner_read` policy already covers them via the same `pages` ownership join.

### 4.2 Graph API layer (`lib/instagramGraph.ts`)

New function:

```ts
export async function fetchCarouselChildren(input: {
  mediaId: string; accessToken: string;
}): Promise<GraphMediaItem[]>
```

Calls `GET /{media-id}/children?fields=id,media_type,media_url,thumbnail_url,access_token`. Returns the existing `GraphMediaItem` shape — no new type needed, since the existing download/upload code in `syncInstagramMedia` already knows how to turn a `GraphMediaItem` into a stored file.

### 4.3 Data layer (`lib/data/instagram.ts`)

- `insertBackedUpMedia` changes to return the inserted row's `id` (currently returns `void`). Needed so the sync flow can attach freshly-created children to a freshly-created parent in the same pass.
- `getBackedUpMediaIds` changes from returning `Set<string>` to `Map<string, string>` (`ig_media_id` → row `id`) — the sync loop already needs this map to check `existingIds.has(item.id)`; returning the row id alongside costs nothing extra (same query, same columns already close to what's selected) and is exactly what the backfill path needs to look up an existing carousel's row id.
- New `countMediaChildren(parentMediaId: string): Promise<number>` — used by the backfill check (§4.4) to decide whether a carousel's children still need fetching.
- `listBackedUpMedia` and `countBackedUpMedia` both add `.is("parent_media_id", null)` — children never appear as their own gallery tile or inflate the "N posts backed up" count.

### 4.4 Sync flow (`lib/instagramBackup.ts`)

`syncInstagramMedia` currently does, per item from `/me/media`: skip if `existingIds.has(item.id)`, otherwise download and insert. That becomes:

1. **Item already backed up** (`existingIds.has(item.id)`):
   - If `item.media_type !== "CAROUSEL_ALBUM"`: skip, unchanged.
   - If it **is** a carousel: look up the existing row's id via `existingIds.get(item.id)`, call `countMediaChildren`. If zero, this is a pre-existing cover-only carousel — fetch and store its children now (the backfill path). If non-zero, it was already fully backed up in a previous run; skip.
2. **New item**: download and insert the cover exactly as today. If `media_type === "CAROUSEL_ALBUM"`, additionally call `fetchCarouselChildren`, and for each child: download its `media_url` (falling back to `thumbnail_url` for video children, same fallback already used for top-level items), upload to `{page_id}/{parent_ig_media_id}/{child_ig_media_id}`, insert with `parent_media_id` set to the cover row's id and `position` set to its index in the response array.

A child download/upload failure is caught and skipped individually (same per-item `try { } catch { continue }` pattern already used for top-level items) — one bad child doesn't fail the carousel's other children or the rest of the sync run. A `fetchCarouselChildren` call failing entirely (e.g. transient Graph API error) is likewise caught and skipped — that carousel just stays cover-only for this run and gets retried as a backfill candidate on the next sync.

### 4.5 Storage layout

Top-level files keep their existing path, `{page_id}/{ig_media_id}`. Children are namespaced under their parent: `{page_id}/{parent_ig_media_id}/{child_ig_media_id}` — keeps a carousel's slides grouped together in the bucket and avoids any path collision with top-level items.

## 5. Testing

- Pure-logic unit tests: the "does this carousel need backfilling" check (existing item + zero children → needs backfill; existing item + children present → skip), and child position assignment from the Graph API response order.
- `lib/instagramGraph.ts`: `fetchCarouselChildren` tested the same way existing Graph API functions are (mocked `fetch`, asserts on request shape and response mapping).
- Full sync flow verified live against Denis's real connected Instagram account, the same way the original backup slice was verified: trigger a re-sync, confirm via direct DB query that (a) previously cover-only carousels gain child rows with correct `position` ordering, (b) newly-synced carousels get children in the same pass as their cover, (c) `mediaCount`/gallery rendering on the dashboard is unchanged before and after.
- Existing test suite must continue passing unchanged (additive change, no removed behavior).

## 6. Rollout

Same pattern as prior slices: subagent-driven development in an isolated worktree, final whole-branch review, merge to `main` locally, deploy with explicit go-ahead. This slice has no user-facing surface — the "N posts backed up" count and gallery must look identical before and after to a creator, only the underlying data grows richer. This is a foundation for "Restore to new account" (next spec), not independently exciting to end users.
