# Breach Alert — Slice 2 Design Spec

**Date:** 2026-07-09
**Status:** Approved
**Depends on:** Slice 1 (Lifeline) — pages, auth, break-glass, Resend outbound.

---

## 1. Problem

Per the v1 design spec (§4, item 4), the instant breach alert is the growth hook: Meta/Instagram give no
API for "someone logged in from a new device," but they do send the creator's own account a security
email when a login or password change happens. If the creator forwards those emails to an address we
control, we can read Meta's own warning and alert the creator faster than they'd otherwise notice —
before they're fully locked out — and point them at the break-glass flow already built in Slice 1.

This is a hook feature: free tier, drives the "I got hacked, but I had this set up" story that fuels the
viral loop. It is not the retained value (owned audience + backup are), so it should be cheap to build
and safe to fail open.

## 2. Scope

**In scope:**
- A unique, per-page forwarding address the creator sets as their Instagram security-email forward target.
- An inbound webhook that receives forwarded mail via Resend, classifies it as a Meta security event
  (new login / password changed) using sender + subject/body pattern rules, and records it.
- A notification email to a creator-registered **secondary email address** (not the at-risk account)
  linking back to the dashboard, where break-glass is one click away.
- Dashboard UI to set the secondary email and see forwarding setup instructions.

**Out of scope (YAGNI for this slice):**
- SMS/push alerting — no infra exists yet; email-to-secondary-address is the v1 channel.
- One-click break-glass activation from the alert email itself (auth-bypass token flow) — real scope
  for a security-sensitive shortcut; the dashboard link is fast enough for v1.
- LLM-based classification — deterministic keyword/pattern rules are enough for the two known Meta
  email types and are free, fast, and unit-testable. Revisit if Meta's format drifts enough to matter.
- Retry/backoff or alerting on classifier misses — an unmatched or malformed forwarded email is silently
  ignored (ack + log), not treated as an error. This is a known, documented limitation, not a bug.
- Rate limiting / deduplication of repeat alerts for the same event — not needed for v1 volume.

## 3. Architecture

Meta → creator's Instagram inbox → creator-configured auto-forward rule → Resend inbound domain →
`POST /api/inbound-email` → classify → record `breach_alerts` row → send notice to `secondary_email`
via the existing Resend outbound adapter.

The forwarding address is derived deterministically from the page ID (`alerts+<pageId>@yourdomain.com`),
not a separately generated token — forwarding rules are configured by the creator themselves and aren't
a secret, so there's no unguessability requirement to engineer for.

## 4. Components

- **`lib/breachAlert.ts`** (pure, unit-tested)
  - `classifyAlert(input: { from: string; subject: string; body: string }): { type: "new_login" | "password_changed" } | null`
    — matches known Meta sender domains and subject/body keyword patterns. Returns `null` for anything
    that doesn't match (including non-Meta forwarded mail).
  - `composeAlertNotice(input: { creatorName: string; alertType: "new_login" | "password_changed"; dashboardUrl: string }): { subject: string; body: string }`
    — plain notification text, links to the dashboard, makes no promises about account recovery
    (same resilience-not-recovery constraint as Slice 1's break-glass copy), contains no auth-bypass token.

- **`supabase/migrations/0002_breach_alerts.sql`**
  - `alter table pages add column secondary_email text;` (nullable — alerts are inert until set).
  - `create table breach_alerts (id uuid pk, page_id uuid → pages, alert_type text, created_at timestamptz)`.
  - RLS: owners read their own alerts (same pattern as `subscribers`/`break_glass_events`).

- **`lib/data/pages.ts`** — add `setSecondaryEmail(pageId: string, email: string): Promise<void>`.

- **`lib/data/breachAlerts.ts`** — add `recordBreachAlert(pageId: string, alertType: string): Promise<void>`.

- **`app/api/inbound-email/route.ts`**
  - Parses Resend's inbound webhook payload (`from`, `to`, `subject`, `text`/`html` body).
  - Extracts `pageId` from the `alerts+<pageId>@...` recipient address; looks up the page.
  - If page not found, or `classifyAlert` returns `null`: respond `200` (ack, no retry), no side effects.
  - If matched: `recordBreachAlert`, then — if the page has a `secondary_email` set — send the notice
    via the existing `sendBroadcast`-style Resend outbound path (reused, not duplicated).

- **Dashboard** (`app/(dashboard)/dashboard/`)
  - Form to set/update `secondary_email` (reuses `isValidEmail`/`normalizeEmail` from Slice 1).
  - Static instructions block showing the creator their forwarding address and where to paste it in
    Instagram's security-email settings.

## 5. Data flow

1. Creator sets `secondary_email` and configures the Instagram forward rule to `alerts+<pageId>@yourdomain.com`.
2. Meta sends a security email to the creator's Instagram-linked inbox; it auto-forwards to us.
3. Resend inbound receives it, POSTs to `/api/inbound-email`.
4. We extract `pageId`, look up the page, classify the email.
5. On a match: log `breach_alerts` row, email the notice to `secondary_email` (if set) linking to `/dashboard`.
6. Creator opens the dashboard, sees the alert, and activates break-glass (Slice 1 flow) if warranted.

## 6. Error handling

- Malformed inbound payload → `200`, log, no side effects. Webhooks must not retry-storm us over
  formatting differences we can't control.
- Unknown `pageId` (page deleted, address typo'd) → `200`, log, silently ignored. Do not leak whether
  a page exists via response codes/timing.
- `classifyAlert` returns `null` (doesn't match known patterns) → `200`, log, no alert. This is the
  expected behavior for the bulk of non-security forwarded mail, not an error path.
- Missing `secondary_email` on an otherwise-matched page → still record the `breach_alerts` row (so the
  creator can see it on the dashboard later), just skip sending the notice email.

## 7. Testing

- Unit tests for `classifyAlert`: positive cases (representative Meta "new login" and "password changed"
  sample emails), negative cases (unrelated forwarded mail, empty/malformed input).
- Unit tests for `composeAlertNotice`: dashboard link present, no recovery promises (reuse the
  resilience-not-recovery assertion pattern from Slice 1's `breakGlass.test.ts`), no auth tokens in body.
- Manual verification: configure a page's forwarding address in a real (or sandboxed) Instagram account,
  trigger a real Meta security email, confirm a `breach_alerts` row appears and the secondary email
  receives the notice.

## 8. Self-review

- **Placeholder scan:** no TBD/TODO; `yourdomain.com` is a placeholder for the real inbound domain,
  same treatment as Slice 1's Resend sender placeholder — resolved at deploy time.
- **Internal consistency:** `Page` type gains `secondaryEmail` consistently across `lib/data/pages.ts`
  and the dashboard form; `breach_alerts.alert_type` matches `classifyAlert`'s return union.
- **Scope check:** single implementation plan's worth of work — one migration, one pure module, one
  webhook route, one dashboard form addition. Not decomposed further.
- **Constraint carry-over:** resilience-not-recovery and no-platform-credentials constraints from the
  v1 design spec both still apply and are enforced the same way as Slice 1 (copy + unit test).
