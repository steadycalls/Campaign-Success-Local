import type { SLAStatus } from '../../types';

const config: Record<SLAStatus, { dot: string; text: string; pulse?: boolean }> = {
  ok: { dot: 'bg-green-500', text: 'text-green-700' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-700' },
  violation: { dot: 'bg-red-500', text: 'text-red-700', pulse: true },
};

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
    <span className={`inline-flex items-center gap-1.5 ${c.text} ${textSize} font-medium`}>
      <span className={`inline-block rounded-full ${c.dot} ${dotSize} ${c.pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
