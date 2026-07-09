"use client";
import { useState } from "react";
import { generateSlugFromHandle } from "@/lib/slug";

export function CreatePageForm() {
  const [creatorName, setName] = useState("");
  const [realHandle, setHandle] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = generateSlugFromHandle(realHandle || creatorName);
    const res = await fetch("/api/pages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creatorName, realHandle, slug }),
    });
    const data = await res.json();
    if (data.ok) window.location.href = "/dashboard";
    else setError(data.reason === "taken" ? "That link is taken — tweak your handle." : "Check your details.");
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">Create your lifeline page</h1>
      <input required placeholder="Your name" value={creatorName} onChange={(e) => setName(e.target.value)} className="rounded border p-2" />
      <input required placeholder="@yourhandle" value={realHandle} onChange={(e) => setHandle(e.target.value)} className="rounded border p-2" />
      <button className="rounded bg-black p-2 text-white">Create page</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
