export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidSlug(input: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(input) && !input.includes("--");
}

export function generateSlugFromHandle(handle: string): string {
  return normalizeSlug(handle.replace(/^@/, ""));
}
