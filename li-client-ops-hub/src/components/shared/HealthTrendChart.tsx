import type { HealthHistoryEntry } from '../../types';

interface HealthTrendChartProps {
  history: HealthHistoryEntry[];
}

export default function HealthTrendChart({ history }: HealthTrendChartProps) {
  if (!history || history.length < 2) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 italic">Not enough data for trend chart (need 2+ days)</p>;
  }

  // Simple SVG sparkline — no dependency on recharts
  const scores = history.map(h => h.health_score);
  const dates = history.map(h =>
    new Date(h.computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );

  const min = 0;
  const max = 100;
  const width = 400;
  const height = 100;
  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const xStep = scores.length > 1 ? chartW / (scores.length - 1) : 0;

  const points = scores.map((s, i) => {
    const x = padding.left + i * xStep;
    const y = padding.top + chartH - ((s - min) / (max - min)) * chartH;
    return { x, y, score: s };
  });

  const pathD = points.map((p, i) =>
    i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
  ).join(' ');

  // Reference lines at 75, 55, 35
  const refY = (v: number) => padding.top + chartH - ((v - min) / (max - min)) * chartH;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
        {/* Reference lines */}
        {[75, 55, 35].map(v => (
          <line
            key={v}
            x1={padding.left} y1={refY(v)}
            x2={width - padding.right} y2={refY(v)}
            stroke={v === 75 ? '#86efac' : v === 55 ? '#fcd34d' : '#fca5a5'}
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        ))}

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map(v => (
          <text key={v} x={padding.left - 4} y={refY(v) + 3}
            className="text-[8px] fill-slate-400 dark:fill-slate-500" textAnchor="end">{v}</text>
        ))}

        {/* Score line */}
        <path d={pathD} fill="none" stroke="#0d9488" strokeWidth="2" />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3"
            fill="#0d9488" stroke="white" strokeWidth="1" />
        ))}

        {/* X-axis labels (first and last) */}
        {dates.length > 0 && (
          <>
            <text x={points[0].x} y={height - 2}
              className="text-[8px] fill-slate-400 dark:fill-slate-500" textAnchor="start">{dates[0]}</text>
            <text x={points[points.length - 1].x} y={height - 2}
              className="text-[8px] fill-slate-400 dark:fill-slate-500" textAnchor="end">{dates[dates.length - 1]}</text>
          </>
        )}
      </svg>
    </div>
  );
}
