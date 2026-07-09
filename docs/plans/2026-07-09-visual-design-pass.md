# Visual Design Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app (currently on create-next-app's default black/white theme) a real dark, security-toned visual identity across all four surfaces (`/`, `/login`, `/dashboard`, `/p/[slug]`), with zero behavior/data changes.

**Architecture:** Pure presentation-layer change. A semantic CSS-variable token layer in `app/globals.css` (CDS-inspired: surfaces, text, border, accent, danger), four small shared React primitives in `components/ui/` (`Shell`, `Card`, `Button`, `Badge`), and one new icon dependency (`lucide-react`). Every existing page/component is restyled to use these; no new routes, no new data fetching, no schema changes.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4 (`@theme inline` token generation), TypeScript, `lucide-react` (new).

## Global Constraints

- No behavior, data model, route, or auth changes — styling/markup only (spec §2, §5, §6).
- Red (`--danger`) is used in exactly one interactive place (break-glass button) and one conditional place (public page when break-glass is active) — never decoratively (spec §8).
- No new test infrastructure — no component tests. Existing unit test suite (`slug.test.ts`, `breakGlass.test.ts`, `email.test.ts`, `breachAlert.test.ts`) must keep passing unchanged (spec §7).
- `tsc --noEmit` and `npm run lint` must stay clean throughout.
- One new dependency only: `lucide-react` (spec §2).
- No multi-tenant/platform changes — one page per account stays as-is (spec §2, brainstorming decision).
- Production deploy (`vercel --prod`) only happens after explicit user go-ahead, after local verification (spec §7).

---

### Task 1: Design tokens in `globals.css`

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: Tailwind utility classes consumed by every later task: `bg-surface-0/1/2`, `text-primary/secondary/muted`, `border-border`/`border-border-strong`, `bg-accent`/`text-accent`/`border-accent`, `text-accent-foreground`, `bg-danger`/`text-danger`/`border-danger`, `text-danger-foreground`.

- [ ] **Step 1: Replace the token block**

Replace the entire contents of `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --surface-0: #0b0c0e;
  --surface-1: #141518;
  --surface-2: #1c1e22;
  --primary: #f5f6f7;
  --secondary: #a8abb2;
  --muted: #6b6e76;
  --border: #26282d;
  --border-strong: #34363c;
  --accent: #2dd4bf;
  --accent-foreground: #06201c;
  --danger: #e2483d;
  --danger-foreground: #ffffff;
}

@theme inline {
  --color-surface-0: var(--surface-0);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-primary: var(--primary);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-danger: var(--danger);
  --color-danger-foreground: var(--danger-foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--surface-0);
  color: var(--primary);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

This removes the old `--background`/`--foreground` pair and the `prefers-color-scheme: dark` media query entirely — dark is now the only theme, not conditional.

- [ ] **Step 2: Verify the build picks up the new tokens**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds with no CSS/type errors. (The build will still render old pages with now-undefined `dark:` variants harmlessly ignored — those get replaced in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add dark security-toned design tokens"
```

---

### Task 2: Add `lucide-react` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `lucide-react` icon components importable as `import { ShieldCheck } from "lucide-react"` in later tasks.

- [ ] **Step 1: Install**

Run: `npm install lucide-react`
Expected: `package.json` gains `"lucide-react": "^<version>"` under `dependencies`.

- [ ] **Step 2: Verify it resolves**

Run: `node -e "require.resolve('lucide-react')"`
Expected: prints a path with no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add lucide-react for iconography"
```

---

### Task 3: `Shell` and `Card` primitives

**Files:**
- Create: `components/ui/Shell.tsx`
- Create: `components/ui/Card.tsx`

**Interfaces:**
- Consumes: nothing (pure presentational, only needs Task 1's Tailwind color utilities).
- Produces:
  - `Shell({ children: React.ReactNode; className?: string })` — page wrapper, default `export function Shell`.
  - `Card({ children: React.ReactNode; className?: string })` — raised surface container, default `export function Card`.

- [ ] **Step 1: Write `components/ui/Shell.tsx`**

```tsx
export function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto min-h-screen max-w-md px-6 py-12 ${className}`}>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: Write `components/ui/Card.tsx`**

```tsx
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 p-6 ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Shell.tsx components/ui/Card.tsx
git commit -m "feat: add Shell and Card UI primitives"
```

---

### Task 4: `Button` and `Badge` primitives

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `components/ui/Badge.tsx`

**Interfaces:**
- Consumes: Task 1's Tailwind color utilities.
- Produces:
  - `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost" })` — default `export function Button`. Always full-width (`w-full`) — callers needing an inline-width CTA style their own element instead of overriding this (see Task 9's homepage CTA link).
  - `Badge({ children: React.ReactNode })` — default `export function Badge`.

