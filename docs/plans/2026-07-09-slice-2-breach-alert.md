# Breach Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect Meta security emails (new login / password changed) forwarded by the creator to a unique per-page address, and notify the creator at a separate secondary email with a link back to their dashboard.

**Architecture:** A pure classifier module (`lib/breachAlert.ts`) decides whether a forwarded email is a Meta security event, driven off sender/subject/body pattern rules. A webhook route (`app/api/inbound-email/route.ts`) receives Resend's inbound-parse payload, verifies it came from Resend (svix signature), extracts the page ID from the recipient address, classifies, records a `breach_alerts` row, and emails the creator's `secondary_email` via the existing Resend outbound adapter. Dashboard UI lets the creator set that secondary email and shows their forwarding address.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres) · Resend (outbound + inbound) · `svix` (webhook signature verification) · Tailwind CSS · Vitest.

## Global Constraints

- **Resilience, never recovery.** Alert copy may say "check your account" / "activate break-glass" — it must never promise account recovery or restoration. Verbatim rule from the v1 design spec §3, carried into the breach-alert design spec §4.
- **No platform credentials.** This feature reads forwarded email content only; it never touches Instagram credentials or scrapes anything. Spec §6.
- **Fail open, don't error-storm.** Malformed payloads, unknown page IDs, and unmatched email patterns are all silent no-ops (`200` + log), never thrown errors that trigger webhook retries. Breach-alert design spec §6.
- **Email-only alert channel for v1.** No SMS/push infrastructure exists; do not add any. Breach-alert design spec §2.
- **No auth-bypass shortcuts.** The alert email links to the dashboard; it must never contain a pre-authenticated action link. Breach-alert design spec §2.

---

## File Structure

- `supabase/migrations/0002_breach_alerts.sql` — adds `pages.secondary_email`, new `breach_alerts` table + RLS.
- `lib/breachAlert.ts` — pure: classify a forwarded email, compose the alert notice.
- `lib/data/pages.ts` — modify: add `secondaryEmail` to `Page`, add `getPageById`, add `setSecondaryEmail`.
- `lib/data/breachAlerts.ts` — data access: record a breach alert.
- `app/api/inbound-email/route.ts` — Resend inbound webhook handler.
- `app/api/pages/secondary-email/route.ts` — POST endpoint to set the caller's secondary email.
- `app/(dashboard)/dashboard/secondary-email-form.tsx` — client form for the secondary email.
- `app/(dashboard)/dashboard/page.tsx` — modify: show forwarding address + the secondary-email form.
- Tests colocated as `lib/breachAlert.test.ts`.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0002_breach_alerts.sql`

**Interfaces:**
- Produces: `pages.secondary_email` (nullable text) and `breach_alerts(id, page_id, alert_type, created_at)`, RLS-scoped like existing tables.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_breach_alerts.sql`:
```sql
alter table pages add column secondary_email text;

create table breach_alerts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  alert_type text not null,
  created_at timestamptz not null default now()
);

alter table breach_alerts enable row level security;

create policy breach_alerts_owner_read on breach_alerts
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: migration applies; `pages.secondary_email` and `breach_alerts` exist.

- [ ] **Step 3: Verify**

Run: `npx supabase db diff`
Expected: no pending diff.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_breach_alerts.sql && git commit -m "feat: breach_alerts table + secondary_email column"
```

---

### Task 2: Breach alert classifier + notice composer (pure, TDD)

**Files:**
- Create: `lib/breachAlert.ts`, `lib/breachAlert.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type AlertType = "new_login" | "password_changed"`
  - `classifyAlert(input: { from: string; subject: string; body: string }): { type: AlertType } | null`
  - `composeAlertNotice(input: { creatorName: string; alertType: AlertType; dashboardUrl: string }): { subject: string; body: string }`

- [ ] **Step 1: Write the failing test**

