# Prevention Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's static, inert "Prevention checklist" card with a real, working checklist of 5 account-hardening items the creator can check off, with progress saved per-account.

**Architecture:** One new pure module (`lib/checklist.ts`) holds the fixed item list and validation logic — this is the single source of truth used by both the frontend (rendering) and backend (input validation), and the only new code covered by unit tests, matching this codebase's existing convention (`vitest.config.ts` only runs `lib/**/*.test.ts`; no route or component tests exist anywhere in the repo). One migration adds a `text[]` column to the existing `pages` table. `lib/data/pages.ts` gains a setter following the exact shape of `setSecondaryEmail`/`setBreakGlass`. One new API route and one new client component follow the exact shape of the existing secondary-email route/form. No new tables, no new dependencies.

**Tech Stack:** Next.js 15 App Router, React Server Components + one client component, Supabase (`@supabase/ssr`, service-role client), Zod v4, Tailwind CSS (existing design-token classes), Vitest for unit tests.

## Global Constraints

- No public-facing surface — completion state is dashboard-only, never shown on `/p/[slug]` (spec §3).
- No gating — no feature unlocks based on completion (spec §3).
- The 5 checklist items are fixed in code, not creator-configurable (spec §3).
- The "Content & metrics backup" coming-soon card is untouched (spec §3).
- Existing test suite must continue passing unchanged; new automated tests are added only for the new pure module in `lib/checklist.ts`, per the codebase's established testing convention (confirmed via `vitest.config.ts`: `include: ["lib/**/*.test.ts"]`, and the absence of any `lib/data/*.test.ts` or route test anywhere in the repo — those layers are verified manually, same as `setSecondaryEmail`/`setBreakGlass` and the existing API routes today).

---

## File Structure

- Create: `supabase/migrations/0003_prevention_checklist.sql` — adds `pages.checklist_completed`.
- Create: `lib/checklist.ts` — pure: the fixed 5-item list + key validation.
- Create: `lib/checklist.test.ts` — unit tests for the above.
- Modify: `lib/data/pages.ts` — add `checklistCompleted` to `Page`/`Row`/`toPage`, add `setChecklistCompleted`.
- Create: `app/api/pages/checklist/route.ts` — POST endpoint to persist the caller's checklist progress.
- Create: `app/(dashboard)/dashboard/prevention-checklist.tsx` — client component rendering the checklist.
- Modify: `app/(dashboard)/dashboard/page.tsx` — replace the static "Coming soon" Prevention checklist card with the live component.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0003_prevention_checklist.sql`

**Interfaces:**
- Produces: `pages.checklist_completed` (`text[]`, not null, default `'{}'`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_prevention_checklist.sql`:

```sql
alter table pages add column checklist_completed text[] not null default '{}';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applies; `pages.checklist_completed` exists.

- [ ] **Step 3: Verify**

Run: `npx supabase db diff`
Expected: no pending diff.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_prevention_checklist.sql && git commit -m "feat: add checklist_completed column to pages"
```

---

### Task 2: Checklist items + validation (pure, TDD)

**Files:**
- Create: `lib/checklist.ts`
- Test: `lib/checklist.test.ts`

**Interfaces:**
- Produces:
  - `type ChecklistItem = { key: string; label: string }`
  - `CHECKLIST_ITEMS: ChecklistItem[]` — the fixed 5 items, in display order.
  - `isValidChecklistKey(key: string): boolean`
  - `isValidChecklistCompleted(completed: string[]): boolean` — true iff every entry is a valid key (including for an empty array).

- [ ] **Step 1: Write the failing tests**

Create `lib/checklist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CHECKLIST_ITEMS, isValidChecklistKey, isValidChecklistCompleted } from "@/lib/checklist";

describe("CHECKLIST_ITEMS", () => {
  it("has 5 items with unique keys", () => {
    expect(CHECKLIST_ITEMS).toHaveLength(5);
    const keys = CHECKLIST_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isValidChecklistKey", () => {
  it("returns true for a real item key", () => {
    expect(isValidChecklistKey("secure_recovery_email")).toBe(true);
  });
  it("returns false for an unknown key", () => {
    expect(isValidChecklistKey("not_a_real_key")).toBe(false);
  });
});

describe("isValidChecklistCompleted", () => {
  it("returns true for an empty array", () => {
    expect(isValidChecklistCompleted([])).toBe(true);
  });
  it("returns true when every key is valid", () => {
    expect(isValidChecklistCompleted(["secure_recovery_email", "authenticator_app_2fa"])).toBe(true);
  });
  it("returns false when any key is invalid", () => {
    expect(isValidChecklistCompleted(["secure_recovery_email", "bogus"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checklist.test.ts`
