import { Wordmark } from "@/components/ui/Wordmark";
import { LogoutButton } from "./logout-button";

export function DashboardHeader({ email }: { email: string }) {
  return (
    <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
      <Wordmark />
      <div className="flex items-center gap-3">
        <span className="text-sm text-secondary">{email}</span>
        <LogoutButton />
      </div>
    </div>
  );
}
