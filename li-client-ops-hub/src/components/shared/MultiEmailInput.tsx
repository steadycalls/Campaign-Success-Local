import { useState, useEffect } from 'react';

interface MultiEmailInputProps {
  emails: string[];
  defaultEmail?: string;
  onChange: (emails: string[]) => void;
  matchCount?: number;
}

function isValidEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function MultiEmailInput({ emails, defaultEmail, onChange, matchCount }: MultiEmailInputProps) {
  const [dupeWarning, setDupeWarning] = useState<string | null>(null);

  useEffect(() => {
    setDupeWarning(null);
  }, [emails]);

  const handleAdd = () => {
    onChange([...emails, '']);
  };

  const handleChange = (idx: number, value: string) => {
    const normalized = value.toLowerCase();
    const others = emails.filter((_, i) => i !== idx).map(e => e.trim().toLowerCase());
    if (normalized.trim() && others.includes(normalized.trim())) {
      setDupeWarning(`"${value.trim()}" is already added`);
    } else {
      setDupeWarning(null);
    }
    const updated = [...emails];
    updated[idx] = value;
    onChange(updated);
  };

  const handleRemove = (idx: number) => {
    onChange(emails.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
        Read.ai Email Addresses
      </div>

      {emails.map((email, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="email"
              value={email}
              onChange={e => handleChange(idx, e.target.value)}
              placeholder="email@company.com"
              className={`w-full px-2.5 py-1.5 text-sm border rounded-md
                ${!isValidEmail(email) && email.length > 0
                  ? 'border-red-300 dark:border-red-700 focus:ring-red-500'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-teal-500'
                } focus:outline-none focus:ring-1`}
            />
            {idx === 0 && email.trim().toLowerCase() === defaultEmail?.trim().toLowerCase() && defaultEmail && (
              <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900/50 px-1 rounded">
                GHL
              </span>
            )}
          </div>
          {emails.length > 1 && (
            <button
              onClick={() => handleRemove(idx)}
              className="text-slate-400 dark:text-slate-500 hover:text-red-500 p-1 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {dupeWarning && (
        <div className="text-[11px] text-amber-600">{dupeWarning}</div>
      )}

      <button
        onClick={handleAdd}
        className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1"
      >
        + Add another email
      </button>

      {matchCount !== undefined && (
        <div className="text-xs mt-1">
          {matchCount > 0 ? (
            <span className="text-green-600">
              {matchCount} meeting{matchCount !== 1 ? 's' : ''} found matching these emails
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">No meetings matched yet</span>
          )}
        </div>
      )}
    </div>
  );
}
