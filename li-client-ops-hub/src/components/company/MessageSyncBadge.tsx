interface Props {
  syncedAt: string | null;
  messageCount: number;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function MessageSyncBadge({ syncedAt, messageCount }: Props) {
  if (!syncedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-900/50 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
        Not synced
      </span>
    );
  }

  const isStale = Date.now() - new Date(syncedAt).getTime() > 24 * 3600000;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        isStale ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400' : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isStale ? 'bg-amber-400' : 'bg-green-400'}`} />
      {relativeTime(syncedAt)} &middot; {messageCount} msgs
    </span>
  );
}
