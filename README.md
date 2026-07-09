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

### Database

Initialize the database by applying the migration:

```bash
npx supabase db push
```

This creates three tables:
- `pages` — creator capture pages (slug, creator name, handle, break-glass status)
- `subscribers` — subscriber emails for each page
- `break_glass_events` — emergency activation logs

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
