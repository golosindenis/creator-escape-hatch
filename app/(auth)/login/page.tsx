"use client";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

const LINK_EXPIRED_MESSAGE =
  "That login link didn't work — it may have expired, already been used, or been opened in a different browser than the one you requested it from. Please request a new one.";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "link_expired") {
      setError(LINK_EXPIRED_MESSAGE);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await browserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    });
    if (error) {
      setError(error.message && error.message !== "{}" ? error.message : "Couldn't send the login email. Please try again in a moment.");
      return;
    }
    setSent(true);
  }
  return (
    <Shell>
      <div className="mb-8">
        <Wordmark />
      </div>
      <Card>
        {sent ? (
          <p className="text-sm text-secondary">Check your email for a login link.</p>
        ) : (
          <>
            <h1 className="text-xl font-medium">Log in</h1>
            <form onSubmit={send} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit">Send magic link</Button>
            </form>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </>
        )}
      </Card>
    </Shell>
  );
}
