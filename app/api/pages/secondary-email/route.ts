import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { setSecondaryEmail } from "@/lib/data/pages";
import { isValidEmail, normalizeEmail } from "@/lib/email";

const Body = z.object({ email: z.string() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidEmail(parsed.data.email))
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const { data: page } = await serviceClient()
    .from("pages").select("id").eq("owner", user.id).maybeSingle();
  if (!page) return NextResponse.json({ ok: false }, { status: 404 });

  await setSecondaryEmail(page.id, normalizeEmail(parsed.data.email));
  return NextResponse.json({ ok: true });
}
