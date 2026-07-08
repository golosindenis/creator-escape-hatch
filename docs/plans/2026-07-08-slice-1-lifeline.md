# Slice 1 — "The Lifeline" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a creator's owned-audience capture page plus a one-click "break-glass" status page, so that if their social account is lost, they can still reach their followers and brand partners.

**Architecture:** Next.js (App Router) web app. Core rules (slugs, email normalization, break-glass messaging, subscriber dedup) live in pure, unit-tested TypeScript modules under `lib/`. Supabase (Postgres + Auth) is the datastore, reached through thin adapter functions. Resend sends the break-glass broadcast. Public pages are server-rendered at `/p/[slug]`; the creator dashboard is auth-gated.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Supabase (Postgres + Auth, magic-link) · Resend · Tailwind CSS · Vitest · deploy on Vercel.

## Global Constraints

- **Resilience, never recovery.** No copy, button, or message may promise to recover, restore, or get back a lost account. Break-glass copy states only: "this is my real account, ignore anyone messaging you as me." Verbatim rule from spec §3.
- **Never store platform credentials.** No Instagram/TikTok passwords, no scraping. Slice 1 touches no platform API at all.
- **No follower-export claim.** The owned audience is built forward via the capture page; never imply we export a follower list. Spec §6.
- **Freemium comes later.** Slice 1 is free for all users; billing is Slice 2. Do not add paywalls.
- **Platform copy:** creator-facing, Instagram-first language is fine, but Slice 1 stores a generic `handle` string — no platform integration yet.

---

## File Structure

- `lib/slug.ts` — pure: normalize/validate/generate page slugs.
- `lib/email.ts` — pure: normalize + validate subscriber emails.
- `lib/breakGlass.ts` — pure: page display state + broadcast message composition.
- `lib/supabase/server.ts` — server-side Supabase client (service + RLS-scoped).
- `lib/supabase/browser.ts` — browser Supabase client for auth.
- `lib/data/pages.ts` — data access: create/get page, toggle break-glass.
- `lib/data/subscribers.ts` — data access: add subscriber, list subscribers.
- `lib/email/resend.ts` — thin Resend adapter: `sendBroadcast`.
- `supabase/migrations/0001_init.sql` — schema + RLS for `pages`, `subscribers`, `break_glass_events`.
- `app/p/[slug]/page.tsx` — public capture / status page.
- `app/api/subscribe/route.ts` — POST capture endpoint.
- `app/api/break-glass/route.ts` — POST activate/deactivate endpoint (sends broadcast).
- `app/(dashboard)/dashboard/page.tsx` — auth-gated dashboard.
- `app/(auth)/login/page.tsx` — magic-link login.
- Tests colocated as `lib/*.test.ts`.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.local.example`, `app/layout.tsx`, `app/page.tsx`, `lib/env.ts`

**Interfaces:**
- Produces: a booting Next.js app and a working `npm test` (Vitest) command. `lib/env.ts` exports `getEnv()` returning `{ supabaseUrl, supabaseAnonKey, resendApiKey, appUrl }`.

- [ ] **Step 1: Scaffold the app**

Run:
```bash
cd ~/Desktop/creator-escape-hatch
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm --yes
npm install @supabase/supabase-js @supabase/ssr resend zod
npm install -D vitest
```

- [ ] **Step 2: Add the test script and Vitest config**

Edit `package.json` `scripts` to include:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Add env accessor**

Create `lib/env.ts`:
```ts
export function getEnv() {
  const required = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing env var: ${k}`);
    return v;
  };
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    resendApiKey: required("RESEND_API_KEY"),
    appUrl: required("NEXT_PUBLIC_APP_URL"),
  };
}
```

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 4: Verify it boots and tests run**

Run: `npm run build`
Expected: build succeeds.
Run: `npm test`
Expected: "No test files found" (exit 0) — runner works; tests come next.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with Vitest, Supabase, Resend"
```

---

### Task 2: Slug utilities (pure, TDD)

**Files:**
- Create: `lib/slug.ts`, `lib/slug.test.ts`

**Interfaces:**
- Produces: `normalizeSlug(input: string): string`, `isValidSlug(input: string): boolean`, `generateSlugFromHandle(handle: string): string`. Slug rules: lowercase, `a-z0-9-`, 3–30 chars, no leading/trailing/double hyphen.

- [ ] **Step 1: Write the failing test**

Create `lib/slug.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeSlug, isValidSlug, generateSlugFromHandle } from "@/lib/slug";