- [ ] **Step 1: Write `components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground",
  danger: "bg-danger text-danger-foreground",
  ghost: "bg-transparent text-primary border border-border-strong",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Write `components/ui/Badge.tsx`**

```tsx
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-secondary">
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/Button.tsx components/ui/Badge.tsx
git commit -m "feat: add Button and Badge UI primitives"
```

---

### Task 5: Restyle login page

**Files:**
- Modify: `app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `Shell`, `Card`, `Button` from Task 3/4 (`@/components/ui/Shell`, `@/components/ui/Card`, `@/components/ui/Button`); `ShieldCheck` from `lucide-react`.

- [ ] **Step 1: Replace `app/(auth)/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { browserClient } from "@/lib/supabase/browser";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    });
    if (error) {
      setError(error.message && error.message !== "{}" ? error.message : "Couldn't send the login email. Please try again in a moment.");
      return;
    }
    setSent(true);
  }
  return (
    <Shell>
      <div className="mb-8 flex items-center gap-2">
        <ShieldCheck className="text-accent" size={24} aria-hidden="true" />
        <span className="text-base font-medium">AccountGuard</span>
      </div>
      <Card>
        {sent ? (
          <p className="text-sm text-secondary">Check your email for a login link.</p>
        ) : (
          <>
            <h1 className="text-xl font-medium">Log in</h1>
            <form onSubmit={send} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit">Send magic link</Button>
            </form>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </>
        )}
      </Card>
    </Shell>
  );
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Run full test suite to confirm no regression**

Run: `npm test`
Expected: `4 passed`, `25 passed` (unchanged from before this plan — no logic touched).

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/page.tsx"
git commit -m "style: restyle login page with design tokens"
```

---

### Task 6: Restyle dashboard client components

**Files:**
- Modify: `app/(dashboard)/dashboard/create-page-form.tsx`
- Modify: `app/(dashboard)/dashboard/break-glass-button.tsx`
- Modify: `app/(dashboard)/dashboard/secondary-email-form.tsx`

**Interfaces:**
- Consumes: `Button` from Task 4 (`@/components/ui/Button`); `AlertTriangle` from `lucide-react`.
- Produces: same component names/props as before (`CreatePageForm()`, `BreakGlassButton({ active: boolean })`, `SecondaryEmailForm({ initialEmail: string })`) — Task 7 imports these unchanged.

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/create-page-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { generateSlugFromHandle } from "@/lib/slug";
import { Button } from "@/components/ui/Button";

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
      <h1 className="text-xl font-medium">Create your lifeline page</h1>
      <input
        required
        placeholder="Your name"
        value={creatorName}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <input
        required
        placeholder="@yourhandle"
        value={realHandle}
        onChange={(e) => setHandle(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <Button type="submit">Create page</Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/dashboard/break-glass-button.tsx`**

```tsx
"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    <Button
      onClick={toggle}
      disabled={busy}
      variant={on ? "ghost" : "danger"}
      className="mt-4 flex items-center justify-center gap-2"
    >
      {!on && <AlertTriangle size={16} aria-hidden="true" />}
      {on ? "Deactivate break-glass" : "Activate break-glass — alert my subscribers"}
    </Button>
  );
}
```

- [ ] **Step 3: Replace `app/(dashboard)/dashboard/secondary-email-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

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
      <label className="text-sm font-medium text-secondary">Secondary email (for alerts)</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@personalemail.com"
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <Button type="submit" variant="ghost">Save</Button>
      {status === "saved" && <p className="text-sm text-accent">Saved.</p>}
      {status === "error" && <p className="text-sm text-danger">Please check your email address.</p>}
    </form>
  );
}
```

- [ ] **Step 4: Verify types, lint, and tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; `4 passed`, `25 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/create-page-form.tsx app/\(dashboard\)/dashboard/break-glass-button.tsx app/\(dashboard\)/dashboard/secondary-email-form.tsx
git commit -m "style: restyle dashboard client components with design tokens"
```

---

### Task 7: Restyle dashboard page

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `Shell`, `Card`, `Badge` from Tasks 3/4; `CreatePageForm`, `BreakGlassButton`, `SecondaryEmailForm` from Task 6 (unchanged names/props); `listBreachAlerts` (existing, unchanged) from `@/lib/data/breachAlerts`; `ShieldCheck` from `lucide-react`.

- [ ] **Step 1: Replace `app/(dashboard)/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { listBreachAlerts } from "@/lib/data/breachAlerts";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";
import { SecondaryEmailForm } from "./secondary-email-form";

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
        <Card>
          <CreatePageForm />
        </Card>
      </Shell>
    );
  }

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;
  const alerts = await listBreachAlerts(data.id);

  return (
    <Shell className="max-w-lg">
      <div className="mb-8 flex items-center gap-2">
        <ShieldCheck className="text-accent" size={24} aria-hidden="true" />
        <span className="text-base font-medium">AccountGuard</span>
      </div>

      <Card>
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
    </Shell>
  );
}
```

- [ ] **Step 2: Verify types, lint, and tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; `4 passed`, `25 passed`.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx"
git commit -m "style: restyle dashboard page with Card-based layout"
```

