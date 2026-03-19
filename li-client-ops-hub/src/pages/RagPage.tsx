import { useState, useCallback } from 'react';
import { Loader2, Search, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../lib/ipc';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const mb = bytes / (1024 * 1024);
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export default function RagPage() {
  const statsFetcher = useCallback(() => api.getRagStats(), []);
  const storageFetcher = useCallback(() => api.getRagStorageStats(), []);
  const { data: stats, loading } = useAutoRefresh(statsFetcher, [], 60000);
  const { data: storage } = useAutoRefresh(storageFetcher, [], 60000);

  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; content: string; score: number; sourceType: string; companyName: string | null }>>([]);

  const handleProcess = async () => {
    setProcessing(true);
    await api.ragProcessNow();
    setProcessing(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await api.ragSearch(searchQuery.trim());
    setResults(res);
    setSearching(false);
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all RAG chunks and embeddings? This cannot be undone.')) return;
    await api.ragClearAll();
  };

  const totals = (stats?.totals ?? {}) as Record<string, number>;
  const sources = (stats?.sources ?? []) as Array<Record<string, unknown>>;
  const totalChunks = totals.total_chunks ?? 0;
  const embedded = totals.embedded ?? 0;
  const pending = totals.pending ?? 0;
  const pct = totalChunks > 0 ? Math.round((embedded / totalChunks) * 100) : 0;

  if (loading) return <div className="p-6 text-sm text-slate-400">Loading RAG stats...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">RAG Pipeline</h1>
          <p className="mt-1 text-xs text-slate-500">Preparing data for AI-powered querying</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleProcess} disabled={processing} className="flex items-center gap-1.5 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {processing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Process Now
          </button>
          <button onClick={handleClear} className="flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
            <Trash2 size={13} /> Clear All
          </button>
        </div>
      </div>

      {/* Overall progress */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Overall Progress</span>
          <span className="text-sm font-semibold text-slate-900">{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-3 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>{embedded.toLocaleString()} embedded / {totalChunks.toLocaleString()} chunks</span>
          {pending > 0 && <span className="text-teal-600">{pending.toLocaleString()} pending</span>}
        </div>
        {storage && (
          <div className="mt-1 text-xs text-slate-400">
            Vectors: {formatBytes(storage.vectorBytes)} | Content: {formatBytes(storage.contentBytes)} | DB: {formatBytes(storage.dbTotalBytes)}
          </div>
        )}
      </div>

      {/* Source breakdown */}
      {sources.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Source Breakdown</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-2 text-left text-xs font-medium uppercase text-slate-500">Source</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Total</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Eligible</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Chunked</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Embedded</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.map((s) => {
                const created = (s.chunks_created as number) ?? 0;
                const emb = (s.chunks_embedded as number) ?? 0;
                const srcPct = created > 0 ? Math.round((emb / created) * 100) : 0;
                return (
                  <tr key={s.source_type as string} className="hover:bg-slate-50">
                    <td className="px-5 py-2 text-slate-700">{s.source_type as string}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{((s.total_source_rows as number) ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{((s.eligible_rows as number) ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{created.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-green-600">{emb.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={srcPct === 100 ? 'text-green-600' : 'text-slate-500'}>{srcPct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Search test */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Search Test</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Enter a query to test RAG search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full rounded border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none"
            />
          </div>
          <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="rounded bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {searching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
          </button>
        </div>

        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            {results.map((r, i) => (
              <div key={r.id} className="rounded border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="font-mono font-medium text-teal-600">[{r.score.toFixed(3)}]</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">{r.sourceType}</span>
                  {r.companyName && <span>{r.companyName}</span>}
                </div>
                <p className="text-xs text-slate-700 line-clamp-3">{r.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