describe("normalizeSlug", () => {
  it("lowercases and strips invalid chars", () => {
    expect(normalizeSlug("Iryna Fit!")).toBe("iryna-fit");
  });
  it("collapses repeats and trims hyphens", () => {
    expect(normalizeSlug("--a__b  c--")).toBe("a-b-c");
  });
});

describe("isValidSlug", () => {
  it("accepts a clean slug", () => { expect(isValidSlug("iryna-fit")).toBe(true); });
  it("rejects too short", () => { expect(isValidSlug("ab")).toBe(false); });
  it("rejects leading hyphen", () => { expect(isValidSlug("-abc")).toBe(false); });
  it("rejects uppercase", () => { expect(isValidSlug("Abc")).toBe(false); });
});

describe("generateSlugFromHandle", () => {
  it("strips a leading @", () => { expect(generateSlugFromHandle("@iryna.fit")).toBe("iryna-fit"); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/slug.test.ts`
Expected: FAIL — cannot find module `@/lib/slug`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/slug.ts`:
```ts
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidSlug(input: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(input) && !input.includes("--");
}

export function generateSlugFromHandle(handle: string): string {
  return normalizeSlug(handle.replace(/^@/, ""));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/slug.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/slug.ts lib/slug.test.ts && git commit -m "feat: page slug utilities"
```

---

### Task 3: Email utilities (pure, TDD)

**Files:**
- Create: `lib/email.ts`, `lib/email.test.ts`

**Interfaces:**
- Produces: `normalizeEmail(input: string): string` (trim + lowercase), `isValidEmail(input: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `lib/email.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Fan@Example.COM ")).toBe("fan@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a normal address", () => { expect(isValidEmail("fan@example.com")).toBe(true); });
  it("rejects missing @", () => { expect(isValidEmail("fan.example.com")).toBe(false); });
  it("rejects empty", () => { expect(isValidEmail("")).toBe(false); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/email.ts`:
```ts
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  const v = normalizeEmail(input);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts lib/email.test.ts && git commit -m "feat: email normalization + validation"
```

---

### Task 4: Break-glass state + message composition (pure, TDD)

**Files:**
- Create: `lib/breakGlass.ts`, `lib/breakGlass.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PageState = "normal" | "break_glass"`
  - `pageState(page: { breakGlassActive: boolean }): PageState`
  - `composeBroadcast(input: { creatorName: string; realHandle: string }): { subject: string; body: string }` — the email sent to subscribers when break-glass is activated. MUST obey the resilience-not-recovery constraint.

- [ ] **Step 1: Write the failing test**

Create `lib/breakGlass.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { pageState, composeBroadcast } from "@/lib/breakGlass";

describe("pageState", () => {
  it("is normal when inactive", () => {
    expect(pageState({ breakGlassActive: false })).toBe("normal");
  });
  it("is break_glass when active", () => {
    expect(pageState({ breakGlassActive: true })).toBe("break_glass");
  });
});

describe("composeBroadcast", () => {
  const msg = composeBroadcast({ creatorName: "Iryna", realHandle: "@iryna.real" });
  it("names the creator in the subject", () => {
    expect(msg.subject).toContain("Iryna");
  });
  it("points to the real handle", () => {
    expect(msg.body).toContain("@iryna.real");
  });
  it("warns about imposters", () => {
    expect(msg.body.toLowerCase()).toContain("imposter");
  });
  it("never promises account recovery", () => {
    expect(msg.body.toLowerCase()).not.toMatch(/recover|get (it|the account) back|restore/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/breakGlass.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/breakGlass.ts`:
```ts
export type PageState = "normal" | "break_glass";

export function pageState(page: { breakGlassActive: boolean }): PageState {
  return page.breakGlassActive ? "break_glass" : "normal";
}

export function composeBroadcast(input: { creatorName: string; realHandle: string }): {
  subject: string;
  body: string;
} {
  const { creatorName, realHandle } = input;
  return {
    subject: `Important: how to find the real ${creatorName}`,
    body:
      `Hi — this is ${creatorName}. My usual account is having problems, ` +
      `so I'm reaching you here directly.\n\n` +
      `My real account is ${realHandle}. If anyone messages you claiming to be me ` +
      `from another account, please treat them as an imposter and do not send money, ` +
      `gift cards, or personal details.\n\n` +
      `Thanks for staying connected — more updates soon.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/breakGlass.test.ts`
Expected: PASS — including the resilience-not-recovery assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/breakGlass.ts lib/breakGlass.test.ts && git commit -m "feat: break-glass state + broadcast composition"
```

---

### Task 5: Database schema + RLS

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces tables:
  - `pages(id uuid pk, owner uuid → auth.users, slug text unique, creator_name text, real_handle text, break_glass_active bool default false, created_at timestamptz)`
  - `subscribers(id uuid pk, page_id uuid → pages, email text, created_at timestamptz, unique(page_id, email))`
  - `break_glass_events(id uuid pk, page_id uuid → pages, activated boolean, recipient_count int, created_at timestamptz)`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_init.sql`:
```sql
create extension if not exists "pgcrypto";

create table pages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  creator_name text not null,
  real_handle text not null,
  break_glass_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table subscribers (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (page_id, email)
);

create table break_glass_events (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  activated boolean not null,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table pages enable row level security;
alter table subscribers enable row level security;
alter table break_glass_events enable row level security;

-- Owners manage their own pages.
create policy pages_owner_all on pages
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Owners read their subscribers / events.
create policy subs_owner_read on subscribers
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
create policy events_owner_read on break_glass_events
  for select using (exists (select 1 from pages p where p.id = page_id and p.owner = auth.uid()));
```
> Note: public subscribe writes and break-glass sends go through the **service-role** server client (bypasses RLS) in Tasks 6–9, so no public-insert policy is exposed.

- [ ] **Step 2: Apply the migration**

Run (with the linked Supabase project):
```bash
supabase db push
```
Expected: migration applies; `pages`, `subscribers`, `break_glass_events` exist.

- [ ] **Step 3: Verify tables exist**

Run: `supabase db diff` (or check the dashboard).
Expected: no pending diff — schema matches migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql && git commit -m "feat: initial schema + RLS for pages, subscribers, events"
```

---

### Task 6: Supabase clients + data-access functions

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/data/pages.ts`, `lib/data/subscribers.ts`

**Interfaces:**
- Consumes: `getEnv()` (Task 1); `normalizeEmail`/`isValidEmail` (Task 3); `isValidSlug` (Task 2).
- Produces:
  - `serviceClient()` → service-role Supabase client (server only).
  - `getPageBySlug(slug: string)` → `Page | null` where `Page = { id, slug, creatorName, realHandle, breakGlassActive }`.
  - `createPage(owner: string, input: { slug, creatorName, realHandle })` → `Page`.
  - `setBreakGlass(pageId: string, active: boolean)` → `void`.
  - `addSubscriber(pageId: string, email: string)` → `{ ok: boolean; reason?: "invalid" | "duplicate" }`.
  - `listSubscriberEmails(pageId: string)` → `string[]`.

- [ ] **Step 1: Server + browser clients**

Create `lib/supabase/server.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Supabase server env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

Create `lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Page data access**

Create `lib/data/pages.ts`:
```ts
import { serviceClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/slug";

export type Page = {
  id: string;
  slug: string;
  creatorName: string;
  realHandle: string;
  breakGlassActive: boolean;
};

type Row = {
  id: string; slug: string; creator_name: string;
  real_handle: string; break_glass_active: boolean;
};

const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
});

export async function getPageBySlug(slug: string): Promise<Page | null> {
  const { data } = await serviceClient()
    .from("pages").select("*").eq("slug", slug).maybeSingle();
  return data ? toPage(data as Row) : null;
}

export async function createPage(
  owner: string,
  input: { slug: string; creatorName: string; realHandle: string },
): Promise<Page> {
  if (!isValidSlug(input.slug)) throw new Error("invalid slug");
  const { data, error } = await serviceClient()
    .from("pages")
    .insert({ owner, slug: input.slug, creator_name: input.creatorName, real_handle: input.realHandle })
    .select("*").single();
  if (error) throw error;
  return toPage(data as Row);
}

export async function setBreakGlass(pageId: string, active: boolean): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ break_glass_active: active }).eq("id", pageId);
  if (error) throw error;
}
```

- [ ] **Step 3: Subscriber data access**

Create `lib/data/subscribers.ts`:
```ts
import { serviceClient } from "@/lib/supabase/server";
import { normalizeEmail, isValidEmail } from "@/lib/email";

export async function addSubscriber(
  pageId: string, email: string,
): Promise<{ ok: boolean; reason?: "invalid" | "duplicate" }> {
  if (!isValidEmail(email)) return { ok: false, reason: "invalid" };
  const { error } = await serviceClient()
    .from("subscribers").insert({ page_id: pageId, email: normalizeEmail(email) });
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    throw error;
  }
  return { ok: true };
}

export async function listSubscriberEmails(pageId: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("subscribers").select("email").eq("page_id", pageId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { email: string }).email);
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase lib/data && git commit -m "feat: supabase clients + page/subscriber data access"
```

---

### Task 7: Public capture / status page + subscribe endpoint

**Files:**
- Create: `app/p/[slug]/page.tsx`, `app/api/subscribe/route.ts`

**Interfaces:**
- Consumes: `getPageBySlug`, `addSubscriber` (Task 6); `pageState` (Task 4).
- Produces: public route `GET /p/:slug` (renders normal capture form OR break-glass warning), and `POST /api/subscribe` with body `{ slug, email }` → `{ ok, reason? }`.

- [ ] **Step 1: Subscribe API route**

Create `app/api/subscribe/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPageBySlug } from "@/lib/data/pages";
import { addSubscriber } from "@/lib/data/subscribers";

const Body = z.object({ slug: z.string(), email: z.string() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const page = await getPageBySlug(parsed.data.slug);
  if (!page) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const result = await addSubscriber(page.id, parsed.data.email);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
```

- [ ] **Step 2: Public page**

Create `app/p/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/data/pages";
import { pageState } from "@/lib/breakGlass";
import { SubscribeForm } from "./subscribe-form";

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  if (pageState(page) === "break_glass") {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">This is the real {page.creatorName}</h1>
        <p className="mt-4">
          {page.creatorName}&apos;s usual account is having problems. The real account is{" "}
          <strong>{page.realHandle}</strong>.
        </p>
        <p className="mt-4 text-sm text-gray-600">
          If anyone messages you claiming to be {page.creatorName} from another account,
          treat them as an imposter. Do not send money, gift cards, or personal details.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">Stay connected with {page.creatorName}</h1>
      <p className="mt-2 text-sm text-gray-600">
        Get updates directly — even if my social account ever goes down.
      </p>
      <SubscribeForm slug={page.slug} />
    </main>
  );
}
```

Create `app/p/[slug]/subscribe-form.tsx`:
```tsx
"use client";
import { useState } from "react";

export function SubscribeForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email }),
    });
    const data = await res.json();
    setStatus(data.ok || data.reason === "duplicate" ? "ok" : "error");
  }

  if (status === "ok") return <p className="mt-6">You&apos;re on the list. Thank you!</p>;
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Keep me updated</button>
      {status === "error" && <p className="text-sm text-red-600">Please check your email address.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, then seed one page row via the Supabase dashboard (owner = any auth user id, slug = `demo`, creator_name = `Demo`, real_handle = `@demo`).
Visit `http://localhost:3000/p/demo`, submit an email.
Expected: success message; a row appears in `subscribers`. Re-submitting the same email still shows success (duplicate handled).

- [ ] **Step 4: Commit**

```bash
git add app/p app/api/subscribe && git commit -m "feat: public capture/status page + subscribe endpoint"
```

---

### Task 8: Auth + create-page dashboard

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/dashboard/create-page-form.tsx`, `app/api/pages/route.ts`, `lib/auth.ts`

**Interfaces:**
- Consumes: `createPage`, `getPageBySlug` (Task 6); `generateSlugFromHandle`, `isValidSlug` (Task 2); browser client (Task 6).
- Produces: magic-link login; `POST /api/pages` body `{ creatorName, realHandle, slug }` → creates a page for the logged-in user; dashboard that shows the user's page or the create form. `lib/auth.ts` exports `getSessionUser()` → `{ id } | null` (server-side, from Supabase auth cookie).

- [ ] **Step 1: Server session helper**

Create `lib/auth.ts`:
```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getSessionUser(): Promise<{ id: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}
```

- [ ] **Step 2: Login page (magic link)**

Create `app/(auth)/login/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` },
    });
    setSent(true);
  }
  if (sent) return <main className="p-8">Check your email for a login link.</main>;
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-bold">Log in</h1>
      <form onSubmit={send} className="mt-4 flex flex-col gap-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com" className="rounded border p-2" />
        <button className="rounded bg-black p-2 text-white">Send magic link</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create-page endpoint**

Create `app/api/pages/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createPage, getPageBySlug } from "@/lib/data/pages";
import { isValidSlug } from "@/lib/slug";

const Body = z.object({ creatorName: z.string().min(1), realHandle: z.string().min(1), slug: z.string() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidSlug(parsed.data.slug))
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  if (await getPageBySlug(parsed.data.slug))
    return NextResponse.json({ ok: false, reason: "taken" }, { status: 409 });
  const page = await createPage(user.id, parsed.data);
  return NextResponse.json({ ok: true, slug: page.slug });
}
```

- [ ] **Step 4: Dashboard + create form**

Create `app/(dashboard)/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { CreatePageForm } from "./create-page-form";

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) return <main className="mx-auto max-w-md p-8"><CreatePageForm /></main>;
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Your lifeline page</h1>
      <p className="mt-2">Public link: <code>/p/{data.slug}</code></p>
    </main>
  );
}
```

Create `app/(dashboard)/dashboard/create-page-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { generateSlugFromHandle } from "@/lib/slug";

export function CreatePageForm() {
  const [creatorName, setName] = useState("");
  const [realHandle, setHandle] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = generateSlugFromHandle(realHandle || creatorName);
    const res = await fetch("/api/pages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorName, realHandle, slug }),
    });
    const data = await res.json();
    if (data.ok) window.location.href = "/dashboard";
    else setError(data.reason === "taken" ? "That link is taken — tweak your handle." : "Check your details.");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Create your lifeline page</h1>
      <input required placeholder="Your name" value={creatorName} onChange={(e) => setName(e.target.value)} className="rounded border p-2" />
      <input required placeholder="@yourhandle" value={realHandle} onChange={(e) => setHandle(e.target.value)} className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Create page</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Visit `/login`, complete magic link, land on `/dashboard`, create a page, confirm `/p/<slug>` renders the capture form.
Expected: page row created with `owner` = your user id.

- [ ] **Step 6: Commit**

```bash
git add app lib/auth.ts && git commit -m "feat: magic-link auth + create-page dashboard"
```

---

### Task 9: Break-glass activation + broadcast send

**Files:**
- Create: `lib/email/resend.ts`, `app/api/break-glass/route.ts`, `app/(dashboard)/dashboard/break-glass-button.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx` (add the button when a page exists)

**Interfaces:**
- Consumes: `getSessionUser` (Task 8); `setBreakGlass` (Task 6); `listSubscriberEmails` (Task 6); `composeBroadcast` (Task 4); `serviceClient` (Task 6).
- Produces: `sendBroadcast({ to, subject, body })` (Resend adapter); `POST /api/break-glass` body `{ activate: boolean }` → toggles the caller's page and, on activate, emails all subscribers + records a `break_glass_events` row.

- [ ] **Step 1: Resend adapter**

Create `lib/email/resend.ts`:
```ts
import { Resend } from "resend";

export async function sendBroadcast(input: { to: string[]; subject: string; body: string }) {
  if (input.to.length === 0) return { sent: 0 };
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.BROADCAST_FROM ?? "Creator Lifeline <alerts@example.com>";
  await Promise.all(
    input.to.map((addr) =>
      resend.emails.send({ from, to: addr, subject: input.subject, text: input.body }),
    ),
  );
  return { sent: input.to.length };
}
```

- [ ] **Step 2: Break-glass endpoint**

Create `app/api/break-glass/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { setBreakGlass } from "@/lib/data/pages";
import { listSubscriberEmails } from "@/lib/data/subscribers";
import { composeBroadcast } from "@/lib/breakGlass";
import { sendBroadcast } from "@/lib/email/resend";

const Body = z.object({ activate: z.boolean() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: page } = await serviceClient()
    .from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  await setBreakGlass(page.id, parsed.data.activate);

  let recipientCount = 0;
  if (parsed.data.activate) {
    const emails = await listSubscriberEmails(page.id);
    const msg = composeBroadcast({ creatorName: page.creator_name, realHandle: page.real_handle });
    const result = await sendBroadcast({ to: emails, subject: msg.subject, body: msg.body });
    recipientCount = result.sent;
  }
  await serviceClient().from("break_glass_events")
    .insert({ page_id: page.id, activated: parsed.data.activate, recipient_count: recipientCount });

  return NextResponse.json({ ok: true, recipientCount });
}
```

- [ ] **Step 3: Dashboard button**

Create `app/(dashboard)/dashboard/break-glass-button.tsx`:
```tsx
"use client";
import { useState } from "react";

export function BreakGlassButton({ active }: { active: boolean }) {
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/break-glass", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: !on }),
    });
    const data = await res.json();
    if (data.ok) setOn(!on);
    setBusy(false);
  }
  return (
    <button onClick={toggle} disabled={busy}
      className={`mt-6 rounded p-3 text-white ${on ? "bg-gray-600" : "bg-red-600"}`}>
      {on ? "Deactivate break-glass" : "🚨 Activate break-glass — alert my subscribers"}
    </button>
  );
}
```

Modify `app/(dashboard)/dashboard/page.tsx` — replace the existing "page exists" branch with:
```tsx
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Your lifeline page</h1>
      <p className="mt-2">Public link: <code>/p/{data.slug}</code></p>
      <BreakGlassButton active={data.break_glass_active} />
    </main>
  );
```
Add the import at the top: `import { BreakGlassButton } from "./break-glass-button";`

- [ ] **Step 4: Manual verification**

With a page that has ≥1 subscriber (add your own email via `/p/<slug>`), click "Activate break-glass".
Expected: the subscriber receives the broadcast email; `/p/<slug>` now shows the "This is the real …" warning; a `break_glass_events` row exists with `recipient_count ≥ 1`. Deactivate returns the page to the capture form.

- [ ] **Step 5: Commit**

```bash
git add app lib/email && git commit -m "feat: break-glass activation + subscriber broadcast"
```

---

### Task 10: Deploy to Vercel + smoke test

**Files:**
- Create: `README.md` (env + run notes)

**Interfaces:**
- Consumes: everything above.
- Produces: a live URL.

- [ ] **Step 1: Set env vars on Vercel**

Set in the Vercel project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL` (the production URL), `BROADCAST_FROM` (a Resend-verified sender).

- [ ] **Step 2: Deploy**

Run: `npx vercel --prod`
Expected: deploy succeeds; note the URL.

- [ ] **Step 3: Full smoke test on production**

Log in → create page → open `/p/<slug>` in an incognito window → subscribe with a real inbox → activate break-glass → confirm the email arrives and the page flips to the warning state.
Expected: all steps pass end to end.

- [ ] **Step 4: Write README + commit**

Create `README.md` documenting env vars, `npm run dev`, `npm test`, and `supabase db push`.
```bash
git add README.md && git commit -m "docs: setup + deploy notes"
```

---

## Self-Review

**Spec coverage (Slice 1 subset):**
- Owned audience channel → Tasks 6–8 (capture page + subscribe + storage). ✓
- Break-glass status page → Tasks 4, 7, 9. ✓
- Resilience-not-recovery constraint → enforced by a unit test in Task 4 and copy in Tasks 7, 9. ✓
- No platform credentials / no follower export → Slice 1 touches no platform API; audience is built forward. ✓
- Freemium-later → no billing in this slice. ✓
- Deferred by design (documented in plan intro): Instagram OAuth/backup, email-forward alert, impersonation detection, billing → Slices 2–5.

**Placeholder scan:** every code step contains complete code; commands have expected output; no TBD/TODO. The only literal `example.com` values are Resend sender placeholders, explicitly replaced with a verified sender in Task 10. ✓

**Type consistency:** `Page` shape (`creatorName`/`realHandle`/`breakGlassActive`) is defined once in Task 6 and consumed consistently; `composeBroadcast`, `pageState`, `addSubscriber`, `listSubscriberEmails`, `setBreakGlass` signatures match across Tasks 4/6/7/9. ✓
