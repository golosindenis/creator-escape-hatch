export type BillingInfo = { subscriptionStatus: string; comped: boolean };

export function hasActiveAccess(page: BillingInfo): boolean {
  return page.comped || page.subscriptionStatus === "active";
}

export function billingStatusLabel(page: BillingInfo): string {
  if (page.comped) return "Comped";
  if (page.subscriptionStatus === "active") return "Active";
  return "Not subscribed";
}
