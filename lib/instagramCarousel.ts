import type { GraphMediaItem } from "@/lib/instagramGraph";

export function needsChildBackfill(mediaType: string, existingChildCount: number): boolean {
  return mediaType === "CAROUSEL_ALBUM" && existingChildCount === 0;
}

export type ChildInsertPlanItem = {
  igMediaId: string;
  mediaType: string;
  sourceUrl: string | undefined;
  position: number;
};

export function buildChildInsertPlan(children: GraphMediaItem[]): ChildInsertPlanItem[] {
  return children.map((child, position) => ({
    igMediaId: child.id,
    mediaType: child.media_type,
    sourceUrl: child.media_url ?? child.thumbnail_url,
    position,
  }));
}