---

### Task 8: Restyle public page and subscribe form

**Files:**
- Modify: `app/p/[slug]/subscribe-form.tsx`
- Modify: `app/p/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Shell`, `Card`, `Button` from Tasks 3/4; `ShieldAlert`, `ShieldCheck` from `lucide-react`; `getPageBySlug`, `pageState` (existing, unchanged).
- Note: the break-glass-active state does **not** use the shared `Card` component — it needs a `border-danger` border, and stacking a second border-color utility on top of `Card`'s own `border-border` class risks an unpredictable Tailwind cascade order. It's written as a one-off styled `div` matching `Card`'s visual spec instead (this is the only such exception in the app — everywhere else uses `Card` directly).

- [ ] **Step 1: Replace `app/p/[slug]/subscribe-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

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

  if (status === "ok") return <p className="mt-6 text-sm text-secondary">You&apos;re on the list. Thank you!</p>;
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <Button type="submit">Keep me updated</Button>
      {status === "error" && <p className="text-sm text-danger">Please check your email address.</p>}
    </form>
  );
}
```

- [ ] **Step 2: Replace `app/p/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { getPageBySlug } from "@/lib/data/pages";
import { pageState } from "@/lib/breakGlass";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { SubscribeForm } from "./subscribe-form";

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  if (pageState(page) === "break_glass") {
    return (
      <Shell>
        <div className="rounded-xl border border-danger bg-surface-1 p-6 text-center">
          <ShieldAlert className="mx-auto text-danger" size={28} aria-hidden="true" />
          <h1 className="mt-3 text-xl font-medium">This is the real {page.creatorName}</h1>
          <p className="mt-4 text-sm text-secondary">
            {page.creatorName}&apos;s usual account is having problems. The real account is{" "}
            <strong className="text-primary">{page.realHandle}</strong>.
          </p>
          <p className="mt-4 text-sm text-muted">
            If anyone messages you claiming to be {page.creatorName} from another account,
            treat them as an imposter. Do not send money, gift cards, or personal details.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="text-center">
        <ShieldCheck className="mx-auto text-accent" size={28} aria-hidden="true" />
        <h1 className="mt-3 text-xl font-medium">Stay connected with {page.creatorName}</h1>
        <p className="mt-2 text-sm text-secondary">
          Get updates directly — even if my social account ever goes down.
        </p>
        <SubscribeForm slug={page.slug} />
      </Card>
    </Shell>
  );
}
```

- [ ] **Step 3: Verify types, lint, and tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; `4 passed`, `25 passed`.

- [ ] **Step 4: Commit**

```bash
git add app/p/\[slug\]/subscribe-form.tsx app/p/\[slug\]/page.tsx
git commit -m "style: restyle public page with design tokens"
```

