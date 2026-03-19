import { useState, useRef } from 'react';
import { Info } from 'lucide-react';

interface ColumnTooltipProps {
  label: string;
  tooltip: string;
  children?: React.ReactNode;
}

export default function ColumnTooltip({ label, tooltip, children }: ColumnTooltipProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  }

  return (
    <div
      className="relative inline-flex items-center gap-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children || <span>{label}</span>}
      <Info size={11} className="text-slate-300 flex-shrink-0" />
      {show && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-56 px-3 py-2
          bg-slate-800 text-white text-xs leading-relaxed rounded-lg shadow-lg
          pointer-events-none"
        >
          <div className="font-medium mb-0.5">{label}</div>
          <div className="text-slate-300">{tooltip}</div>
          <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-800 rotate-45" />
        </div>
      )}
    </div>
  );
}
