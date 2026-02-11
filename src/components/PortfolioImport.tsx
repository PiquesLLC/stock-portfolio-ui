import { useState, useRef, useCallback } from 'react';
import { uploadPortfolioCsv, confirmPortfolioImport, clearPortfolio, CsvParsedRow } from '../api';

interface PortfolioImportProps {
  onClose: () => void;
  onImportComplete: () => void;
  /** When true, show as onboarding (no close X, add manual entry option) */
  onboarding?: boolean;
  onManualEntry?: () => void;
}

type Step = 'choose' | 'uploading' | 'review' | 'confirming' | 'done' | 'clear-confirm';

export function PortfolioImport({ onClose, onImportComplete, onboarding, onManualEntry }: PortfolioImportProps) {
  const [step, setStep] = useState<Step>('choose');
  const [rows, setRows] = useState<CsvParsedRow[]>([]);
  const [warnings, setWarnings] = useState<{ rowNumber: number; message: string }[]>([]);
  const [stats, setStats] = useState({ totalRows: 0, validRows: 0, skippedRows: 0 });
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; removed: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [clearText, setClearText] = useState('');
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }
    setError('');
    setStep('uploading');
    try {
      const data = await uploadPortfolioCsv(file);
      setRows(data.parsed);
      setWarnings(data.warnings);
      setStats({ totalRows: data.totalRows, validRows: data.validRows, skippedRows: data.skippedRows });
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStep('choose');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = async () => {
    setStep('confirming');
    setError('');
    try {
      const holdings = rows.map(r => ({ ticker: r.ticker, shares: r.shares, averageCost: r.averageCost }));
      const res = await confirmPortfolioImport(holdings, importMode);
      setResult(res);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('review');
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setError('');
    try {
      await clearPortfolio();
      onImportComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear');
      setClearing(false);
    }
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: 'ticker' | 'shares' | 'averageCost', value: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== index) return r;
      if (field === 'ticker') return { ...r, ticker: value.toUpperCase() };
      if (field === 'shares') return { ...r, shares: parseFloat(value) || 0 };
      return { ...r, averageCost: parseFloat(value) || 0 };
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={step !== 'uploading' && step !== 'confirming' ? onClose : undefined} />
      <div className="relative bg-white dark:bg-rh-card rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
            {step === 'clear-confirm' ? 'Clear Portfolio' : step === 'done' ? 'Import Complete' : 'Import Portfolio'}
          </h2>
          {!onboarding && step !== 'uploading' && step !== 'confirming' && (
            <button onClick={onClose} className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* ── STEP: Choose ── */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">
                {onboarding ? 'Get started by importing your portfolio.' : 'Update your portfolio from a CSV file.'}
              </p>

              {/* Drag-and-drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-rh-green bg-rh-green/5'
                    : 'border-gray-200/60 dark:border-white/[0.1] hover:border-rh-green/40'
                }`}
              >
                <svg className="w-10 h-10 mx-auto mb-3 text-rh-light-muted/40 dark:text-rh-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                  Drop your CSV here or click to browse
                </p>
                <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/50 mt-1">
                  Columns: ticker, shares, average cost
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {/* Screenshot option (coming soon) */}
              <button
                disabled
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-left opacity-50 cursor-not-allowed"
              >
                <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">Upload Screenshot</p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">Coming soon</p>
                </div>
              </button>

              {/* Manual entry */}
              {onManualEntry && (
                <button
                  onClick={onManualEntry}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200/40 dark:border-white/[0.08] hover:border-rh-green/30 transition-colors text-left"
                >
                  <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">Add Manually</p>
                    <p className="text-xs text-rh-light-muted dark:text-rh-muted">Enter holdings one by one</p>
                  </div>
                </button>
              )}

              {/* Clear portfolio */}
              {!onboarding && (
                <div className="pt-3 border-t border-gray-200/20 dark:border-white/[0.06]">
                  <button
                    onClick={() => setStep('clear-confirm')}
                    className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Clear entire portfolio...
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: Uploading ── */}
          {step === 'uploading' && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-rh-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">Parsing your CSV...</p>
            </div>
          )}

          {/* ── STEP: Review ── */}
          {step === 'review' && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex items-center gap-4 text-xs text-rh-light-muted dark:text-rh-muted">
                <span>{stats.validRows} valid</span>
                {stats.skippedRows > 0 && (
                  <span className="text-amber-500">{stats.skippedRows} skipped</span>
                )}
                <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{stats.totalRows} total rows</span>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 space-y-1">
                  {warnings.slice(0, 5).map((w, i) => (
                    <p key={i} className="text-xs text-amber-500">
                      {w.rowNumber > 0 ? `Row ${w.rowNumber}: ` : ''}{w.message}
                    </p>
                  ))}
                  {warnings.length > 5 && (
                    <p className="text-xs text-amber-500/60">+{warnings.length - 5} more warnings</p>
                  )}
                </div>
              )}

              {/* Editable table */}
              <div className="border border-gray-200/40 dark:border-white/[0.08] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/[0.03] text-xs text-rh-light-muted/60 dark:text-rh-muted/60 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Ticker</th>
                      <th className="px-3 py-2 text-right">Shares</th>
                      <th className="px-3 py-2 text-right">Avg Cost</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-200/20 dark:border-white/[0.06]">
                        <td className="px-3 py-1.5">
                          <input
                            value={row.ticker}
                            onChange={(e) => updateRow(i, 'ticker', e.target.value)}
                            className="w-20 bg-transparent text-rh-light-text dark:text-rh-text font-medium focus:outline-none focus:underline"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            value={row.shares}
                            onChange={(e) => updateRow(i, 'shares', e.target.value)}
                            className="w-20 bg-transparent text-rh-light-text dark:text-rh-text text-right focus:outline-none focus:underline tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={row.averageCost}
                            onChange={(e) => updateRow(i, 'averageCost', e.target.value)}
                            className="w-24 bg-transparent text-rh-light-text dark:text-rh-text text-right focus:outline-none focus:underline tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            onClick={() => removeRow(i)}
                            className="text-rh-light-muted/40 dark:text-rh-muted/40 hover:text-red-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mode selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-rh-light-muted dark:text-rh-muted">Import mode:</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-200/40 dark:border-white/[0.08]">
                  <button
                    onClick={() => setImportMode('replace')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'replace'
                        ? 'bg-rh-green/10 text-rh-green'
                        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white'
                    }`}
                  >
                    Replace All
                  </button>
                  <button
                    onClick={() => setImportMode('merge')}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'merge'
                        ? 'bg-rh-green/10 text-rh-green'
                        : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white'
                    }`}
                  >
                    Merge
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-rh-light-muted/50 dark:text-rh-muted/40">
                {importMode === 'replace'
                  ? 'Removes all existing holdings and replaces with these.'
                  : 'Updates existing tickers and adds new ones. Keeps unmentioned holdings.'}
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setStep('choose'); setRows([]); setWarnings([]); setError(''); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={rows.length === 0}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-rh-green text-black font-semibold hover:bg-green-600 disabled:opacity-50 transition-all text-sm"
                >
                  Import {rows.length} Holdings
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: Confirming ── */}
          {step === 'confirming' && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-rh-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">Importing holdings...</p>
            </div>
          )}

          {/* ── STEP: Done ── */}
          {step === 'done' && result && (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-rh-green/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Portfolio Updated</p>
                <div className="flex justify-center gap-6 mt-3 text-sm">
                  {result.added > 0 && <span className="text-rh-green">{result.added} added</span>}
                  {result.updated > 0 && <span className="text-amber-400">{result.updated} updated</span>}
                  {result.removed > 0 && <span className="text-rh-light-muted dark:text-rh-muted">{result.removed} removed</span>}
                </div>
              </div>
              <button
                onClick={() => { onImportComplete(); onClose(); }}
                className="px-6 py-2.5 rounded-xl bg-rh-green text-black font-semibold hover:bg-green-600 transition-all text-sm"
              >
                Done
              </button>
            </div>
          )}

          {/* ── STEP: Clear Confirm ── */}
          {step === 'clear-confirm' && (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-sm text-red-400 font-medium">This will permanently remove all holdings and reset cash/margin to $0.</p>
              </div>
              <div>
                <label className="block text-xs text-rh-light-muted dark:text-rh-muted mb-1.5">
                  Type <span className="font-mono font-bold text-red-400">CLEAR</span> to confirm
                </label>
                <input
                  value={clearText}
                  onChange={(e) => setClearText(e.target.value)}
                  placeholder="CLEAR"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200/40 dark:border-white/[0.08] bg-transparent text-rh-light-text dark:text-rh-text focus:outline-none focus:border-red-400/50 font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('choose'); setClearText(''); setError(''); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearText !== 'CLEAR' || clearing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-40 transition-all text-sm"
                >
                  {clearing ? 'Clearing...' : 'Clear Portfolio'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
