import { useState, useEffect, useMemo, useCallback } from 'react';
import { getStockDetails, getAssetAbout, getNalaScore, getIntradayCandles, getHourlyCandles, IntradayCandle } from '../api';
import { StockDetailsResponse, AssetAbout, NalaScoreResponse, ChartPeriod, SymbolSearchResult } from '../types';
import { StockPriceChart } from './StockPriceChart';
import { StockLogo } from './StockLogo';
import { TickerAutocompleteInput } from './TickerAutocompleteInput';

const ACCENT_COLORS = ['#F59E0B', '#EC4899', '#06B6D4'];

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

function getStockColor(index: number, isDark: boolean) {
  return index === 0 ? (isDark ? '#FFFFFF' : '#000000') : ACCENT_COLORS[(index - 1) % ACCENT_COLORS.length];
}

interface StockCompareData {
  ticker: string;
  color: string;
  details: StockDetailsResponse | null;
  about: AssetAbout | null;
  nalaScore: NalaScoreResponse | null;
}

interface CompareStocksPageProps {
  tickers: string[];
  onBack: () => void;
  onTickerClick: (ticker: string) => void;
  onUpdateTickers: (tickers: string[]) => void;
}

// Format helpers
function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(2) + '%';
}
function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}
function fmtMarketCap(mktCapM: number | null | undefined): string {
  if (mktCapM == null) return '—';
  if (mktCapM >= 1e6) return '$' + (mktCapM / 1e6).toFixed(2) + 'T';
  if (mktCapM >= 1e3) return '$' + (mktCapM / 1e3).toFixed(2) + 'B';
  return '$' + mktCapM.toFixed(0) + 'M';
}
function getPeriodChange(s: StockCompareData, period: ChartPeriod): { change: number; pct: number } | null {
  const q = s.details?.quote;
  if (!q?.currentPrice) return null;
  if (period === '1D') return { change: q.change ?? 0, pct: q.changePercent ?? 0 };
  const cc = s.details?.candles;
  if (!cc || cc.closes.length < 2) return null;
  const now = Date.now();
  let periodStartMs: number;
  switch (period) {
    case '1W': periodStartMs = now - 7 * 86400000; break;
    case '1M': periodStartMs = now - 30 * 86400000; break;
    case '3M': periodStartMs = now - 90 * 86400000; break;
    case 'YTD': periodStartMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
    case '1Y': periodStartMs = now - 365 * 86400000; break;
    default: periodStartMs = 0; break; // MAX
  }
  let refIdx = 0;
  for (let i = 0; i < cc.dates.length; i++) {
    if (new Date(cc.dates[i] + 'T12:00:00').getTime() >= periodStartMs) { refIdx = i; break; }
  }
  const startPrice = cc.closes[refIdx];
  if (!startPrice) return null;
  const change = q.currentPrice - startPrice;
  const pct = (change / startPrice) * 100;
  return { change, pct };
}


type MetricRule = 'maximize' | 'minimize' | 'neutral';
type MetricRow = {
  label: string;
  getValue: (s: StockCompareData) => number | null | undefined;
  format: (v: number | null | undefined) => string;
  rule: MetricRule;
  positiveOnly?: boolean; // Exclude <= 0 values from comparison (e.g. P/E)
};

