# Instagram Content Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a creator connect their Instagram professional account via OAuth (Instagram Login, no Facebook Page required), back up their media (images/videos, captions, like/comment counts) into a private Supabase Storage bucket, sync on demand, and browse what's backed up from the dashboard — replacing the inert "Coming soon" card.

**Architecture:** Two new tables (`instagram_connections`, `backed_up_media`) plus a private Storage bucket, following the existing `breach_alerts`-style owner-scoped RLS pattern. Pure, testable logic (state-token signing/verification, token-refresh timing) lives in `lib/instagramAuth.ts`. Graph API HTTP calls live in an untested adapter (`lib/instagramGraph.ts`), matching how `lib/email/resend.ts` is already an untested adapter alongside the tested pure `lib/email.ts`. Orchestration (`lib/instagramBackup.ts`) ties adapter + data layer together and is verified manually, same treatment as the existing `app/api/inbound-email/route.ts` webhook. Four new API routes (connect, callback, sync, disconnect) and one new client component (`InstagramBackup`) follow the exact shape of the existing Instagram-adjacent routes/components in this repo.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase (Postgres + Storage, service-role client) · Instagram Graph API (Instagram Login flow) · Zod v4 · Tailwind CSS · Vitest.

## Global Constraints

- **Ungated.** No paywall/billing check — same access model as breach alerts and the checklist (spec §3).
- **Media-only backup.** No growth/metrics-history time series in this slice (spec §3).
- **Manual sync only.** No cron/scheduled job is introduced (spec §3, §4.5).
- **Carousel albums back up cover media only**, not each child item (spec §3, §4.5).
- **Gallery is capped** to the most recent backed-up items; no pagination UI (spec §3, §7).
- **No new encryption layer** for the stored access token — plaintext column protected by RLS + service-role-only access, matching the existing `secondary_email` convention (spec §4.2).
- **Storage bucket is private**, never public — signed URLs only, generated server-side (spec §4.3).
- **Meta App Review is a manual, external follow-up** the founder handles outside this plan — this plan's own verification uses Development-mode access with the founder's own Instagram test account (spec §4.1, §7).
- **Migrations are applied via the Supabase MCP `apply_migration` tool**, not `npx supabase db push` — this repo has no linked Supabase CLI (`supabase/config.toml` doesn't exist), confirmed working pattern from the prevention-checklist slice.

---

## File Structure

- Create: `supabase/migrations/0004_instagram_backup.sql` — `instagram_connections`, `backed_up_media` tables + RLS + private `instagram-backups` Storage bucket.
- Create: `lib/instagramAuth.ts` / `lib/instagramAuth.test.ts` — pure: OAuth `state` signing/verification, token-refresh-due check.
- Create: `lib/data/instagram.ts` — data access: connections CRUD, backed-up-media CRUD, signed URL generation.
- Create: `lib/instagramGraph.ts` — Instagram Graph API HTTP adapter (authorize URL, token exchange/refresh, fetch user, fetch media page).
- Create: `lib/instagramBackup.ts` — sync orchestration (`syncInstagramMedia`).
- Create: `app/api/instagram/connect/route.ts` — GET, redirects to Instagram's OAuth dialog.
- Create: `app/api/instagram/callback/route.ts` — GET, completes OAuth, triggers first sync.
- Create: `app/api/instagram/sync/route.ts` — POST, re-syncs the caller's connected account.
- Create: `app/api/instagram/disconnect/route.ts` — POST, removes the connection (keeps backed-up data).
- Create: `app/(dashboard)/dashboard/instagram-backup.tsx` — client component: connect/connected/gallery/error states.
- Modify: `app/(dashboard)/dashboard/page.tsx` — replace the static backup card with the live component.
- Modify: `README.md`, `.env.local.example` — new env vars + setup instructions.

---

### Task 1: Database migration + storage bucket

**Files:**
- Create: `supabase/migrations/0004_instagram_backup.sql`

**Interfaces:**
- Produces: `instagram_connections(id, page_id, ig_user_id, ig_username, access_token, token_expires_at, last_synced_at, created_at)`, `backed_up_media(id, page_id, ig_media_id, media_type, caption, like_count, comments_count, permalink, storage_path, posted_at, created_at)`, private Storage bucket `instagram-backups`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_instagram_backup.sql`:

```sql
create table instagram_connections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade unique,
  ig_user_id text not null,
  ig_username text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table backed_up_media (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  ig_media_id text not null,
  media_type text not null,
  caption text,
  like_count int,
  comments_count int,
  permalink text,
  storage_path text not null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (page_id, ig_media_id)
);

alter table instagram_connections enable row level security;
alter table backed_up_media enable row level security;

create policy instagram_connections_owner_all on instagram_connections
  for all using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()))
  with check (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));

