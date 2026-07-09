import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) return <main className="mx-auto max-w-md p-8"><CreatePageForm /></main>;
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Your lifeline page</h1>
      <p className="mt-2">Public link: <code>/p/{data.slug}</code></p>
      <BreakGlassButton active={data.break_glass_active} />
    </main>
  );
}