const METRIC_ROWS: MetricRow[] = [
  { label: 'Market Cap', getValue: s => s.details?.profile?.marketCapM, format: fmtMarketCap, rule: 'maximize' },
  { label: 'P/E Ratio', getValue: s => s.details?.metrics?.peRatio, format: v => fmtNum(v), rule: 'minimize', positiveOnly: true },
  { label: 'EPS', getValue: s => s.details?.metrics?.eps, format: fmtCurrency, rule: 'maximize' },
  { label: 'Dividend Yield', getValue: s => s.details?.metrics?.dividendYield, format: fmtPct, rule: 'maximize' },
  { label: 'Beta', getValue: s => s.details?.metrics?.beta, format: v => fmtNum(v), rule: 'minimize' },
  { label: '52W High', getValue: s => s.details?.metrics?.week52High, format: fmtCurrency, rule: 'neutral' },
  { label: '52W Low', getValue: s => s.details?.metrics?.week52Low, format: fmtCurrency, rule: 'neutral' },
  { label: 'Avg Vol (10D)', getValue: s => s.details?.metrics?.avgVolume10D, format: v => v == null ? '—' : `${v.toFixed(1)}M`, rule: 'maximize' },
  { label: 'Day Open', getValue: s => s.details?.quote?.open, format: fmtCurrency, rule: 'neutral' },
  { label: 'Day High', getValue: s => s.details?.quote?.high, format: fmtCurrency, rule: 'neutral' },
  { label: 'Day Low', getValue: s => s.details?.quote?.low, format: fmtCurrency, rule: 'neutral' },
  { label: 'Prev Close', getValue: s => s.details?.quote?.previousClose, format: fmtCurrency, rule: 'neutral' },
];

