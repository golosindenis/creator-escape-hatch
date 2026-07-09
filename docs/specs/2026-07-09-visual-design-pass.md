# Visual Design Pass — Design Spec

**Date:** 2026-07-09
**Status:** Approved
**Depends on:** Slice 1 (Lifeline), Slice 2 (Breach Alert) — no behavior changes, styling only.

---

## 1. Problem

The app is functionally complete through Slice 2 but has zero visual identity: every screen (`/`, `/login`,
`/dashboard`, `/p/[slug]`) still uses create-next-app's default black/white theme and bare Tailwind
utility classes. The root route `/` is still the unedited Next.js starter template. The product now has a
real domain (`accountguard.app`) and is live in production, so it needs to look like a real product
before more users touch it.

## 2. Scope

**In scope:**
- A dark, security-toned visual identity (navy/near-black surfaces, teal accent, red reserved for
  break-glass/danger actions only), expressed as CSS variables in `app/globals.css`.
- A small set of shared UI primitives (`Shell`, `Card`, `Button`, `Badge`) in `components/ui/`.
- Restyling all four existing surfaces to use the new tokens/primitives: `/login`, `/dashboard` (and its
  three client components), `/p/[slug]` (and `subscribe-form`).
- A real homepage at `/`, replacing the Next.js starter: shield mark + wordmark, headline focused on
  audience ownership / break-glass backup (not breach alerts — that's a supporting feature), one primary
  CTA to `/login`, a brief 3-point value list. No pricing or testimonials (none exist yet).
- `lucide-react` as a new dependency for iconography (shield logo mark, bell for alerts, a handful of
  small UI icons).

**Out of scope (YAGNI for this pass):**
- Any behavior, data model, route, or auth change. This is markup/CSS only.
- Multi-tenant/platform support (one account managing multiple creator pages) — explicitly deferred;
  raised and declined during brainstorming. The data model stays one-page-per-account.
- A component library (shadcn/ui or similar) — evaluated and declined; the app is 4 pages / ~6 shared
  components, too small to justify the setup and dependency surface.
- Light-mode-specific design work — the app defaults to the dark theme; `prefers-color-scheme: light`
  just needs to not visually break (existing token fallback), not be separately designed.
- Marketing content beyond the homepage (pricing tiers, case studies, docs) — no such content exists to
  design around yet.

## 3. Architecture

Pure presentation-layer change. No new routes, no new API calls, no new database access. Existing pages
keep their current data-fetching (server components already call `getPageById`, `getSessionUser`,
`listBreachAlerts`, etc.) — only the JSX/className output changes, plus new shared components imported
into that JSX.

## 4. Components

- **`app/globals.css`** — replace the default `--background`/`--foreground` pair with a CDS-inspired
  semantic token layer (own variables, not an external package — see design discussion):
  - `--surface-0/1/2` — page background → card → elevated panel, dark near-black scale.
  - `--text-primary/secondary/muted`
  - `--border`, `--border-strong`
  - `--accent` (teal) — links, secondary actions, badges.
  - `--danger` (red) — break-glass button only. Not used decoratively elsewhere.
  - Dark theme is the default look (not gated behind `prefers-color-scheme: dark`); the existing
    `@media (prefers-color-scheme: dark)` block is removed since there's only one theme.

- **`components/ui/Shell.tsx`** — page wrapper: max-width, consistent padding/vertical rhythm. Replaces
  the repeated `mx-auto max-w-{sm,md} p-8` pattern across every page.

- **`components/ui/Card.tsx`** — raised-surface container (`--surface-1` bg, `--border`, rounded corners).
  Used for dashboard sections and the public page content block.

- **`components/ui/Button.tsx`** — variants `primary` (teal), `danger` (red, break-glass only), `ghost`
  (form submit buttons, secondary actions). Replaces ad hoc `rounded bg-black p-2 text-white` classes.

- **`components/ui/Badge.tsx`** — small pill for alert-type labels ("New login", "Password changed").

- **Page updates** (styling only, no logic changes):
  - `app/page.tsx` — new homepage content (see scope above), replacing the create-next-app starter.
  - `app/(auth)/login/page.tsx` — centered `Card` inside `Shell`, shield mark, restyled form.
  - `app/(dashboard)/dashboard/page.tsx` and its three client components
    (`break-glass-button.tsx`, `secondary-email-form.tsx`, `create-page-form.tsx`) — restructured into
    `Card`-based sections (page status/link, break-glass control, breach-alert setup + alert history).
  - `app/p/[slug]/page.tsx` and `subscribe-form.tsx` — `Card`-based layout; break-glass-active state
    uses `--danger` prominently to signal urgency, normal state stays calm/teal.

## 5. Data flow

No change — this pass touches presentation only. Existing server components still fetch the same data
(`getPageById`, `getSessionUser`, `listBreachAlerts`, `getPageBySlug`, `pageState`) and pass it into the
same client components, which now render with the new primitives instead of raw Tailwind classes.

## 6. Error handling

No change — no new failure modes are introduced. Existing error states (invalid email, taken slug, send
failures) keep their current logic and get restyled with the same `Button`/`Card` primitives (e.g. error
text uses `--danger` color token instead of the hardcoded `text-red-600`).

## 7. Testing

- No new unit tests needed — no new logic, pure rendering change. Existing suite
  (`slug.test.ts`, `breakGlass.test.ts`, `email.test.ts`, `breachAlert.test.ts`) must continue passing
  unchanged, confirming no logic regression.
- `tsc --noEmit` and `npm run lint` clean on all touched files.
- Manual verification via local dev server: visually check all four surfaces
  (`/`, `/login`, `/dashboard`, `/p/[slug]`) in the browser, confirm break-glass active/inactive states
  render correctly, confirm the alert history list and badges render with real data.
- Deploy to production (`vercel --prod`) only after local verification and explicit user go-ahead.

## 8. Self-review

- **Placeholder scan:** no TBD/TODO. Homepage copy will be written directly (not placeholder lorem ipsum)
  during implementation, following the break-glass/audience-backup pitch agreed in brainstorming.
- **Internal consistency:** `--danger` is used in exactly one interactive place (break-glass button) and
  one conditional place (public page when break-glass is active) — matches the "red reserved for
  danger only" principle agreed during design.
- **Scope check:** single implementation plan's worth of work — one token file, four small shared
  components, five page/component restyles, one new dependency. Not decomposed further.
- **Constraint carry-over:** no behavior/data changes, so Slice 1/2's resilience-not-recovery and
  no-platform-credentials constraints are unaffected (copy is preserved, only visual treatment changes).
