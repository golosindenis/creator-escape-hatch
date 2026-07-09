import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createPage, getPageBySlug } from "@/lib/data/pages";
import { isValidSlug } from "@/lib/slug";

const Body = z.object({ creatorName: z.string().min(1), realHandle: z.string().min(1), slug: z.string() });

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidSlug(parsed.data.slug))
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  if (await getPageBySlug(parsed.data.slug))
    return NextResponse.json({ ok: false, reason: "taken" }, { status: 409 });
  const page = await createPage(user.id, parsed.data);
  return NextResponse.json({ ok: true, slug: page.slug });
}