Expected: FAIL with "Cannot find module '@/lib/checklist'" (or similar — the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/checklist.ts`:

```ts
export type ChecklistItem = { key: string; label: string };

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "secure_recovery_email", label: "Secure your recovery email with 2FA" },
  { key: "authenticator_app_2fa", label: "Switch Instagram 2FA to an authenticator app, not SMS" },
  { key: "review_connected_apps", label: "Review connected apps and remove anything you don't recognize" },
  { key: "save_recovery_info", label: "Save your account recovery info somewhere safe outside Instagram" },
  {
    key: "recognize_phishing_pattern",
    label: 'Know the pattern: Meta never asks you to "log in to appeal" via a DM or email link',
  },
];

const VALID_KEYS = new Set(CHECKLIST_ITEMS.map((item) => item.key));

export function isValidChecklistKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

export function isValidChecklistCompleted(completed: string[]): boolean {
  return completed.every(isValidChecklistKey);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checklist.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/checklist.ts lib/checklist.test.ts && git commit -m "feat: add prevention checklist items and validation"
```

---

### Task 3: Data layer — `setChecklistCompleted`

**Files:**
- Modify: `lib/data/pages.ts`

**Interfaces:**
- Consumes: `serviceClient()` from `@/lib/supabase/server` (already imported in this file).
- Produces: `setChecklistCompleted(pageId: string, completed: string[]): Promise<void>`. `Page` type gains `checklistCompleted: string[]`.

- [ ] **Step 1: Add `checklistCompleted` to the `Page` type and `Row` type**

In `lib/data/pages.ts`, change:

```ts
export type Page = {
  id: string;
  slug: string;
  creatorName: string;
  realHandle: string;
  breakGlassActive: boolean;
  secondaryEmail: string | null;
};

type Row = {
  id: string; slug: string; creator_name: string;
  real_handle: string; break_glass_active: boolean;
  secondary_email: string | null;
};
```

to:

```ts
export type Page = {
  id: string;
  slug: string;
  creatorName: string;
  realHandle: string;
  breakGlassActive: boolean;
  secondaryEmail: string | null;
  checklistCompleted: string[];
};

type Row = {
  id: string; slug: string; creator_name: string;
  real_handle: string; break_glass_active: boolean;
  secondary_email: string | null; checklist_completed: string[];
};
```

- [ ] **Step 2: Add the field to `toPage`**

Change:

```ts
const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
  secondaryEmail: r.secondary_email,
});
```

to:

```ts
const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
  secondaryEmail: r.secondary_email, checklistCompleted: r.checklist_completed,
});
```

- [ ] **Step 3: Add `setChecklistCompleted`**

Add to `lib/data/pages.ts`, after `setSecondaryEmail`:

```ts
export async function setChecklistCompleted(pageId: string, completed: string[]): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ checklist_completed: completed }).eq("id", pageId);
  if (error) throw error;
}
```

- [ ] **Step 4: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/data/pages.ts && git commit -m "feat: add setChecklistCompleted to pages data layer"
```

---

### Task 4: API route

**Files:**
- Create: `app/api/pages/checklist/route.ts`

**Interfaces:**
- Consumes: `getSessionUser()` from `@/lib/auth`, `serviceClient()` from `@/lib/supabase/server`, `setChecklistCompleted` from `@/lib/data/pages` (Task 3), `isValidChecklistCompleted` from `@/lib/checklist` (Task 2).
- Produces: `POST /api/pages/checklist` — body `{ completed: string[] }` — returns `{ ok: true }` on success, `{ ok: false }` (401 no session, 404 no page) or `{ ok: false, reason: "invalid" }` (400 bad shape or unknown key) on failure.

- [ ] **Step 1: Write the route**

Create `app/api/pages/checklist/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { setChecklistCompleted } from "@/lib/data/pages";
import { isValidChecklistCompleted } from "@/lib/checklist";

const Body = z.object({ completed: z.array(z.string()) });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidChecklistCompleted(parsed.data.completed))
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  await setChecklistCompleted(page.id, parsed.data.completed);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/pages/checklist/route.ts && git commit -m "feat: add checklist progress API route"
```

---

