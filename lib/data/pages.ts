import { serviceClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/slug";

export type Page = {
  id: string;
  slug: string;
  creatorName: string;
  realHandle: string;
  breakGlassActive: boolean;
  secondaryEmail: string | null;
  checklistCompleted: string[];
  subscriptionStatus: string;
  comped: boolean;
  lemonsqueezyCustomerId: string | null;
  lemonsqueezySubscriptionId: string | null;
  lemonsqueezyRenewsAt: string | null;
};

type Row = {
  id: string; slug: string; creator_name: string;
  real_handle: string; break_glass_active: boolean;
  secondary_email: string | null; checklist_completed: string[];
  subscription_status: string; comped: boolean;
  lemonsqueezy_customer_id: string | null;
  lemonsqueezy_subscription_id: string | null;
  lemonsqueezy_renews_at: string | null;
};

const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
  secondaryEmail: r.secondary_email, checklistCompleted: r.checklist_completed,
  subscriptionStatus: r.subscription_status, comped: r.comped,
  lemonsqueezyCustomerId: r.lemonsqueezy_customer_id,
  lemonsqueezySubscriptionId: r.lemonsqueezy_subscription_id,
  lemonsqueezyRenewsAt: r.lemonsqueezy_renews_at,
});

export async function getPageBySlug(slug: string): Promise<Page | null> {
  const { data, error } = await serviceClient()
    .from("pages").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? toPage(data as Row) : null;
}

export async function createPage(
  owner: string,
  input: { slug: string; creatorName: string; realHandle: string },
): Promise<Page> {
  if (!isValidSlug(input.slug)) throw new Error("invalid slug");
  const { data, error } = await serviceClient()
    .from("pages")
    .insert({ owner, slug: input.slug, creator_name: input.creatorName, real_handle: input.realHandle })
    .select("*").single();
  if (error) throw error;
  return toPage(data as Row);
}

export async function setBreakGlass(pageId: string, active: boolean): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ break_glass_active: active }).eq("id", pageId);
  if (error) throw error;
}

export async function getPageById(pageId: string): Promise<Page | null> {
  const { data, error } = await serviceClient()
    .from("pages").select("*").eq("id", pageId).maybeSingle();
  if (error) throw error;
  return data ? toPage(data as Row) : null;
}

export async function setSecondaryEmail(pageId: string, email: string): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ secondary_email: email }).eq("id", pageId);
  if (error) throw error;
}

export async function setChecklistCompleted(pageId: string, completed: string[]): Promise<void> {
  const { error } = await serviceClient()
    .from("pages").update({ checklist_completed: completed }).eq("id", pageId);
  if (error) throw error;
}

export async function setBillingStatus(
  pageId: string,
  input: {
    subscriptionStatus: "active" | "expired";
    lemonsqueezyCustomerId: string;
    lemonsqueezySubscriptionId: string;
    lemonsqueezyRenewsAt: string | null;
  },
): Promise<void> {
  const { error } = await serviceClient()
    .from("pages")
    .update({
      subscription_status: input.subscriptionStatus,
      lemonsqueezy_customer_id: input.lemonsqueezyCustomerId,
      lemonsqueezy_subscription_id: input.lemonsqueezySubscriptionId,
      lemonsqueezy_renews_at: input.lemonsqueezyRenewsAt,
    })
    .eq("id", pageId);
  if (error) throw error;
}
