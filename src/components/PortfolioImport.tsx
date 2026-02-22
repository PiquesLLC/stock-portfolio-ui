import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { uploadPortfolioCsv, uploadPortfolioScreenshot, confirmPortfolioImport, clearPortfolio, searchSymbols, submitMappedCsv, CsvParsedRow, ColumnMappings, MappedTrade, ImportTelemetry } from '../api';
import { SymbolSearchResult } from '../types';
import { WizardStepIndicator, WIZARD_STEPS, type WizardStepKey } from './WizardStepIndicator';
import { CsvPreviewTable } from './CsvPreviewTable';
import { TransactionReview } from './TransactionReview';

interface PortfolioImportProps {
  onClose: () => void;
  onImportComplete: () => void;
  onboarding?: boolean;
  onManualEntry?: () => void;
}

type Step = 'choose' | 'uploading' | 'auto-detected' | 'wizard' | 'processing' | 'review' | 'confirming' | 'done' | 'clear-confirm';

const MAX_IMPORT_ROWS = 2000;

function detectBroker(headers: string[]): string | null {
  const h = headers.map(s => s.toLowerCase().trim());
  if (h.includes('activity date') && h.includes('trans code') && h.includes('instrument')) return 'robinhood';
  if (h.includes('date') && h.includes('action') && h.includes('symbol') && !h.includes('activity date')) return 'schwab';
  return null;
}

