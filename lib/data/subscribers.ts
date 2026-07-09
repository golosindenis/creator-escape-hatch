import { serviceClient } from "@/lib/supabase/server";
import { normalizeEmail, isValidEmail } from "@/lib/email";

export async function addSubscriber(
  pageId: string, email: string,
): Promise<{ ok: boolean; reason?: "invalid" | "duplicate" }> {
  if (!isValidEmail(email)) return { ok: false, reason: "invalid" };
  const { error } = await serviceClient()
    .from("subscribers").insert({ page_id: pageId, email: normalizeEmail(email) });
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "duplicate" };
    throw error;
  }
  return { ok: true };
}

export async function listSubscriberEmails(pageId: string): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("subscribers").select("email").eq("page_id", pageId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { email: string }).email);
}