create policy backed_up_media_owner_read on backed_up_media
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));

insert into storage.buckets (id, name, public) values ('instagram-backups', 'instagram-backups', false);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `name: instagram_backup` and `query` set to the full SQL above (do not run `npx supabase db push` — this repo has no linked Supabase CLI project).

- [ ] **Step 3: Verify**

Use the Supabase MCP `list_tables` tool and confirm `instagram_connections` and `backed_up_media` are present with RLS enabled. Then use the `execute_sql` tool to run:

```sql
select id, public from storage.buckets where id = 'instagram-backups';
```

Expected: one row, `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_instagram_backup.sql && git commit -m "feat: add instagram_connections and backed_up_media tables"
```

---

### Task 2: OAuth state signing + token-refresh timing (pure, TDD)

**Files:**
- Create: `lib/instagramAuth.ts`
- Test: `lib/instagramAuth.test.ts`

**Interfaces:**
- Consumes: nothing (secret is passed as a parameter, not read from `process.env`, to keep this module pure and testable).
- Produces:
  - `signState(pageId: string, secret: string): string`
  - `verifyState(state: string, secret: string): string | null` — returns the page id if valid, `null` otherwise.
  - `needsTokenRefresh(expiresAt: Date, now: Date): boolean` — true if `expiresAt` is less than 7 days after `now`.

- [ ] **Step 1: Write the failing tests**

Create `lib/instagramAuth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signState, verifyState, needsTokenRefresh } from "@/lib/instagramAuth";

describe("signState / verifyState", () => {
  const secret = "test-secret";
  const pageId = "11111111-1111-1111-1111-111111111111";

  it("round-trips a page id", () => {
    const state = signState(pageId, secret);
    expect(verifyState(state, secret)).toBe(pageId);
  });

  it("rejects a tampered page id", () => {
    const state = signState(pageId, secret);
    const tampered = state.replace("1111", "2222");
    expect(verifyState(tampered, secret)).toBeNull();
  });

  it("rejects a state signed with a different secret", () => {
    const state = signState(pageId, secret);
    expect(verifyState(state, "wrong-secret")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyState("not-a-valid-state", secret)).toBeNull();
  });
});

describe("needsTokenRefresh", () => {
  const now = new Date("2026-07-12T00:00:00Z");

  it("returns false when expiry is far away", () => {
    expect(needsTokenRefresh(new Date("2026-08-01T00:00:00Z"), now)).toBe(false);
  });

  it("returns true when within 7 days of expiry", () => {
    expect(needsTokenRefresh(new Date("2026-07-15T00:00:00Z"), now)).toBe(true);
  });

  it("returns true when already expired", () => {
    expect(needsTokenRefresh(new Date("2026-07-01T00:00:00Z"), now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/instagramAuth.test.ts`
Expected: FAIL — cannot find module `@/lib/instagramAuth`.

- [ ] **Step 3: Write the implementation**

Create `lib/instagramAuth.ts`:

```ts
import { createHmac, timingSafeEqual } from "crypto";

export function signState(pageId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(pageId).digest("base64url");
  return `${pageId}.${sig}`;
}

export function verifyState(state: string, secret: string): string | null {
  const idx = state.lastIndexOf(".");
  if (idx === -1) return null;
  const pageId = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(pageId).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return pageId;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function needsTokenRefresh(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < SEVEN_DAYS_MS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/instagramAuth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/instagramAuth.ts lib/instagramAuth.test.ts && git commit -m "feat: add Instagram OAuth state signing and token-refresh timing"
```

