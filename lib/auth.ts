import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function getSessionUser(): Promise<{ id: string } | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}
