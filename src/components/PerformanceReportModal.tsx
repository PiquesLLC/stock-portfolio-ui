import { useState, useEffect } from 'react';
import { getPerformanceReport, emailPerformanceReport } from '../api';
import { PerformanceWindow } from '../types';

const PERIODS: { value: PerformanceWindow; label: string }[] = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'ALL' },
];

const BENCHMARKS = ['SPY', 'QQQ', 'DIA'];

function getTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

interface Props {
  onClose: () => void;
}

export function PerformanceReportModal({ onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const [period, setPeriod] = useState<PerformanceWindow>('1M');
  const [benchmark, setBenchmark] = useState('SPY');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState('');
  const [error, setError] = useState('');

  async function handleDownload() {
    setLoading(true);
    setError('');
    try {
      const theme = getTheme();
      const html = await getPerformanceReport(period, benchmark, theme);

      // Open report in a new window and trigger print (Save as PDF)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        // Popup blocked — fall back to HTML download
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nala-report-${period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      printWindow.document.write(html);
      printWindow.document.close();

      // Wait for content to render, then trigger print dialog
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      // Fallback if onload doesn't fire (some browsers)
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail() {
    setLoading(true);
    setError('');
    setEmailSent('');
    try {
      const theme = getTheme();
      const result = await emailPerformanceReport(period, benchmark, theme);
      setEmailSent(result.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a1a1e] border border-gray-200 dark:border-white/[0.08] rounded-xl shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Performance Report</h3>
          <button onClick={onClose} className="text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Period pills */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60 mb-1.5">Period</div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-rh-green text-white'
                    : 'bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark pills */}
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60 mb-1.5">Benchmark</div>
          <div className="flex gap-1">
            {BENCHMARKS.map((b) => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  benchmark === b
                    ? 'bg-rh-green text-white'
                    : 'bg-gray-100 dark:bg-white/[0.04] text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-white/[0.08]'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-rh-red mb-3">{error}</div>
        )}

        {/* Email sent success */}
        {emailSent && (
          <div className="text-xs text-rh-green mb-3">Report sent to {emailSent}</div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-rh-green text-white hover:bg-rh-green/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating…
              </span>
            ) : 'Download PDF'}
          </button>
          <button
            onClick={handleEmail}
            disabled={loading}
            className="flex-1 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-white/[0.08] text-rh-light-text dark:text-rh-text hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
          >
            Email to Me
          </button>
        </div>
      </div>
    </div>
  );
}
