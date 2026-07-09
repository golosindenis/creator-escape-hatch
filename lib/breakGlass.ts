export type PageState = "normal" | "break_glass";

export function pageState(page: { breakGlassActive: boolean }): PageState {
  return page.breakGlassActive ? "break_glass" : "normal";
}

export function composeBroadcast(input: { creatorName: string; realHandle: string }): {
  subject: string;
  body: string;
} {
  const { creatorName, realHandle } = input;
  return {
    subject: `Important: how to find the real ${creatorName}`,
    body:
      `Hi — this is ${creatorName}. My usual account is having problems, ` +
      `so I'm reaching you here directly.\n\n` +
      `My real account is ${realHandle}. If anyone messages you claiming to be me ` +
      `from another account, please treat them as an imposter and do not send money, ` +
      `gift cards, or personal details.\n\n` +
      `Thanks for staying connected — more updates soon.`,
  };
}
