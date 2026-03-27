interface Props {
  percent: number;
  used?: number | null;
  total?: number | null;
}

export default function BudgetBar({ percent, used, total }: Props) {
  if (total === null || total === undefined || total === 0) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">-</span>;
  }

  const color =
    percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="w-full min-w-[80px]">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600 dark:text-slate-400">
          {used != null ? `$${used.toLocaleString()}` : ''}
        </span>
        <span className="font-medium text-slate-700 dark:text-slate-300">{Math.round(percent)}%</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