---

### Task 3: Data layer — connections + backed-up media

**Files:**
- Create: `lib/data/instagram.ts`

**Interfaces:**
- Consumes: `serviceClient()` from `@/lib/supabase/server`.
- Produces:
  - `type InstagramConnection = { pageId: string; igUserId: string; igUsername: string; accessToken: string; tokenExpiresAt: string; lastSyncedAt: string | null }`
  - `getConnectionByPageId(pageId: string): Promise<InstagramConnection | null>`
  - `upsertConnection(input: { pageId: string; igUserId: string; igUsername: string; accessToken: string; tokenExpiresAt: string }): Promise<void>`
  - `updateConnectionToken(pageId: string, accessToken: string, tokenExpiresAt: string): Promise<void>`
  - `updateLastSyncedAt(pageId: string): Promise<void>`
  - `deleteConnection(pageId: string): Promise<void>`
  - `type BackedUpMedia = { id: string; igMediaId: string; mediaType: string; caption: string | null; likeCount: number | null; commentsCount: number | null; permalink: string | null; storagePath: string; postedAt: string | null }`
  - `listBackedUpMedia(pageId: string, limit?: number): Promise<BackedUpMedia[]>` (default limit 24, ordered newest-first)
  - `countBackedUpMedia(pageId: string): Promise<number>`
  - `getBackedUpMediaIds(pageId: string): Promise<Set<string>>`
  - `insertBackedUpMedia(pageId: string, input: { igMediaId: string; mediaType: string; caption: string | null; likeCount: number | null; commentsCount: number | null; permalink: string | null; storagePath: string; postedAt: string | null }): Promise<void>`
  - `getSignedMediaUrls(paths: string[]): Promise<Record<string, string>>` — 1-hour expiry, keyed by storage path.

- [ ] **Step 1: Write the module**

Create `lib/data/instagram.ts`:

```ts
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
    .from("backed_up_media").select("*").eq("page_id", pageId)
    .order("posted_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => toMedia(r as MediaRow));
}

export async function countBackedUpMedia(pageId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("backed_up_media").select("*", { count: "exact", head: true }).eq("page_id", pageId);
  if (error) throw error;
  return count ?? 0;
}

export async function getBackedUpMediaIds(pageId: string): Promise<Set<string>> {
  const { data, error } = await serviceClient()
    .from("backed_up_media").select("ig_media_id").eq("page_id", pageId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { ig_media_id: string }).ig_media_id));
}

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
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/instagram.ts && git commit -m "feat: add Instagram connection and backed-up media data layer"
```

---

### Task 4: Instagram Graph API adapter

**Files:**
- Create: `lib/instagramGraph.ts`

**Interfaces:**
- Consumes: nothing (reads no env vars directly — all secrets/ids are passed in by callers).
- Produces:
  - `buildAuthorizeUrl(input: { appId: string; redirectUri: string; state: string }): string`
  - `exchangeCodeForShortLivedToken(input: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<{ accessToken: string; userId: string }>`
  - `exchangeForLongLivedToken(input: { appSecret: string; accessToken: string }): Promise<{ accessToken: string; expiresInSeconds: number }>`
  - `refreshLongLivedToken(input: { accessToken: string }): Promise<{ accessToken: string; expiresInSeconds: number }>`
  - `fetchInstagramUsername(input: { accessToken: string }): Promise<string>`
  - `type GraphMediaItem = { id: string; caption?: string; media_type: string; media_url: string; permalink: string; like_count?: number; comments_count?: number; timestamp: string }`
  - `fetchMediaPage(input: { accessToken: string; after?: string }): Promise<{ items: GraphMediaItem[]; nextAfter: string | null }>`

No unit tests for this module — it is a thin HTTP adapter over Meta's API, matching the existing untested-adapter convention (`lib/email/resend.ts` has no test file; only the pure `lib/email.ts` does).

- [ ] **Step 1: Write the module**

Create `lib/instagramGraph.ts`:

