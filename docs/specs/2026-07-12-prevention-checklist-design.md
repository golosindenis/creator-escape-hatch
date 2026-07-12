# Prevention Checklist — Design Spec

**Date:** 2026-07-12
**Status:** Approved

## 1. Problem

The dashboard's "Prevention checklist" card (added in the dashboard trust pass) is a static, inert placeholder — a "Coming soon" badge with no functionality. It maps to v1 design-spec item #5 (`docs/specs/2026-07-08-creator-escape-hatch-design.md`), which was left unbuilt pending one discovery input: the actual attack vector creators face, needed to make the checklist specific instead of generic security advice.

That input wasn't available from the primary interview, so it was sourced from current (2026) reporting on Instagram/Meta account-takeover patterns instead. The dominant vector by a wide margin is DM/email phishing impersonating Meta ("your account will be disabled," fake copyright-violation notices) — AI-generated phishing is now visually indistinguishable from real Meta communications. Other real vectors: malicious/over-privileged third-party apps retaining OAuth access after a password change, a compromised recovery email undermining 2FA, SMS-based 2FA/SIM-swap interception, and (a 2026-specific case) social-engineering Meta's own AI support bot into re-linking an account's email.

## 2. Goals

- Replace the static "Coming soon" card with a real, working checklist.
- Ground the content in actual attack patterns, not generic advice.
- Give creators a sense of visible progress ("insurance for my livelihood"), consistent with the dashboard trust pass's move toward proving the product does something, not just claiming it.

## 3. Out of scope

- No public-facing surface. Completion state is personal to the creator, shown only on the authenticated dashboard — not on the public `/p/[slug]` status page. A partially-completed checklist would effectively broadcast which accounts aren't fully secured; a public "fully protected" badge is a plausible fast-follow later, not part of this build.
- No gating — no feature unlocks or blocks based on checklist completion.
- No editable/custom items — the 5 items are fixed in code, not creator-configurable.
- The other still-open v1 item (content/metrics backup) is untouched; its own "Coming soon" card stays as-is.

## 4. Design

### 4.1 Data model

Migration `0003_prevention_checklist.sql` adds one column to the existing `pages` table:

```sql
alter table pages add column checklist_completed text[] not null default '{}';
```

Stores the array of completed item keys. No new table — follows the same shape as `break_glass_active`/`secondary_email`, both single columns on `pages` mutated by dedicated setter functions.

### 4.2 Checklist items (fixed)

Defined as a const array in code (`lib/checklist.ts` or similar), each with a stable key and label:

1. `secure_recovery_email` — Secure your recovery email with 2FA
2. `authenticator_app_2fa` — Switch Instagram 2FA to an authenticator app, not SMS
3. `review_connected_apps` — Review connected apps and remove anything you don't recognize
4. `save_recovery_info` — Save your account recovery info somewhere safe outside Instagram
5. `recognize_phishing_pattern` — Know the pattern: Meta never asks you to "log in to appeal" via a DM or email link

This same const is the single source of truth for rendering (frontend) and validation (backend rejects unknown keys).

### 4.3 Backend

`lib/data/pages.ts`:
- `Page` type gains `checklistCompleted: string[]`.
- `toPage` mapping reads `checklist_completed` (defaulting to `[]` if null).
- New `setChecklistCompleted(pageId: string, completed: string[]): Promise<void>`, matching the shape of `setSecondaryEmail`/`setBreakGlass`.

New route `app/api/pages/checklist/route.ts`, following the existing route pattern (`app/api/pages/secondary-email/route.ts`):
- `POST`, body `{ completed: string[] }` validated with Zod — every entry must be one of the known item keys (`z.enum` over the const's keys, wrapped in `z.array(...)`); unknown keys reject with 400.
- Auth-gated via `getSessionUser()`, 401 if absent.
- Looks up the page by `owner`, 404 if none.
- Calls `setChecklistCompleted`, returns `{ ok: true }`.

### 4.4 Frontend

New client component `app/(dashboard)/dashboard/prevention-checklist.tsx`, matching the shape of `SecondaryEmailForm`/`BreakGlassButton`:
- Props: `initialCompleted: string[]`.
- Renders the 5 items as labeled checkboxes, checked state seeded from `initialCompleted`.
- On toggle: updates local state optimistically, then `POST`s the full updated array to `/api/pages/checklist`.

`app/(dashboard)/dashboard/page.tsx`: the existing dashed, `opacity-60`, "Coming soon"-badged Prevention checklist `Card` is replaced with a live `Card` rendering `<PreventionChecklist initialCompleted={data.checklistCompleted} />`. The Content & metrics backup card is unchanged.

## 5. Data flow

`Dashboard` (`app/(dashboard)/dashboard/page.tsx`) already loads `data` (the raw page row) directly via `serviceClient()`, and reads fields like `data.break_glass_active` straight off it rather than through `lib/data/pages.ts`'s `toPage` mapping. The checklist follows the same convention: the page component reads `data.checklist_completed` directly off the same row. No additional queries. The `lib/data/pages.ts` changes (`Page` type, `toPage`, `setChecklistCompleted`) exist for the API route and for consistency with the other setter functions, not because the dashboard page itself goes through them for reads.

## 6. Testing

- Data-layer test for `setChecklistCompleted` and the `checklistCompleted` mapping, alongside the existing `lib/data` tests.
- Route-level test asserting unknown item keys are rejected with 400, and a valid subset/full array is accepted and persisted.
- Existing test suite must continue passing unchanged (additive change, no removed behavior).
- Manual verification in browser: checklist renders with correct initial state, toggling a checkbox persists across a page reload, unrelated cards (status strip, breach alerts, backup placeholder) are unaffected.

## 7. Rollout

Same pattern as prior slices: subagent-driven development in an isolated worktree, final whole-branch review, merge to `main` locally, deploy to `accountguard.app` with explicit go-ahead.
