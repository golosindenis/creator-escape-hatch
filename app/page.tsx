import Link from "next/link";
import { ShieldCheck, Radio, Bell } from "lucide-react";
import { Shell } from "@/components/ui/Shell";

const VALUE_POINTS = [
  {
    icon: ShieldCheck,
    title: "Own your audience",
    body: "Collect subscriber emails directly, independent of any platform's algorithm or goodwill.",
  },
  {
    icon: Radio,
    title: "Emergency broadcast",
    body: "If your account is ever locked, hacked, or taken down, activate a status page and reach everyone in one click.",
  },
  {
    icon: Bell,
    title: "Breach alerts",
    body: "Forward Instagram's own security emails to us and get notified the moment something looks wrong.",
  },
];

export default function Home() {
  return (
    <Shell className="max-w-lg text-center">
      <div className="flex items-center justify-center gap-2">
        <ShieldCheck className="text-accent" size={28} aria-hidden="true" />
        <span className="text-base font-medium">AccountGuard</span>
      </div>

      <h1 className="mt-8 text-3xl font-medium text-primary">
        Don&apos;t let a platform hold your audience hostage
      </h1>
      <p className="mt-4 text-base text-secondary">
        Build an owned subscriber list and keep an emergency channel ready, so a lockout,
        hack, or ban never means losing the people who follow you.
      </p>

      <Link
        href="/login"
        className="mt-8 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Get started
      </Link>

      <div className="mt-16 flex flex-col gap-6 text-left">
        {VALUE_POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4">
            <Icon className="mt-1 shrink-0 text-accent" size={20} aria-hidden="true" />
            <div>
              <h2 className="text-sm font-medium text-primary">{title}</h2>
              <p className="mt-1 text-sm text-secondary">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
