"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export type BackupMediaItem = {
  id: string;
  caption: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  signedUrl: string | null;
};

export function InstagramBackup({
  connected,
  username,
  lastSyncedAt,
  mediaCount,
  media,
  initialError,
}: {
  connected: boolean;
  username: string | null;
  lastSyncedAt: string | null;
  mediaCount: number;
  media: BackupMediaItem[];
  initialError: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setError(false);
    setMessage(null);
    const res = await fetch("/api/instagram/sync", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage(`Synced ${data.synced} new post${data.synced === 1 ? "" : "s"}.`);
    } else {
      setError(true);
    }
    setSyncing(false);
  }

  async function disconnect() {
    await fetch("/api/instagram/disconnect", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="mt-4">
      {!connected && (
        <a href="/api/instagram/connect">
          <Button variant="ghost">Connect Instagram</Button>
        </a>
      )}

      {connected && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-secondary">
            Connected as <span className="font-medium text-primary">@{username}</span>
          </p>
          <p className="text-sm text-secondary">
            {lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}` : "Not yet synced"} ·{" "}
            {mediaCount} post{mediaCount === 1 ? "" : "s"} backed up
          </p>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={sync} disabled={syncing} className="w-auto px-4">
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <button onClick={disconnect} className="text-sm text-danger underline">
              Disconnect
            </button>
          </div>
          {message && <p className="text-sm text-accent">{message}</p>}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-danger">
          Something went wrong connecting to Instagram. Please try again.
        </p>
      )}

      {media.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-secondary">Backed-up posts</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {media.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                {item.signedUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt={item.caption ?? ""}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                )}
                <Badge>{item.likeCount ?? 0}♥ · {item.commentsCount ?? 0}💬</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
