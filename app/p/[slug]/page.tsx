import { notFound } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { getPageBySlug } from "@/lib/data/pages";
import { pageState } from "@/lib/breakGlass";
import { hasActiveAccess } from "@/lib/billing";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { SubscribeForm } from "./subscribe-form";

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  if (pageState(page) === "break_glass") {
    return (
      <Shell>
        <div className="rounded-xl border border-danger bg-surface-1 p-6 text-center">
          <ShieldAlert className="mx-auto text-danger" size={28} aria-hidden="true" />
          <h1 className="mt-3 text-xl font-medium">This is the real {page.creatorName}</h1>
          <p className="mt-4 text-sm text-secondary">
            {page.creatorName}&apos;s usual account is having problems. The real account is{" "}
            <strong className="text-primary">{page.realHandle}</strong>.
          </p>
          <p className="mt-4 text-sm text-muted">
            If anyone messages you claiming to be {page.creatorName} from another account,
            treat them as an imposter. Do not send money, gift cards, or personal details.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="text-center">
        <ShieldCheck className="mx-auto text-accent" size={28} aria-hidden="true" />
        <h1 className="mt-3 text-xl font-medium">Get updates from {page.creatorName}</h1>
        <p className="mt-2 text-sm text-secondary">
          Drop your email to stay connected — even if my social account ever goes down.
        </p>
        <SubscribeForm slug={page.slug} hasAccess={hasActiveAccess(page)} />
      </Card>
    </Shell>
  );
}
