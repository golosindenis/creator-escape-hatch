# PWA support (installable icon)

## Goal

Let users add AccountGuard to their phone's home screen with a proper app icon and name, so it opens full-screen instead of as a plain browser tab. No offline support — the app needs live Supabase data, so a service worker is explicitly out of scope.

## Icon design

Rounded-square icon: dark background (`#0b0c0e`, matches `--surface-0`), teal (`#2dd4bf`) shield glyph with a checkmark, matching the existing `ShieldCheck` brand mark used in `Wordmark.tsx`. Approved as "Option B" during design review.

## Components

**`app/icon.tsx`**
Next.js Metadata File Convention icon generator using `ImageResponse` (from `next/og`). Renders the dark/teal shield glyph at 32×32. Next auto-injects the `<link rel="icon">` browser-tab favicon tag from this — it is not consumed by the manifest (see below).

**`app/apple-icon.tsx`**
Same glyph, rendered at 180×180 (Apple's touch-icon convention). Next auto-injects `<link rel="apple-touch-icon">` from this.

**`app/icons/192/route.tsx`, `app/icons/512/route.tsx`**
Plain Route Handlers (not the `icon.tsx` metadata convention) that each return `new ImageResponse(...)` with the same glyph at a fixed size. These exist because `manifest.ts`'s `icons` array needs a stable, predictable URL — the `icon.tsx` convention serves its output at a Next-generated hashed query path (`/icon?<generated>`) meant for `<head>` injection, not for external reference. A plain route at `/icons/192` and `/icons/512` gives the manifest fixed paths to point at, while still generating the PNG in code instead of committing binary files.

**`app/manifest.ts`**
Next's typed Web App Manifest convention. Fields:
- `name`: "AccountGuard"
- `short_name`: "AccountGuard"
- `description`: reuse the existing metadata description from `app/layout.tsx`
- `theme_color`: `#0b0c0e`
- `background_color`: `#0b0c0e`
- `display`: `"standalone"`
- `icons`: `[{ src: '/icons/192', sizes: '192x192', type: 'image/png' }, { src: '/icons/512', sizes: '512x512', type: 'image/png' }]`

## Wiring

Next.js auto-detects `manifest.ts`, `icon.tsx`, and `apple-icon.tsx` in the `app/` root and injects the correct `<link rel="manifest">`, `<link rel="icon">`, and `<link rel="apple-touch-icon">` tags into `<head>` at build time. No manual changes to `app/layout.tsx` are required. The `app/icons/*/route.tsx` handlers are plain routes and require no wiring beyond being referenced by URL in `manifest.ts`.

## Out of scope

- Service worker / offline caching
- App store listing (this is a web-only PWA, not a native/store app)
- Splash screen customization beyond what `theme_color`/`background_color` provide by default

## Testing

- Build the site and inspect generated `<head>` tags for manifest/icon links
- Load `/manifest.webmanifest` (or wherever Next serves it) directly and confirm valid JSON with correct colors/sizes
- Visually confirm icon renders correctly (dark background, teal shield) at 192 and 512 sizes
- On a phone browser, use "Add to Home Screen" and confirm the icon and name appear correctly, and that it opens in standalone mode (no browser address bar)
