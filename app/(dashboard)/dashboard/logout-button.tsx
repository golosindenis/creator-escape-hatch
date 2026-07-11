"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { browserClient } from "@/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await browserClient().auth.signOut();
    router.push("/login");
  }

  return (
    <Button
      variant="ghost"
      onClick={logout}
      disabled={busy}
      className="w-auto px-3 py-1.5 text-xs"
    >
      Log out
    </Button>
  );
}
