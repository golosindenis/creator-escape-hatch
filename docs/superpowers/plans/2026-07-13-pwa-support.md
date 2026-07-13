# PWA Support (Installable Icon) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add AccountGuard to their phone's home screen with a dark/teal shield icon and proper name, opening in standalone (full-screen) mode instead of a plain browser tab.

**Architecture:** Next.js 15 App Router Metadata File Conventions (`app/icon.tsx`, `app/apple-icon.tsx`, `app/manifest.ts`) generate the favicon and iOS touch icon programmatically via `ImageResponse`. Because `manifest.ts`'s `icons` array needs stable URLs (unlike the hashed `/icon?<generated>` path Next injects into `<head>`), two plain Route Handlers (`app/icons/192/route.tsx`, `app/icons/512/route.tsx`) serve the same glyph at fixed paths for the manifest to reference. All icon variants share one glyph-rendering function so the shield mark stays visually identical everywhere.

**Tech Stack:** Next.js 15.5.20 App Router, `next/og` `ImageResponse`, TypeScript, vitest (existing project test runner — not used for these files; see Testing Approach below).

## Global Constraints

- Dark background `#0b0c0e` (matches `--surface-0`), teal `#2dd4bf` shield glyph — approved icon design, do not alter colors.
- No service worker, no offline caching — explicitly out of scope.
- No manual/binary icon image files committed — all icons generated in code via `ImageResponse`.
- App name in manifest: `"AccountGuard"` (both `name` and `short_name`).
- `display: "standalone"`, `theme_color` and `background_color` both `#0b0c0e`.

## Testing Approach

These files are declarative Next.js config (icon renderers, a manifest object) with no branching business logic — there is nothing meaningful to unit-test with vitest (the project's existing `lib/*.test.ts` files all test pure logic functions, which is not what this feature adds). Instead, each task's "test cycle" is: start the dev server, `curl` the relevant URL, and assert on the HTTP response (status, content-type, byte signature, or JSON body). This matches the verification approach already approved in the design spec (`docs/superpowers/specs/2026-07-13-pwa-support-design.md`).

---

### Task 1: Shared icon glyph + favicon (`app/icon.tsx`)

**Files:**
- Create: `app/_icons/glyph.tsx`
- Create: `app/icon.tsx`

**Interfaces:**
- Produces: `renderIcon(size: number): ReactElement` exported from `app/_icons/glyph.tsx` — takes the pixel size of the square canvas, returns a JSX tree (dark square background + centered teal shield-with-checkmark SVG, scaled to that size). Consumed by Task 2 and Task 3.

- [ ] **Step 1: Create the shared glyph module**

`app/_icons/glyph.tsx` (the `_icons` folder name is prefixed with `_` so Next.js's "private folder" convention excludes it from routing — it's just a shared module, not a route):

```tsx
import type { ReactElement } from "react";

export function renderIcon(size: number): ReactElement {
  const shieldSize = Math.round(size * 0.72);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0c0e",
      }}
    >
      <svg width={shieldSize} height={shieldSize} viewBox="0 0 100 100" fill="none">
        <path
          d="M50 6 L90 22 V48 C90 74 72 92 50 98 C28 92 10 74 10 48 V22 Z"
          fill="#2dd4bf"
        />
        <path
          d="M32 50 L45 63 L70 34"
          stroke="#0b0c0e"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Create the favicon route**

`app/icon.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { renderIcon } from "./_icons/glyph";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(renderIcon(size.width), { ...size });
}
```

- [ ] **Step 3: Verify the favicon is wired into `<head>`**

```bash
npm run dev > /tmp/accountguard-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200 && break
  sleep 1
done
curl -s http://localhost:3000/ | grep -o '<link rel="icon"[^>]*>'
kill $DEV_PID
```

Expected: a line like `<link rel="icon" href="/icon?<hash>" type="image/png" sizes="32x32"/>` is printed. If nothing prints, check `/tmp/accountguard-dev.log` for a compile error in `app/icon.tsx` or `app/_icons/glyph.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/_icons/glyph.tsx app/icon.tsx
git commit -m "feat: add generated favicon with shield glyph"
```

---

### Task 2: Apple touch icon (`app/apple-icon.tsx`)

**Files:**
- Create: `app/apple-icon.tsx`

**Interfaces:**
- Consumes: `renderIcon(size: number)` from `app/_icons/glyph.tsx` (Task 1)

- [ ] **Step 1: Create the apple touch icon route**

`app/apple-icon.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { renderIcon } from "./_icons/glyph";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(renderIcon(size.width), { ...size });
}
```

- [ ] **Step 2: Verify it's wired into `<head>`**

```bash
npm run dev > /tmp/accountguard-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200 && break
  sleep 1
