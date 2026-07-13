"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function SubscribeForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, email }),
    });
    const data = await res.json();
    setStatus(data.ok || data.reason === "duplicate" ? "ok" : "error");
  }

  if (status === "ok") return <p className="mt-6 text-sm text-secondary">You&apos;re on the list. Thank you!</p>;
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
      />
      <Button type="submit">Subscribe</Button>
      {status === "error" && <p className="text-sm text-danger">Please check your email address.</p>}
      <p className="text-xs text-muted">No account or password needed — just future updates.</p>
    </form>
  );
}
