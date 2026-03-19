import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface CredentialInputProps {
  label: string;
  value: string;
  hasValue: boolean;
  onChange: (value: string) => void;
}

export default function CredentialInput({
  label,
  value,
  hasValue,
  onChange,
}: CredentialInputProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <div className="mt-1 flex">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasValue ? '••••••••' : 'Not set'}
          className="flex-1 rounded-l border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}
