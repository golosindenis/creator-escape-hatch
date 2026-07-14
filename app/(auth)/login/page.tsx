"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function sendCode() {
    setError(null);
    setSending(true);
    const { error } = await browserClient().auth.signInWithOtp({ email });
    setSending(false);
    if (error) {
      setError(
        error.message && error.message !== "{}"
          ? error.message
          : "Couldn't send the login email. Please try again in a moment.",
      );
      return;
    }
    setStep("code");
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendCode();
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    const { error } = await browserClient().auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setError(
        error.message && error.message !== "{}"
          ? error.message
          : "That code didn't work. Please check it and try again.",
      );
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <Shell>
      <div className="mb-8">
        <Wordmark />
      </div>
      <Card>
        {step === "email" ? (
          <>
            <h1 className="text-xl font-medium">Log in</h1>
            <form onSubmit={handleEmailSubmit} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send login code"}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium">Enter your code</h1>
            <p className="mt-1 text-sm text-secondary">
              We sent a 6-digit code to {email}.
            </p>
            <form onSubmit={handleCodeSubmit} className="mt-4 flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-primary placeholder:text-muted focus:border-border-strong focus:outline-none"
              />
              <Button type="submit" disabled={verifying}>
                {verifying ? "Verifying…" : "Verify code"}
              </Button>
            </form>
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              className="mt-3 text-sm text-secondary underline hover:text-primary disabled:opacity-50"
            >
              {sending ? "Resending…" : "Resend code"}
            </button>
          </>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
    </Shell>
  );
}
