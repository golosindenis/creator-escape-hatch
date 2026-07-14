# Prevention checklist: explicit Save button

## Goal

Replace the checklist's current auto-save-per-toggle behavior with local-only toggling plus an explicit Save button, so users get clear feedback on whether their changes are saved instead of a silent per-click network call.

## Motivation

Two problems with the current behavior (`app/(dashboard)/dashboard/prevention-checklist.tsx`):
- Every checkbox click fires its own `POST /api/pages/checklist` — five toggles is five separate requests.
- There's no UI feedback on save success or failure. A failed save is silent; the user has no way to know their progress wasn't recorded until they reload and see stale state.

## Approach

No backend change: `POST /api/pages/checklist` already accepts and replaces the full `completed: string[]` array, so batching multiple toggles into one save fits the existing API as-is.

Client-side, the component moves from "save on every toggle" to "track local dirty state, save on button click":

- Checkbox `onChange` only updates local React state (`useState`) — no network call.
- A `dirty` flag is derived by comparing current local state against the last-successfully-saved snapshot.
- The Save button is disabled when `dirty` is false, enabled when true.
- Clicking Save POSTs the current full `completed` array, same as today's per-toggle request.

This removes the `useRef` mirror that exists in the current implementation. That ref was added specifically to work around React's `setState` functional-updater only running synchronously on a component's first call ever (see prevention-checklist project memory) — it was needed because each toggle immediately triggered a network call that needed the freshly-computed value. Since saving is no longer coupled to each toggle, plain `useState` is sufficient; the ref workaround no longer applies to anything in this component.

## Save state machine

Status text rendered next to the Save button, plus button `disabled` state:

| State | Trigger | Button | Status text |
|---|---|---|---|
| Clean | initial load, or after successful save | disabled | (none) |
| Dirty | local state differs from last-saved snapshot | enabled | "Unsaved changes" |
| Saving | Save clicked | disabled | "Saving…" |
| Saved | POST resolves 200 | disabled | "Saved" (reverts to Clean/no-text after a short delay, e.g. 2s) |
| Error | POST fails or resolves non-200 | enabled (dirty state preserved) | "Couldn't save, try again" |

On save failure, checkbox state is **not** reverted — whatever the user last toggled stays as-is, so clicking Save again retries with their intended state.

## Explicitly out of scope

- No diffing/partial-update optimization — full-array save is how the API already works, no reason to change it.
- No `beforeunload` / navigation-away warning for unsaved changes.
- No toast/banner notification pattern — status is a plain inline text string next to the button.
- No change to `app/api/pages/checklist/route.ts` — existing validation and persistence logic is reused unchanged.

## Testing

- Toggle a checkbox: Save button becomes enabled, status shows "Unsaved changes", no network request fires yet.
- Toggle back to original state: verify dirty-check correctly returns to Clean (button disabled, no status text) — not just "any change ever made."
- Click Save: status shows "Saving…" then "Saved"; after the delay, status clears and button disables again.
- Reload the page after a successful save: confirm persisted state matches what was saved.
- Simulate a failed save (e.g. network error): status shows "Couldn't save, try again", button stays enabled, checkbox states are unchanged from what the user set, clicking Save again retries.
