import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { SLA_DEFINITION } from '../../lib/slaExplainer';

interface SLAExplainerProps {
  context: 'portfolio' | 'company';
  className?: string;
}

export default function SLAExplainer({ context, className = '' }: SLAExplainerProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className={`relative inline-block ${className}`} ref={popoverRef}>
      {/* Trigger button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500
          hover:text-teal-500 transition-colors rounded px-1 py-0.5
          hover:bg-slate-100 dark:hover:bg-slate-800"
        title="What is SLA?"
      >
        <HelpCircle size={13} />
        <span>What is SLA?</span>
      </button>

      {/* Popover panel */}
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-80 bg-white dark:bg-slate-800
            border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
              {SLA_DEFINITION.title}
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X size={14} />
            </button>
          </div>

          {/* Summary */}
          <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-3">
            {SLA_DEFINITION.summary}
          </p>

          {/* Threshold legend */}
          <div className="space-y-2 mb-3">
            {SLA_DEFINITION.thresholds.map((t) => (
              <div key={t.status} className="flex items-start gap-2">
                <span className="text-sm mt-0.5 flex-shrink-0">{t.emoji}</span>
                <div>
                  <div className="font-medium text-xs text-slate-700 dark:text-slate-300">
                    {t.label}
                    <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">
                      &mdash; {t.rule}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{t.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Context-specific note */}
          {context === 'portfolio' && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-600 dark:text-slate-400">Company roll-up: </span>
              {SLA_DEFINITION.companyRollup}
            </div>
          )}

          {context === 'company' && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-600 dark:text-slate-400">How it&apos;s tracked: </span>
              {SLA_DEFINITION.dataSource}
            </div>
          )}

          {/* Arrow pointing up */}
          <div className="absolute -top-1.5 left-6 w-3 h-3 bg-white dark:bg-slate-800
            border-t border-l border-slate-200 dark:border-slate-700 rotate-45" />
        </div>
      )}
    </div>
  );
}
