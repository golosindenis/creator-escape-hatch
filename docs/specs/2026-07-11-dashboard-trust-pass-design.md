# Dashboard Trust Pass — Design Spec

**Date:** 2026-07-11
**Status:** Approved

## 1. Problem

After the visual design pass (2026-07-09) restyled the dashboard with the new dark theme, live testing surfaced a product gap, not a styling one: the dashboard reads as untrustworthy. It's two bare configuration cards with no header, no account menu, no way to log out, no explanation of what the product does, and no proof that anything is actually working. It also only surfaces 2 of the 5 features in the v1 design spec (`docs/specs/2026-07-08-creator-escape-hatch-design.md`) — the other three (owned-audience capture is live but not visible here, content/metrics backup, prevention checklist) are invisible, making the product feel smaller than it is.

## 2. Goals

- Make the dashboard feel like a logged-in app, not a lone settings form.
- Prove the setup is actually live, using real data already in the database (no fake stats).
- Make the fuller product roadmap visible, even for unbuilt features.
- Fix a pre-existing gap: there is currently no sign-out anywhere in the app.

## 3. Out of scope

- No new backend features (content backup, prevention checklist) — those stay unbuilt; only their presence is surfaced.
- No multi-page navigation / sidebar — the app stays single-page per the existing scope decision (visual-design-pass spec, §"Scope decisions").
- No settings page — "Log out" is the only header menu action for now; no dead-end links.

## 4. Design

### 4.1 Shared `Wordmark` primitive

Extract the shield-icon + "AccountGuard" text block (currently duplicated across login, dashboard, homepage — flagged as a fast-follow in the visual-design-pass review) into `components/ui/Wordmark.tsx`:

```tsx
function Wordmark({ size = 24 }: { size?: number }) { ... }
```

Login, dashboard, and homepage all switch to using it, at their current respective sizes.

### 4.2 `DashboardHeader`

New dashboard-only component, `app/(dashboard)/dashboard/dashboard-header.tsx`:

- Left: `<Wordmark />`
- Right: the signed-in user's email (small, muted text) + a "Log out" `Button` (ghost variant)
- Styled as a header bar: bottom border (`border-b border-border`), horizontal padding matching the `Shell`, sits above the page content (not inside a `Card`)

Renders in **both** dashboard states — the existing "create your page" empty state currently has no header at all; this fixes that too.

Logout is a small client component: calls `browserClient().auth.signOut()`, then `router.push("/login")`.

`getSessionUser()` (`lib/auth.ts`) is extended to also return `email`, since the header needs it and today it only returns `{ id }`.

### 4.3 Intro line + status strip

Directly under the header, before the existing cards:

- One-line tagline: "Your escape hatch if Instagram goes down."
- A compact status strip (plain text row, `text-sm text-secondary`, `·` separators), built from real data already in the `pages`/`subscribers` tables:
  - Protection state: 🟢 "Protection active" normally, or 🔴 "Break-glass active — subscribers alerted" when `data.break_glass_active` is true
  - Subscriber count: "{N} subscribers" via the existing `listSubscriberEmails(pageId).length`
  - Secondary alert state: "Secondary alerts: on" / "Secondary alerts: off" based on whether `data.secondary_email` is set

No new data model — everything here is already stored.

### 4.4 "Coming soon" feature cards

Two additional `Card`s appended after the existing "Breach alerts" card, visually muted (`opacity-60` or muted border/text) and non-interactive:

- **Content & metrics backup** — "Auto-archive your posts and growth history." + a muted `Badge`: "Coming soon"
- **Prevention checklist** — "Harden your account before anything happens." + a muted `Badge`: "Coming soon"

These map to v1 design-spec items #3 and #5. Purely presentational — no functionality, no links, no forms.

## 5. Data flow

No new tables or migrations. `Dashboard` (`app/(dashboard)/dashboard/page.tsx`) already loads `data` (the page row) and now also loads subscriber count via the existing `listSubscriberEmails`. `getSessionUser()` gains `email` on its return type; the one caller (`Dashboard`) passes it to `DashboardHeader`.

## 6. Testing

- Existing 25-test suite must continue passing unchanged (pure additive change, no behavior removed).
- Manual verification in browser: header renders with correct email + working logout, in both the "no page yet" and "page exists" dashboard states; status strip reflects real break-glass/subscriber/secondary-email state; coming-soon cards render but are inert.

## 7. Rollout

Same pattern as prior slices: subagent-driven development in an isolated worktree, final whole-branch review, merge to `main` locally, deploy to `accountguard.app` with explicit go-ahead.
