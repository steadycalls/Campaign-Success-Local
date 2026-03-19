/** Format an ISO timestamp as "3:45 PM CST, 03/19/2026" */
export function formatETA(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago',
      timeZoneName: 'short',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Format elapsed time since a start ISO string → "12m 30s" or "2h 15m" */
export function formatElapsed(startedAtIso: string | null | undefined): string {
  if (!startedAtIso) return '';
  const ms = Date.now() - new Date(startedAtIso).getTime();
  return formatDuration(ms);
}

/** Format milliseconds → "45s", "12m 30s", "2h 15m" */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Format just the time portion of an ETA → "3:45 PM" */
export function formatETAShort(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Chicago',
    });
  } catch {
    return '';
  }
}
