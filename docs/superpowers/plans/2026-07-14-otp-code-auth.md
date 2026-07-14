# OTP-Code Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the magic-link login email with a 6-digit code that the user types back into whichever browser/PWA instance they started login from, so iOS home-screen PWA users can complete login without ever needing a link to open in Safari.

**Architecture:** `app/(auth)/login/page.tsx` grows a second client-side step (email → code) using the same `browserClient()` Supabase instance already in use; `verifyOtp` runs entirely in the browser and sets the session cookie via `@supabase/ssr`, so no new server route is needed. The two routes that only existed to handle magic-link clicks are deleted.

**Tech Stack:** Next.js 15 App Router, React 19, `@supabase/supabase-js` + `@supabase/ssr`, Tailwind, Vitest.

## Global Constraints

- Use `browserClient().auth.verifyOtp({ email, token, type: "email" })` for code verification — NOT `token_hash`/`verifyOtp({ type, token_hash })`, which is the old link-based shape and won't work with a typed code.
- Drop the `emailRedirectTo` option from `signInWithOtp` entirely — there is no redirect target once the link is gone.
- Navigate to `/dashboard` after a successful verify using `window.location.href = "/dashboard"`, matching the existing precedent in `app/(dashboard)/dashboard/create-page-form.tsx:18` (`if (data.ok) window.location.href = "/dashboard";`) — a full navigation, not `router.push`, so the server-rendered dashboard reliably re-reads the freshly-set cookie rather than risking a stale RSC cache.
- This repo has no component-test infrastructure: `vitest.config.ts` only includes `lib/**/*.test.ts` in a `node` environment (no jsdom, no React Testing Library). Do not add component-test tooling for this change — verify the UI behavior manually via the browser preview instead, consistent with existing project convention (only pure `lib/` functions get automated unit tests here).
- Manual step outside this plan's scope, owned by Denis, not a task below: the Supabase dashboard's "Magic Link" email template must be edited to include `{{ .Token }}` before the real end-to-end email flow can be tested with a live code. Until that's done, the code step's UI/error-handling can still be fully verified (a `signInWithOtp` call still succeeds and still moves to the code step; only the *content* of the received email is affected).

---

### Task 1: Two-step email → code login flow

**Files:**
- Modify: `app/(auth)/login/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `browserClient()` from `lib/supabase/browser.ts` (unchanged signature — `createBrowserClient` instance with `.auth.signInWithOtp()` and `.auth.verifyOtp()`).
- Produces: nothing consumed by other tasks — this is a self-contained page component.

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function sendCode() {
    setError(null);
    setSending(true);
    const { error } = await browserClient().auth.signInWithOtp({ email });
    setSending(false);
    if (error) {
      setError(
        error.message && error.message !== "{}"
          ? error.message
          : "Couldn't send the login email. Please try again in a moment.",
      );
      return;
    }
    setStep("code");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    const { error } = await browserClient().auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setError(
        error.message && error.message !== "{}"
          ? error.message
          : "That code didn't work. Please check it and try again.",
      );
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <Shell>
      <div className="mb-8">
        <Wordmark />
      </div>
      <Card>
        {step === "email" ? (
          <>
            <h1 className="text-xl font-medium">Log in</h1>
            <form onSubmit={handleEmailSubmit} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send login code"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium">Enter your code</h1>
            <p className="mt-1 text-sm text-secondary">
              We sent a 6-digit code to {email}.
            </p>
            <form onSubmit={handleCodeSubmit} className="mt-4 flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit" disabled={verifying}>
                {verifying ? "Verifying…" : "Verify code"}
              </Button>
            </form>
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              className="mt-3 text-sm text-secondary underline hover:text-primary disabled:opacity-50"
            >
              {sending ? "Resending…" : "Resend code"}
            </button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    </Shell>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Start the preview and verify the email step renders**

Start the dev server (`preview_start` if not already running), navigate to `/login`.
Expected via `preview_snapshot`: heading "Log in", an email input, a button reading "Send login code". No "magic link" wording anywhere on the page.

- [ ] **Step 4: Verify the happy path to the code step**

Using `preview_fill` + `preview_click`, submit a real email address you control through the form.
Expected: button briefly reads "Sending…", then the card swaps to heading "Enter your code" with the text "We sent a 6-digit code to `<the email you typed>`.", a numeric code input, "Verify code" button, and a "Resend code" link. Confirm via `preview_network` that a request to Supabase's `signInWithOtp` endpoint returned success (2xx), not an error.

- [ ] **Step 5: Verify the wrong-code error path**

With the code step showing, use `preview_fill` to enter an arbitrary 6-digit value (e.g. `000000`) and submit.
Expected: an inline red error message appears below the form (`text-danger` styling), the code step remains visible (no navigation away from `/login`), and `preview_console_logs` shows no unhandled exceptions.

- [ ] **Step 6: Verify resend**

Click "Resend code".
Expected: button reads "Resending…" briefly, no error appears, the code step stays visible (this re-invokes `signInWithOtp` — confirm via `preview_network` a second successful call).

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/login/page.tsx"
git commit -m "feat: replace magic-link login with 6-digit code entry"
```

---

### Task 2: Remove the now-dead magic-link routes

**Files:**
- Delete: `app/auth/confirm/route.ts`
- Delete: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: nothing — this is cleanup with no other consumers.

- [ ] **Step 1: Confirm nothing else references these routes**

Run: `grep -rn "auth/confirm\|auth/callback" --include="*.ts" --include="*.tsx" app lib components`
Expected: no matches (Task 1's rewritten `login/page.tsx` no longer references `/auth/confirm`, and `/auth/callback` was already unreferenced prior to this plan).

- [ ] **Step 2: Delete both route files**

```bash
git rm "app/auth/confirm/route.ts" "app/auth/callback/route.ts"
```

- [ ] **Step 3: Type-check and run the existing test suite**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors; all existing `lib/**/*.test.ts` tests still pass (establish the current passing count first with `npm run test` on `main` before this change if you need a baseline to compare against).

- [ ] **Step 4: Verify the routes are actually gone at runtime**

With the preview server running, use `preview_network` or a direct fetch to hit `http://localhost:<port>/auth/confirm?token_hash=x&type=magiclink` and `http://localhost:<port>/auth/callback?code=x`.
Expected: both return Next.js's default 404, not the old redirect-to-`/login?error=link_expired` behavior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove magic-link auth routes superseded by code entry"
```