---

### Task 9: Build the homepage and update metadata

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `Shell` from Task 3; `ShieldCheck`, `Radio`, `Bell` from `lucide-react`; Next.js `Link` from `next/link`.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from "next/link";
import { ShieldCheck, Radio, Bell } from "lucide-react";
import { Shell } from "@/components/ui/Shell";

const VALUE_POINTS = [
  {
    icon: ShieldCheck,
    title: "Own your audience",
    body: "Collect subscriber emails directly, independent of any platform's algorithm or goodwill.",
  },
  {
    icon: Radio,
    title: "Emergency broadcast",
    body: "If your account is ever locked, hacked, or taken down, activate a status page and reach everyone in one click.",
  },
  {
    icon: Bell,
    title: "Breach alerts",
    body: "Forward Instagram's own security emails to us and get notified the moment something looks wrong.",
  },
];

export default function Home() {
  return (
    <Shell className="max-w-lg text-center">
      <div className="flex items-center justify-center gap-2">
        <ShieldCheck className="text-accent" size={28} aria-hidden="true" />
        <span className="text-base font-medium">AccountGuard</span>
      </div>

      <h1 className="mt-8 text-3xl font-medium text-primary">
        Don&apos;t let a platform hold your audience hostage
      </h1>
      <p className="mt-4 text-base text-secondary">
        Build an owned subscriber list and keep an emergency channel ready, so a lockout,
        hack, or ban never means losing the people who follow you.
      </p>

      <Link
        href="/login"
        className="mt-8 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Get started
      </Link>

      <div className="mt-16 flex flex-col gap-6 text-left">
        {VALUE_POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4">
            <Icon className="mt-1 shrink-0 text-accent" size={20} aria-hidden="true" />
            <div>
              <h2 className="text-sm font-medium text-primary">{title}</h2>
              <p className="mt-1 text-sm text-secondary">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Update metadata in `app/layout.tsx`**

Change the `metadata` export (leave everything else in the file unchanged):

```tsx
export const metadata: Metadata = {
  title: "AccountGuard — audience backup for creators",
  description: "Own your audience and keep an emergency channel ready if your account ever gets locked out or hacked.",
};
```

- [ ] **Step 3: Verify types, lint, and tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; `4 passed`, `25 passed`.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: build real homepage, replacing Next.js starter content"
```

---

### Task 10: Full verification across all four surfaces

**Files:** none (verification only)

**Interfaces:** none — this task only observes the output of Tasks 1–9.

- [ ] **Step 1: Run the full check suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type/lint errors; `Test Files 4 passed (4)`, `Tests 25 passed (25)`.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev` (leave running)
Expected: `Ready in <N>ms` on `http://localhost:3000`.

- [ ] **Step 3: Visually check the homepage**

Open `http://localhost:3000/` in a browser.
Expected: dark background, shield mark + "AccountGuard" wordmark, headline, "Get started" button, three value points with icons. No leftover Next.js starter content ("Get started by editing app/page.tsx" must be gone).

- [ ] **Step 4: Visually check the login page**

Open `http://localhost:3000/login`.
Expected: centered card on dark background, shield mark above it, email input, "Send magic link" button in teal.

- [ ] **Step 5: Visually check the dashboard (both states)**

Log in with a real account (or reuse an existing session). If the account has no page yet, confirm the "Create your lifeline page" form renders inside a card. If it has a page, confirm: page-status card with public link and break-glass button (red when inactive, ghost-style "Deactivate" when active); breach-alerts card with forwarding address, secondary email form, and — if any `breach_alerts` rows exist — an "Alert history" list with badges.

- [ ] **Step 6: Visually check the public page (both states)**

Open `http://localhost:3000/p/<a-real-slug>` for a page with break-glass inactive: confirm the calm teal "Stay connected" card. Toggle break-glass on from the dashboard, reload the public page: confirm it switches to the red-bordered "This is the real ..." warning card.

- [ ] **Step 7: Stop the dev server**

Stop the process started in Step 2.

- [ ] **Step 8: Ask the user before deploying**

Per the global constraints, do not run `vercel --prod` as part of this task. Report the verification results and ask the user for explicit go-ahead before deploying to production.
