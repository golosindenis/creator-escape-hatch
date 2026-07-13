import { Check, Lock } from "lucide-react";
import { Wordmark } from "@/components/ui/Wordmark";
import { Shell } from "@/components/ui/Shell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const FREE_FEATURES = [
  { label: "Instant breach alerts", included: true },
  { label: "Break-glass status page", included: true },
  { label: "Instagram content backup", included: false },
  { label: "Owned-audience capture page", included: false },
];

const PAID_FEATURES = [
  { label: "Instant breach alerts", included: true },
  { label: "Break-glass status page", included: true },
  { label: "Instagram content backup", included: true },
  { label: "Owned-audience capture page", included: true },
];

function FeatureRow({ label, included }: { label: string; included: boolean }) {
  const Icon = included ? Check : Lock;
  return (
    <div className="flex items-start gap-2">
      <Icon className={included ? "mt-0.5 text-accent" : "mt-0.5 text-muted"} size={16} aria-hidden="true" />
      <span className={`text-sm ${included ? "text-primary" : "text-muted"}`}>{label}</span>
    </div>
  );
}

export default function Pricing() {
  return (
    <Shell className="max-w-lg">
      <Wordmark />
      <div className="mt-8 text-center">
        <h1 className="text-xl font-medium">Choose your plan</h1>
        <p className="mt-2 text-sm text-secondary">
          Resilience, never recovery. If your account vanishes, your business doesn&apos;t.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium">Free</p>
          <p className="mt-1 text-xs text-muted">Always free, no card needed</p>
          <p className="mt-5 text-2xl font-medium">$0</p>
          <div className="mt-5 flex flex-col gap-3">
            {FREE_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included={f.included} />
            ))}
          </div>
        </Card>

        <Card className="relative border-2 border-accent">
          <span className="absolute -top-3 left-5 rounded-md bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Recommended
          </span>
          <p className="mt-2 text-sm font-medium">Creator</p>
          <p className="mt-1 text-xs text-secondary">Billed annually</p>
          <p className="mt-5 text-2xl font-medium">
            $99<span className="text-sm text-secondary"> / year</span>
          </p>
          <p className="mt-1 text-xs text-muted">$8.25/mo, billed once annually</p>
          <div className="mt-5 flex flex-col gap-3">
            {PAID_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included={f.included} />
            ))}
          </div>
          <a href="/api/billing/checkout" className="mt-5 block">
            <Button>Upgrade to Creator</Button>
          </a>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Cancel anytime from your dashboard. No auto-upsells, no recovery-scam tactics — just a
        straight yearly plan.
      </p>
    </Shell>
  );
}
