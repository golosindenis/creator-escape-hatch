# Billing / Paid Tier — Design Spec

**Date:** 2026-07-13
**Status:** Approved (design), pending implementation plan

---

## 1. Problem

Every v1 feature from the original design spec (`docs/specs/2026-07-08-creator-escape-hatch-design.md`) has shipped, but the app is still fully ungated — there is no billing at all. Section 7 of that spec calls for a freemium model: free breach-alert + break-glass status page, with a paid tier unlocking backup and the owned-audience channel. Without billing, the product has no path to its revenue target ($40K MRR / ~2,100 paying creators). This spec covers closing that gap.

## 2. Constraints

- The founder does not currently have a registered company or trade license, which rules out a standard Stripe merchant account (Stripe requires representing a registered business in most jurisdictions).
- Solution: use a **merchant of record** (MoR) payment provider, which acts as the seller and lets individuals sell without business registration. **LemonSqueezy** is the choice — popular with solo/indie SaaS builders, simple subscription API, handles global VAT/sales tax as the reseller.
- **Yearly billing only** — no monthly plan, no trial period. A creator pays to unlock, immediately, no trial-abuse edge cases or expiry cron jobs to build.
- Currently only one real account exists (the founder's own, already carrying 949 synced Instagram posts and a tested capture page). The founder wants the ability to comp a handful of people free access later, once the product is further validated.

## 3. Scope

**Free forever:** breach alert setup, break-glass status page (matches the original spec's free tier exactly).

**Requires an active paid subscription:** Instagram content backup, and the owned-audience capture page (`/p/[slug]`, subscriber capture). This matches the original spec's paid-tier scope precisely.

**Comped access:** a `comped` boolean flag, set manually via direct Supabase DB/SQL editor access — no admin UI. Right-sized for "a handful of people," not a self-serve admin tool.

**Unpaid capture page behavior:** the public page at `/p/[slug]` continues to render normally (creator branding, copy, layout) even without an active subscription — it does **not** 404. The subscribe form is disabled with a quiet note instead of accepting emails. Rationale: this product's core value proposition is trust and business continuity; a dead public link (which may already be shared in a bio, or referenced from an active break-glass status page) undermines that trust at exactly the moment it matters most.

### Out of scope for this pass (deliberate simplifications, not oversights)

- **Cancellation grace period.** LemonSqueezy's subscription status flips to `cancelled` immediately on cancellation, even though the creator has technically paid through the end of the year. Standard SaaS practice keeps access alive until the paid period ends. This spec does **not** build that: any non-`active` LemonSqueezy status immediately revokes access. At current scale (single-digit users) this is a minor fairness gap, not a correctness bug, and is a one-line change later (compare `lemonsqueezy_renews_at` against now, instead of trusting status directly) if it starts to matter.
- Embedded billing portal (LemonSqueezy's hosted portal is linked to, not iframed).
- Payment-failure emails.
- Self-serve admin UI for comping users.
- Monthly billing option.

## 4. Data model

New migration `0005_billing.sql`, adding columns to the existing `pages` table (already the app's 1:1 account row — no new `subscriptions` table needed at this scale):

```sql
alter table pages add column subscription_status text not null default 'none'
  check (subscription_status in ('none', 'active', 'expired'));
alter table pages add column comped boolean not null default false;
alter table pages add column lemonsqueezy_customer_id text;
alter table pages add column lemonsqueezy_subscription_id text unique;
alter table pages add column lemonsqueezy_renews_at timestamptz;
```

`lemonsqueezy_renews_at` is not strictly required for gating logic but is cheap to store and lets the dashboard show a real "renews on [date]" line, consistent with the existing dashboard's philosophy of showing verifiable proof rather than bare state (see `docs/specs/2026-07-11-dashboard-trust-pass-design.md`).

### Gating helper

`lib/billing.ts`:

```ts
export function hasActiveAccess(page: { subscription_status: string; comped: boolean }) {
  return page.comped || page.subscription_status === 'active';
}
```

Every gate in the app calls this one function — no duplicated access logic anywhere.

## 5. Checkout flow

`app/api/billing/checkout/route.ts` (GET, authenticated via the existing `getSessionUser()` helper):

1. Loads the caller's `pages` row. 400 if none exists (shouldn't happen post-onboarding).
2. Calls LemonSqueezy's Checkout API to create a session for the yearly variant, attaching `checkout_data.custom_data = { page_id }`.
3. 307-redirects the browser to the returned hosted checkout URL.

The dashboard's "Upgrade" button is a plain link to this route — no client-side LemonSqueezy SDK needed.

## 6. Webhook flow

`app/api/billing/webhook/route.ts` (POST):

1. Reads the **raw** request body first (required for signature verification, before any JSON parsing).
2. Verifies the `X-Signature` header as HMAC-SHA256 against `LEMONSQUEEZY_WEBHOOK_SECRET`. Mismatch → 401, nothing processed, nothing written.
3. On a valid `subscription_created` / `subscription_updated` / `subscription_resumed` / `subscription_expired` event, reads `page_id` from `meta.custom_data`. LemonSqueezy persists `custom_data` on the subscription object for its whole lifecycle, so this resolves correctly for every event type, not just the first.
4. Overwrites that page's `subscription_status`, `lemonsqueezy_customer_id`, `lemonsqueezy_subscription_id`, and `lemonsqueezy_renews_at` from the payload (mapping any non-`active` LemonSqueezy status to `expired`, per §3's cancellation-timing simplification).
5. Unrecognized `page_id` (well-formed webhook, no matching row) → logged as a warning, still returns 200, so LemonSqueezy doesn't retry-storm a payload that will never resolve.

Because every handler write is an absolute overwrite (never an increment or append), duplicate webhook deliveries — which LemonSqueezy sends on any non-2xx response — are naturally idempotent. No separate processed-events table is needed.

## 7. Gating points

Every place that currently assumes free access gets a `hasActiveAccess(page)` check:

- **`app/api/instagram/connect/route.ts`** — 402 before starting OAuth if inactive.
- **`app/api/instagram/sync/route.ts`** — same check before syncing, covering the case where access lapses after a creator already connected.
- **Dashboard backup card** (`app/(dashboard)/dashboard/instagram-backup.tsx`) — if inactive, renders an "Upgrade to unlock backup" card linking to `/api/billing/checkout` instead of the connect/sync controls.
- **`app/p/[slug]/page.tsx`** — already fetches the `pages` row server-side for `break_glass_active` etc.; adds the same check and passes `hasActiveAccess` down as a prop.
- **`subscribe-form.tsx`** — when `hasActiveAccess` is false, renders disabled with a quiet note ("List capture is paused") instead of the email input.
- **The subscribe API route** the form posts to — rejects server-side with the same check. This is the real security boundary; the client-side disabled form is just the honest reflection of it, not a substitute for it.

## 8. Billing management UI

A "Billing" section on the dashboard shows `subscription_status`, `renews_at` (if active), a "Comped" badge (if `comped`), and a "Manage subscription" link. That link hits `app/api/billing/portal/route.ts`, which does a server-side GET to LemonSqueezy's subscription API and 307-redirects to the `customer_portal` URL in the response. LemonSqueezy hosts and builds that entire page — there is nothing to build beyond the redirect.

## 9. Configuration

New env vars, following the existing `.env.local` + Vercel env pattern used for Resend/Supabase: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_VARIANT_ID` (the yearly plan), `LEMONSQUEEZY_WEBHOOK_SECRET`.

These get folded into `lib/env.ts`'s existing `getEnv()` validator so missing config fails fast at startup — also closing a small pre-existing gap where the Instagram OAuth vars were never added to that validator.

## 10. Error handling

- Checkout requested for a user with no `pages` row → 400, no LemonSqueezy call made.
- LemonSqueezy API unreachable/erroring during checkout creation → dashboard shows a friendly "couldn't start checkout, try again" message, not a crash.
- Webhook with a bad signature → 401, logged, nothing written.
- Webhook referencing an unrecognized `page_id` → logged as a warning, 200 returned, no write.

## 11. Testing

- Unit tests for `hasActiveAccess()` covering all four combinations of `comped` / `subscription_status`.
- Webhook handler tests: valid signature + `subscription_created` updates the right `pages` row; invalid signature → 401 + no write; unknown `page_id` → 200 + no write.
- Gating tests: Instagram connect/sync return 402 when inactive; the subscribe route rejects POSTs when inactive.
- Manual end-to-end pass against LemonSqueezy's test mode (sandbox + test card) before going live: checkout → webhook fires → dashboard reflects unlocked backup/capture page → cancel → access revoked.
