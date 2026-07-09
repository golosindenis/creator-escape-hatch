export type AlertType = "new_login" | "password_changed";

const META_SENDER_PATTERN = /@(mail\.)?instagram\.com$|@facebookmail\.com$/i;

const PASSWORD_KEYWORDS = [
  /password (was |has been )?changed/i,
  /you changed your password/i,
  /your password was reset/i,
];

const LOGIN_KEYWORDS = [
  /new login/i,
  /new device/i,
  /signed in from a new/i,
];

export function classifyAlert(input: {
  from: string;
  subject: string;
  body: string;
}): { type: AlertType } | null {
  if (!META_SENDER_PATTERN.test(input.from)) return null;

  const text = `${input.subject}\n${input.body}`;
  if (PASSWORD_KEYWORDS.some((p) => p.test(text))) return { type: "password_changed" };
  if (LOGIN_KEYWORDS.some((p) => p.test(text))) return { type: "new_login" };
  return null;
}

export function composeAlertNotice(input: {
  creatorName: string;
  alertType: AlertType;
  dashboardUrl: string;
}): { subject: string; body: string } {
  const label = input.alertType === "password_changed" ? "password change" : "new login";
  return {
    subject: `Possible Instagram security event for ${input.creatorName}`,
    body:
      `We detected a ${label} notice forwarded from Instagram for ${input.creatorName}'s account.\n\n` +
      `If this wasn't you, check your account now and consider activating your break-glass page ` +
      `from your dashboard: ${input.dashboardUrl}\n\n` +
      `If this was you, no action is needed.`,
  };
}
