# Carousel Backup Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Instagram backup so a carousel post's every child image/video is stored, not just its cover — including backfilling carousels already backed up in production — so the upcoming "restore to new account" feature can reconstruct true multi-image carousels.

**Architecture:** Two nullable columns (`parent_media_id`, `position`) added to the existing `backed_up_media` table — carousel children become ordinary rows in that same table, reusing its storage/signed-URL machinery rather than a parallel table. A new pure, tested module (`lib/instagramCarousel.ts`) holds the backfill-needed check and child-position-assignment logic, mirroring the existing `lib/instagramAuth.ts` pattern of extracting pure logic out of the impure sync orchestration. The Graph API adapter (`lib/instagramGraph.ts`) and sync orchestration (`lib/instagramBackup.ts`) gain the actual HTTP/DB work, verified manually against a real account — matching how the rest of the Instagram backup feature is tested.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (Postgres + Storage, service-role client) · Instagram Graph API · Vitest.

## Global Constraints

- **No dashboard UI changes.** The gallery and "N posts backed up" count must render identically before and after this slice (spec §2, §3).
- **Migrations are applied via the Supabase MCP `apply_migration` tool**, not `npx supabase db push` — this repo has no linked Supabase CLI (confirmed working pattern from prior slices).
- **A child download/upload failure is caught and skipped individually** — it must never fail the whole carousel or the rest of the sync run (spec §4.4).
- **Already-backed-up carousels get backfilled on their next sync**, not left cover-only forever (spec §2, §4.4).
- **No restore/publish logic in this slice** — that's the next spec (spec §3).

---

## File Structure

- Create: `supabase/migrations/0006_carousel_children.sql` — adds `parent_media_id`/`position` to `backed_up_media` + an index.
- Create: `lib/instagramCarousel.ts` / `lib/instagramCarousel.test.ts` — pure: backfill-needed check, child position assignment.
- Modify: `lib/instagramGraph.ts` — widen `GraphMediaItem`, add `fetchCarouselChildren`.
- Modify: `lib/data/instagram.ts` — `getBackedUpMediaIds` returns a `Map` instead of a `Set`, `insertBackedUpMedia` returns the new row's id and accepts `parentMediaId`/`position`, new `countMediaChildren`, `listBackedUpMedia`/`countBackedUpMedia` filter out children.
- Modify: `lib/instagramBackup.ts` — sync loop backs up carousel children (new items) and backfills them (already-synced items).

*(Note: the spec named the migration `0005_carousel_children.sql`; the repo has since gained an unrelated `0005_billing.sql`, so this plan uses `0006` — the next free number.)*

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0006_carousel_children.sql`

**Interfaces:**
- Produces: `backed_up_media.parent_media_id` (nullable uuid FK to `backed_up_media.id`, `on delete cascade`), `backed_up_media.position` (nullable int), index `backed_up_media_parent_idx`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_carousel_children.sql`:

```sql
alter table backed_up_media
  add column parent_media_id uuid references backed_up_media(id) on delete cascade,
  add column position int;

create index backed_up_media_parent_idx on backed_up_media (parent_media_id);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `name: carousel_children` and `query` set to the full SQL above.

- [ ] **Step 3: Verify**

Use the Supabase MCP `execute_sql` tool to run:

```sql
select column_name from information_schema.columns
where table_name = 'backed_up_media' and column_name in ('parent_media_id', 'position')
order by column_name;
```

Expected: 2 rows — `parent_media_id`, `position`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_carousel_children.sql && git commit -m "feat: add parent_media_id and position columns for carousel children"
```

---

### Task 2: Graph API adapter — fetch carousel children

