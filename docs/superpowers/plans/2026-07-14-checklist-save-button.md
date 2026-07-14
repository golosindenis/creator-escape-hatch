# Prevention Checklist Save Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prevention Checklist's auto-save-per-toggle behavior with local-only toggling plus an explicit Save button that shows unsaved/saving/saved/error status.

**Architecture:** Checkbox toggles become pure local state changes (no network call). A new pure helper `isChecklistDirty` (added alongside the existing `CHECKLIST_ITEMS`/`isValidChecklistKey` in `lib/checklist.ts`, following this codebase's established pattern of keeping domain logic in a tested pure module) compares current local state against the last-saved snapshot to drive the Save button's enabled state and the status text. The component tracks save state (`idle`/`saving`/`saved`/`error`) and uses a generation-token ref to discard stale async results if the user edits or re-saves while a save is still in flight. No backend changes — `POST /api/pages/checklist` already accepts and replaces the full array.

**Tech Stack:** Next.js 15 App Router, React (client component, `useState`/`useRef`/`useEffect`), Vitest for unit tests. No new dependencies.

## Global Constraints

- No backend/API/migration changes — `app/api/pages/checklist/route.ts` and the DB schema are untouched (spec: "No backend change").
- On save failure, checkbox state is not reverted — the user's in-progress edits stay as-is so they can retry (spec: "Save state machine" table, Error row).
- No `beforeunload` navigation warning (spec: "Explicitly out of scope").
- No toast/banner — status is plain inline text next to the Save button (spec: "Explicitly out of scope").
- Automated tests are added only for new pure logic, matching this codebase's existing convention (`vitest.config.ts` only includes `lib/**/*.test.ts`; no component-test framework — jsdom/testing-library — is installed in this repo). Component-level behavior is verified manually in the browser.

---

## File Structure

- Modify: `lib/checklist.ts` — add `isChecklistDirty(current: string[], saved: string[]): boolean`.
- Modify: `lib/checklist.test.ts` — unit tests for `isChecklistDirty`.
- Modify: `app/(dashboard)/dashboard/prevention-checklist.tsx` — rewrite to local dirty-state + Save button + status text; remove the per-toggle POST and the `useRef` mirror it existed for (no longer needed since saving isn't triggered synchronously from every toggle).

---

### Task 1: `isChecklistDirty` pure helper (TDD)

**Files:**
- Modify: `lib/checklist.ts`
- Modify: `lib/checklist.test.ts`

**Interfaces:**
- Produces: `isChecklistDirty(current: string[], saved: string[]): boolean` — true iff the two arrays don't contain the same set of keys (order-independent, duplicate-insensitive is not a concern since callers never produce duplicates).

- [ ] **Step 1: Write the failing tests**

Add to `lib/checklist.test.ts` (append after the existing `describe` blocks, keep the existing `import` line but add `isChecklistDirty` to it):

```ts
import { describe, it, expect } from "vitest";
import {
  CHECKLIST_ITEMS,
  isValidChecklistKey,
  isValidChecklistCompleted,
  isChecklistDirty,
} from "@/lib/checklist";
```

```ts
describe("isChecklistDirty", () => {
  it("returns false when arrays contain the same keys", () => {
    expect(isChecklistDirty(["a", "b"], ["a", "b"])).toBe(false);
  });
  it("returns false when arrays contain the same keys in a different order", () => {
    expect(isChecklistDirty(["b", "a"], ["a", "b"])).toBe(false);
  });
  it("returns true when current has an extra key", () => {
    expect(isChecklistDirty(["a", "b"], ["a"])).toBe(true);
  });
  it("returns true when current is missing a key", () => {
    expect(isChecklistDirty(["a"], ["a", "b"])).toBe(true);
  });
  it("returns false for two empty arrays", () => {
    expect(isChecklistDirty([], [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checklist.test.ts`
Expected: FAIL with "isChecklistDirty is not a function" (or similar — the export doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Add to `lib/checklist.ts`, after `isValidChecklistCompleted`:

```ts
export function isChecklistDirty(current: string[], saved: string[]): boolean {
  if (current.length !== saved.length) return true;
  const savedSet = new Set(saved);
  return current.some((key) => !savedSet.has(key));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checklist.test.ts`
Expected: PASS (10 tests — 5 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/checklist.ts lib/checklist.test.ts && git commit -m "feat: add isChecklistDirty pure helper"
```

---

### Task 2: Rewrite `PreventionChecklist` with Save button

**Files:**
- Modify: `app/(dashboard)/dashboard/prevention-checklist.tsx`

**Interfaces:**
- Consumes: `CHECKLIST_ITEMS`, `isChecklistDirty` from `@/lib/checklist` (Task 1); posts to `/api/pages/checklist` (unchanged, existing route). Uses a plain `<button>` rather than the shared `components/ui/Button` component — `Button` is `w-full` by design (fits its existing full-width form-submit usages), which conflicts with this component's inline button-plus-status-text layout.
- Produces: `PreventionChecklist({ initialCompleted }: { initialCompleted: string[] })` — same external signature as before, no callers need to change.

- [ ] **Step 1: Replace the component body**

Replace the full contents of `app/(dashboard)/dashboard/prevention-checklist.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { CHECKLIST_ITEMS, isChecklistDirty } from "@/lib/checklist";

type SaveState = "idle" | "saving" | "saved" | "error";

const SAVED_MESSAGE_MS = 2000;

export function PreventionChecklist({ initialCompleted }: { initialCompleted: string[] }) {
  const [completed, setCompleted] = useState<string[]>(initialCompleted);
  const [savedSnapshot, setSavedSnapshot] = useState<string[]>(initialCompleted);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  function clearSavedTimeout() {
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }
  }

  function toggle(key: string) {
    saveTokenRef.current++;
    clearSavedTimeout();
    setSaveState("idle");
    setCompleted((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleSave() {
    const token = ++saveTokenRef.current;
    clearSavedTimeout();
    setSaveState("saving");
    const submitted = completed;
    try {
      const res = await fetch("/api/pages/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: submitted }),
      });
      if (!res.ok) throw new Error("save failed");
      if (saveTokenRef.current !== token) return;
      setSavedSnapshot(submitted);
      setSaveState("saved");
      savedTimeoutRef.current = setTimeout(() => setSaveState("idle"), SAVED_MESSAGE_MS);
    } catch {
      if (saveTokenRef.current !== token) return;
      setSaveState("error");
    }
  }

  const dirty = isChecklistDirty(completed, savedSnapshot);
  const statusText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Couldn't save, try again"
          : dirty
            ? "Unsaved changes"
            : null;
  const statusColor =
    saveState === "saved" ? "text-accent" : saveState === "error" ? "text-danger" : "text-secondary";

  return (
    <>
      <ul className="mt-4 flex flex-col gap-3">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5">
            <input
              type="checkbox"
              id={`checklist-${item.key}`}
              checked={completed.includes(item.key)}
              onChange={() => toggle(item.key)}
              className="mt-0.5 h-4 w-4 rounded border-border bg-surface-2 accent-accent"
            />
            <label htmlFor={`checklist-${item.key}`} className="text-sm text-secondary">
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saveState === "saving"}
          className="rounded-lg border border-border-strong px-4 py-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
        {statusText && <span className={`text-sm ${statusColor}`}>{statusText}</span>}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including Task 1's new `isChecklistDirty` tests — no regressions.

- [ ] **Step 3: Verify the project typechecks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification in browser**

Start the dev server, sign in, open `/dashboard`:
- On load, Save button is disabled, no status text shown (clean state, nothing changed yet).
- Check one item: Save button becomes enabled, status text shows "Unsaved changes" in secondary/muted color. No network request fires yet (confirm via browser devtools network tab — no POST to `/api/pages/checklist` until Save is clicked).
- Uncheck the same item (back to original state): Save button becomes disabled again, status text disappears — confirms dirty-check compares against the saved snapshot, not "any click ever happened."
- Check an item and click Save: status briefly shows "Saving…", then "Saved" in accent color, Save button disabled. After ~2 seconds, status text clears.
- Reload the page: confirm the checked item is still checked (persisted).
- Uncheck it and click Save, then immediately reload: confirm it's unchecked (persisted).
- Simulate a failed save: open browser devtools, go offline (or block the `/api/pages/checklist` request), check an item, click Save. Status should show "Couldn't save, try again" in danger/red color, Save button re-enabled, the checkbox stays in the state the user set (not reverted). Go back online, click Save again: confirm it now succeeds and shows "Saved".
- Rapid-edit race check: check an item, click Save, and *before* the save resolves (throttle network to Slow 3G in devtools to give yourself time) toggle a different item. Confirm the status does not incorrectly flash "Saved" after your second edit — it should reflect your latest edit ("Unsaved changes"), not the outcome of the first, now-stale save.
- Confirm the "Content & metrics backup" card above it and the rest of the dashboard (status strip, breach-alerts card, break-glass button) are all unaffected.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/prevention-checklist.tsx" && git commit -m "feat: add explicit Save button to prevention checklist"
```

---

## Self-Review Notes

- **Spec coverage:** "Approach" (local dirty state, single POST on save, existing API reused) → Task 2. "Save state machine" table (all 5 rows: Clean/Dirty/Saving/Saved/Error) → Task 2 Step 1's `statusText`/button-disabled logic, verified row-by-row in Task 2 Step 4. Removal of the `useRef` closure workaround → Task 2 Step 1 (new component has no per-toggle network call, so the old mirror pattern is gone; the new `useRef`s are for timeout-handle and race-token bookkeeping, an unrelated concern). "Explicitly out of scope" (no diffing, no beforeunload, no toast) → confirmed not present in Task 2's implementation. "Testing" section's manual scenarios → all mapped to Task 2 Step 4 bullets, plus the rapid-edit race scenario added as an explicit manual check since it's the one scenario without automated coverage in this repo's testing convention.
- **Placeholder scan:** none found — all steps have complete code and exact commands.
- **Type consistency:** `SaveState` type, `isChecklistDirty(current, saved)` parameter order, and `PreventionChecklist({ initialCompleted })` signature are consistent throughout Task 2 and match Task 1's produced interface.
- **Race condition note:** the generation-token (`saveTokenRef`) guard against a stale in-flight save overwriting a newer edit's status is not spec-mandated explicitly, but follows directly from the spec's state machine (an in-flight save must not clobber state the user has since changed) and mirrors the kind of async-state bug this codebase's review process previously caught in this exact component (see `[[project-prevention-checklist-status]]` memory — a stale-closure bug in the original per-toggle save). Included proactively rather than left to be caught in review.
