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