export function CompareStocksPage({ tickers, onBack, onTickerClick, onUpdateTickers }: CompareStocksPageProps) {
  const isDark = useIsDark();
  const [rawStocks, setRawStocks] = useState<StockCompareData[]>([]);
  // Override colors reactively based on theme
  const stocks = useMemo(() => rawStocks.map((s, i) => ({ ...s, color: getStockColor(i, isDark) })), [rawStocks, isDark]);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');
  const [showAddInput, setShowAddInput] = useState(false);
  const [addInputValue, setAddInputValue] = useState('');

  // Fetch all stock data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      const results = await Promise.allSettled(
        tickers.map(async (ticker) => {
          const [details, about, nalaScore] = await Promise.allSettled([
            getStockDetails(ticker),
            getAssetAbout(ticker),
            getNalaScore(ticker),
          ]);
          return {
            ticker,
            color: '', // overridden reactively by stocks memo
            details: details.status === 'fulfilled' ? details.value : null,
            about: about.status === 'fulfilled' ? about.value : null,
            nalaScore: nalaScore.status === 'fulfilled' ? nalaScore.value : null,
          } as StockCompareData;
        })
      );

      if (!cancelled) {
        setRawStocks(results.filter((r): r is PromiseFulfilledResult<StockCompareData> => r.status === 'fulfilled').map(r => r.value));
        setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [tickers]);

  // Chart comparison data — normalization logic (mirrors StockDetailView)
  const primaryStock = stocks[0] ?? null;
  const [intradayCandles, setIntradayCandles] = useState<IntradayCandle[]>([]);
  const [hourlyCandles, setHourlyCandles] = useState<IntradayCandle[]>([]);
  const [compareData, setCompareData] = useState<{ ticker: string; color: string; points: { time: number; price: number; rawPrice: number }[] }[]>([]);

  // Fetch primary stock candles for chart
  useEffect(() => {
    if (!primaryStock) return;
    let cancelled = false;
    setCompareData([]); // Clear stale comparison data immediately on period change
    const ticker = primaryStock.ticker;
    if (chartPeriod === '1D') {
      getIntradayCandles(ticker).then(c => { if (!cancelled) setIntradayCandles(c); }).catch(() => { if (!cancelled) setIntradayCandles([]); });
      setHourlyCandles([]);
    } else if (chartPeriod === '1W' || chartPeriod === '1M') {
      getHourlyCandles(ticker, chartPeriod).then(c => { if (!cancelled) setHourlyCandles(c); }).catch(() => { if (!cancelled) setHourlyCandles([]); });
      setIntradayCandles([]);
    } else {
      setIntradayCandles([]);
      setHourlyCandles([]);
    }
    return () => { cancelled = true; };
  }, [primaryStock, chartPeriod]);

  // Fetch comparison chart data
  useEffect(() => {
    if (stocks.length < 2 || !primaryStock?.details) return;
    let cancelled = false;

    const fetchComps = async () => {
      const pd = primaryStock.details!;
      let mainRefPrice = pd.quote?.currentPrice ?? 0;
      if (chartPeriod === '1D' && intradayCandles.length > 0) {
        mainRefPrice = intradayCandles[0].close;
      } else if ((chartPeriod === '1W' || chartPeriod === '1M') && hourlyCandles.length > 0) {
        mainRefPrice = hourlyCandles[0].close;
      } else if (pd.candles && pd.candles.closes.length > 0) {
        const cc = pd.candles;
        const now = Date.now();
        let periodStartMs: number;
        switch (chartPeriod) {
          case '3M': periodStartMs = now - 90 * 86400000; break;
          case 'YTD': periodStartMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
          case '1Y': periodStartMs = now - 365 * 86400000; break;
          default: periodStartMs = 0; break;
        }
        let refIdx = 0;
        for (let i = 0; i < cc.dates.length; i++) {
          if (new Date(cc.dates[i] + 'T12:00:00').getTime() >= periodStartMs) { refIdx = i; break; }
        }
        mainRefPrice = cc.closes[refIdx];
      }
      if (!mainRefPrice) return;

      const results: typeof compareData = [];
      for (let ci = 1; ci < stocks.length; ci++) {
        const s = stocks[ci];
        try {
          let points: { time: number; price: number; rawPrice: number }[] = [];
          if (chartPeriod === '1D') {
            const compCandles = await getIntradayCandles(s.ticker);
            if (compCandles.length >= 2) {
              const compStart = compCandles[0].close;
              points = compCandles.map(c => ({
                time: new Date(c.time).getTime(),
                price: mainRefPrice * (1 + (c.close - compStart) / compStart),
                rawPrice: c.close,
              }));
            }
          } else if (chartPeriod === '1W' || chartPeriod === '1M') {
            const compCandles = await getHourlyCandles(s.ticker, chartPeriod);
            if (compCandles.length >= 2) {
              const compStart = compCandles[0].close;
              points = compCandles.map(c => ({
                time: new Date(c.time).getTime(),
                price: mainRefPrice * (1 + (c.close - compStart) / compStart),
                rawPrice: c.close,
              }));
            }
          } else {
            const compDetails = await getStockDetails(s.ticker);
            if (compDetails.candles && compDetails.candles.closes.length >= 2) {
              const cc = compDetails.candles;
              const now = Date.now();
              let periodStartMs: number;
              switch (chartPeriod) {
                case '3M': periodStartMs = now - 90 * 86400000; break;
                case 'YTD': periodStartMs = new Date(new Date().getFullYear(), 0, 1).getTime(); break;
                case '1Y': periodStartMs = now - 365 * 86400000; break;
                default: periodStartMs = 0; break;
              }
              let compRefIdx = 0;
              for (let i = 0; i < cc.dates.length; i++) {
                if (new Date(cc.dates[i] + 'T12:00:00').getTime() >= periodStartMs) { compRefIdx = i; break; }
              }
              const compStart = cc.closes[compRefIdx];
              points = cc.dates.map((date, i) => ({
                time: new Date(date + 'T12:00:00').getTime(),
                price: mainRefPrice * (1 + (cc.closes[i] - compStart) / compStart),
                rawPrice: cc.closes[i],
              }));
            }
          }
          if (points.length >= 2) {
            results.push({ ticker: s.ticker, color: s.color, points });
          }
        } catch { /* skip failed */ }
      }
      if (!cancelled) setCompareData(results);
    };

    fetchComps();
    return () => { cancelled = true; };
  }, [stocks, chartPeriod, primaryStock?.details, intradayCandles, hourlyCandles]);

  const removeTicker = useCallback((ticker: string) => {
    const updated = tickers.filter(t => t !== ticker);
    if (updated.length < 2) {
      onBack();
    } else {
      onUpdateTickers(updated);
    }
  }, [tickers, onBack, onUpdateTickers]);

  const addTicker = useCallback((ticker: string) => {
    const upper = ticker.trim().toUpperCase();
    if (!upper || tickers.includes(upper) || tickers.length >= 4) return;
    onUpdateTickers([...tickers, upper]);
    setShowAddInput(false);
    setAddInputValue('');
  }, [tickers, onUpdateTickers]);

  // Compute best values for metric highlighting (supports ties)
  const bestValues = useMemo(() => {
    const EPS = 1e-6;
    const result: Record<string, Set<string>> = {};
    for (const row of METRIC_ROWS) {
      result[row.label] = new Set();
      if (row.rule === 'neutral') continue;

      // Collect valid values
      const valid: { ticker: string; val: number }[] = [];
      for (const s of stocks) {
        const v = row.getValue(s);
        if (v == null || !isFinite(v)) continue;
        if (row.positiveOnly && v <= 0) continue;
        valid.push({ ticker: s.ticker, val: v });
      }
      if (valid.length < 2) continue; // need at least 2 to compare

      const bestVal = row.rule === 'maximize'
        ? Math.max(...valid.map(e => e.val))
        : Math.min(...valid.map(e => e.val));

      // Highlight all tied winners
      for (const e of valid) {
        if (Math.abs(e.val - bestVal) < EPS) result[row.label].add(e.ticker);
      }
    }
    return result;
  }, [stocks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-rh-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.04] transition-colors text-rh-light-muted dark:text-white/40">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-rh-light-text dark:text-rh-text">Compare Stocks</h1>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {stocks.map(s => (
            <span key={s.ticker}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: s.color + '40', color: s.color }}
              onClick={() => onTickerClick(s.ticker)}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.ticker}
              {stocks.length > 2 && (
                <button onClick={(e) => { e.stopPropagation(); removeTicker(s.ticker); }}
                  className="ml-0.5 opacity-60 hover:opacity-100">&times;</button>
              )}
            </span>
          ))}
          {tickers.length < 4 && (
            showAddInput ? (
              <div className="inline-flex items-center relative" style={{ width: '130px' }}>
                <TickerAutocompleteInput
                  value={addInputValue}
                  onChange={setAddInputValue}
                  onSelect={(result: SymbolSearchResult) => addTicker(result.symbol)}
                  placeholder="Add ticker"
                  autoFocus
                  className="!w-full !px-2 !py-1 !text-xs !font-semibold !bg-transparent !border-gray-300/60 dark:!border-white/[0.12] !rounded-lg !text-rh-light-text dark:!text-rh-text"
                />
              </div>
            ) : (
              <button onClick={() => setShowAddInput(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted/70 dark:text-white/30 hover:text-rh-light-text dark:hover:text-white/60 transition-colors"
              >
                + Add
              </button>
            )
          )}
        </div>
      </div>

      {/* Price Summary Cards */}
      <div className={`grid gap-3 mb-6 ${stocks.length <= 2 ? 'grid-cols-2' : stocks.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        {stocks.map(s => {
          const q = s.details?.quote;
          const pc = getPeriodChange(s, chartPeriod);
          const changeVal = pc?.change ?? 0;
          const changePct = pc?.pct ?? 0;
          const changeColor = changeVal >= 0 ? 'text-rh-green' : 'text-rh-red';
          return (
            <div key={s.ticker}
              className="bg-white dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.05] rounded-xl p-4 shadow-sm dark:shadow-none cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
              style={{ borderLeftColor: s.color, borderLeftWidth: '3px' }}
              onClick={() => onTickerClick(s.ticker)}
            >
              <div className="flex items-center gap-2 mb-2">
                <StockLogo ticker={s.ticker} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs font-bold" style={{ color: s.color }}>{s.ticker}</div>
                  <div className="text-[10px] text-rh-light-muted dark:text-rh-muted truncate">
                    {s.details?.profile?.name ?? '—'}
                  </div>
                </div>
              </div>
              <div className="text-lg font-bold text-rh-light-text dark:text-rh-text tabular-nums">
                {fmtCurrency(q?.currentPrice)}
              </div>
              <div className={`text-xs font-semibold ${changeColor} tabular-nums`}>
                {changeVal >= 0 ? '+' : ''}{fmtCurrency(changeVal)} ({changePct >= 0 ? '+' : ''}{fmtPct(changePct)})
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Chart */}
      {primaryStock?.details && (
        <div className="mb-8 bg-gray-50/60 dark:bg-transparent rounded-xl p-3 dark:p-0 border border-gray-200/30 dark:border-transparent">
          <StockPriceChart
            ticker={primaryStock.ticker}
            candles={primaryStock.details.candles}
            intradayCandles={intradayCandles}
            hourlyCandles={hourlyCandles}
            livePrices={[]}
            selectedPeriod={chartPeriod}
            onPeriodChange={setChartPeriod}
            currentPrice={primaryStock.details.quote?.currentPrice ?? 0}
            previousClose={primaryStock.details.quote?.previousClose ?? 0}
            session={primaryStock.details.quote?.session}
            comparisons={compareData.length > 0 ? compareData : undefined}
            overrideLineColor={primaryStock.color}
          />
        </div>
      )}

      {/* Key Metrics Table */}
      <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl overflow-hidden mb-8">
        <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white p-5 pb-3">Key Statistics</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200/30 dark:border-white/[0.05]">
                <th className="text-left py-2 px-5 font-medium text-rh-light-muted/60 dark:text-white/25 text-[10px] uppercase tracking-wider">Metric</th>
                {stocks.map(s => (
                  <th key={s.ticker} className="text-right py-2 px-4 font-semibold text-[11px]" style={{ color: s.color }}>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.ticker}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIC_ROWS.map(row => {
                const winners = bestValues[row.label];
                return (
                  <tr key={row.label} className="border-b border-gray-200/15 dark:border-white/[0.025] last:border-b-0">
                    <td className="py-2.5 px-5 text-gray-600 dark:text-white/50 font-medium whitespace-nowrap">{row.label}</td>
                    {stocks.map(s => {
                      const isBest = winners?.has(s.ticker) ?? false;
                      return (
                        <td key={s.ticker} className={`py-2.5 px-4 text-right font-medium tabular-nums whitespace-nowrap ${isBest ? 'text-rh-green' : 'text-rh-light-text dark:text-white/85'}`}>
                          {row.format(row.getValue(s))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Company Profile Cards */}
      <div className="mb-8">
        <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white mb-3">Company Profile</h2>
        <div className={`grid gap-3 ${stocks.length <= 2 ? 'grid-cols-2' : stocks.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
          {stocks.map(s => {
            const profile = s.details?.profile;
            const about = s.about;
            return (
              <div key={s.ticker}
                className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-4"
                style={{ borderTopColor: s.color, borderTopWidth: '3px' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <StockLogo ticker={s.ticker} size="sm" />
                  <div className="text-sm font-bold text-rh-light-text dark:text-rh-text">{s.ticker}</div>
                </div>
                <div className="space-y-2 text-xs">
                  {(about?.sector || profile?.industry) && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Sector</div>
                      <div className="text-rh-light-text dark:text-white/85 font-medium">{about?.sector || profile?.industry || '—'}</div>
                    </div>
                  )}
                  {about?.industry && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Industry</div>
                      <div className="text-rh-light-text dark:text-white/85 font-medium">{about.industry}</div>
                    </div>
                  )}
                  {profile?.country && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Country</div>
                      <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.country}</div>
                    </div>
                  )}
                  {profile?.exchange && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">Exchange</div>
                      <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.exchange}</div>
                    </div>
                  )}
                  {profile?.ipoDate && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mb-0.5">IPO Date</div>
                      <div className="text-rh-light-text dark:text-white/85 font-medium">{profile.ipoDate}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nala Score Comparison */}
      {stocks.some(s => s.nalaScore) && (
        <div className="bg-gray-50/40 dark:bg-white/[0.02] backdrop-blur-md border border-gray-200/40 dark:border-white/[0.05] rounded-xl p-5 mb-8">
          <h2 className="text-sm font-bold tracking-tight text-rh-light-text dark:text-white mb-4">Nala Score</h2>
          <div className={`grid gap-4 ${stocks.length <= 2 ? 'grid-cols-2' : stocks.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
            {stocks.map(s => (
              <div key={s.ticker} className="text-center">
                <div className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>
                  {s.nalaScore?.composite ?? '—'}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-rh-light-muted/60 dark:text-white/25 mt-1">
                  {s.nalaScore?.grade || 'N/A'}
                </div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: s.color }}>{s.ticker}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
