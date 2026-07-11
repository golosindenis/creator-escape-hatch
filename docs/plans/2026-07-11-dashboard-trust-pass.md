# Dashboard Trust Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard from two bare configuration forms into a page that feels like a logged-in app — with a header (branding + account email + logout), an explanation of what the product does, real-data proof the setup is live, and visibility into the fuller product roadmap.

**Architecture:** Pure presentational additions on top of the existing single-page Next.js App Router dashboard. One new shared UI primitive (`Wordmark`), two new dashboard-only components (`DashboardHeader`, `LogoutButton`), one new pure-function module (`lib/dashboardStatus.ts`) for the status-strip text (the only new logic, so the only new unit tests), and edits to three existing pages to wire it together. No new tables, no new API routes, no new dependencies.

**Tech Stack:** Next.js 15 App Router, React Server Components + one client component for logout, Supabase (`@supabase/ssr`), Tailwind CSS (project's existing design-token classes), `lucide-react` icons, Vitest for unit tests.

## Global Constraints

- No multi-page navigation / sidebar — stay single-page (spec §3).
- No settings page or dead-end header menu items — "Log out" is the only header action (spec §3).
- No new backend features (content backup, prevention checklist) — only their presence is surfaced via inert "Coming soon" cards (spec §3, §4.4).
- No fake stats — the status strip only shows data already stored in `pages`/`subscribers` (spec §4.3).
- Existing 25-test suite must continue passing unchanged; this plan adds unit tests only for new pure functions, following the codebase's existing convention of testing `lib/**/*.test.ts` only, not component rendering (spec §6, confirmed via `vitest.config.ts`: `include: ["lib/**/*.test.ts"]`).

---

## File Structure

- Create: `components/ui/Wordmark.tsx` — shared icon+wordmark primitive, replaces duplicated markup in homepage/login/dashboard.
- Modify: `app/page.tsx` — use `Wordmark`.
- Modify: `app/(auth)/login/page.tsx` — use `Wordmark`.
- Modify: `lib/auth.ts` — `getSessionUser()` returns `email` in addition to `id`.
- Create: `lib/dashboardStatus.ts` — pure functions computing the three status-strip labels.
- Create: `lib/dashboardStatus.test.ts` — unit tests for the above.
- Create: `app/(dashboard)/dashboard/logout-button.tsx` — client component, calls `supabase.auth.signOut()` then redirects to `/login`.
- Create: `app/(dashboard)/dashboard/dashboard-header.tsx` — header bar: `Wordmark` + user email + `LogoutButton`.
- Modify: `app/(dashboard)/dashboard/page.tsx` — render `DashboardHeader` in both dashboard states, add intro tagline + status strip, add subscriber count fetch, add two "Coming soon" cards.

---

### Task 1: `Wordmark` primitive, adopted by homepage and login

**Files:**
- Create: `components/ui/Wordmark.tsx`
- Modify: `app/page.tsx:26-29`
- Modify: `app/(auth)/login/page.tsx:1-31`

**Interfaces:**
- Produces: `Wordmark({ size = 24 }: { size?: number })` — a React component rendering the shield icon + "AccountGuard" text as a flex row (`flex items-center gap-2`). Callers control centering/spacing via a wrapping element.

- [ ] **Step 1: Create the `Wordmark` component**

```tsx
// components/ui/Wordmark.tsx
import { ShieldCheck } from "lucide-react";

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck className="text-accent" size={size} aria-hidden="true" />
      <span className="text-base font-medium">AccountGuard</span>
    </div>
  );
}
```

- [ ] **Step 2: Use it in the homepage**

In `app/page.tsx`, replace the import and the header block:

```tsx
import Link from "next/link";
import { ShieldCheck, Radio, Bell } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Wordmark } from "@/components/ui/Wordmark";
```

Replace lines 26-29 (the `<div className="flex items-center justify-center gap-2">...</div>` block) with:

```tsx
      <div className="flex justify-center">
        <Wordmark size={28} />
      </div>
```

Leave `ShieldCheck` in the `lucide-react` import — it's still used by `VALUE_POINTS` on line 7.

- [ ] **Step 3: Use it in the login page**

In `app/(auth)/login/page.tsx`, replace the import (drop `ShieldCheck`, add `Wordmark`):

```tsx
"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
```

Replace lines 28-31 (the `<div className="mb-8 flex items-center gap-2">...</div>` block) with:

```tsx
      <div className="mb-8">
        <Wordmark />
      </div>
```

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests pass (this task touches no logic, only JSX).

- [ ] **Step 5: Commit**

```bash
git add components/ui/Wordmark.tsx app/page.tsx "app/(auth)/login/page.tsx"
git commit -m "refactor: extract shared Wordmark primitive"
```

---

### Task 2: `getSessionUser()` returns the user's email

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Produces: `getSessionUser(): Promise<{ id: string; email: string } | null>` (was `{ id: string } | null>`). `email` is `""` if Supabase's user object has no email (defensive fallback; in practice every user in this app authenticates via magic-link email, so this is always populated).
- Consumes (later tasks): `Dashboard` (Task 5) reads `user.email` and passes it to `DashboardHeader`.

- [ ] **Step 1: Update the return type and implementation**

Replace the full contents of `lib/auth.ts`:

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
}
```

- [ ] **Step 2: Run the existing test suite**

Run: `npm run test`
Expected: all existing tests pass (no test file covers `lib/auth.ts` today — it's a thin Supabase wrapper, consistent with the existing convention of not unit-testing these wrappers; verification happens via manual browser testing in Task 6).

Run: `npx tsc --noEmit`
Expected: no new type errors (this changes a return type — Task 5 will update the one caller).

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: return email from getSessionUser"
```

