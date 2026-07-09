import { serviceClient } from "@/lib/supabase/server";

export async function recordBreachAlert(pageId: string, alertType: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breach_alerts").insert({ page_id: pageId, alert_type: alertType });
  if (error) throw error;
}
