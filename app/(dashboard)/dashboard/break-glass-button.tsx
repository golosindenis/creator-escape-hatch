"use client";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
    <Button
      onClick={toggle}
      disabled={busy}
      variant={on ? "ghost" : "danger"}
      className="mt-4 flex items-center justify-center gap-2"
    >
      {!on && <AlertTriangle size={16} aria-hidden="true" />}
      {on ? "Deactivate break-glass" : "Activate break-glass — alert my subscribers"}
    </Button>
  );
}