**Files:**
- Modify: `lib/instagramGraph.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `GraphMediaItem` — `permalink` and `timestamp` become optional (was required).
  - `fetchCarouselChildren(input: { mediaId: string; accessToken: string }): Promise<GraphMediaItem[]>`

- [ ] **Step 1: Widen `GraphMediaItem`**

In `lib/instagramGraph.ts`, change:

```ts
export type GraphMediaItem = {
  id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string;
  permalink: string; like_count?: number; comments_count?: number; timestamp: string;
};
```

to:

```ts
export type GraphMediaItem = {
  id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string;
  permalink?: string; like_count?: number; comments_count?: number; timestamp?: string;
};
```

Every existing consumer already reads `permalink`/`timestamp` defensively (`item.permalink ?? null`, `item.timestamp ?? null` in `lib/instagramBackup.ts`), so this is backward compatible — carousel children just never populate those two fields, since the Graph API's `children` edge doesn't return them.

- [ ] **Step 2: Add `fetchCarouselChildren`**

At the end of `lib/instagramGraph.ts`, add:

```ts
export async function fetchCarouselChildren(input: {
  mediaId: string; accessToken: string;
}): Promise<GraphMediaItem[]> {
  const url = new URL(`${GRAPH_BASE}/${input.mediaId}/children`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url");
  url.searchParams.set("access_token", input.accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Instagram carousel children fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: GraphMediaItem[] };
  return json.data;
}
```

No unit test for this function — it's a thin HTTP adapter, matching the existing untested-adapter convention for the rest of this file (`fetchMediaPage`, `fetchInstagramUsername`, etc. have no tests either).

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/instagramGraph.ts && git commit -m "feat: fetch carousel children from the Instagram Graph API"
```

---

### Task 3: Pure carousel-backfill logic (TDD)

**Files:**
- Create: `lib/instagramCarousel.ts`
- Test: `lib/instagramCarousel.test.ts`

**Interfaces:**
- Consumes: `GraphMediaItem` (Task 2, type-only import).
- Produces:
  - `needsChildBackfill(mediaType: string, existingChildCount: number): boolean` — true only when `mediaType === "CAROUSEL_ALBUM"` and `existingChildCount === 0`.
  - `type ChildInsertPlanItem = { igMediaId: string; mediaType: string; sourceUrl: string | undefined; position: number }`
  - `buildChildInsertPlan(children: GraphMediaItem[]): ChildInsertPlanItem[]` — maps each child to its Instagram id, media type, download URL (`media_url` falling back to `thumbnail_url`), and its 0-indexed position in the array.

- [ ] **Step 1: Write the failing tests**

Create `lib/instagramCarousel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsChildBackfill, buildChildInsertPlan } from "@/lib/instagramCarousel";
import type { GraphMediaItem } from "@/lib/instagramGraph";

describe("needsChildBackfill", () => {
  it("returns true for a carousel with no children yet", () => {
    expect(needsChildBackfill("CAROUSEL_ALBUM", 0)).toBe(true);
  });

  it("returns false for a carousel that already has children", () => {
    expect(needsChildBackfill("CAROUSEL_ALBUM", 3)).toBe(false);
  });

  it("returns false for a non-carousel item, regardless of child count", () => {
    expect(needsChildBackfill("IMAGE", 0)).toBe(false);
  });
});

describe("buildChildInsertPlan", () => {
  const child = (overrides: Partial<GraphMediaItem>): GraphMediaItem => ({
    id: "child-1",
    media_type: "IMAGE",
    media_url: "https://example.com/1.jpg",
    ...overrides,
  });

  it("assigns position by array order", () => {
    const plan = buildChildInsertPlan([child({ id: "a" }), child({ id: "b" }), child({ id: "c" })]);
    expect(plan.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(plan.map((p) => p.igMediaId)).toEqual(["a", "b", "c"]);
  });

  it("falls back to thumbnail_url when media_url is missing (video children)", () => {
    const plan = buildChildInsertPlan([
      child({ id: "v1", media_type: "VIDEO", media_url: undefined, thumbnail_url: "https://example.com/thumb.jpg" }),
    ]);
    expect(plan[0].sourceUrl).toBe("https://example.com/thumb.jpg");
  });

  it("prefers media_url over thumbnail_url when both are present", () => {
    const plan = buildChildInsertPlan([
      child({ media_url: "https://example.com/full.jpg", thumbnail_url: "https://example.com/thumb.jpg" }),
    ]);
    expect(plan[0].sourceUrl).toBe("https://example.com/full.jpg");
  });

  it("carries mediaType through unchanged", () => {
    const plan = buildChildInsertPlan([child({ media_type: "VIDEO", media_url: "https://example.com/v.mp4" })]);
    expect(plan[0].mediaType).toBe("VIDEO");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/instagramCarousel.test.ts`
Expected: FAIL — cannot find module `@/lib/instagramCarousel`.

- [ ] **Step 3: Write the implementation**

Create `lib/instagramCarousel.ts`:

```ts
import type { GraphMediaItem } from "@/lib/instagramGraph";

export function needsChildBackfill(mediaType: string, existingChildCount: number): boolean {
  return mediaType === "CAROUSEL_ALBUM" && existingChildCount === 0;
}

export type ChildInsertPlanItem = {
  igMediaId: string;
  mediaType: string;
  sourceUrl: string | undefined;
  position: number;
};

export function buildChildInsertPlan(children: GraphMediaItem[]): ChildInsertPlanItem[] {
  return children.map((child, position) => ({
    igMediaId: child.id,
    mediaType: child.media_type,
    sourceUrl: child.media_url ?? child.thumbnail_url,
    position,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/instagramCarousel.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/instagramCarousel.ts lib/instagramCarousel.test.ts && git commit -m "feat: add pure carousel backfill and child-position logic"
```

---

### Task 4: Data layer — children, backfill check, id-returning insert

**Files:**
- Modify: `lib/data/instagram.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `getBackedUpMediaIds(pageId: string): Promise<Map<string, string>>` — was `Promise<Set<string>>`; now maps `ig_media_id` → row `id`.
  - `insertBackedUpMedia(pageId: string, input: {..., parentMediaId?: string; position?: number}): Promise<string>` — was `Promise<void>`; now returns the inserted row's `id`.
  - `countMediaChildren(parentMediaId: string): Promise<number>`
  - `listBackedUpMedia`/`countBackedUpMedia` — unchanged signatures, now exclude child rows.

- [ ] **Step 1: Change `getBackedUpMediaIds` to return a `Map`**

In `lib/data/instagram.ts`, change:

```ts
export async function getBackedUpMediaIds(pageId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("ig_media_id").eq("page_id", pageId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { ig_media_id: string }).ig_media_id));
}
```

to:

```ts
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
```

- [ ] **Step 2: Make `insertBackedUpMedia` return the row id and accept parent/position**

Change:

```ts
export async function insertBackedUpMedia(pageId: string, input: {
  igMediaId: string; mediaType: string; caption: string | null;
  likeCount: number | null; commentsCount: number | null; permalink: string | null;
  storagePath: string; postedAt: string | null;
}): Promise<void> {
  const { error } = await serviceClient().from("backed_up_media").insert({
    page_id: pageId, ig_media_id: input.igMediaId, media_type: input.mediaType,
    caption: input.caption, like_count: input.likeCount, comments_count: input.commentsCount,
    permalink: input.permalink, storage_path: input.storagePath, posted_at: input.postedAt,
  });
  if (error) throw error;
}
```

to:

```ts
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
```

- [ ] **Step 3: Add `countMediaChildren`**

After `insertBackedUpMedia`, add:

```ts
export async function countMediaChildren(parentMediaId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("backed_up_media").select("*", { count: "exact", head: true }).eq("parent_media_id", parentMediaId);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 4: Exclude children from the gallery list and count**

Change:

```ts
export async function listBackedUpMedia(pageId: string, limit = 24): Promise<BackedUpMedia[]> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("*").eq("page_id", pageId)
    .order("posted_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toMedia(r as MediaRow));
}
```

to:

```ts
export async function listBackedUpMedia(pageId: string, limit = 24): Promise<BackedUpMedia[]> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("*").eq("page_id", pageId).is("parent_media_id", null)
    .order("posted_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toMedia(r as MediaRow));
}
```

Change:

```ts
export async function countBackedUpMedia(pageId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("backed_up_media").select("*", { count: "exact", head: true }).eq("page_id", pageId);
  if (error) throw error;
  return count ?? 0;
}
```

to:

```ts
export async function countBackedUpMedia(pageId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("backed_up_media").select("*", { count: "exact", head: true }).eq("page_id", pageId).is("parent_media_id", null);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 5: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (`Map.has()` and `Set.has()` share a signature and `lib/instagramBackup.ts` never uses `insertBackedUpMedia`'s return value yet, so the existing call sites there stay valid even before Task 5 rewires them.)

- [ ] **Step 6: Commit**

```bash
git add lib/data/instagram.ts && git commit -m "feat: support carousel children in the backed-up media data layer"
```

---

### Task 5: Sync flow — back up and backfill carousel children

**Files:**
- Modify: `lib/instagramBackup.ts`

**Interfaces:**
- Consumes: `needsChildBackfill`/`buildChildInsertPlan` (Task 3), `countMediaChildren` (Task 4), `getBackedUpMediaIds` now returning `Map` (Task 4), `insertBackedUpMedia` now returning `string` (Task 4), `fetchCarouselChildren` (Task 2).
- Produces: `syncInstagramMedia` — same public signature as before; carousels now back up and backfill their children as a side effect.

- [ ] **Step 1: Update imports**

In `lib/instagramBackup.ts`, change:

```ts
import { serviceClient } from "@/lib/supabase/server";
import { needsTokenRefresh } from "@/lib/instagramAuth";
import {
  getConnectionByPageId,
  updateConnectionToken,
  updateLastSyncedAt,
  getBackedUpMediaIds,
  insertBackedUpMedia,
} from "@/lib/data/instagram";
import { refreshLongLivedToken, fetchMediaPage } from "@/lib/instagramGraph";
```

to:

```ts
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
```

- [ ] **Step 2: Add the child-backup helper**

After the `type SyncResult = ...` declaration and before `export async function syncInstagramMedia`, add:

```ts
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
```

A `fetchCarouselChildren` failure (transient Graph API error) leaves the carousel cover-only for this run — it's picked up again as a backfill candidate on the next sync, per spec §4.4. A single child's download/upload failure is caught individually and doesn't stop the rest of that carousel's children from backing up.

- [ ] **Step 3: Wire it into the sync loop**

Inside `syncInstagramMedia`, change:

```ts
    for (const item of page.items) {
      total += 1;
      if (existingIds.has(item.id)) continue;

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

        await insertBackedUpMedia(pageId, {
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
      } catch {
        continue;
      }
    }
```

to:

```ts
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
          const childCount = await countMediaChildren(existingRowId);
          if (needsChildBackfill(item.media_type, childCount)) {
            await backUpCarouselChildren({ pageId, parentMediaId: existingRowId, igMediaId: item.id, accessToken });
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
```

`synced`/`total` intentionally still count top-level posts only, not children — the dashboard's "Synced N new posts" copy stays accurate and unchanged, per the Global Constraints' no-UI-changes rule.

- [ ] **Step 4: Verify the project typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, plus the 6 new tests from Task 3 — no regressions.

- [ ] **Step 6: Commit**

```bash
git add lib/instagramBackup.ts && git commit -m "feat: back up and backfill carousel children during sync"
```

---

### Task 6: Manual verification against a real account

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm pre-existing carousels backfill**

Using the founder's own connected Instagram account (production, `accountguard.app` or local dev pointed at the same Supabase project): before syncing, run this query via the Supabase MCP `execute_sql` tool to find a carousel that predates this slice:

```sql
select id, ig_media_id from backed_up_media
where media_type = 'CAROUSEL_ALBUM' and parent_media_id is null
limit 5;
```

Note one `id`. Trigger "Sync now" from the dashboard. Re-run:

```sql
select id, position, media_type from backed_up_media
where parent_media_id = '<the id you noted>'
order by position;
```

Expected: one or more rows, `position` starting at 0 and increasing with no gaps.

- [ ] **Step 2: Confirm new carousels back up children in the same pass**

If the connected account has posted a new carousel since the last sync (or post a test one), trigger "Sync now" and confirm via the same query pattern as Step 1 that the new carousel's cover row has children immediately, in one sync run.

- [ ] **Step 3: Confirm the dashboard is visually unchanged**

Open `/dashboard`. Confirm: the gallery still shows exactly one tile per carousel post (the cover), and "N posts backed up" matches the count from before this slice shipped (i.e., it did not increase just because children rows now exist).

- [ ] **Step 4: Confirm storage layout**

Via Supabase Storage, confirm a carousel's child files live under `instagram-backups/<page-id>/<parent-ig-media-id>/<child-ig-media-id>`, separate from top-level files at `instagram-backups/<page-id>/<ig-media-id>`.

---

## Self-Review

**Spec coverage:**
- §4.1 Data model (`parent_media_id`, `position`, index) → Task 1. ✓
- §4.2 Graph API layer (`fetchCarouselChildren`) → Task 2. ✓
- §4.3 Data layer (`getBackedUpMediaIds` → Map, `insertBackedUpMedia` returns id, `countMediaChildren`, list/count exclude children) → Task 4. ✓
- §4.4 Sync flow (new carousel backs up children in the same pass; already-backed-up carousel backfills; per-child and per-carousel failure isolation) → Task 5. ✓
- §4.5 Storage layout (`{page_id}/{parent_ig_media_id}/{child_ig_media_id}`) → Task 5 Step 2/3, verified in Task 6 Step 4. ✓
- §5 Testing (pure-logic unit tests, full sync verified live, existing suite unchanged) → Task 3 (TDD), Task 6 (live verification), Task 5 Step 5 (full suite). ✓
- §3 Non-goals (no UI changes, no restore logic, no handling for expired/disconnected tokens beyond existing behavior) — no task builds any of these; Task 6 Step 3 explicitly verifies the UI is unchanged. ✓

**Testing convention deviation from the design spec:** the spec's §5 describes `fetchCarouselChildren` being "tested the same way existing Graph API functions are (mocked fetch, asserts on request shape and response mapping)." No function in `lib/instagramGraph.ts` actually has a test today — it's a fully untested HTTP adapter (confirmed: no `lib/instagramGraph.test.ts` exists), and the original Instagram-backup plan explicitly chose this convention and documented the same deviation from its own spec. This plan follows the codebase's real, established convention (Task 2 has no test) rather than the spec's aspirational description, consistent with prior slices.

**Placeholder scan:** every code step contains complete, runnable code; commands have expected output; no TBD/TODO.

**Type consistency:** `ChildInsertPlanItem` fields (`igMediaId`, `mediaType`, `sourceUrl`, `position`) defined in Task 3 match their usage in Task 5's `backUpCarouselChildren` (`planned.igMediaId`, `planned.mediaType`, `planned.sourceUrl`, `planned.position`). `needsChildBackfill(mediaType, existingChildCount)`'s parameter order (Task 3) matches its call site in Task 5 (`needsChildBackfill(item.media_type, childCount)`). `getBackedUpMediaIds`'s new `Map<string, string>` return (Task 4) matches Task 5's `existingIds.get(item.id)` usage. `insertBackedUpMedia`'s new `Promise<string>` return (Task 4) matches Task 5's `const insertedId = await insertBackedUpMedia(...)` and its use as `parentMediaId` in the nested `backUpCarouselChildren` call. `countMediaChildren(parentMediaId: string)` (Task 4) matches its Task 5 call site (`countMediaChildren(existingRowId)`, where `existingRowId` is narrowed to `string` by the preceding truthy check). `fetchCarouselChildren`'s `{ mediaId, accessToken }` input (Task 2) matches Task 5's call (`{ mediaId: input.igMediaId, accessToken: input.accessToken }`).

---

## Post-merge addendum: Task 7 (added after final whole-branch review)

The final whole-branch review, run against Tasks 1-6 merged together and verified live against production, found an Important gap that only real data exposed: **the `count === 0` backfill trigger cannot distinguish a fully-backed-up carousel from a partially-backed-up one.** Per-child failure isolation (§4.4, correctly implemented) means a carousel can end up with *some* but not all children stored — e.g. a transient download failure on one interior slide. Once a carousel has ≥1 child, `needsChildBackfill` reports `false` forever, so the gap never gets retried. This was confirmed live: 3 of 64 backfilled carousels are missing an interior slide.

**Fix:** replace the zero-count gate with a real diff. Every sync, for every carousel (new or already-existing), fetch its current children from the Graph API and compare against the child `ig_media_id`s already stored for that parent — only download/upload/insert the ones actually missing. This makes carousel child backup naturally idempotent and self-healing: a complete carousel costs one cheap Graph API call and does nothing further; a partial carousel gets exactly its missing slides filled in; a fresh carousel gets all its children, same as before.

### Task 7: Idempotent, self-healing carousel child backup

**Files:**
- Modify: `lib/data/instagram.ts` — replace `countMediaChildren` with `getMediaChildIds`.
- Modify: `lib/instagramCarousel.ts` / `lib/instagramCarousel.test.ts` — remove `needsChildBackfill`; `buildChildInsertPlan` gains an `existingChildIds` filter parameter.
- Modify: `lib/instagramBackup.ts` — every carousel (new-item or already-existing) goes through the same `backUpCarouselChildren` call; that function now does its own missing-children diff internally.

**Interfaces:**
- Consumes: `fetchCarouselChildren` (unchanged, Task 2).
- Produces:
  - `getMediaChildIds(parentMediaId: string): Promise<Set<string>>` — the `ig_media_id`s already stored as children of this parent.
  - `buildChildInsertPlan(children: GraphMediaItem[], existingChildIds: Set<string>): ChildInsertPlanItem[]` — was `buildChildInsertPlan(children: GraphMediaItem[])`; now filters out any child whose `id` is already in `existingChildIds`.
  - `needsChildBackfill` is removed — no longer needed, since the diff itself determines what (if anything) to do.

**Result (2026-07-15):** implemented (commit `6304299`), reviewed clean, then verified live against production. Ran the repair sync live: `child_rows` grew 376→382 (no duplicates — confirmed via a `group by (parent_media_id, position) having count(*) > 1` query returning zero rows). Parent `3b6a7a43` fully repaired (6→7 children, positions 0-6 contiguous) — its missing video downloaded successfully on retry. The other +5 child rows came from *other* carousels that had trailing gaps (a missing *last* slide, which the original gap-detection heuristic `max(position)-min(position)+1 <> count(*)` can't see) — the new diff-based design correctly caught and repaired those too, beyond the 3 originally identified.

Parents `cbe933ae` and `fe7a40de` are still missing their one slide each. Diagnosed directly against Instagram's Graph API and CDN (temporary diagnostic script, not committed): both are real, external, non-transient failures — one video's `media_url` returns a hard `500` from Instagram's own CDN, the other hangs indefinitely with no response. Neither is a defect in this branch's logic; both are outside this codebase's control. Confirmed this is *not* a silent-forever failure mode like before the fix: because the trigger is now a real id-diff rather than a zero-count gate, these two carousels are correctly re-identified as incomplete on every future sync and will keep retrying — if Instagram ever serves that content correctly again, the next sync picks it up automatically.

Flagged separately (not part of this slice): `lib/instagramBackup.ts`'s media downloads (both top-level and carousel-child) have no fetch timeout, which is how the hung request surfaced during diagnosis — pre-existing since the original Instagram backup slice, tracked as a follow-up task rather than scope-crept into this fix.
