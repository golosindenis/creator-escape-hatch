import { serviceClient } from "@/lib/supabase/server";

export type BreachAlert = {
  id: string;
  alertType: string;
  createdAt: string;
};

export async function recordBreachAlert(pageId: string, alertType: string): Promise<void> {
  const { error } = await serviceClient()
    .from("breach_alerts").insert({ page_id: pageId, alert_type: alertType });
  if (error) throw error;
}

export async function listBreachAlerts(pageId: string): Promise<BreachAlert[]> {
  const { data, error } = await serviceClient()
    .from("breach_alerts")
    .select("id, alert_type, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, alertType: r.alert_type, createdAt: r.created_at }));
}