---

### Task 3: `lib/dashboardStatus.ts` pure functions (TDD)

**Files:**
- Create: `lib/dashboardStatus.test.ts`
- Create: `lib/dashboardStatus.ts`

**Interfaces:**
- Produces:
  - `protectionLabel(breakGlassActive: boolean): string`
  - `subscriberCountLabel(count: number): string`
  - `secondaryAlertsLabel(secondaryEmail: string | null): string`
- Consumes (later tasks): `Dashboard` (Task 5) imports all three to build the status strip.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/dashboardStatus.test.ts
import { describe, it, expect } from "vitest";
import { protectionLabel, subscriberCountLabel, secondaryAlertsLabel } from "@/lib/dashboardStatus";

describe("protectionLabel", () => {
  it("shows protection active when break-glass is off", () => {
    expect(protectionLabel(false)).toBe("🟢 Protection active");
  });
  it("shows break-glass active when on", () => {
    expect(protectionLabel(true)).toBe("🔴 Break-glass active — subscribers alerted");
  });
});

describe("subscriberCountLabel", () => {
  it("pluralizes for zero", () => { expect(subscriberCountLabel(0)).toBe("0 subscribers"); });
  it("does not pluralize for one", () => { expect(subscriberCountLabel(1)).toBe("1 subscriber"); });
  it("pluralizes for many", () => { expect(subscriberCountLabel(142)).toBe("142 subscribers"); });
});

