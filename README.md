# Creator Escape Hatch — Slice 1: Lifeline

An owned-audience capture page and break-glass emergency broadcast system for creators. Build your independent subscriber list and activate a status page when you need to reach your audience directly, without platform dependency.

## Quick Start

### Prerequisites

- Node.js 18+
- A Supabase project
- A Resend account with a verified sender email

### Environment Setup

Copy `.env.local.example` to `.env.local` and fill in the required values:

```bash
cp .env.local.example .env.local
```

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Your Supabase anonymous (public) key
- `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase service role key (server-side only)
- `RESEND_API_KEY` — Your Resend API key for email broadcasting
- `NEXT_PUBLIC_APP_URL` — The app's public URL (e.g., `http://localhost:3000` locally; your Vercel URL in production)
- `BROADCAST_FROM` — A Resend-verified sender email address
- `RESEND_WEBHOOK_SECRET` — The signing secret for the Resend inbound-email webhook (used to verify svix signatures on `/api/inbound-email`)
- `NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN` — The verified inbound domain that receives forwarded security emails (e.g., `inbound.yourdomain.com`)
- `INSTAGRAM_APP_ID` — Your Meta app ID (for Instagram content backup and OAuth login)
- `INSTAGRAM_APP_SECRET` — Your Meta app secret (for Instagram content backup and OAuth login)

### Database

Initialize the database by applying the migration:

```bash
npx supabase db push
```

This creates three tables:
- `pages` — creator capture pages (slug, creator name, handle, break-glass status)
- `subscribers` — subscriber emails for each page
- `break_glass_events` — emergency activation logs

### Breach alerts

Creators can forward Instagram's own "new login" / "password changed" security emails to a per-page address, and the app will detect them and notify a secondary email — without ever touching Instagram credentials or APIs.

Setup (one-time, per deployment):

1. In the Resend dashboard, add and verify an inbound domain (e.g. `inbound.yourdomain.com`) and point its MX records per Resend's instructions.
2. Set the domain's inbound webhook URL to `https://<your-app>/api/inbound-email`.
3. Copy the webhook's signing secret into `RESEND_WEBHOOK_SECRET`, and set `NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN` to the verified domain.

Per-creator setup (done by the creator, in their own Instagram account):

1. Log in to the dashboard and set a secondary email; the dashboard will show a unique forwarding address for the page.
2. In Instagram, go to Settings → Security → Emails from Instagram, and add that forwarding address as a recipient for security emails.

This only configures a forwarding rule inside the creator's own Instagram account — the app never receives or stores an Instagram password or API credential, and cannot recover a compromised account. It can only detect Instagram's own alert emails once forwarded and notify the creator so they can act.

### Content backup

Creators can back up their Instagram post content — images, videos, captions, and engagement counts — to cloud storage without dependency on the platform. This slice backs up media only; growth metrics and follower history are not included. The feature is fully ungated; all authenticated creators can connect and sync.

Setup (one-time, per deployment):

1. At [developers.facebook.com](https://developers.facebook.com), create a Meta app and add the Instagram product.
2. In the app settings, enable "Instagram Login" and set the OAuth redirect URI to `https://<your-app>/api/instagram/callback` (for local dev, use `http://localhost:3000/api/instagram/callback`).
3. Add your own Instagram professional account as an app tester in Development mode.
4. Copy the app's App ID and App Secret into `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.

Per-creator setup (done by the creator, in the dashboard):

1. Log in and open the dashboard.
2. On the "Content backup" card, click "Connect Instagram".
3. Approve the app on Instagram's OAuth dialog to grant media read permissions.
4. After approval, the app syncs existing posts and displays a gallery of thumbnails. Click "Sync now" to refresh the backup after new posts are published on Instagram.

Meta App Review is required before creators other than the app's registered testers can connect. This review is a separate manual step outside the codebase and is handled by the app maintainer directly with Meta.

### Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

Run the test suite:

```bash
npm test
```

Watch mode:

```bash
npm test:watch
```

### Production Deployment

1. Create a Vercel project linked to this repository.
2. Set the six environment variables in Vercel project settings.
3. Deploy:
   ```bash
   npx vercel --prod
   ```
4. Verify the deployment with a smoke test: log in → create a page → subscribe → activate break-glass → confirm email delivery.

## Project Structure

- `app/` — Next.js 15 app directory (pages, API routes, layouts)
- `lib/` — Shared utilities (env validation, Supabase client, email & database helpers)
- `supabase/migrations/` — Database schema
- `__tests__/` — Unit tests (Vitest)

## Architecture

- **Frontend:** React 19 with Next.js 15 (App Router, Server Components)
- **Auth:** Supabase Auth (email/password)
- **Database:** Supabase PostgreSQL
- **Email:** Resend (transactional & broadcast)
- **Styling:** Tailwind CSS 4
- **Type Safety:** TypeScript, Zod for env validation

## Key Constraints

- **Resilience, not recovery:** The break-glass page is read-only; subscribers cannot unsubscribe. It's an emergency channel, not a mailing list.
- **No platform credentials:** The app does not touch platform APIs (Twitter, Instagram, etc.); all audience data is first-party.
- **Freemium structure deferred:** Slice 1 is free for all users; billing is planned for future slices.

## Further Reading

- [Design Spec](./docs/specs/2026-07-08-creator-escape-hatch-design.md)
- [Implementation Plan](./docs/implementation-plan.md)
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Resend Docs](https://resend.com/docs)
