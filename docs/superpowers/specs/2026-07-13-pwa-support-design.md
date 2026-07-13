# PWA support (installable icon)

## Goal

Let users add AccountGuard to their phone's home screen with a proper app icon and name, so it opens full-screen instead of as a plain browser tab. No offline support — the app needs live Supabase data, so a service worker is explicitly out of scope.

## Icon design

Rounded-square icon: dark background (`#0b0c0e`, matches `--surface-0`), teal (`#2dd4bf`) shield glyph with a checkmark, matching the existing `ShieldCheck` brand mark used in `Wordmark.tsx`. Approved as "Option B" during design review.

## Components

**`app/icon.tsx`**
Next.js Metadata File Convention icon generator using `ImageResponse`. Renders the dark/teal shield glyph. Next serves this at multiple standard sizes automatically (used for the browser tab favicon and general `icons` metadata).

**`app/apple-icon.tsx`**
Same glyph, rendered at 180×180 (Apple's touch-icon convention), for iOS "Add to Home Screen".

**`app/manifest.ts`**
Next's typed Web App Manifest convention. Fields:
- `name`: "AccountGuard"
- `short_name`: "AccountGuard"
- `description`: reuse the existing metadata description from `app/layout.tsx`
- `theme_color`: `#0b0c0e`
- `background_color`: `#0b0c0e`
- `display`: `"standalone"`
- `icons`: array referencing 192×192 and 512×512 PNGs, produced by exporting `generateImageMetadata` from `app/icon.tsx` to emit both sizes from the one file (same glyph, scaled)

## Wiring

Next.js auto-detects `manifest.ts`, `icon.tsx`, and `apple-icon.tsx` in the `app/` root and injects the correct `<link rel="manifest">`, `<link rel="icon">`, and `<link rel="apple-touch-icon">` tags into `<head>` at build time. No manual changes to `app/layout.tsx` are required.

## Out of scope

- Service worker / offline caching
- App store listing (this is a web-only PWA, not a native/store app)
- Splash screen customization beyond what `theme_color`/`background_color` provide by default

## Testing

- Build the site and inspect generated `<head>` tags for manifest/icon links
- Load `/manifest.webmanifest` (or wherever Next serves it) directly and confirm valid JSON with correct colors/sizes
- Visually confirm icon renders correctly (dark background, teal shield) at 192 and 512 sizes
- On a phone browser, use "Add to Home Screen" and confirm the icon and name appear correctly, and that it opens in standalone mode (no browser address bar)
