export type ChecklistItem = { key: string; label: string };

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "secure_recovery_email", label: "Secure your recovery email with 2FA" },
  { key: "authenticator_app_2fa", label: "Switch Instagram 2FA to an authenticator app, not SMS" },
  { key: "review_connected_apps", label: "Review connected apps and remove anything you don't recognize" },
  { key: "save_recovery_info", label: "Save your account recovery info somewhere safe outside Instagram" },
  {
    key: "recognize_phishing_pattern",
    label: 'Know the pattern: Meta never asks you to "log in to appeal" via a DM or email link',
  },
];

const VALID_KEYS = new Set(CHECKLIST_ITEMS.map((item) => item.key));

export function isValidChecklistKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

export function isValidChecklistCompleted(completed: string[]): boolean {
  return completed.every(isValidChecklistKey);
}