export function PortfolioImport({ onClose, onImportComplete, onboarding, onManualEntry }: PortfolioImportProps) {
  // Core state
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  // CSV data (from PapaParse)
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [detectedBroker, setDetectedBroker] = useState<string | null>(null);

  // Wizard state
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [mappings, setMappings] = useState<ColumnMappings>({ ticker: '' });
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepKey>>(new Set());
  const [skippedSteps, setSkippedSteps] = useState<Set<WizardStepKey>>(new Set());

  // Review state (for both auto-detected and wizard paths)
  const [rows, setRows] = useState<CsvParsedRow[]>([]);
  const [warnings, setWarnings] = useState<{ rowNumber: number; message: string; line?: string }[]>([]);
  const [stats, setStats] = useState({ totalRows: 0, validRows: 0, skippedRows: 0 });
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [trades, setTrades] = useState<MappedTrade[]>([]);
  const [telemetry, setTelemetry] = useState<ImportTelemetry | null>(null);
  const [excludedTradeRows, setExcludedTradeRows] = useState<Set<number>>(new Set());
  const [globalWarning, setGlobalWarning] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; removed: number } | null>(null);
  const [uploadSource, setUploadSource] = useState<'csv' | 'screenshot'>('csv');

  // Clear confirm
  const [clearText, setClearText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Inline ticker autocomplete for review table
  const [tickerEditRow, setTickerEditRow] = useState<number | null>(null);
  const [tickerResults, setTickerResults] = useState<SymbolSearchResult[]>([]);
  const tickerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerDropdownRef = useRef<HTMLDivElement>(null);

  const searchTicker = useCallback((query: string) => {
    if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    if (query.length < 1) { setTickerResults([]); return; }
    tickerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await searchSymbols(query);
        setTickerResults(res.results.slice(0, 5));
      } catch { setTickerResults([]); }
    }, 250);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tickerDropdownRef.current && !tickerDropdownRef.current.contains(e.target as Node)) {
        setTickerEditRow(null);
        setTickerResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Current wizard step key
  const currentWizardStep = WIZARD_STEPS[wizardStepIndex]?.key ?? 'ticker';

  // Determine if wide modal is needed
  const isWideStep = step === 'wizard' || step === 'review' || step === 'processing' || step === 'auto-detected';

  // Parse CSV client-side with PapaParse
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }
    setError('');
    setCsvFile(file);

    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      setError('Could not parse CSV file. Please check the format.');
      return;
    }

    const headers = parsed.meta.fields || [];
    const rows = parsed.data;

    if (rows.length > MAX_IMPORT_ROWS) {
      setError(`CSV has ${rows.length.toLocaleString()} rows. Maximum is ${MAX_IMPORT_ROWS.toLocaleString()}.`);
      return;
    }

    setCsvHeaders(headers);
    setCsvRows(rows);

    const broker = detectBroker(headers);
    setDetectedBroker(broker);

    if (broker) {
      setStep('auto-detected');
    } else {
      setStep('wizard');
    }
  }, []);

  // Handle auto-import (send to existing endpoint)
  const handleAutoImport = useCallback(async () => {
    if (!csvFile) return;
    setStep('uploading');
    setUploadSource('csv');
    try {
      const data = await uploadPortfolioCsv(csvFile);
      setRows(data.parsed);
      setWarnings(data.warnings);
      setGlobalWarning(data.warning || '');
      setTrades((data.trades || []) as MappedTrade[]);
      setStats({ totalRows: data.totalRows, validRows: data.validRows, skippedRows: data.skippedRows });
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStep('choose');
    }
  }, [csvFile]);

  const handleScreenshot = useCallback(async (file: File) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
    const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      setError('Please upload an image file (PNG, JPG, WebP, or HEIC)');
      return;
    }
    setError('');
    setStep('uploading');
    setUploadSource('screenshot');
    try {
      const data = await uploadPortfolioScreenshot(file);
      setRows(data.parsed);
      setWarnings(data.warnings);
      setGlobalWarning(data.warning || '');
      setStats({ totalRows: data.totalRows, validRows: data.validRows, skippedRows: data.skippedRows });
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screenshot processing failed');
      setStep('choose');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // Wizard column selection
  const handleColumnSelect = useCallback((header: string) => {
    const stepKey = WIZARD_STEPS[wizardStepIndex].key;
    const mappingKey = stepKey as keyof ColumnMappings;

    // Toggle: if already selected, deselect
    if (mappings[mappingKey] === header) {
      setMappings(prev => {
        const next = { ...prev };
        if (mappingKey === 'ticker') {
          next.ticker = '';
        } else {
          delete next[mappingKey];
        }
        return next;
      });
      setCompletedSteps(prev => { const next = new Set(prev); next.delete(stepKey); return next; });
      return;
    }

    setMappings(prev => ({ ...prev, [mappingKey]: header }));
    setCompletedSteps(prev => new Set(prev).add(stepKey));
  }, [wizardStepIndex, mappings]);

  // Wizard navigation
  const handleWizardNext = useCallback(() => {
    const stepKey = WIZARD_STEPS[wizardStepIndex].key;
    const mappingKey = stepKey as keyof ColumnMappings;

    // Mark as skipped if not completed
    if (!mappings[mappingKey]) {
      setSkippedSteps(prev => new Set(prev).add(stepKey));
    }

    if (wizardStepIndex < WIZARD_STEPS.length - 1) {
      setWizardStepIndex(wizardStepIndex + 1);
    } else {
      handleWizardSubmit();
    }
  }, [wizardStepIndex, mappings]);

  const handleWizardBack = useCallback(() => {
    if (wizardStepIndex > 0) {
      setWizardStepIndex(wizardStepIndex - 1);
    } else {
      // Go back to choose or auto-detected
      if (detectedBroker) {
        setStep('auto-detected');
      } else {
        setStep('choose');
        setCsvFile(null);
        setCsvHeaders([]);
        setCsvRows([]);
      }
    }
  }, [wizardStepIndex, detectedBroker]);

  // Wizard validation
  const wizardCanProceed = useMemo(() => {
    const stepKey = WIZARD_STEPS[wizardStepIndex].key;
    // Ticker is required
    if (stepKey === 'ticker') return !!mappings.ticker;
    // All other steps are optional
    return true;
  }, [wizardStepIndex, mappings]);

  const wizardCanFinish = useMemo(() => {
    // Need ticker + at least one numeric
    return !!mappings.ticker && !!(mappings.price || mappings.shares || mappings.totalAmount);
  }, [mappings]);

  // Submit wizard mappings to API
  const handleWizardSubmit = useCallback(async () => {
    if (!csvFile) return;

    // Validate
    if (!mappings.ticker) {
      setError('Ticker column is required');
      return;
    }
    if (!mappings.price && !mappings.shares && !mappings.totalAmount) {
      setError('At least one of Price, Shares, or Amount must be mapped');
      return;
    }

    setStep('processing');
    setError('');

    try {
      const data = await submitMappedCsv(csvFile, mappings);
      setRows(data.parsed);
      setWarnings(data.warnings);
      setGlobalWarning(data.warning || '');
      setTrades(data.trades);
      setTelemetry(data.telemetry);
      setStats({ totalRows: data.totalRows, validRows: data.validRows, skippedRows: data.skippedRows });
      setUploadSource('csv');
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setStep('wizard');
    }
  }, [csvFile, mappings]);

  // Transaction review toggle
  const handleToggleTradeRow = useCallback((rowIndex: number) => {
    setExcludedTradeRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  const handleToggleAllTrades = useCallback((selected: boolean) => {
    if (selected) {
      setExcludedTradeRows(new Set());
    } else {
      setExcludedTradeRows(new Set(trades.map(t => t.rowIndex)));
    }
  }, [trades]);

  // Confirm import
  const handleConfirm = async () => {
    setStep('confirming');
    setError('');
    try {
      const holdings = rows.map(r => ({ ticker: r.ticker, shares: r.shares, averageCost: r.averageCost }));

      // Filter excluded trades
      const filteredTrades = trades.length > 0
        ? trades.filter(t => !excludedTradeRows.has(t.rowIndex))
        : undefined;

      const res = await confirmPortfolioImport(holdings, importMode, filteredTrades);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step !== 'uploading' && step !== 'confirming' && step !== 'processing' ? onClose : undefined} />
      <div className={`relative bg-white/90 dark:bg-white/[0.06] backdrop-blur-2xl border border-white/20 dark:border-white/[0.1] rounded-2xl w-full max-h-[85vh] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-300 ${
        isWideStep ? 'max-w-4xl' : 'max-w-lg'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">
            {step === 'clear-confirm' ? 'Clear Portfolio'
              : step === 'done' ? 'Import Complete'
              : step === 'wizard' ? 'Map Columns'
              : step === 'auto-detected' ? 'Format Detected'
              : 'Import Portfolio'}
          </h2>
          {!onboarding && step !== 'uploading' && step !== 'confirming' && step !== 'processing' && (
            <button onClick={onClose} aria-label="Close" className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white p-1">
              <svg className="w-5 h-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Wizard step indicator */}
        {step === 'wizard' && (
          <div className="px-5 pb-3 shrink-0">
            <WizardStepIndicator
              currentStep={currentWizardStep}
              completedSteps={completedSteps}
              skippedSteps={skippedSteps}
            />
          </div>
        )}

        {error && (
          <div className="mx-5 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-500 shrink-0">
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
                  Supports Robinhood, Schwab, and custom formats
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

              <button
                onClick={() => screenshotInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200/40 dark:border-white/[0.08] hover:border-rh-green/30 transition-colors text-left"
              >
                <svg className="w-5 h-5 text-rh-light-muted dark:text-rh-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">Upload Screenshot</p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted">OCR reads your portfolio image (beta)</p>
                </div>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleScreenshot(file);
                  }}
                />
              </button>

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

          {/* ── STEP: Auto-detected broker ── */}
          {step === 'auto-detected' && (
            <div className="space-y-5">
              <div className="bg-rh-green/5 border border-rh-green/20 rounded-xl p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-rh-green/15 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">
                    Detected <span className="text-rh-green capitalize">{detectedBroker}</span> format
                  </p>
                  <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
                    {csvRows.length.toLocaleString()} rows found. You can auto-import or map columns manually.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleAutoImport}
                  className="flex-1 px-4 py-3 rounded-xl bg-rh-green text-black font-semibold hover:bg-green-600 transition-all text-sm"
                >
                  Auto-import
                </button>
                <button
                  onClick={() => setStep('wizard')}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors text-sm"
                >
                  Map columns manually
                </button>
              </div>

              <button
                onClick={() => { setStep('choose'); setCsvFile(null); setCsvHeaders([]); setCsvRows([]); setError(''); }}
                className="text-xs text-rh-light-muted/60 dark:text-rh-muted/40 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
              >
                Choose a different file
              </button>
            </div>
          )}

          {/* ── STEP: Uploading (auto-import path) ── */}
          {step === 'uploading' && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-rh-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">
                {uploadSource === 'screenshot' ? 'Running OCR on your screenshot...' : 'Parsing your CSV...'}
              </p>
              {uploadSource === 'screenshot' && (
                <p className="text-xs text-rh-light-muted/50 dark:text-rh-muted/40 mt-2">This may take a few seconds</p>
              )}
            </div>
          )}

          {/* ── STEP: Wizard (column mapping) ── */}
          {step === 'wizard' && (
            <div className="space-y-4">
              <CsvPreviewTable
                headers={csvHeaders}
                rows={csvRows}
                currentStep={currentWizardStep}
                mappings={mappings}
                onColumnSelect={handleColumnSelect}
              />

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleWizardBack}
                  className="px-4 py-2 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors text-sm"
                >
                  Back
                </button>

                <div className="flex items-center gap-2">
                  {/* Show "Finish" only when we have enough mappings and it's not the last step */}
                  {wizardStepIndex < WIZARD_STEPS.length - 1 && wizardCanFinish && (
                    <button
                      onClick={handleWizardSubmit}
                      className="px-4 py-2 rounded-xl border border-rh-green/30 text-rh-green hover:bg-rh-green/5 transition-colors text-sm"
                    >
                      Finish mapping
                    </button>
                  )}

                  <button
                    onClick={handleWizardNext}
                    disabled={currentWizardStep === 'ticker' && !wizardCanProceed}
                    className={`px-5 py-2 rounded-xl font-semibold transition-all text-sm ${
                      wizardCanProceed
                        ? 'bg-rh-green text-black hover:bg-green-600'
                        : 'bg-gray-200/50 dark:bg-white/[0.06] text-rh-light-muted/40 dark:text-rh-muted/30 cursor-not-allowed'
                    }`}
                  >
                    {wizardStepIndex === WIZARD_STEPS.length - 1
                      ? (wizardCanFinish ? 'Process' : 'Skip & Process')
                      : (mappings[WIZARD_STEPS[wizardStepIndex].key as keyof ColumnMappings] ? 'Next' : 'Skip')}
                  </button>
                </div>
              </div>

              {/* Validation hint */}
              {!wizardCanFinish && wizardStepIndex >= 2 && (
                <p className="text-[11px] text-amber-500/70 text-center">
                  Map at least one of Price, Shares, or Amount to continue
                </p>
              )}
            </div>
          )}

          {/* ── STEP: Processing (wizard submit) ── */}
          {step === 'processing' && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-rh-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-rh-light-muted dark:text-rh-muted">Processing mapped transactions...</p>
              <p className="text-xs text-rh-light-muted/50 dark:text-rh-muted/40 mt-2">Replaying trade history</p>
            </div>
          )}

          {/* ── STEP: Review ── */}
          {step === 'review' && (
            <div className="space-y-4">
              {(uploadSource === 'screenshot' || globalWarning) && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-500 font-medium">
                    {globalWarning || 'OCR Result — Please verify all values before importing'}
                  </p>
                </div>
              )}

              {/* Stats bar */}
              <div className="flex items-center gap-4 text-xs text-rh-light-muted dark:text-rh-muted">
                <span>{stats.validRows} valid</span>
                {stats.skippedRows > 0 && (
                  <span className="text-amber-500">{stats.skippedRows} skipped</span>
                )}
                <span className="text-rh-light-muted/40 dark:text-rh-muted/40">{stats.totalRows} total rows</span>
              </div>

              {/* Transaction review (if trades present from mapped import) */}
              {trades.length > 0 && telemetry && (
                <TransactionReview
                  trades={trades}
                  telemetry={telemetry}
                  excludedRows={excludedTradeRows}
                  onToggleRow={handleToggleTradeRow}
                  onToggleAll={handleToggleAllTrades}
                />
              )}

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 space-y-1.5">
                  {warnings.slice(0, 5).map((w, i) => (
                    <div key={i}>
                      <p className="text-xs text-amber-500">
                        {w.rowNumber > 0 ? `Row ${w.rowNumber}: ` : ''}{w.message}
                      </p>
                      {w.line && (
                        <p className="text-[10px] text-amber-500/50 font-mono truncate mt-0.5">
                          {w.line}
                        </p>
                      )}
                    </div>
                  ))}
                  {warnings.length > 5 && (
                    <p className="text-xs text-amber-500/60">+{warnings.length - 5} more warnings</p>
                  )}
                </div>
              )}

              {/* Positions table */}
              {rows.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-2">
                    <h3 className="text-xs font-semibold text-rh-light-text dark:text-rh-text uppercase tracking-wider">
                      Resulting Positions ({rows.length})
                    </h3>
                  </div>
                  <div className="border border-gray-200/40 dark:border-white/[0.08] rounded-xl overflow-visible">
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
                            <td className="px-3 py-1.5 relative">
                              <input
                                value={row.ticker}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  updateRow(i, 'ticker', val);
                                  setTickerEditRow(i);
                                  searchTicker(val);
                                }}
                                onFocus={() => { setTickerEditRow(i); if (row.ticker.length >= 1) searchTicker(row.ticker); }}
                                onBlur={() => { setTimeout(() => { setTickerEditRow(prev => prev === i ? null : prev); setTickerResults([]); }, 150); }}
                                autoComplete="off"
                                className="w-20 bg-transparent text-rh-light-text dark:text-rh-text font-medium focus:outline-none focus:underline"
                              />
                              {tickerEditRow === i && tickerResults.length > 0 && (
                                <div
                                  ref={tickerDropdownRef}
                                  className="absolute left-0 top-full z-50 mt-0.5 w-64 bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg shadow-lg max-h-40 overflow-y-auto"
                                >
                                  {tickerResults.map((r) => (
                                    <div
                                      key={r.symbol}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateRow(i, 'ticker', r.symbol);
                                        setTickerEditRow(null);
                                        setTickerResults([]);
                                      }}
                                      className="px-3 py-1.5 cursor-pointer hover:bg-rh-green/10 transition-colors"
                                    >
                                      <span className="font-semibold text-rh-light-text dark:text-rh-text text-sm">{r.symbol}</span>
                                      <span className="ml-2 text-xs text-rh-light-muted dark:text-rh-muted truncate">{r.description}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
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
                </>
              )}

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
                  onClick={() => {
                    setStep('choose');
                    setRows([]);
                    setWarnings([]);
                    setGlobalWarning('');
                    setError('');
                    setTrades([]);
                    setTelemetry(null);
                    setExcludedTradeRows(new Set());
                    setCsvFile(null);
                    setCsvHeaders([]);
                    setCsvRows([]);
                    setMappings({ ticker: '' });
                    setCompletedSteps(new Set());
                    setSkippedSteps(new Set());
                    setWizardStepIndex(0);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-white transition-colors text-sm"
                >
                  Start Over
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