```ts
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
  id: string; caption?: string; media_type: string; media_url: string;
  permalink: string; like_count?: number; comments_count?: number; timestamp: string;
};

export async function fetchMediaPage(input: {
  accessToken: string; after?: string;
}): Promise<{ items: GraphMediaItem[]; nextAfter: string | null }> {
  const url = new URL(`${GRAPH_BASE}/me/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp");
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
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/instagramGraph.ts && git commit -m "feat: add Instagram Graph API adapter"
```

---

### Task 5: Sync orchestration

**Files:**
- Create: `lib/instagramBackup.ts`

**Interfaces:**
- Consumes: `serviceClient()` (`@/lib/supabase/server`), `needsTokenRefresh` (Task 2), `getConnectionByPageId`/`updateConnectionToken`/`updateLastSyncedAt`/`getBackedUpMediaIds`/`insertBackedUpMedia` (Task 3), `refreshLongLivedToken`/`fetchMediaPage` (Task 4).
- Produces: `syncInstagramMedia(pageId: string): Promise<{ ok: true; synced: number; total: number } | { ok: false; reason: "not_connected" | "token_expired" | "sync_failed" }>`.

No unit test for this module — it is I/O-heavy orchestration (network + storage + database), matching the existing convention where impure orchestration (e.g. the `app/api/inbound-email` webhook) is verified manually rather than unit-tested. Manual verification happens in Task 10.

- [ ] **Step 1: Write the module**

Create `lib/instagramBackup.ts`:

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

type SyncResult =
  | { ok: true; synced: number; total: number }
  | { ok: false; reason: "not_connected" | "token_expired" | "sync_failed" };

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

  try {
    let after: string | undefined;
    do {
      const page = await fetchMediaPage({ accessToken, after });
      for (const item of page.items) {
        total += 1;
        if (existingIds.has(item.id)) continue;

        const mediaRes = await fetch(item.media_url);
        if (!mediaRes.ok) continue;
        const bytes = new Uint8Array(await mediaRes.arrayBuffer());
        const storagePath = `${pageId}/${item.id}`;

        const { error: uploadError } = await serviceClient()
          .storage.from("instagram-backups")
          .upload(storagePath, bytes, { upsert: true });
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
      }
      after = page.nextAfter ?? undefined;
    } while (after);
  } catch {
    return { ok: false, reason: "sync_failed" };
  }

  await updateLastSyncedAt(pageId);
  return { ok: true, synced, total };
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/instagramBackup.ts && git commit -m "feat: add Instagram media sync orchestration"
```

---

### Task 6: OAuth connect + callback routes

**Files:**
- Create: `app/api/instagram/connect/route.ts`
- Create: `app/api/instagram/callback/route.ts`

**Interfaces:**
- Consumes: `getSessionUser` (`@/lib/auth`), `serviceClient` (`@/lib/supabase/server`), `signState`/`verifyState` (Task 2), `buildAuthorizeUrl`/`exchangeCodeForShortLivedToken`/`exchangeForLongLivedToken`/`fetchInstagramUsername` (Task 4), `upsertConnection` (Task 3), `syncInstagramMedia` (Task 5). Requires env vars `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `NEXT_PUBLIC_APP_URL` (existing).
- Produces: `GET /api/instagram/connect` (redirect to Instagram OAuth), `GET /api/instagram/callback` (completes OAuth, redirects to `/dashboard` or `/dashboard?instagram_error=1`).

- [ ] **Step 1: Write the connect route**

Create `app/api/instagram/connect/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { signState } from "@/lib/instagramAuth";
import { buildAuthorizeUrl } from "@/lib/instagramGraph";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.redirect(new URL("/dashboard", req.url));

  const state = signState(page.id, process.env.INSTAGRAM_APP_SECRET!);
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`;
  const authorizeUrl = buildAuthorizeUrl({
    appId: process.env.INSTAGRAM_APP_ID!,
    redirectUri,
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}
```

- [ ] **Step 2: Write the callback route**

Create `app/api/instagram/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
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
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/instagram/connect app/api/instagram/callback && git commit -m "feat: add Instagram OAuth connect and callback routes"
```

---

### Task 7: Sync + disconnect routes

