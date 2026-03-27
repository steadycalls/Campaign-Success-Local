import type { SLAStatus } from '../../types';

const config: Record<SLAStatus, { dot: string; text: string; pulse?: boolean }> = {
  ok: { dot: 'bg-green-500', text: 'text-green-700 dark:text-green-400' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  violation: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', pulse: true },
};

function getSLATitle(status: SLAStatus, days: number | null | undefined): string {
  if (status === 'violation') {
    return days === null || days === undefined
      ? 'Overdue: No outbound message on record'
      : `Overdue: ${days} days since last outbound (max 7)`;
  }
  if (status === 'warning') {
    return `Approaching deadline: ${days ?? '?'} days since last outbound`;
  }
  return `On track: ${days ?? 0} days since last outbound`;
}

interface Props {
  status: SLAStatus;
  days?: number | null;
  size?: 'sm' | 'md';
}

export default function SLABadge({ status, days, size = 'sm' }: Props) {
  const c = config[status] ?? config.ok;
  const dotSize = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  const label =
    days === null || days === undefined
      ? 'Never'
      : days === 0
        ? 'Today'
        : `${days}d`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${c.text} ${textSize} font-medium`}
      title={getSLATitle(status, days)}
    >
      <span className={`inline-block rounded-full ${c.dot} ${dotSize} ${c.pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
