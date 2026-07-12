# Content & Metrics Backup (Instagram OAuth) — Design Spec

**Date:** 2026-07-12
**Status:** Approved

## 1. Problem

The dashboard's "Content & metrics backup" card (`app/(dashboard)/dashboard/page.tsx:86-92`) is a static, inert "Coming soon" placeholder. It maps to v1 design-spec item #3 (`docs/specs/2026-07-08-creator-escape-hatch-design.md` §4/§6): auto-archiving a creator's posts and growth history via Instagram's official Graph API, so that if an account is lost, the creator doesn't lose their content with it.

This is the last open item from the v1 design spec — breach alerts (Slice 2) and the prevention checklist have both shipped. It was deferred longest because it's the heaviest lift: it requires registering a Meta Developer app and (eventually) passing Meta's App Review before creators other than the founder can connect their accounts.

## 2. Goals

- Let a creator connect their Instagram professional account via OAuth.
- Back up their media (images/videos, captions, like/comment counts) into storage the founder controls, not dependent on Instagram continuing to serve it.
- Let the creator browse what's been backed up from the dashboard.
- Ship something fully testable end-to-end using the founder's own Instagram account in Meta's Development mode, without waiting on App Review.

## 3. Out of scope (this slice)

- **Billing/paywall.** The v1 spec frames backup as a paid-tier feature, but no billing system exists in this codebase yet and there are no paying users. Building Stripe/a subscription gate is separate future scope — backup ships fully ungated, same access model as breach alerts and the checklist.
- **Growth/metrics history** (follower count, reach over time via the Insights API). Scoped down to media backup only; metrics is a real fast-follow, not silently dropped.
- **Automatic recurring sync.** No scheduled-job infrastructure exists in this repo (breach alerts are webhook-driven, not polled). This slice is connect + manual "Sync now" only. Cron-based daily sync is a fast-follow once this is proven out.
- **Carousel child media.** Carousel album posts back up their cover media only; each child image/video requires a separate Graph API `children` edge fetch per item, deferred to keep sync logic simple.
- **Gallery pagination.** The dashboard shows a capped set of the most recent backed-up posts; "load more" / full pagination is deferred.
- **Proactive token-expiry warnings.** Long-lived tokens are refreshed opportunistically during a sync if within 7 days of expiry. A UI warning shown ahead of expiry (independent of the creator triggering a sync) is deferred.
- **Meta App Review submission.** This is a manual, non-code step the founder does outside this pipeline (see §4.1).

## 4. Design

### 4.1 Meta app prerequisite (external, not built here)

Requires a Meta Developer app with Instagram API via Instagram Login (`instagram_business_basic` scope) — the newer direct-to-Instagram OAuth that does **not** require the creator to have a linked Facebook Page, unlike the legacy Facebook Login for Business flow. Redirect URI: `https://accountguard.app/api/instagram/callback`.

