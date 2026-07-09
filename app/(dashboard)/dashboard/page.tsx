import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { listBreachAlerts } from "@/lib/data/breachAlerts";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";
import { SecondaryEmailForm } from "./secondary-email-form";

const ALERT_LABELS: Record<string, string> = {
  new_login: "New login detected",
  password_changed: "Password changed",
};

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) return <main className="mx-auto max-w-md p-8"><CreatePageForm /></main>;

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;
  const alerts = await listBreachAlerts(data.id);

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-bold">Your lifeline page</h1>
      <p className="mt-2">Public link: <code>/p/{data.slug}</code></p>
      <BreakGlassButton active={data.break_glass_active} />

      <section className="mt-10 border-t pt-6">
        <h2 className="text-lg font-semibold">Breach alerts</h2>
        <p className="mt-2 text-sm text-gray-600">
          In Instagram, go to Settings → Security → Emails from Instagram, and forward those
          emails to:
        </p>
        <p className="mt-2 rounded bg-gray-100 p-2 font-mono text-sm">{forwardAddress}</p>
        <p className="mt-4 text-sm text-gray-600">
          We&apos;ll email you at a separate address below if we detect a login or password-change notice.
        </p>
        <SecondaryEmailForm initialEmail={data.secondary_email ?? ""} />

        {alerts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Alert history</h3>
            <ul className="mt-2 space-y-1">
              {alerts.map((alert) => (
                <li key={alert.id} className="text-sm text-gray-600">
                  {ALERT_LABELS[alert.alertType] ?? alert.alertType} —{" "}
                  {new Date(alert.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
