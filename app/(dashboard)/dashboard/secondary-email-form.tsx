"use client";
import { useState } from "react";

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
      <label className="text-sm font-medium">Secondary email (for alerts)</label>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@personalemail.com" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Save</button>
      {status === "saved" && <p className="text-sm text-green-700">Saved.</p>}
      {status === "error" && <p className="text-sm text-red-600">Please check your email address.</p>}
    </form>
  );
}
