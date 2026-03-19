import { useState, useRef, useCallback } from 'react';
import { Upload, Download, ChevronDown, ChevronRight, Check, AlertTriangle, SkipForward, Loader2, X } from 'lucide-react';
import { api } from '../../lib/ipc';
import { parsePitCsv, maskToken, type ParsedPitRow } from '../../utils/parsePitCsv';

interface MatchedRow extends ParsedPitRow {
  status: 'matched' | 'no_match' | 'skipped';
  companyId?: string;
  dbName?: string;
  currentPitStatus?: string;
  testResult?: { success: boolean; message: string };
}

interface Props {
  onUploadComplete: () => void;
}

export default function PitCsvUpload({ onUploadComplete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<Array<{ rowNumber: number; reason: string }>>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [importResult, setImportResult] = useState<{ saved: number; skipped: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<{ tested: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(null);
    setMatchedRows([]);
    setSkippedRows([]);
    setParseErrors([]);
    setImportDone(false);
    setImportResult(null);
    setTesting(false);
    setTestProgress(null);
  };

  const handleFile = useCallback(async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setParseErrors(['File is too large (max 5MB)']);
      return;
    }

    const text = await file.text();
    setFileName(file.name);
    setImportDone(false);
    setImportResult(null);

    const parsed = parsePitCsv(text);
    setSkippedRows(parsed.skippedRows);
    setParseErrors(parsed.errors);

    if (parsed.errors.length > 0 || parsed.rows.length === 0) {
      setMatchedRows([]);
      return;
    }

    // Match against DB
    const locationIds = parsed.rows.map((r) => r.locationId);
    const matches = await api.matchLocationIds(locationIds);

    const matched: MatchedRow[] = parsed.rows.map((r) => {
      const match = matches[r.locationId];
      if (match) {
        return {
          ...r,
          status: 'matched' as const,
          companyId: match.companyId,
          dbName: match.name,
          currentPitStatus: match.currentPitStatus,
        };
      }
      return { ...r, status: 'no_match' as const };
    });

    setMatchedRows(matched);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    const toImport = matchedRows.filter((r) => r.status === 'matched' && r.companyId);
    if (toImport.length === 0) return;

    setImporting(true);
    const entries = toImport.map((r) => ({ companyId: r.companyId!, token: r.token }));
    const result = await api.bulkSavePits(entries);
    setImporting(false);
    setImportDone(true);
    setImportResult({
      saved: result.saved,
      skipped: matchedRows.length - toImport.length,
    });
    onUploadComplete();
  };

  const handleTestAll = async () => {
    const toTest = matchedRows.filter((r) => r.status === 'matched' && r.companyId);
    const companyIds = toTest.map((r) => r.companyId!);
    if (companyIds.length === 0) return;

    setTesting(true);
    setTestProgress({ tested: 0, total: companyIds.length });

    const results = await api.bulkTestPits(companyIds);

    // Update rows with test results
    setMatchedRows((prev) =>
      prev.map((r) => {
        if (r.companyId && results[r.companyId]) {
          return { ...r, testResult: results[r.companyId] };
        }
        return r;
      })
    );

    setTesting(false);
    setTestProgress(null);
    onUploadComplete();
  };

  const handleDownloadTemplate = async () => {
    const csv = await api.generatePitTemplate();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pit-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importableCount = matchedRows.filter((r) => r.status === 'matched').length;
  const noMatchCount = matchedRows.filter((r) => r.status === 'no_match').length;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-white">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <Upload size={15} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-800">Bulk Upload PITs</span>
        </div>
        {expanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-slate-500">
            Upload a CSV to configure multiple sub-account PITs at once.
          </p>

          {/* Drop zone */}
          {!fileName && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              <Upload size={24} className="mb-2 text-slate-400" />
              <p className="text-sm text-slate-600">Drag & drop a CSV file here</p>
              <p className="text-xs text-slate-400">or click to browse</p>
              <p className="mt-2 text-[10px] text-slate-400">
                Columns: subaccount_id, subaccount_name, private_integration_token
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {/* File loaded indicator */}
          {fileName && (
            <div className="mb-3 flex items-center justify-between rounded bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-600">{fileName}</span>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.map((err, i) => (
            <div key={i} className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
          ))}

          {/* Preview table */}
          {matchedRows.length > 0 && (
            <>
              <div className="mb-2 text-xs text-slate-500">
                {matchedRows.length} rows parsed, {importableCount} matched, {noMatchCount} no match, {skippedRows.length} skipped
              </div>

              <div className="max-h-64 overflow-auto rounded border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-1.5 font-medium text-slate-500">Location ID</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500">Name</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500">Token</th>
                      <th className="px-3 py-1.5 font-medium text-slate-500">Match</th>
                      {importDone && <th className="px-3 py-1.5 font-medium text-slate-500">Test</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchedRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-3 py-1.5 font-mono text-slate-600">{r.locationId.slice(0, 12)}...</td>
                        <td className="px-3 py-1.5 text-slate-700">{r.dbName || r.name || '-'}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-500">{maskToken(r.token)}</td>
                        <td className="px-3 py-1.5">
                          {r.status === 'matched' && (
                            <span className="flex items-center gap-1 text-green-600"><Check size={12} /> Found</span>
                          )}
                          {r.status === 'no_match' && (
                            <span className="flex items-center gap-1 text-amber-600"><AlertTriangle size={12} /> No match</span>
                          )}
                          {r.status === 'skipped' && (
                            <span className="flex items-center gap-1 text-slate-400"><SkipForward size={12} /> Skip</span>
                          )}
                        </td>
                        {importDone && (
                          <td className="px-3 py-1.5">
                            {r.testResult ? (
                              <span className={r.testResult.success ? 'text-green-600' : 'text-red-500'}>
                                {r.testResult.success ? 'Valid' : 'Invalid'}
                              </span>
                            ) : '-'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {noMatchCount > 0 && (
                <div className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {noMatchCount} location ID(s) not found in database. Refresh the sub-account list first if these are new.
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                {!importDone && (
                  <>
                    <button
                      onClick={handleImport}
                      disabled={importing || importableCount === 0}
                      className="flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
                    >
                      {importing && <Loader2 size={12} className="animate-spin" />}
                      Import {importableCount} PITs
                    </button>
                    <button onClick={reset} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  </>
                )}
                {importDone && (
                  <>
                    <button
                      onClick={handleTestAll}
                      disabled={testing}
                      className="flex items-center gap-1 rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40"
                    >
                      {testing && <Loader2 size={12} className="animate-spin" />}
                      {testing && testProgress ? `Testing ${testProgress.tested}/${testProgress.total}` : 'Test All Imported'}
                    </button>
                    <button onClick={reset} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                      Close
                    </button>
                  </>
                )}
              </div>

              {importResult && (
                <div className="mt-2 rounded bg-green-50 px-3 py-2 text-xs text-green-700">
                  Import complete: {importResult.saved} PITs saved, {importResult.skipped} skipped
                </div>
              )}
            </>
          )}

          {/* Template download */}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-800"
            >
              <Download size={13} />
              Download Template CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
