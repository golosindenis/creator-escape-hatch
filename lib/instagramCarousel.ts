import type { GraphMediaItem } from "@/lib/instagramGraph";

export type ChildInsertPlanItem = {
  igMediaId: string;
  mediaType: string;
  sourceUrl: string | undefined;
  position: number;
};

export function buildChildInsertPlan(children: GraphMediaItem[], existingChildIds: Set<string>): ChildInsertPlanItem[] {
  return children
    .map((child, position) => ({
      igMediaId: child.id,
      mediaType: child.media_type,
      sourceUrl: child.media_url ?? child.thumbnail_url,
      position,
    }))
    .filter((item) => !existingChildIds.has(item.igMediaId));
}