### Task 5: `PreventionChecklist` client component

**Files:**
- Create: `app/(dashboard)/dashboard/prevention-checklist.tsx`

**Interfaces:**
- Consumes: `CHECKLIST_ITEMS` from `@/lib/checklist` (Task 2); posts to `/api/pages/checklist` (Task 4).
- Produces: `PreventionChecklist({ initialCompleted }: { initialCompleted: string[] })` — a React client component.

- [ ] **Step 1: Write the component**

Create `app/(dashboard)/dashboard/prevention-checklist.tsx`:

```tsx
"use client";
import { useState } from "react";
import { CHECKLIST_ITEMS } from "@/lib/checklist";

export function PreventionChecklist({ initialCompleted }: { initialCompleted: string[] }) {
  const [completed, setCompleted] = useState<string[]>(initialCompleted);

  async function toggle(key: string) {
    const next = completed.includes(key)
      ? completed.filter((k) => k !== key)
      : [...completed, key];
    setCompleted(next);
    await fetch("/api/pages/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }

  return (
    <ul className="mt-4 flex flex-col gap-3">
      {CHECKLIST_ITEMS.map((item) => (
        <li key={item.key} className="flex items-start gap-2.5">
          <input
            type="checkbox"
            id={`checklist-${item.key}`}
            checked={completed.includes(item.key)}
            onChange={() => toggle(item.key)}
            className="mt-0.5 h-4 w-4 rounded border-border bg-surface-2 accent-accent"
          />
          <label htmlFor={`checklist-${item.key}`} className="text-sm text-secondary">
            {item.label}
          </label>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/prevention-checklist.tsx" && git commit -m "feat: add PreventionChecklist component"
```

---

### Task 6: Wire into the dashboard

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `PreventionChecklist` from `./prevention-checklist` (Task 5); reads `data.checklist_completed` off the existing raw page row already loaded in this file.

- [ ] **Step 1: Import the component**

In `app/(dashboard)/dashboard/page.tsx`, add to the imports (after the `DashboardHeader` import):

```tsx
import { PreventionChecklist } from "./prevention-checklist";
```

- [ ] **Step 2: Replace the static card**

Change:

```tsx
      <Card className="mt-6 border-dashed opacity-60">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Prevention checklist</h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="mt-2 text-sm text-secondary">Harden your account before anything happens.</p>
      </Card>
```

to:

```tsx
      <Card className="mt-6">
        <h2 className="text-base font-medium">Prevention checklist</h2>
        <p className="mt-2 text-sm text-secondary">Harden your account before anything happens.</p>
        <PreventionChecklist initialCompleted={data.checklist_completed ?? []} />
      </Card>
```

Leave the "Content & metrics backup" card immediately above it untouched.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all existing tests pass, plus the 5 new tests from Task 2 — no regressions.

- [ ] **Step 4: Run the typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification in browser**

Start the dev server, sign in, open `/dashboard`:
- Confirm the Prevention checklist card now renders 5 checkboxes with the real labels, no "Coming soon" badge.
- Check one item, reload the page — it should remain checked (persisted).
- Uncheck it, reload — it should remain unchecked.
- Confirm the "Content & metrics backup" card above it is unchanged (still dashed/muted/"Coming soon").
- Confirm the status strip, breach-alerts card, and break-glass button all still work as before.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" && git commit -m "feat: wire prevention checklist into dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** §4.1 migration → Task 1. §4.2 item list → Task 2. §4.3 backend (data layer + route) → Tasks 3–4. §4.4 frontend (component + wiring) → Tasks 5–6. §6 testing → Task 2's TDD tests + Task 6 Step 3 full-suite run + Task 6 Step 5 manual verification. §3 out-of-scope items (no public surface, no gating, fixed items, backup card untouched) are all respected — no task touches `/p/[slug]` or the backup card.
- **Testing convention deviation from spec draft:** the design spec's §6 mentioned a "data-layer test" and a "route-level test." Neither pattern exists anywhere in this codebase today (`vitest.config.ts` only includes `lib/**/*.test.ts`; there are zero `lib/data/*.test.ts` or route test files). This plan follows the codebase's actual established convention instead: the validation logic that would otherwise need a route test is extracted into pure, unit-tested `lib/checklist.ts` (Task 2), and the data-layer setter/route themselves are verified manually (Task 6 Step 5), exactly like `setSecondaryEmail` and the existing `secondary-email` route are today.
