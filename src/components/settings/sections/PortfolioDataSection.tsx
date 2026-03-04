import { useState } from 'react';
import { getPortfolio } from '../../../api';
import { ToggleSwitch } from '../ToggleSwitch';
import { LinkedAccountsSection } from '../../LinkedAccountsSection';
import AccountHistorySection from '../../AccountHistorySection';

interface PortfolioDataSectionProps {
  isAdmin: boolean;
  userId: string;
  onOpenImport: () => void;
  onDeleteAccount: () => void;
  dripEnabled: boolean;
  setDripEnabled: (v: boolean) => void;
  cashInterestRate: string;
  setCashInterestRate: (v: string) => void;
  ytdBaseline: string;
  setYtdBaseline: (v: string) => void;
}

export function PortfolioDataSection({
  isAdmin,
  userId,
  onOpenImport,
  onDeleteAccount,
  dripEnabled,
  setDripEnabled,
  cashInterestRate,
  setCashInterestRate,
  ytdBaseline,
  setYtdBaseline,
}: PortfolioDataSectionProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportPortfolio = async () => {
    setExporting(true);
    setError(null);
    try {
      const portfolio = await getPortfolio(userId);

      const headers = ['Ticker', 'Shares', 'Average Cost', 'Current Price', 'Current Value', 'Total Cost', 'Profit/Loss', 'Profit/Loss %'];
      const rows = portfolio.holdings.map(h => [
        h.ticker,
        h.shares,
        h.averageCost?.toFixed(2) ?? '',
        h.currentPrice?.toFixed(2) ?? '',
        h.currentValue?.toFixed(2) ?? '',
        h.totalCost?.toFixed(2) ?? '',
        h.profitLoss?.toFixed(2) ?? '',
        h.profitLossPercent?.toFixed(2) ?? '',
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_err) {
      setError('Failed to export portfolio');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* Import & Export — first */}
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Import & Export</h3>

        {/* Import — admin only */}
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={onOpenImport}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Import Portfolio (CSV)</span>
              </div>
            </button>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted px-1">
              Upload a CSV to replace or merge with your current holdings
            </p>
          </>
        )}

        {/* Export */}
        <button
          type="button"
          onClick={handleExportPortfolio}
          disabled={exporting}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
            bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
            hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-rh-light-muted dark:text-rh-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{exporting ? 'Exporting...' : 'Export Portfolio (CSV)'}</span>
          </div>
        </button>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted px-1">
          Download your holdings, cost basis, and current values
        </p>

        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Portfolio Settings */}
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Portfolio Settings</h3>

        {/* DRIP */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Dividend Reinvestment (DRIP)</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Automatically reinvest dividends</p>
          </div>
          <ToggleSwitch checked={dripEnabled} onChange={setDripEnabled} />
        </label>

        {/* Cash Interest Rate */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Cash Interest Rate (APY)</span>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Interest earned on uninvested cash</p>
            </div>
          </div>
          <div className="relative w-32">
            <input
              type="number"
              step="0.01"
              min="0"
              max="20"
              value={cashInterestRate}
              onChange={e => setCashInterestRate(e.target.value)}
              placeholder="e.g. 4.5"
              className="w-full px-3 py-1.5 pr-7 text-sm bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-1 focus:ring-rh-green/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rh-light-muted/50 dark:text-rh-muted text-xs">%</span>
          </div>
        </div>

        {/* Jan 1 Portfolio Value */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div>
              <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Jan 1 Portfolio Value</span>
              <p className="text-xs text-rh-light-muted dark:text-rh-muted">Your total portfolio value on January 1st — enables accurate YTD returns</p>
            </div>
          </div>
          <div className="relative w-40">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rh-light-muted/50 dark:text-rh-muted text-xs">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={ytdBaseline}
              onChange={e => setYtdBaseline(e.target.value)}
              placeholder="e.g. 125000"
              className="w-full px-3 py-1.5 pl-7 text-sm bg-white dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-lg text-rh-light-text dark:text-white focus:outline-none focus:border-rh-green/50 focus:ring-1 focus:ring-rh-green/20"
            />
          </div>
        </div>
      </div>

      {/* Linked Accounts */}
      <LinkedAccountsSection />

      {/* Account History */}
      <AccountHistorySection />

      {/* Delete Account */}
      <div className="rounded-xl border border-red-500/15 dark:border-red-500/10 bg-red-500/[0.02] dark:bg-red-500/[0.02] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">Delete Account</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted mt-0.5">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
          </div>
          <button
            onClick={onDeleteAccount}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg
              border border-red-500/25 text-red-500 hover:bg-red-500/10
              hover:border-red-500/40 transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