**Files:**
- Create: `app/api/instagram/sync/route.ts`
- Create: `app/api/instagram/disconnect/route.ts`

**Interfaces:**
- Consumes: `getSessionUser` (`@/lib/auth`), `serviceClient` (`@/lib/supabase/server`), `syncInstagramMedia` (Task 5), `deleteConnection` (Task 3).
- Produces: `POST /api/instagram/sync` → `{ ok: true, synced, total }` or `{ ok: false, reason }`; `POST /api/instagram/disconnect` → `{ ok: true }`.

- [ ] **Step 1: Write the sync route**

Create `app/api/instagram/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { syncInstagramMedia } from "@/lib/instagramBackup";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  const result = await syncInstagramMedia(page.id);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Write the disconnect route**

Create `app/api/instagram/disconnect/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { deleteConnection } from "@/lib/data/instagram";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  await deleteConnection(page.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/instagram/sync app/api/instagram/disconnect && git commit -m "feat: add Instagram sync and disconnect routes"
```

---

### Task 8: `InstagramBackup` dashboard component

**Files:**
- Create: `app/(dashboard)/dashboard/instagram-backup.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/Button`), `Badge` (`@/components/ui/Badge`); posts to `/api/instagram/sync` and `/api/instagram/disconnect` (Task 7); links to `/api/instagram/connect` (Task 6).
- Produces: `InstagramBackup(props)` client component, and exported type `BackupMediaItem = { id: string; caption: string | null; likeCount: number | null; commentsCount: number | null; signedUrl: string | null }`.

- [ ] **Step 1: Write the component**

Create `app/(dashboard)/dashboard/instagram-backup.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export type BackupMediaItem = {
  id: string;
  caption: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  signedUrl: string | null;
};

export function InstagramBackup({
  connected,
  username,
  lastSyncedAt,
  mediaCount,
  media,
  initialError,
}: {
  connected: boolean;
  username: string | null;
  lastSyncedAt: string | null;
  mediaCount: number;
  media: BackupMediaItem[];
  initialError: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(false);
    setMessage(null);
    const res = await fetch("/api/instagram/sync", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage(`Synced ${data.synced} new post${data.synced === 1 ? "" : "s"}.`);
    } else {
      setError(true);
    }
    setSyncing(false);
  }

  async function disconnect() {
    await fetch("/api/instagram/disconnect", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="mt-4">
      {!connected && (
        <a href="/api/instagram/connect">
          <Button variant="ghost">Connect Instagram</Button>
        </a>
      )}

      {connected && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-secondary">
            Connected as <span className="font-medium text-primary">@{username}</span>
          </p>
          <p className="text-sm text-secondary">
            {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}` : "Not yet synced"} ·{" "}
            {mediaCount} post{mediaCount === 1 ? "" : "s"} backed up
          </p>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={sync} disabled={syncing} className="w-auto px-4">
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <button onClick={disconnect} className="text-sm text-danger underline">
              Disconnect
            </button>
          </div>
          {message && <p className="text-sm text-accent">{message}</p>}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-danger">
          Something went wrong connecting to Instagram. Please try again.
        </p>
      )}

      {media.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-secondary">Backed-up posts</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {media.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                {item.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt={item.caption ?? ""}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                )}
                <Badge>{item.likeCount ?? 0}♥ · {item.commentsCount ?? 0}💬</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/instagram-backup.tsx" && git commit -m "feat: add InstagramBackup dashboard component"
```

---

### Task 9: Wire into the dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `InstagramBackup` (Task 8), `getConnectionByPageId`/`listBackedUpMedia`/`countBackedUpMedia`/`getSignedMediaUrls` (Task 3).

- [ ] **Step 1: Accept `searchParams` and add imports**

In `app/(dashboard)/dashboard/page.tsx`, change:

```tsx
import { PreventionChecklist } from "./prevention-checklist";
```

to:

```tsx
import { PreventionChecklist } from "./prevention-checklist";
import { InstagramBackup } from "./instagram-backup";
import {
  getConnectionByPageId,
  listBackedUpMedia,
  countBackedUpMedia,
  getSignedMediaUrls,
} from "@/lib/data/instagram";
```

Change:

```tsx
export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
```

to:

```tsx
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ instagram_error?: string }>;
}) {
  const { instagram_error } = await searchParams;
  const instagramError = instagram_error === "1";

  const user = await getSessionUser();
  if (!user) redirect("/login");
```

- [ ] **Step 2: Load Instagram connection + media data**

After the existing `const subscriberCount = (await listSubscriberEmails(data.id)).length;` line, add:

```tsx
  const instagramConnection = await getConnectionByPageId(data.id);
  const backedUpMedia = await listBackedUpMedia(data.id);
  const backedUpMediaCount = await countBackedUpMedia(data.id);
  const signedUrls = await getSignedMediaUrls(backedUpMedia.map((m) => m.storagePath));
```

- [ ] **Step 3: Replace the static backup card**

Change:

```tsx
      <Card className="mt-6 border-dashed opacity-60">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Content &amp; metrics backup</h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="mt-2 text-sm text-secondary">Auto-archive your posts and growth history.</p>
      </Card>
```

to:

```tsx
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Content &amp; metrics backup</h2>
          {instagramConnection && <Badge>Connected</Badge>}
        </div>
        <p className="mt-2 text-sm text-secondary">Auto-archive your posts and their engagement counts.</p>
        <InstagramBackup
          connected={!!instagramConnection}
          username={instagramConnection?.igUsername ?? null}
          lastSyncedAt={instagramConnection?.lastSyncedAt ?? null}
          mediaCount={backedUpMediaCount}
          media={backedUpMedia.map((m) => ({
            id: m.id,
            caption: m.caption,
            likeCount: m.likeCount,
            commentsCount: m.commentsCount,
            signedUrl: signedUrls[m.storagePath] ?? null,
          }))}
          initialError={instagramError}
        />
      </Card>
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, plus the 7 new tests from Task 2 — no regressions.

- [ ] **Step 5: Run the typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the `no-img-element` rule is suppressed inline in Task 8).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" && git commit -m "feat: wire Instagram backup into dashboard"
```

---

### Task 10: Env vars, docs, and full manual verification

**Files:**
- Modify: `README.md`, `.env.local.example`

**Interfaces:**
- Consumes: everything above.
- Produces: a working end-to-end connect → sync → gallery → disconnect flow against a real Instagram professional account in Meta's Development mode.

- [ ] **Step 1: Register the Meta app (external — done by the founder, not this task's code)**

At developers.facebook.com: create an app, add the "Instagram" product with Instagram Login, set the OAuth redirect URI to `https://accountguard.app/api/instagram/callback` (and `http://localhost:3000/api/instagram/callback` for local dev, if Meta's dev tooling allows a second registered URI — otherwise test locally against a tunnel or test directly on the deployed app). Add the founder's own Instagram professional account as an app tester (Development mode). Note the App ID and App Secret.

- [ ] **Step 2: Set environment variables**

Add to `.env.local` (and Vercel project settings):

```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

Update `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

- [ ] **Step 3: Update README**

Add `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` to the "Required environment variables" list, and add a "Content backup" subsection (mirroring the existing "Breach alerts" subsection) describing: the Meta app / Instagram Login setup from Step 1, that backup is media-only and ungated in this slice, and that Meta App Review (required before creators other than the founder can connect) is a separate manual follow-up.

- [ ] **Step 4: Manual verification — happy path**

Using the founder's own Instagram test account:
1. Log in, open the dashboard, click "Connect Instagram" on the backup card.
2. Approve on Instagram's OAuth dialog, get redirected back to `/dashboard`.
3. Confirm: the card now shows "Connected as @<username>", a synced post count, and a gallery of thumbnails.
4. Click "Sync now" — confirm it reports `Synced 0 new posts` on a second run (no duplicates) if nothing changed since first sync, and a positive count if new posts were added on Instagram since.
5. Open Supabase Storage — confirm objects exist under `instagram-backups/<page-id>/...`, bucket is private.

- [ ] **Step 5: Manual verification — error paths**

1. Navigate directly to `/api/instagram/callback` with no `code`/`state` — confirm redirect to `/dashboard?instagram_error=1` and the card shows the inline error message.
2. Navigate to `/api/instagram/callback?code=x&state=tampered` — confirm the same error redirect (invalid signature rejected).
3. Click "Disconnect" — confirm the card reverts to "Connect Instagram", but the gallery below it still shows the previously-backed-up posts (per spec §4.7).

- [ ] **Step 6: Commit**

```bash
git add README.md .env.local.example && git commit -m "docs: Instagram backup env vars and setup instructions"
```

---

## Self-Review

**Spec coverage:**
- §4.1 Meta app prerequisite → Task 10 Step 1 (external, documented not automated). ✓
- §4.2 Data model → Task 1. ✓
- §4.3 Storage (private bucket, signed URLs) → Task 1 (bucket), Task 3 (`getSignedMediaUrls`). ✓
- §4.4 OAuth connect flow → Task 6. ✓
- §4.5 Sync (pagination, dedup, refresh, carousel-cover-only) → Task 4 (Graph fetch), Task 5 (orchestration). ✓
- §4.6 Disconnect (keeps backed-up data) → Task 7 (`deleteConnection` only, `backed_up_media` untouched). ✓
- §4.7 Dashboard UI (not-connected/connected/error states, gallery persists post-disconnect) → Task 8, Task 9. ✓
- §5 Testing → Task 2 TDD tests (state signing, refresh timing) + Task 9 Step 4/5 full-suite run + Task 10 Steps 4–5 manual verification. ✓
- §3 Out-of-scope items (no paywall, no metrics history, no cron, no carousel children, no pagination, no proactive expiry warning) — no task builds any of these. ✓

**Testing convention deviation from the design spec:** the spec's §5 describes tests for `lib/instagramBackup.test.ts` and route-level tests for connect/callback/disconnect. Neither pattern exists anywhere in this codebase (confirmed via `vitest.config.ts`: `include: ["lib/**/*.test.ts"]`, and zero existing route or `lib/data/*` test files — same finding the prevention-checklist and breach-alert plans made). This plan follows the codebase's actual established convention instead: genuinely pure, security-relevant logic (state signing/verification, refresh timing) is extracted into `lib/instagramAuth.ts` and unit-tested (Task 2); the I/O-heavy adapter (`lib/instagramGraph.ts`), orchestration (`lib/instagramBackup.ts`), and routes are verified manually (Task 10), exactly like `lib/email/resend.ts` and `app/api/inbound-email/route.ts` are today.

**Env var convention deviation from the design spec:** the spec mentions adding `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` to `lib/env.ts`. That module's `getEnv()` function is not actually called anywhere in this codebase — every existing integration (Supabase, Resend, the inbound webhook) reads `process.env.X!` directly at its point of use instead, and documents the var in `README.md`. This plan follows that actual convention (Tasks 6–7 read `process.env.INSTAGRAM_APP_ID!`/`INSTAGRAM_APP_SECRET!` directly) rather than the unused `lib/env.ts` module.

**Placeholder scan:** every code step contains complete, runnable code; commands have expected output; no TBD/TODO. The only intentionally-blank values are the `.env.local.example` var names (Task 10), matching the existing file's own convention of blank values.

**Type consistency:** `InstagramConnection.igUsername`/`.lastSyncedAt`/`.tokenExpiresAt` (Task 3) match their usage in Task 5 (`connection.accessToken`, `connection.tokenExpiresAt`), Task 6 (none — callback writes via `upsertConnection`, doesn't read `InstagramConnection` back), and Task 9 (`instagramConnection?.igUsername`, `instagramConnection?.lastSyncedAt`). `BackedUpMedia.storagePath`/`.caption`/`.likeCount`/`.commentsCount` (Task 3) match the mapping to `BackupMediaItem` in Task 9 and the prop type declared in Task 8. `syncInstagramMedia`'s return shape (Task 5) matches its consumption in Task 6 (ignored via best-effort try/catch) and Task 7 (`result.ok`, `result.reason` passed straight through as JSON). `signState`/`verifyState` signatures (Task 2) match their call sites in Task 6 exactly (`secret` as second positional argument in both directions).
