"use client";
import { useState } from "react";

export function BreakGlassButton({ active }: { active: boolean }) {
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/break-glass", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activate: !on }),
    });
    const data = await res.json();
    if (data.ok) setOn(!on);
    setBusy(false);
  }
  return (
    <button onClick={toggle} disabled={busy}
      className={`mt-6 rounded p-3 text-white ${on ? "bg-gray-600" : "bg-red-600"}`}>
      {on ? "Deactivate break-glass" : "🚨 Activate break-glass — alert my subscribers"}
    </button>
  );
}