describe("secondaryAlertsLabel", () => {
  it("is on when an email is set", () => { expect(secondaryAlertsLabel("a@b.com")).toBe("Secondary alerts: on"); });
  it("is off when null", () => { expect(secondaryAlertsLabel(null)).toBe("Secondary alerts: off"); });
  it("is off when empty string", () => { expect(secondaryAlertsLabel("")).toBe("Secondary alerts: off"); });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/dashboardStatus.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboardStatus'`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// lib/dashboardStatus.ts
export function protectionLabel(breakGlassActive: boolean): string {
  return breakGlassActive
    ? "🔴 Break-glass active — subscribers alerted"
    : "🟢 Protection active";
}

export function subscriberCountLabel(count: number): string {
  return `${count} subscriber${count === 1 ? "" : "s"}`;
}

export function secondaryAlertsLabel(secondaryEmail: string | null): string {
  return secondaryEmail ? "Secondary alerts: on" : "Secondary alerts: off";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/dashboardStatus.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboardStatus.ts lib/dashboardStatus.test.ts
git commit -m "feat: add dashboard status label functions"
```

---

### Task 4: `LogoutButton` and `DashboardHeader` components

**Files:**
- Create: `app/(dashboard)/dashboard/logout-button.tsx`
- Create: `app/(dashboard)/dashboard/dashboard-header.tsx`

**Interfaces:**
- Consumes: `Wordmark` (Task 1), `Button` (`components/ui/Button.tsx`, existing), `browserClient` (`lib/supabase/browser.ts`, existing).
- Produces:
  - `LogoutButton()` — client component, no props.
  - `DashboardHeader({ email }: { email: string })` — server-renderable component (renders `LogoutButton` as a child client component).
- Consumed by (Task 5): `Dashboard` renders `<DashboardHeader email={user.email} />`.

- [ ] **Step 1: Create `LogoutButton`**

```tsx
// app/(dashboard)/dashboard/logout-button.tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { browserClient } from "@/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await browserClient().auth.signOut();
    router.push("/login");
  }

  return (
    <Button
      variant="ghost"
      onClick={logout}
      disabled={busy}
      className="w-auto px-3 py-1.5 text-xs"
    >
      Log out
    </Button>
  );
}
```

- [ ] **Step 2: Create `DashboardHeader`**

```tsx
// app/(dashboard)/dashboard/dashboard-header.tsx
import { Wordmark } from "@/components/ui/Wordmark";
import { LogoutButton } from "./logout-button";

export function DashboardHeader({ email }: { email: string }) {
  return (
    <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
      <Wordmark />
      <div className="flex items-center gap-3">
        <span className="text-sm text-secondary">{email}</span>
        <LogoutButton />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the existing test suite**

Run: `npm run test`
Expected: all existing tests pass (new components aren't imported anywhere yet, so this is a no-op check that nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/logout-button.tsx" "app/(dashboard)/dashboard/dashboard-header.tsx"
git commit -m "feat: add DashboardHeader and LogoutButton components"
```

---

### Task 5: Wire it all into the dashboard page

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser` (now returns `{ id, email }`, Task 2), `DashboardHeader` (Task 4), `protectionLabel` / `subscriberCountLabel` / `secondaryAlertsLabel` (Task 3), `listSubscriberEmails` (`lib/data/subscribers.ts`, existing, produces `Promise<string[]>`).

- [ ] **Step 1: Replace the full contents of `app/(dashboard)/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { listBreachAlerts } from "@/lib/data/breachAlerts";
import { listSubscriberEmails } from "@/lib/data/subscribers";
import { protectionLabel, subscriberCountLabel, secondaryAlertsLabel } from "@/lib/dashboardStatus";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";
import { SecondaryEmailForm } from "./secondary-email-form";
import { DashboardHeader } from "./dashboard-header";

const ALERT_LABELS: Record<string, string> = {
  new_login: "New login detected",
  password_changed: "Password changed",
};

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) {
    return (
      <Shell>
        <DashboardHeader email={user.email} />
        <Card>
          <CreatePageForm />
        </Card>
      </Shell>
    );
  }

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;
  const alerts = await listBreachAlerts(data.id);
  const subscriberCount = (await listSubscriberEmails(data.id)).length;

  return (
    <Shell className="max-w-lg">
      <DashboardHeader email={user.email} />

      <p className="text-sm text-secondary">Your escape hatch if Instagram goes down.</p>
      <p className="mt-2 text-sm text-secondary">
        {protectionLabel(data.break_glass_active)} · {subscriberCountLabel(subscriberCount)} ·{" "}
        {secondaryAlertsLabel(data.secondary_email)}
      </p>

      <Card className="mt-6">
        <h1 className="text-lg font-medium">Your lifeline page</h1>
        <p className="mt-2 text-sm text-secondary">
          Public link: <code className="rounded bg-surface-2 px-1.5 py-0.5 text-primary">/p/{data.slug}</code>
        </p>
        <BreakGlassButton active={data.break_glass_active} />
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Breach alerts</h2>
        <p className="mt-2 text-sm text-secondary">
          In Instagram, go to Settings → Security → Emails from Instagram, and forward those
          emails to:
        </p>
        <p className="mt-2 rounded-lg bg-surface-2 p-2.5 font-mono text-sm text-primary">{forwardAddress}</p>
        <p className="mt-4 text-sm text-secondary">
          We&apos;ll email you at a separate address below if we detect a login or password-change notice.
        </p>
        <SecondaryEmailForm initialEmail={data.secondary_email ?? ""} />

        {alerts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-secondary">Alert history</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between text-sm">
                  <Badge>{ALERT_LABELS[alert.alertType] ?? alert.alertType}</Badge>
                  <span className="text-muted">{new Date(alert.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="mt-6 border-dashed opacity-60">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Content &amp; metrics backup</h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="mt-2 text-sm text-secondary">Auto-archive your posts and growth history.</p>
      </Card>

      <Card className="mt-6 border-dashed opacity-60">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Prevention checklist</h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="mt-2 text-sm text-secondary">Harden your account before anything happens.</p>
      </Card>
    </Shell>
  );
}
```

- [ ] **Step 2: Run the full test suite and typecheck**

Run: `npm run test`
Expected: all tests pass, including the 7 new `dashboardStatus` tests (existing suite count + 7).

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: build succeeds with no new errors or warnings beyond the pre-existing workspace-root warning.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: dashboard trust pass — header, status strip, roadmap cards"
```

---

### Task 6: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and log in**

Run: `npm run dev`

Navigate to `http://localhost:3000/login` (note: per project history, Supabase Auth's redirect allowlist may only include `accountguard.app`, not `localhost` — if the magic link doesn't redirect correctly locally, verify against the deployed preview/production URL instead).

- [ ] **Step 2: Verify the "no page yet" state**

For a user with no `pages` row: confirm `DashboardHeader` renders (Wordmark, email, "Log out" button) above the `CreatePageForm` card.

- [ ] **Step 3: Verify the populated dashboard state**

For a user with a `pages` row:
- Header shows Wordmark, correct email, "Log out" button.
- Tagline "Your escape hatch if Instagram goes down." renders.
- Status strip shows correct protection state (toggle break-glass via its existing button and confirm the label flips between "🟢 Protection active" and "🔴 Break-glass active — subscribers alerted"), correct subscriber count (compare against the `subscribers` table row count for that page), and correct secondary-alerts on/off state (toggle via the existing `SecondaryEmailForm` and confirm the label flips).
- Both existing cards ("Your lifeline page", "Breach alerts") render unchanged.
- Two new "Coming soon" cards render below, visually muted, with no interactive elements.

- [ ] **Step 4: Verify logout**

Click "Log out". Confirm redirect to `/login` and that navigating back to `/dashboard` redirects to `/login` (session cleared).

- [ ] **Step 5: Verify homepage and login page**

Navigate to `/` and `/login`. Confirm the Wordmark renders identically to before (shield icon + "AccountGuard" text, same size/position as prior to this change).

- [ ] **Step 6: Whole-branch review**

Review the full diff against this plan and the design spec (`docs/specs/2026-07-11-dashboard-trust-pass-design.md`) before merging, per the project's standing workflow (subagent-driven development in an isolated worktree → final whole-branch review → merge locally to `main`).

---

## Self-Review Notes

- **Spec coverage:** §4.1 Wordmark → Task 1. §4.2 DashboardHeader/logout/email → Tasks 2, 4, 5. §4.3 intro + status strip → Tasks 3, 5. §4.4 coming-soon cards → Task 5. §6 testing → Tasks 3 (unit) and 6 (manual, matching existing project convention of no component tests). §7 rollout → handled by the execution method (subagent-driven-development), not a plan task.
- **Placeholder scan:** none found — every step has literal code or an exact command.
- **Type consistency:** `getSessionUser()` return type (`{ id: string; email: string } | null`) matches its one call site in Task 5 (`user.email`). `DashboardHeader({ email }: { email: string })` matches the call `<DashboardHeader email={user.email} />`. `dashboardStatus.ts` function names/signatures match their imports and call sites in Task 5 exactly.