done
curl -s http://localhost:3000/ | grep -o '<link rel="apple-touch-icon"[^>]*>'
kill $DEV_PID
```

Expected: a line like `<link rel="apple-touch-icon" href="/apple-icon?<hash>" type="image/png" sizes="180x180"/>` is printed.

- [ ] **Step 3: Commit**

```bash
git add app/apple-icon.tsx
git commit -m "feat: add generated apple touch icon"
```

---

### Task 3: Manifest icon routes (`app/icons/192`, `app/icons/512`)

**Files:**
- Create: `app/icons/192/route.tsx`
- Create: `app/icons/512/route.tsx`

**Interfaces:**
- Consumes: `renderIcon(size: number)` from `app/_icons/glyph.tsx` (Task 1)
- Produces: stable `GET /icons/192` and `GET /icons/512` endpoints, each returning a `image/png` body — consumed by `app/manifest.ts` (Task 4) via their URL paths.

- [ ] **Step 1: Create the 192×192 route**

`app/icons/192/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { renderIcon } from "../../_icons/glyph";

export async function GET() {
  return new ImageResponse(renderIcon(192), { width: 192, height: 192 });
}
```

- [ ] **Step 2: Create the 512×512 route**

`app/icons/512/route.tsx`:

```tsx
import { ImageResponse } from "next/og";
import { renderIcon } from "../../_icons/glyph";

export async function GET() {
  return new ImageResponse(renderIcon(512), { width: 512, height: 512 });
}
```

- [ ] **Step 3: Verify both routes serve PNGs**

```bash
npm run dev > /tmp/accountguard-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200 && break
  sleep 1
done
curl -s -D - -o /tmp/icon-192.png http://localhost:3000/icons/192 | grep -i "content-type"
curl -s -D - -o /tmp/icon-512.png http://localhost:3000/icons/512 | grep -i "content-type"
file /tmp/icon-192.png /tmp/icon-512.png
kill $DEV_PID
```

Expected: both `content-type: image/png` headers print, and `file` reports `PNG image data, 192 x 192` and `PNG image data, 512 x 512` respectively.

- [ ] **Step 4: Commit**

```bash
git add app/icons/192/route.tsx app/icons/512/route.tsx
git commit -m "feat: add fixed-URL manifest icon routes"
```

---

### Task 4: Web app manifest (`app/manifest.ts`)

**Files:**
- Create: `app/manifest.ts`

**Interfaces:**
- Consumes: `/icons/192` and `/icons/512` routes (Task 3) by URL string (no code import — referenced as plain paths in the `icons` array).

- [ ] **Step 1: Create the manifest**

`app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AccountGuard",
    short_name: "AccountGuard",
    description:
      "Own your audience and keep an emergency channel ready if your account ever gets locked out or hacked.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 2: Verify the manifest is served with correct content**

```bash
npm run dev > /tmp/accountguard-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q 200 && break
  sleep 1
done
curl -s http://localhost:3000/manifest.webmanifest | tee /tmp/manifest.json
node -e '
const m = require("/tmp/manifest.json");
const checks = [
  m.name === "AccountGuard",
  m.short_name === "AccountGuard",
  m.display === "standalone",
  m.theme_color === "#0b0c0e",
  m.background_color === "#0b0c0e",
  Array.isArray(m.icons) && m.icons.length === 2,
  m.icons.some((i) => i.sizes === "192x192"),
  m.icons.some((i) => i.sizes === "512x512"),
];
if (checks.every(Boolean)) {
  console.log("PASS: manifest fields correct");
} else {
  console.error("FAIL: manifest checks", checks);
  process.exit(1);
}
'
curl -s http://localhost:3000/ | grep -o '<link rel="manifest"[^>]*>'
kill $DEV_PID
```

Expected: `PASS: manifest fields correct` printed, and a `<link rel="manifest" href="/manifest.webmanifest"/>` tag found in the page head.

- [ ] **Step 3: Commit**

```bash
git add app/manifest.ts
git commit -m "feat: add web app manifest for home screen install"
```

---

### Task 5: Full build verification and manual phone check

**Files:** none (verification only)

- [ ] **Step 1: Run the existing test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests in `lib/*.test.ts` still pass (this feature adds no vitest tests, per Testing Approach above, so the count of passing tests should be unchanged from before Task 1).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Run a production build**

```bash
npm run build
```

Expected: build succeeds with no errors, and the build output lists `/icon`, `/apple-icon`, `/manifest.webmanifest`, `/icons/192`, and `/icons/512` among the generated routes.

- [ ] **Step 4: Manual phone verification**

On a phone (not automatable — do this by hand):
1. Open `https://accountguard.app` in the phone's browser.
2. Open the browser's share/menu and choose "Add to Home Screen".
3. Confirm the home screen icon shows the dark background with the teal shield glyph, and the label reads "AccountGuard".
4. Tap the new home screen icon and confirm it opens full-screen (no browser address bar).

- [ ] **Step 5: Commit (if Step 1-3 required any fixes)**

If everything passed with no code changes, there is nothing to commit for this task. If lint/build surfaced fixes, commit them:

```bash
git add -A
git commit -m "fix: address build/lint issues from PWA support verification"
```
