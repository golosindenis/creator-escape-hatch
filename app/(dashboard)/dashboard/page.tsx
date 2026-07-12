import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/server";
import { listBreachAlerts } from "@/lib/data/breachAlerts";
import { listSubscriberEmails } from "@/lib/data/subscribers";
import { protectionLabel, subscriberCountLabel, secondaryAlertsLabel } from "@/lib/dashboardStatus";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreatePageForm } from "./create-page-form";
import { BreakGlassButton } from "./break-glass-button";
import { SecondaryEmailForm } from "./secondary-email-form";
import { DashboardHeader } from "./dashboard-header";
import { PreventionChecklist } from "./prevention-checklist";
import { InstagramBackup } from "./instagram-backup";
import {
  getConnectionByPageId,
  listBackedUpMedia,
  countBackedUpMedia,
  getSignedMediaUrls,
} from "@/lib/data/instagram";

const ALERT_LABELS: Record<string, string> = {
  new_login: "New login detected",
  password_changed: "Password changed",
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ instagram_error?: string }>;
}) {
  const { instagram_error } = await searchParams;
  const instagramError = instagram_error === "1";

  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data } = await serviceClient().from("pages").select("*").eq("owner", user.id).maybeSingle();
  if (!data) {
    return (
      <Shell>
        <DashboardHeader email={user.email} />
        <Card>
          <CreatePageForm />
        </Card>
      </Shell>
    );
  }

  const inboundDomain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? "example.com";
  const forwardAddress = `alerts+${data.id}@${inboundDomain}`;
  const alerts = await listBreachAlerts(data.id);
  const subscriberCount = (await listSubscriberEmails(data.id)).length;
  const instagramConnection = await getConnectionByPageId(data.id);
  const backedUpMedia = await listBackedUpMedia(data.id);
  const backedUpMediaCount = await countBackedUpMedia(data.id);
  const signedUrls = await getSignedMediaUrls(backedUpMedia.map((m) => m.storagePath));

  return (
    <Shell className="max-w-lg">
      <DashboardHeader email={user.email} />

      <p className="text-sm text-secondary">Your escape hatch if Instagram goes down.</p>
      <p className="mt-2 text-sm text-secondary">
        {protectionLabel(data.break_glass_active)} · {subscriberCountLabel(subscriberCount)} ·{" "}
        {secondaryAlertsLabel(data.secondary_email)}
      </p>

      <Card className="mt-6">
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

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Content &amp; metrics backup</h2>
          {instagramConnection && <Badge>Connected</Badge>}
        </div>
        <p className="mt-2 text-sm text-secondary">Auto-archive your posts and their engagement counts.</p>
        <InstagramBackup
          connected={!!instagramConnection}
          username={instagramConnection?.igUsername ?? null}
          lastSyncedAt={instagramConnection?.lastSyncedAt ?? null}
          mediaCount={backedUpMediaCount}
          media={backedUpMedia.map((m) => ({
            id: m.id,
            caption: m.caption,
            likeCount: m.likeCount,
            commentsCount: m.commentsCount,
            signedUrl: signedUrls[m.storagePath] ?? null,
          }))}
          initialError={instagramError}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Prevention checklist</h2>
        <p className="mt-2 text-sm text-secondary">Harden your account before anything happens.</p>
        <PreventionChecklist initialCompleted={data.checklist_completed ?? []} />
      </Card>
    </Shell>
  );
}