Create `lib/breachAlert.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { classifyAlert, composeAlertNotice } from "@/lib/breachAlert";

describe("classifyAlert", () => {
  it("detects a new-login email from Instagram", () => {
    const result = classifyAlert({
      from: "security@mail.instagram.com",
      subject: "New login to your Instagram account",
      body: "We noticed a new login to your account from a new device.",
    });
    expect(result).toEqual({ type: "new_login" });
  });

  it("detects a password-changed email from Facebookmail", () => {
    const result = classifyAlert({
      from: "notify@facebookmail.com",
      subject: "Your Instagram password was changed",
      body: "Your password was changed on July 9.",
    });
    expect(result).toEqual({ type: "password_changed" });
  });

  it("ignores mail from a non-Meta sender", () => {
    const result = classifyAlert({
      from: "someone@example.com",
      subject: "New login to your Instagram account",
      body: "We noticed a new login to your account.",
    });
    expect(result).toBeNull();
  });

  it("ignores Meta mail that isn't a security notice", () => {
    const result = classifyAlert({
      from: "security@mail.instagram.com",
      subject: "See what's new this week",
      body: "Check out these new features.",
    });
    expect(result).toBeNull();
  });
});

describe("composeAlertNotice", () => {
  const notice = composeAlertNotice({
    creatorName: "Iryna",
    alertType: "new_login",
    dashboardUrl: "https://example.com/dashboard",
  });

  it("names the creator", () => {
    expect(notice.subject).toContain("Iryna");
  });

  it("links to the dashboard", () => {
    expect(notice.body).toContain("https://example.com/dashboard");
  });

  it("never promises account recovery", () => {
    expect(notice.body.toLowerCase()).not.toMatch(/recover|get (it|the account) back|restore/);
  });

  it("contains no auth token query params", () => {
    expect(notice.body).not.toMatch(/[?&]token=/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/breachAlert.test.ts`
Expected: FAIL — cannot find module `@/lib/breachAlert`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/breachAlert.ts`:
```ts
export type AlertType = "new_login" | "password_changed";

const META_SENDER_PATTERN = /@(mail\.)?instagram\.com$|@facebookmail\.com$/i;

const PASSWORD_KEYWORDS = [
  /password (was |has been )?changed/i,
  /you changed your password/i,
  /your password was reset/i,
];

const LOGIN_KEYWORDS = [
  /new login/i,
  /new device/i,
  /signed in from a new/i,
];

export function classifyAlert(input: {
  from: string;
  subject: string;
  body: string;
}): { type: AlertType } | null {
  if (!META_SENDER_PATTERN.test(input.from)) return null;

  const text = `${input.subject}\n${input.body}`;
  if (PASSWORD_KEYWORDS.some((p) => p.test(text))) return { type: "password_changed" };
  if (LOGIN_KEYWORDS.some((p) => p.test(text))) return { type: "new_login" };
  return null;
}

