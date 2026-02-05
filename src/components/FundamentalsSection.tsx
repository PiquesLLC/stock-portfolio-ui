import { useState, useEffect, useRef } from 'react';
import { FundamentalsResponse, ParsedIncomeStatement, ParsedBalanceSheet, ParsedCashFlow } from '../types';
import { getFundamentals } from '../api';

type FundTab = 'revenue' | 'balance' | 'cashflow';
type PeriodToggle = 'annual' | 'quarterly';

function formatLargeNumber(n: number | null): string {
  if (n == null) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const m = d.getMonth();
  const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
  return `${q} ${d.getFullYear()}`;
}

function formatYear(dateStr: string): string {
  return dateStr.substring(0, 4);
}

function RevenueTable({ data, period }: { data: ParsedIncomeStatement[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-rh-light-muted dark:text-rh-muted border-b border-rh-light-border dark:border-rh-border">
            <th className="text-left py-2 pr-3 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Revenue</th>
            <th className="text-right py-2 px-2 font-medium">Gross Profit</th>
            <th className="text-right py-2 px-2 font-medium">Net Income</th>
            <th className="text-right py-2 px-2 font-medium">EBITDA</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-rh-light-border/50 dark:border-rh-border/50">
              <td className="py-2 pr-3 text-rh-light-text dark:text-rh-text font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.totalRevenue)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.grossProfit)}</td>
              <td className={`py-2 px-2 text-right ${row.netIncome != null && row.netIncome < 0 ? 'text-rh-red' : 'text-rh-light-text dark:text-rh-text'}`}>
                {formatLargeNumber(row.netIncome)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.ebitda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceTable({ data, period }: { data: ParsedBalanceSheet[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-rh-light-muted dark:text-rh-muted border-b border-rh-light-border dark:border-rh-border">
            <th className="text-left py-2 pr-3 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Total Assets</th>
            <th className="text-right py-2 px-2 font-medium">Total Liabilities</th>
            <th className="text-right py-2 px-2 font-medium">Equity</th>
            <th className="text-right py-2 px-2 font-medium">Cash</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-rh-light-border/50 dark:border-rh-border/50">
              <td className="py-2 pr-3 text-rh-light-text dark:text-rh-text font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.totalAssets)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.totalLiabilities)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.totalShareholderEquity)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.cashAndEquivalents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CashFlowTable({ data, period }: { data: ParsedCashFlow[]; period: PeriodToggle }) {
  const fmt = period === 'quarterly' ? formatQuarter : formatYear;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-rh-light-muted dark:text-rh-muted border-b border-rh-light-border dark:border-rh-border">
            <th className="text-left py-2 pr-3 font-medium">Period</th>
            <th className="text-right py-2 px-2 font-medium">Operating CF</th>
            <th className="text-right py-2 px-2 font-medium">CapEx</th>
            <th className="text-right py-2 px-2 font-medium">Free CF</th>
            <th className="text-right py-2 px-2 font-medium">Dividends</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-rh-light-border/50 dark:border-rh-border/50">
              <td className="py-2 pr-3 text-rh-light-text dark:text-rh-text font-medium">{fmt(row.fiscalDateEnding)}</td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.operatingCashflow)}</td>
              <td className="py-2 px-2 text-right text-rh-red">{formatLargeNumber(row.capitalExpenditures)}</td>
              <td className={`py-2 px-2 text-right ${row.freeCashFlow != null && row.freeCashFlow < 0 ? 'text-rh-red' : 'text-rh-green'}`}>
                {formatLargeNumber(row.freeCashFlow)}
              </td>
              <td className="py-2 px-2 text-right text-rh-light-text dark:text-rh-text">{formatLargeNumber(row.dividendPayout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Cache per ticker
const fundCache = new Map<string, { data: FundamentalsResponse; time: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function FundamentalsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<FundamentalsResponse | null>(fundCache.get(ticker)?.data ?? null);
  const [loading, setLoading] = useState(!fundCache.has(ticker));
  const [tab, setTab] = useState<FundTab>('revenue');
  const [period, setPeriod] = useState<PeriodToggle>('annual');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const cached = fundCache.get(ticker);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    setLoading(!cached);
    getFundamentals(ticker)
      .then(resp => {
        if (mountedRef.current) {
          setData(resp);
          fundCache.set(ticker, { data: resp, time: Date.now() });
          setLoading(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => { mountedRef.current = false; };
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-rh-light-border dark:bg-rh-border rounded w-24 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-3 bg-rh-light-border dark:bg-rh-border rounded" />)}
        </div>
      </div>
    );
  }

  // Don't render if no data at all
  const hasIncome = (data?.incomeStatements.annual.length ?? 0) > 0 || (data?.incomeStatements.quarterly.length ?? 0) > 0;
  const hasBalance = (data?.balanceSheets.annual.length ?? 0) > 0 || (data?.balanceSheets.quarterly.length ?? 0) > 0;
  const hasCash = (data?.cashFlows.annual.length ?? 0) > 0 || (data?.cashFlows.quarterly.length ?? 0) > 0;

  if (!hasIncome && !hasBalance && !hasCash) return null;

  const tabs: { id: FundTab; label: string; available: boolean }[] = [
    { id: 'revenue', label: 'Income', available: hasIncome },
    { id: 'balance', label: 'Balance Sheet', available: hasBalance },
    { id: 'cashflow', label: 'Cash Flow', available: hasCash },
  ];

  const incomeData = period === 'annual' ? data!.incomeStatements.annual : data!.incomeStatements.quarterly;
  const balanceData = period === 'annual' ? data!.balanceSheets.annual : data!.balanceSheets.quarterly;
  const cashData = period === 'annual' ? data!.cashFlows.annual : data!.cashFlows.quarterly;

  return (
    <div className="bg-rh-light-card dark:bg-rh-card border border-rh-light-border dark:border-rh-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-rh-light-text dark:text-rh-text">Financials</h3>
        <div className="flex items-center gap-2">
          {data?.dataAge === 'stale' && (
            <span className="text-[10px] text-rh-light-muted/60 dark:text-rh-muted/60">stale data</span>
          )}
          <div className="flex gap-0.5 bg-rh-light-bg dark:bg-rh-dark rounded p-0.5">
            {(['annual', 'quarterly'] as PeriodToggle[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors
                  ${period === p
                    ? 'bg-rh-light-card dark:bg-rh-card text-rh-green shadow-sm'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                  }`}
              >
                {p === 'annual' ? 'Annual' : 'Quarterly'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-3 border-b border-rh-light-border dark:border-rh-border">
        {tabs.filter(t => t.available).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px
              ${tab === t.id
                ? 'border-rh-green text-rh-green'
                : 'border-transparent text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table content */}
      {tab === 'revenue' && <RevenueTable data={incomeData} period={period} />}
      {tab === 'balance' && <BalanceTable data={balanceData} period={period} />}
      {tab === 'cashflow' && <CashFlowTable data={cashData} period={period} />}
    </div>
  );
}
