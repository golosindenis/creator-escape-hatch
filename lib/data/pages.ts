import { serviceClient } from "@/lib/supabase/server";
import { isValidSlug } from "@/lib/slug";

export type Page = {
  id: string;
  slug: string;
  creatorName: string;
  realHandle: string;
  breakGlassActive: boolean;
};

type Row = {
  id: string; slug: string; creator_name: string;
  real_handle: string; break_glass_active: boolean;
};

const toPage = (r: Row): Page => ({
  id: r.id, slug: r.slug, creatorName: r.creator_name,
  realHandle: r.real_handle, breakGlassActive: r.break_glass_active,
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
