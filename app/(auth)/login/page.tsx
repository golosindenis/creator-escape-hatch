"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    });
    if (error) {
      setError(error.message && error.message !== "{}" ? error.message : "Couldn't send the login email. Please try again in a moment.");
      return;
    }
    setSent(true);
  }
  if (sent) return <main className="p-8">Check your email for a login link.</main>;
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-bold">Log in</h1>
      <form onSubmit={send} className="mt-4 flex flex-col gap-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com" className="rounded border p-2" />
        <button className="rounded bg-black p-2 text-white">Send magic link</button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}
