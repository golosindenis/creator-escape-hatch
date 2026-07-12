"use client";
import { useState } from "react";
import { CHECKLIST_ITEMS } from "@/lib/checklist";

export function PreventionChecklist({ initialCompleted }: { initialCompleted: string[] }) {
  const [completed, setCompleted] = useState<string[]>(initialCompleted);

  async function toggle(key: string) {
    const next = completed.includes(key)
      ? completed.filter((k) => k !== key)
      : [...completed, key];
    setCompleted(next);
    await fetch("/api/pages/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
  }

  return (
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
  );
}
