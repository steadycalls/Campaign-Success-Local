interface HealthBadgeProps {
  score: number | null | undefined;
  grade?: string | null;
  trend?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showTrend?: boolean;
}

export default function HealthBadge({ score, grade, trend, size = 'sm', showTrend = true }: HealthBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-slate-300 text-xs">&mdash;</span>;
  }

  const color =
    score >= 75 ? 'text-green-700 bg-green-50 border-green-200' :
    score >= 55 ? 'text-amber-700 bg-amber-50 border-amber-200' :
    score >= 35 ? 'text-orange-700 bg-orange-50 border-orange-200' :
    'text-red-700 bg-red-50 border-red-200';

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
    'text-slate-400';

  if (size === 'lg') {
    return (
      <div className="flex items-center gap-3">
        <div className={`relative w-16 h-16 rounded-full border-4 ${color} flex items-center justify-center`}>
          <svg className="absolute inset-0" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className="text-slate-200" strokeWidth="4" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor"
              className={ringColor} strokeWidth="4"
              strokeDasharray={`${(score / 100) * 176} 176`}
              strokeLinecap="round"
              transform="rotate(-90 32 32)" />
          </svg>
          <span className="text-lg font-bold">{score}</span>
        </div>
        <div>
          {grade && <div className="font-semibold text-slate-700">Grade: {grade}</div>}
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
        {grade && <span className="text-xs text-slate-500">{grade}</span>}
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
