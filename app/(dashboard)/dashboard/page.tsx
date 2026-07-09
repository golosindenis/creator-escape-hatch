import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { listBreachAlerts } from "@/lib/data/breachAlerts";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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
  if (!data) {
    return (
      <Shell>
        <Card>
          <CreatePageForm />
        </Card>
      </Shell>
    );
  }

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;
  const alerts = await listBreachAlerts(data.id);

  return (
    <Shell className="max-w-lg">
      <div className="mb-8 flex items-center gap-2">
        <ShieldCheck className="text-accent" size={24} aria-hidden="true" />
        <span className="text-base font-medium">AccountGuard</span>
      </div>

      <Card>
        <h1 className="text-lg font-medium">Your lifeline page</h1>
        <p className="mt-2 text-sm text-secondary">
          Public link: <code className="rounded bg-surface-2 px-1.5 py-0.5 text-primary">/p/{data.slug}</code>
        </p>
        <BreakGlassButton active={data.break_glass_active} />
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Breach alerts</h2>
        <p className="mt-2 text-sm text-secondary">
          In Instagram, go to Settings → Security → Emails from Instagram, and forward those
          emails to:
        </p>
        <p className="mt-2 rounded-lg bg-surface-2 p-2.5 font-mono text-sm text-primary">{forwardAddress}</p>
        <p className="mt-4 text-sm text-secondary">
          We&apos;ll email you at a separate address below if we detect a login or password-change notice.
        </p>
        <SecondaryEmailForm initialEmail={data.secondary_email ?? ""} />

        {alerts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-secondary">Alert history</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between text-sm">
                  <Badge>{ALERT_LABELS[alert.alertType] ?? alert.alertType}</Badge>
                  <span className="text-muted">{new Date(alert.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </Shell>
  );
}
