"use client";
import { useState } from "react";

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

  if (status === "ok") return <p className="mt-6">You&apos;re on the list. Thank you!</p>;
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com" className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Keep me updated</button>
      {status === "error" && <p className="text-sm text-red-600">Please check your email address.</p>}
    </form>
  );
}
