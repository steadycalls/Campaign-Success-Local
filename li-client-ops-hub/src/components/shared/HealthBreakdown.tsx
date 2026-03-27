import type { HealthComponent } from '../../types';

interface HealthBreakdownProps {
  components: HealthComponent[];
}

export default function HealthBreakdown({ components }: HealthBreakdownProps) {
  if (!components || components.length === 0) return null;

  return (
    <div className="space-y-2">
      {components.map((comp, i) => (
        <div key={i} className="flex items-center gap-3">
          {/* Mini progress bar */}
          <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shrink-0">
            <div
              className={`h-full rounded-full ${
                comp.status === 'green' ? 'bg-green-500' :
                comp.status === 'yellow' ? 'bg-amber-500' :
                comp.status === 'red' ? 'bg-red-500' : 'bg-slate-300'
              }`}
              style={{ width: `${comp.score}%` }}
            />
          </div>

          {/* Label + score */}
          <span className="text-xs text-slate-600 dark:text-slate-400 w-32 shrink-0">{comp.name}</span>
          <span className="text-xs font-medium w-8 shrink-0">{comp.score}</span>

          {/* Detail */}
          <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{comp.detail}</span>
        </div>
      ))}
    </div>
  );
}
