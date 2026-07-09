import { Resend } from "resend";

export async function sendBroadcast(input: { to: string[]; subject: string; body: string }) {
  if (input.to.length === 0) return { sent: 0 };
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const from = process.env.BROADCAST_FROM ?? "Creator Lifeline <alerts@example.com>";
  await Promise.all(
    input.to.map((addr) =>
      resend.emails.send({ from, to: addr, subject: input.subject, text: input.body }),
    ),
  );
  return { sent: input.to.length };
}
