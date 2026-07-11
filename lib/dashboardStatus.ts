export function protectionLabel(breakGlassActive: boolean): string {
  return breakGlassActive
    ? "🔴 Break-glass active — subscribers alerted"
    : "🟢 Protection active";
}

export function subscriberCountLabel(count: number): string {
  return `${count} subscriber${count === 1 ? "" : "s"}`;
}

export function secondaryAlertsLabel(secondaryEmail: string | null): string {
  return secondaryEmail ? "Secondary alerts: on" : "Secondary alerts: off";
}
