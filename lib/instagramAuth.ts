import { createHmac, timingSafeEqual } from "crypto";

export function signState(pageId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(pageId).digest("base64url");
  return `${pageId}.${sig}`;
}

export function verifyState(state: string, secret: string): string | null {
  const idx = state.lastIndexOf(".");
  if (idx === -1) return null;
  const pageId = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(pageId).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return pageId;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function needsTokenRefresh(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < SEVEN_DAYS_MS;
}
