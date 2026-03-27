interface HealthBadgeProps {
  score: number | null | undefined;
  grade?: string | null;
  trend?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showTrend?: boolean;
}

export default function HealthBadge({ score, grade, trend, size = 'sm', showTrend = true }: HealthBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <div className="group relative inline-block">
        <span className="text-slate-300 text-xs cursor-help border-b border-dashed border-slate-300">&mdash;</span>
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2.5 text-xs text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <p className="font-medium text-white mb-1">No health score yet</p>
          <p className="leading-relaxed">
            Health scores compute automatically after the first sync. Ensure the company is <span className="text-teal-300 font-medium">Active</span> with <span className="text-teal-300 font-medium">Sync enabled</span>, then run a sync to populate.
          </p>
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      </div>
    );
  }

  const color =
    score >= 75 ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' :
    score >= 55 ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' :
    score >= 35 ? 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' :
    'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';

  const ringColor =
    score >= 75 ? 'text-green-500' :
    score >= 55 ? 'text-amber-500' :
    score >= 35 ? 'text-orange-500' :
    'text-red-500';

  const trendIcon =
    trend === 'improving' ? '\u2191' :
    trend === 'declining' ? '\u2193' :
    trend === 'stable' ? '\u2192' : '';

  const trendColor =
    trend === 'improving' ? 'text-green-500' :
    trend === 'declining' ? 'text-red-500' :
    'text-slate-400 dark:text-slate-500';

  if (size === 'lg') {
    return (
      <div className="flex items-center gap-3">
        <div className={`relative w-16 h-16 rounded-full border-4 ${color} flex items-center justify-center`}>
          <svg className="absolute inset-0" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className="text-slate-200 dark:text-slate-700" strokeWidth="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className={ringColor} strokeWidth="4"
              strokeDasharray={`${(score / 100) * 176} 176`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)" />
          </svg>
          <span className="text-lg font-bold">{score}</span>
        </div>
        <div>
          {grade && <div className="font-semibold text-slate-700 dark:text-slate-300">Grade: {grade}</div>}
          {showTrend && trendIcon && (
            <span className={`text-xs ${trendColor}`}>{trendIcon} {trend}</span>
          )}
        </div>
      </div>
    );
  }

  if (size === 'md') {
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center w-10 h-6
          rounded text-sm font-bold border ${color}`}>
          {score}
        </span>
        {grade && <span className="text-xs text-slate-500 dark:text-slate-400">{grade}</span>}
        {showTrend && trendIcon && (
          <span className={`text-xs ${trendColor}`}>{trendIcon}</span>
        )}
      </div>
    );
  }

  // Small version for portfolio table
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center justify-center w-8 h-5
        rounded text-xs font-bold border ${color}`}>
        {score}
      </span>
      {showTrend && trendIcon && (
        <span className={`text-xs ${trendColor}`}>{trendIcon}</span>
      )}
    </div>
  );
}
