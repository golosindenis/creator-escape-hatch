"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function SecondaryEmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pages/secondary-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setStatus(data.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <label className="text-sm font-medium text-secondary">Secondary email (for alerts)</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@personalemail.com"
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <Button type="submit" variant="ghost">Save</Button>
      {status === "saved" && <p className="text-sm text-accent">Saved.</p>}
      {status === "error" && <p className="text-sm text-danger">Please check your email address.</p>}
    </form>
  );
}