In Meta's **Development mode**, only the app's own registered testers (the founder's Instagram professional account) can complete OAuth — sufficient to build and verify this slice fully end-to-end. **App Review** (required before other creators can connect) is a manual follow-up the founder handles separately; this slice's code does not depend on it being complete.

New required env vars (`lib/env.ts`): `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`. Reuses existing `NEXT_PUBLIC_APP_URL` to build the redirect URI.

### 4.2 Data model

Two new tables, following the existing `breach_alerts`/`subscribers` pattern — owner-scoped access enforced via RLS through a join on `pages`:

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
  media_type text not null,        -- IMAGE | VIDEO | CAROUSEL_ALBUM
  caption text,
  like_count int,
  comments_count int,
  permalink text,
  storage_path text not null,      -- object path in the instagram-backups Storage bucket
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
```

One connection per page (`unique` on `page_id`) — one Instagram account per creator page, matching how the rest of the schema is modeled. `access_token` is stored in plaintext, protected by RLS and accessed server-side only via `serviceClient()` — the same convention already used for `secondary_email`. No new encryption layer: none exists elsewhere in this codebase, and this is an OAuth token issued by Meta, not a creator-supplied password (the v1 spec's "no credentials stored" hard rule is specifically about not storing Instagram *passwords*).

### 4.3 Storage

New **private** Supabase Storage bucket `instagram-backups`, objects keyed `{page_id}/{ig_media_id}`. Not public — this is a creator's personal content backup, not meant to be publicly listable like the `/p/[slug]` status page. The dashboard gallery renders images via short-lived signed URLs generated server-side at page-render time, not direct public URLs.

### 4.4 OAuth connect flow

`app/api/instagram/connect/route.ts` — `GET`, auth-gated via `getSessionUser()`. Builds a signed `state` value tied to the caller's page id (CSRF protection), redirects to `https://www.instagram.com/oauth/authorize` with `client_id`, `redirect_uri`, `scope=instagram_business_basic`, `response_type=code`, `state`.

`app/api/instagram/callback/route.ts` — `GET`. Validates `state` matches a page the caller owns. Exchanges `code` for a short-lived token, exchanges that for a long-lived (60-day) token, calls the Graph API to fetch `ig_user_id`/`username`, upserts the `instagram_connections` row for that page. Triggers an immediate first sync (§4.5) before redirecting. On any failure (user denied, invalid/missing state, exchange error) redirects to `/dashboard?instagram_error=1` instead of throwing.

### 4.5 Sync

`lib/instagramBackup.ts` exports `syncInstagramMedia(pageId: string): Promise<{ synced: number; total: number }>`, invoked by both the callback (first sync) and `app/api/instagram/sync/route.ts` (`POST`, the "Sync now" button):

1. Load the page's `instagram_connections` row. If `token_expires_at` is within 7 days, call the Graph API's refresh endpoint first and persist the new token/expiry.
2. `GET /{ig-user-id}/media?fields=id,caption,media_type,media_url,permalink,like_count,comments_count,timestamp`, following pagination.
3. For each item whose `ig_media_id` isn't already in `backed_up_media` for this page: download the `media_url` binary, upload it to `instagram-backups/{page_id}/{ig_media_id}`, insert the row (caption, counts, permalink, `posted_at` from `timestamp`).
4. Update `last_synced_at` on the connection.

Returns a summary used by the UI to show "Synced N new posts." Sync failures (expired/revoked token, Graph API error, rate limit) are caught and surfaced as a structured error, not thrown — a failed sync leaves existing backed-up data untouched.

### 4.6 Disconnect

`app/api/instagram/disconnect/route.ts` — `POST`, deletes the `instagram_connections` row only. Rows in `backed_up_media` and their Storage objects are kept — disconnecting revokes future sync access, it doesn't destroy an existing backup.

### 4.7 Dashboard UI

Replaces the "Coming soon" card at `app/(dashboard)/dashboard/page.tsx:86-92` with a new `InstagramBackup` client component (`app/(dashboard)/dashboard/instagram-backup.tsx`), following the shape of `PreventionChecklist`/`SecondaryEmailForm`:

- **Not connected:** "Connect Instagram" button linking to `/api/instagram/connect`. If `backed_up_media` rows already exist for the page (a prior connection was disconnected), the gallery grid still renders below the button — disconnecting doesn't hide the existing backup.
- **Connected:** username, "Last synced: {relative time}", "{N} posts backed up", a "Sync now" button (calls the sync route, shows a loading/result state), a "Disconnect" link, and the same media gallery grid — thumbnail (via signed URL), truncated caption, like/comment counts, capped to the most recent items.
- **Error state:** inline message when `?instagram_error=1` is present, or when a sync call returns an error — no crash, no silent failure.

## 5. Testing

- `lib/instagramBackup.test.ts` — sync logic: skips already-backed-up media (dedup by `ig_media_id`), refreshes token when near expiry, surfaces sync errors as structured results rather than throwing.
- Route-level tests: `connect` redirects with a valid signed state; `callback` rejects invalid/missing state and handles denial gracefully; `disconnect` removes the connection but not `backed_up_media` rows.
- Data-layer tests for any new `lib/data/` functions, alongside the existing `lib/data` test pattern.
- Existing test suite must continue passing unchanged (additive change, no removed behavior).
- Manual verification in browser using the founder's own Instagram test account (Development mode): connect flow completes, first sync backs up real media, gallery renders thumbnails via signed URLs, "Sync now" is idempotent (no duplicate rows on a second run), and after disconnect the card reverts to "Connect Instagram" while the gallery still shows previously-backed-up media below it — consistent with §4.6, the backup persists even without an active connection.

## 6. Rollout

Same pattern as prior slices: subagent-driven development in an isolated worktree, final whole-branch review, merge to `main` locally. Deploy to `accountguard.app` with explicit go-ahead. Before this is genuinely useful to creators other than the founder, Meta App Review must be submitted and approved separately — flagged clearly to the founder as a manual next step, not blocking this slice's completion.
