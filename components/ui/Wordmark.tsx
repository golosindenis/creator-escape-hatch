import { ShieldCheck } from "lucide-react";

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck className="text-accent" size={size} aria-hidden="true" />
      <span className="text-base font-medium">AccountGuard</span>
    </div>
  );
}
