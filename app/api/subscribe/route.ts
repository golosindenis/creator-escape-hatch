import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPageBySlug } from "@/lib/data/pages";
import { addSubscriber } from "@/lib/data/subscribers";

const Body = z.object({ slug: z.string(), email: z.string() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  const page = await getPageBySlug(parsed.data.slug);
  if (!page) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  const result = await addSubscriber(page.id, parsed.data.email);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