export function composeAlertNotice(input: {
  creatorName: string;
  alertType: AlertType;
  dashboardUrl: string;
}): { subject: string; body: string } {
  const label = input.alertType === "password_changed" ? "password change" : "new login";
  return {
    subject: `Possible Instagram security event for ${input.creatorName}`,
    body:
      `We detected a ${label} notice forwarded from Instagram for ${input.creatorName}'s account.\n\n` +
      `If this wasn't you, check your account now and consider activating your break-glass page ` +
      `from your dashboard: ${input.dashboardUrl}\n\n` +
      `If this was you, no action is needed.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/breachAlert.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/breachAlert.ts lib/breachAlert.test.ts && git commit -m "feat: breach alert classifier + notice composer"
```

---

### Task 3: Extend page data access

**Files:**
- Modify: `lib/data/pages.ts`

**Interfaces:**
- Consumes: `isValidSlug` (existing).
- Produces:
  - `Page` gains `secondaryEmail: string | null`.
  - `getPageById(pageId: string): Promise<Page | null>`
  - `setSecondaryEmail(pageId: string, email: string): Promise<void>`

- [ ] **Step 1: Update the type, row shape, and mapper**

In `lib/data/pages.ts`, replace the top of the file (through `toPage`) with:
```ts
import { serviceClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/slug";

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

const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
  secondaryEmail: r.secondary_email,
});
```

- [ ] **Step 2: Add `getPageById` and `setSecondaryEmail`**

Append to `lib/data/pages.ts` (after `setBreakGlass`):
```ts
export async function getPageById(pageId: string): Promise<Page | null> {
  const { data, error } = await serviceClient()
    .from("pages").select("*").eq("id", pageId).maybeSingle();
  if (error) throw error;
  return data ? toPage(data as Row) : null;
}

export async function setSecondaryEmail(pageId: string, email: string): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ secondary_email: email }).eq("id", pageId);
  if (error) throw error;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/data/pages.ts && git commit -m "feat: getPageById + setSecondaryEmail on page data access"
```

---

### Task 4: Breach alert data access

**Files:**
- Create: `lib/data/breachAlerts.ts`

**Interfaces:**
- Consumes: nothing beyond `serviceClient`.
- Produces: `recordBreachAlert(pageId: string, alertType: string): Promise<void>`.

- [ ] **Step 1: Write the module**

Create `lib/data/breachAlerts.ts`:
```ts
import { serviceClient } from "@/lib/supabase/server";

export async function recordBreachAlert(pageId: string, alertType: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breach_alerts").insert({ page_id: pageId, alert_type: alertType });
  if (error) throw error;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/data/breachAlerts.ts && git commit -m "feat: breach alert data access"
```

---

### Task 5: Inbound email webhook

**Files:**
- Create: `app/api/inbound-email/route.ts`
- Modify: `package.json` (add `svix` dependency)

**Interfaces:**
- Consumes: `getPageById` (Task 3), `recordBreachAlert` (Task 4), `classifyAlert`/`composeAlertNotice` (Task 2), `sendBroadcast` (existing, `lib/email/resend.ts`).
- Produces: `POST /api/inbound-email` — verifies the Resend webhook signature, extracts the page ID from the `alerts+<pageId>@...` recipient, classifies, records, and (if `secondaryEmail` is set) emails the notice. Always returns `200` on any recognized-but-non-actionable case so Resend doesn't retry-storm.

- [ ] **Step 1: Install the signature-verification dependency**

Run: `npm install svix`

- [ ] **Step 2: Write the webhook route**

Create `app/api/inbound-email/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { getPageById } from "@/lib/data/pages";
import { recordBreachAlert } from "@/lib/data/breachAlerts";
import { classifyAlert, composeAlertNotice } from "@/lib/breachAlert";
import { sendBroadcast } from "@/lib/email/resend";

function extractPageId(to: string[]): string | null {
  for (const addr of to) {
    const match = addr.match(/alerts\+([0-9a-f-]{36})@/i);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: { data?: Record<string, unknown> };
  try {
    const wh = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    event = wh.verify(payload, headers) as { data?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const data = event.data ?? {};
  const toRaw = data.to;
  const to: string[] = Array.isArray(toRaw) ? (toRaw as string[]) : typeof toRaw === "string" ? [toRaw] : [];
  const from = typeof data.from === "string" ? data.from : "";
  const subject = typeof data.subject === "string" ? data.subject : "";
  const body = typeof data.text === "string" ? data.text : typeof data.html === "string" ? data.html : "";

  const pageId = extractPageId(to);
  if (!pageId) return NextResponse.json({ ok: true });

  const page = await getPageById(pageId);
  if (!page) return NextResponse.json({ ok: true });

  const classification = classifyAlert({ from, subject, body });
  if (!classification) return NextResponse.json({ ok: true });

  await recordBreachAlert(page.id, classification.type);

  if (page.secondaryEmail) {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`;
    const notice = composeAlertNotice({
      creatorName: page.creatorName,
      alertType: classification.type,
      dashboardUrl,
    });
    await sendBroadcast({ to: [page.secondaryEmail], subject: notice.subject, body: notice.body });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/inbound-email package.json package-lock.json && git commit -m "feat: inbound email webhook for breach detection"
```

---

### Task 6: Secondary email endpoint + dashboard UI

**Files:**
- Create: `app/api/pages/secondary-email/route.ts`, `app/(dashboard)/dashboard/secondary-email-form.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser` (existing), `setSecondaryEmail` (Task 3), `isValidEmail`/`normalizeEmail` (existing).
- Produces: `POST /api/pages/secondary-email` body `{ email }` → sets the caller's page's secondary email; dashboard shows the forwarding address and a form to set/update the secondary email.

- [ ] **Step 1: Secondary email endpoint**

Create `app/api/pages/secondary-email/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { setSecondaryEmail } from "@/lib/data/pages";
import { isValidEmail, normalizeEmail } from "@/lib/email";

const Body = z.object({ email: z.string() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidEmail(parsed.data.email))
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  await setSecondaryEmail(page.id, normalizeEmail(parsed.data.email));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Secondary email form**

Create `app/(dashboard)/dashboard/secondary-email-form.tsx`:
```tsx
"use client";
import { useState } from "react";

export function SecondaryEmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pages/secondary-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setStatus(data.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <label className="text-sm font-medium">Secondary email (for alerts)</label>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@personalemail.com" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Save</button>
      {status === "saved" && <p className="text-sm text-green-700">Saved.</p>}
      {status === "error" && <p className="text-sm text-red-600">Please check your email address.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Wire into the dashboard**

Replace the "page exists" branch of `app/(dashboard)/dashboard/page.tsx` with:
```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";
import { SecondaryEmailForm } from "./secondary-email-form";

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) return <main className="mx-auto max-w-md p-8"><CreatePageForm /></main>;

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Your lifeline page</h1>
      <p className="mt-2">Public link: <code>/p/{data.slug}</code></p>
      <BreakGlassButton active={data.break_glass_active} />

      <section className="mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold">Breach alerts</h2>
        <p className="mt-2 text-sm text-gray-600">
          In Instagram, go to Settings → Security → Emails from Instagram, and forward those
          emails to:
        </p>
        <p className="mt-2 rounded bg-gray-100 p-2 font-mono text-sm">{forwardAddress}</p>
        <p className="mt-4 text-sm text-gray-600">
          We&apos;ll email you at a separate address below if we detect a login or password-change notice.
        </p>
        <SecondaryEmailForm initialEmail={data.secondary_email ?? ""} />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/pages/secondary-email app/\(dashboard\)/dashboard && git commit -m "feat: secondary email + forwarding instructions on dashboard"
```

---

### Task 7: Wire up Resend inbound + full manual verification

**Files:**
- Modify: `README.md` (env vars + inbound setup notes)

**Interfaces:**
- Consumes: everything above.
- Produces: a working end-to-end breach-alert flow on a real (or sandboxed) Instagram account.

- [ ] **Step 1: Configure Resend inbound routing**

In the Resend dashboard: add/verify the inbound domain (e.g. `inbound.yourdomain.com`), point its MX records per Resend's instructions, and set the inbound webhook URL to `https://<your-app>/api/inbound-email`. Copy the webhook's signing secret.

- [ ] **Step 2: Set environment variables**

Add to `.env.local` (and Vercel project settings):
```
RESEND_WEBHOOK_SECRET=
NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN=inbound.yourdomain.com
```

- [ ] **Step 3: Manual verification — happy path**

1. Log in, open the dashboard, set a secondary email, note the forwarding address shown.
2. In a test Instagram account, set the security-email forward to that address (or send a crafted test email matching the pattern in `lib/breachAlert.ts` directly to it).
3. Confirm: a `breach_alerts` row appears for the page, and the secondary email receives the notice with a working dashboard link.

- [ ] **Step 4: Manual verification — fail-open paths**

1. Send an email to the forward address from a non-Meta sender.
   Expected: `200` response, no `breach_alerts` row, no notice sent.
2. Send a well-formed Meta-pattern email but with no `secondary_email` set on the page.
   Expected: `breach_alerts` row is recorded, no notice email sent (nothing to send it to).
3. POST to `/api/inbound-email` directly without a valid svix signature.
   Expected: `401`.

- [ ] **Step 5: Update README**

Add to `README.md`'s environment variable list: `RESEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN`, and a short "Breach alerts" subsection describing the Resend inbound domain setup from Step 1.

- [ ] **Step 6: Commit**

```bash
git add README.md && git commit -m "docs: breach alert env vars + Resend inbound setup"
```

---

## Self-Review

**Spec coverage (breach-alert design spec):**
- Unique forwarding address derived from page ID → Tasks 5, 6. ✓
- Inbound webhook + classification + recording → Tasks 2, 4, 5. ✓
- Secondary-email notification with dashboard link, no auth-bypass → Tasks 2, 5. ✓
- Dashboard UI for secondary email + forwarding instructions → Task 6. ✓
- Fail-open error handling (malformed payload, unknown page, unmatched pattern) → Task 5 (silent 200s), verified in Task 7 Step 4. ✓
- Resilience-not-recovery constraint → enforced by unit test in Task 2, carried into copy in Tasks 2 and 6. ✓
- Deferred by design (documented in the breach-alert spec): SMS/push, one-click activation links, LLM classification, retry/dedup — none implemented here. ✓

**Placeholder scan:** every code step contains complete code; commands have expected output; no TBD/TODO. `inbound.yourdomain.com` / `example.com` are explicitly-flagged placeholders resolved in Task 7, same treatment as Slice 1's Resend sender placeholder.

**Type consistency:** `Page.secondaryEmail` (Task 3) is consumed as `page.secondaryEmail` in Task 5's webhook and read as the raw `data.secondary_email` column directly in Task 6's server component (matching the existing pattern in `dashboard/page.tsx`, which already reads raw Supabase columns rather than the `Page` type). `classifyAlert`/`composeAlertNotice` signatures (Task 2) match their usage in Task 5 exactly. `recordBreachAlert(pageId, alertType)` (Task 4) matches its call site in Task 5.
