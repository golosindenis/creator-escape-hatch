# OTP-code login (design)

## Problem

Login sends a Supabase magic link (`signInWithOtp` + `emailRedirectTo: /auth/confirm`). Tapping that link in the Mail app always opens Safari — iOS/WebKit has no "link capturing" mechanism to route it into an already-installed home-screen PWA instead. Even setting that aside, Safari and the standalone PWA keep fully separate cookie jars on iOS, so a session established in the Safari tab is invisible to the installed app anyway. Net effect: a user who installed AccountGuard to their iOS home screen can never complete login by tapping the email link from inside that installed app.

There is no supported iOS mechanism (as of iOS 26, per current WebKit standards-positions tracking) that fixes this at the link level. The durable fix is to stop relying on a tappable link at all: send a 6-digit code by email and let the user type it into whichever app instance (Safari tab or installed PWA) they started the login from.

## Scope

Replace the magic-link flow with a code-only OTP flow, for all users (not just PWA/iOS) — one flow, no link-vs-code branching to maintain. Out of scope: rate limiting/lockout beyond what Supabase already provides, "wrong email" recovery UI (a page reload already resets to the email-entry step), any change to session/cookie handling once a session exists.

## Architecture

**`app/(auth)/login/page.tsx`** (client component) grows a second step:

1. **Email step (existing, trimmed):** email input → `browserClient().auth.signInWithOtp({ email })`. Drop the `emailRedirectTo` option — there's no redirect target anymore.
2. **Code step (new):** replaces today's static "check your email for a login link" message. Renders a 6-digit code input, a submit button, and a "Resend code" link.
   - Submit → `browserClient().auth.verifyOtp({ email, token: code, type: "email" })`. On success, navigate to `/dashboard` using a full navigation (not a soft client-side push) so the server-rendered dashboard reliably re-reads the freshly-set session cookie. On failure, show `error.message` inline (matches the existing error-display pattern on this page) and let the user retry or resend — no custom attempt cap.
   - "Resend code" re-invokes the same `signInWithOtp({ email })` call from step 1, reusing the `email` value already held in component state.
3. The existing `useEffect` that reads `?error=link_expired` from the URL and shows `LINK_EXPIRED_MESSAGE` is removed — nothing generates that redirect once magic links are gone.

**Removed entirely:**
- `app/auth/confirm/route.ts` — the token_hash exchange route; unreachable once no email contains a link to it.
- `app/auth/callback/route.ts` — PKCE `exchangeCodeForSession` route; already unused prior to this change (confirmed via repo search — no code constructs a link pointing here).

**Unchanged:** `app/page.tsx` root redirect-if-authenticated logic, `lib/supabase/browser.ts`, `lib/supabase/server.ts`, the dashboard's auth guard. None of these depend on how the session was established — `verifyOtp` called from the browser client sets the same cookie shape the server helpers already read.

## Data flow

**Happy path:** email entered → `signInWithOtp` → Supabase emails a 6-digit code (template updated per "Manual pre-step" below) → user stays on the same login page/tab they started from (no navigation ever happens between send and verify) → code entered → `verifyOtp` succeeds → `@supabase/ssr`'s browser client writes the session cookie → full navigation to `/dashboard`, which reads that cookie exactly as it does today for any other session.

**Error paths:**
- `signInWithOtp` fails (invalid email, Supabase-side error) — unchanged from today's behavior: inline error message under the email form.
- `verifyOtp` fails (wrong code, expired code, already-consumed code) — inline error message under the code form, styled with the existing `text-danger` class. User can retry the same code entry or click "Resend code." No differentiation between error types; Supabase's message is descriptive enough, matching how the email-step error is already surfaced.

## Manual pre-step (outside this codebase)

The Supabase dashboard's "Magic Link" email template must be edited to include `{{ .Token }}` so the sent email actually contains the 6-digit code — otherwise the email still shows only a dead link. This is a dashboard-only change (no `supabase/config.toml` or template files exist in this repo to manage it as code, and no available MCP tool manages email templates). **This must happen at or before deploy** — until it's edited, the code step would ask users for a code that was never actually emailed to them. The old template is harmless to edit ahead of the code deploy, since the magic-link route it currently points to keeps working until this change ships.

## Testing

- Any existing automated test asserting on the current static "check your email for a login link" message needs updating to match the new code-entry UI.
- Manual verification in the browser preview: request a code, confirm the UI swaps to the code-entry step, confirm "Resend code" re-sends, confirm a wrong/garbage code surfaces an inline error, confirm a valid code (once the template edit is live and a real code can be obtained) lands on `/dashboard`.
- Real end-to-end proof on iOS is Denis's to do post-deploy: request a code from the installed home-screen PWA, read the code from Mail, type it back into the still-open PWA tab, confirm landing on `/dashboard` without ever leaving the app.

## Rollout order

1. Edit the Supabase magic-link email template to include `{{ .Token }}` (dashboard, manual, no-op until step 2 ships).
2. Merge and deploy this code change.
3. Denis retests the real iOS PWA login flow.
