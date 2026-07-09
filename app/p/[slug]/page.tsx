import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/data/pages";
import { pageState } from "@/lib/breakGlass";
import { SubscribeForm } from "./subscribe-form";

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  if (pageState(page) === "break_glass") {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">This is the real {page.creatorName}</h1>
        <p className="mt-4">
          {page.creatorName}&apos;s usual account is having problems. The real account is{" "}
          <strong>{page.realHandle}</strong>.
        </p>
        <p className="mt-4 text-sm text-gray-600">
          If anyone messages you claiming to be {page.creatorName} from another account,
          treat them as an imposter. Do not send money, gift cards, or personal details.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-bold">Stay connected with {page.creatorName}</h1>
      <p className="mt-2 text-sm text-gray-600">
        Get updates directly — even if my social account ever goes down.
      </p>
      <SubscribeForm slug={page.slug} />
    </main>
  );
}
