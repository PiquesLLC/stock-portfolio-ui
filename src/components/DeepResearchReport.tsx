import { useState } from 'react';
import { DeepResearchJobResult, submitDeepResearchFollowUp } from '../api';
import { useToast } from '../context/ToastContext';
import { downloadReportAsPdf } from '../utils/downloadReportPdf';

interface DeepResearchReportProps {
  result: DeepResearchJobResult;
  onFollowUpSubmitted?: () => void;
  onTickerClick?: (ticker: string) => void;
}

export function DeepResearchReport({ result, onFollowUpSubmitted, onTickerClick }: DeepResearchReportProps) {
  const { report, resultText, parseError, costTelemetry } = result;
  const { showToast } = useToast();
  const [followUpQ, setFollowUpQ] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);

  const handleFollowUp = async () => {
    if (!followUpQ.trim() || followUpQ.trim().length < 5) return;
    setSubmittingFollowUp(true);
    try {
      await submitDeepResearchFollowUp(result.id, followUpQ.trim());
      showToast('Follow-up research submitted', 'success');
      setFollowUpQ('');
      onFollowUpSubmitted?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to submit follow-up', 'error');
    } finally {
      setSubmittingFollowUp(false);
    }
  };

  // Fallback: raw text if structured report is null
  if (!report) {
    return (
      <div className="space-y-4">
        {parseError && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            Report could not be fully parsed. Showing raw output.
          </div>
        )}
        {resultText ? (
          <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
            <pre className="text-xs text-rh-light-text dark:text-white/80 whitespace-pre-wrap font-mono leading-relaxed">
              {resultText}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-rh-light-muted dark:text-rh-muted">No report data available.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-rh-green/15 flex items-center justify-center">
          <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-rh-light-text dark:text-white">
            Research Report{result.ticker ? ` — ${result.ticker}` : ''}
          </h2>
          <p className="text-[11px] text-rh-light-muted dark:text-rh-muted">
            {result.researchType.charAt(0).toUpperCase() + result.researchType.slice(1)} analysis
            {costTelemetry.modelUsed && ` · ${costTelemetry.modelUsed}`}
          </p>
        </div>
        <button
          onClick={() => downloadReportAsPdf(result)}
          title="Download as PDF"
          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/[0.06] border border-gray-200/50 dark:border-white/[0.08] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-white/[0.1] transition-colors"
        >
          <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      </div>

      {/* Executive Summary */}
      <section className="report-section-in" style={{ animationDelay: '0ms' }}>
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
            Executive Summary
          </h3>
          <p className="text-sm text-rh-light-text dark:text-white/90 leading-relaxed whitespace-pre-line">
            {report.executiveSummary}
          </p>
        </div>
      </section>

      {/* Bull / Base / Bear Cases */}
      <section className="report-section-in" style={{ animationDelay: '50ms' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CaseCard label="Bull Case" color="green" text={report.bullCase} />
          <CaseCard label="Base Case" color="blue" text={report.baseCase} />
          <CaseCard label="Bear Case" color="red" text={report.bearCase} />
        </div>
      </section>

      {/* Key Risks + Key Catalysts */}
      <section className="report-section-in" style={{ animationDelay: '100ms' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <BulletCard
            label="Key Risks"
            items={report.keyRisks}
            icon={
              <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            }
          />
          <BulletCard
            label="Key Catalysts"
            items={report.keyCatalysts}
            icon={
              <svg className="w-3.5 h-3.5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Valuation */}
      <section className="report-section-in" style={{ animationDelay: '150ms' }}>
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
            Valuation — {report.valuation.method}
          </h3>
          <p className="text-sm text-rh-light-text dark:text-white/90 leading-relaxed mb-3">
            {report.valuation.summary}
          </p>
          {report.valuation.comparables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {report.valuation.comparables.map(ticker => (
                <button
                  key={ticker}
                  onClick={() => onTickerClick?.(ticker)}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-rh-green/10 text-rh-green hover:bg-rh-green/20 transition-colors cursor-pointer"
                >
                  {ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Confidence Notes */}
      {report.confidenceNotes && (
        <section className="report-section-in" style={{ animationDelay: '200ms' }}>
          <div className="p-3 rounded-lg bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 dark:border-blue-500/20">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-[11px] font-semibold text-blue-400 mb-1">Confidence Notes</h4>
                <p className="text-xs text-rh-light-muted dark:text-white/60 leading-relaxed">
                  {report.confidenceNotes}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Citations */}
      {report.citations.length > 0 && (
        <section className="report-section-in" style={{ animationDelay: '250ms' }}>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
              Sources ({report.citations.length})
            </h3>
            <div className="space-y-2.5">
              {report.citations.map((cite, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-rh-light-muted dark:text-rh-muted mt-0.5 shrink-0 w-4 text-right">
                    {i + 1}.
                  </span>
                  <div className="min-w-0">
                    <a
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-rh-green hover:underline"
                    >
                      {cite.title}
                    </a>
                    {cite.snippet && (
                      <p className="text-[11px] text-rh-light-muted dark:text-white/50 leading-relaxed mt-0.5 line-clamp-2">
                        {cite.snippet}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Follow-up Question */}
      <section className="report-section-in" style={{ animationDelay: '300ms' }}>
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
            Ask a Follow-Up
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={followUpQ}
              onChange={e => setFollowUpQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !submittingFollowUp) handleFollowUp(); }}
              placeholder="Ask a follow-up question about this research..."
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-rh-light-text dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-rh-green/50"
              maxLength={1000}
              disabled={submittingFollowUp}
            />
            <button
              onClick={handleFollowUp}
              disabled={submittingFollowUp || followUpQ.trim().length < 5}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-rh-green text-white hover:bg-rh-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {submittingFollowUp ? 'Sending...' : 'Ask'}
            </button>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <div className="pt-2 border-t border-gray-200/30 dark:border-white/[0.04]">
        <p className="text-[10px] text-rh-light-muted dark:text-white/30 leading-relaxed">
          This report is generated by NALA AI for informational purposes only and does not constitute financial advice.
          Always conduct your own due diligence before making investment decisions.
        </p>
        <p className="text-[10px] text-rh-light-muted dark:text-white/20 mt-1">
          Powered by Google Deep Research (Gemini)
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function CaseCard({ label, color, text }: { label: string; color: 'green' | 'blue' | 'red'; text: string }) {
  const borderColor = {
    green: 'border-l-rh-green',
    blue: 'border-l-blue-500',
    red: 'border-l-red-500',
  }[color];

  const labelColor = {
    green: 'text-rh-green',
    blue: 'text-blue-400',
    red: 'text-red-400',
  }[color];

  return (
    <div className={`p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06] border-l-2 ${borderColor}`}>
      <h3 className={`text-xs font-semibold uppercase tracking-wider ${labelColor} mb-2`}>
        {label}
      </h3>
      <p className="text-xs text-rh-light-text dark:text-white/80 leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
}

function BulletCard({ label, items, icon }: { label: string; items: string[]; icon: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/50 dark:border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted">
          {label}
        </h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-rh-light-text dark:text-white/80 leading-relaxed">
            <span className="text-rh-light-muted dark:text-white/30 mt-1 shrink-0">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
