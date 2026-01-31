import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Holding, ChartPeriod, StockDetailsResponse, MarketSession } from '../types';
import { Acronym, getAcronymTitle } from './Acronym';
import { getStockDetails, getStockQuote, getIntradayCandles, getHourlyCandles, IntradayCandle, addHolding } from '../api';
import { StockPriceChart } from './StockPriceChart';

interface Props {
  ticker: string;
  holding: Holding | null;
  portfolioTotal: number;
  onBack: () => void;
  onHoldingAdded?: () => void;
}

function formatCurrency(v: number): string {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatLargeNumber(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}T`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}B`;
  return `${v.toFixed(2)}M`;
}

function formatVolume(v: number | null): string {
  if (v === null) return 'N/A';
  // avgVolume10D from Finnhub is in millions
  if (v >= 1000) return `${(v / 1000).toFixed(2)}B`;
  return `${v.toFixed(2)}M`;
}

function formatPercent(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function inferExchangeLabel(ticker: string): string | null {
  const t = ticker.toUpperCase();
  if (t.endsWith('.TO')) return 'TSX';
  if (t.endsWith('.V')) return 'TSX-V';
  if (t.endsWith('.L')) return 'LSE';
  if (t.endsWith('.PA')) return 'Euronext Paris';
  if (t.endsWith('.AS')) return 'Euronext Amsterdam';
  if (t.endsWith('.DE')) return 'Xetra';
  if (t.endsWith('.MI')) return 'Borsa Italiana';
  if (t.endsWith('.T')) return 'Tokyo';
  if (t.endsWith('.HK')) return 'HKEX';
  if (t.endsWith('.AX')) return 'ASX';
  if (t.includes('=F')) return 'Futures';
  if (t.endsWith('-USD') || t.endsWith('-CAD') || t.endsWith('-EUR')) return 'Crypto';
  return null;
}

function StatItem({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-rh-light-muted dark:text-rh-muted">{label}</span>
      <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">{value}</span>
    </div>
  );
}

function PositionCard({ label, value, valueColor, sub }: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="bg-rh-light-bg dark:bg-rh-dark rounded-xl px-4 py-3">
      <div className="text-[11px] font-medium text-rh-light-muted dark:text-rh-muted mb-1">{label}</div>
      <div className={`text-lg font-bold ${valueColor ?? 'text-rh-light-text dark:text-rh-text'}`}>{value}</div>
      {sub && (
        <div className={`text-xs mt-0.5 ${valueColor ?? 'text-rh-light-muted dark:text-rh-muted'}`}>{sub}</div>
      )}
    </div>
  );
}

function AddToPortfolioForm({ ticker, currentPrice, onAdded, holding }: { ticker: string; currentPrice: number; onAdded?: () => void; holding?: Holding | null }) {
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(shares);
    const c = parseFloat(avgCost);
    if (!s || s <= 0) { setFormError('Enter a valid number of shares'); return; }
    if (!c || c <= 0) { setFormError('Enter a valid average cost'); return; }

    setSubmitting(true);
    setFormError(null);
    try {
      await addHolding({ ticker: ticker.toUpperCase(), shares: s, averageCost: c });
      setSuccess(true);
      setShares('');
      setAvgCost('');
      onAdded?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add holding');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-8 bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border p-5">
      {holding && (
        <div className="mb-3 text-sm text-rh-light-muted dark:text-rh-muted">
          Currently holding <span className="font-semibold text-rh-light-text dark:text-rh-text">{holding.shares}</span> shares at <span className="font-semibold text-rh-light-text dark:text-rh-text">${holding.averageCost.toFixed(2)}</span> avg cost
        </div>
      )}
      {success && (
        <div className="mb-3 bg-rh-green/10 border border-rh-green/30 rounded-lg p-3 text-center">
          <div className="text-rh-green font-semibold text-sm">Added to Portfolio</div>
        </div>
      )}
      <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text mb-3">{holding ? 'Update Holding' : 'Add to Portfolio'}</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-rh-light-muted dark:text-rh-muted mb-1">Shares</label>
          <input
            type="number"
            step="any"
            min="0.001"
            value={shares}
            onChange={e => setShares(e.target.value)}
            placeholder="10"
            className="w-28 px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
          />
        </div>
        <div>
          <label className="block text-xs text-rh-light-muted dark:text-rh-muted mb-1">Avg Cost per Share</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={avgCost}
            onChange={e => setAvgCost(e.target.value)}
            placeholder={currentPrice.toFixed(2)}
            className="w-32 px-3 py-2 rounded-lg border border-rh-light-border dark:border-rh-border bg-rh-light-bg dark:bg-rh-dark text-rh-light-text dark:text-rh-text text-sm focus:outline-none focus:ring-2 focus:ring-rh-green/50"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 rounded-lg bg-rh-green hover:bg-green-600 text-black font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {submitting ? 'Adding...' : holding ? 'Update' : 'Add to Portfolio'}
        </button>
      </form>
      {formError && <p className="text-rh-red text-xs mt-2">{formError}</p>}
    </div>
  );
}

export function StockDetailView({ ticker, holding, portfolioTotal, onBack, onHoldingAdded }: Props) {
  const [data, setData] = useState<StockDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>(() => {
    const saved = localStorage.getItem('stockChartPeriod');
    return (saved as ChartPeriod) || '1D';
  });
  const handlePeriodChange = useCallback((period: ChartPeriod) => {
    setChartPeriod(period);
    localStorage.setItem('stockChartPeriod', period);
  }, []);
  // Intraday candles for 1D chart (from Yahoo Finance via API)
  const [intradayCandles, setIntradayCandles] = useState<IntradayCandle[]>([]);
  // Hourly candles for 1W/1M (finer-grained than daily)
  const [hourlyCandles, setHourlyCandles] = useState<IntradayCandle[]>([]);
  // Legacy live prices kept as fallback
  const [livePrices, setLivePrices] = useState<{ time: string; price: number }[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cache for prefetched hourly data
  const hourlyCache = useRef<Record<string, IntradayCandle[]>>({});

  // Initial fetch — full details (profile, metrics, candles, quote) + intraday + prefetch hourly
  const fetchInitial = useCallback(async () => {
    try {
      const [result, intraday, hourly1W, hourly1M] = await Promise.all([
        getStockDetails(ticker),
        getIntradayCandles(ticker).catch(() => []),
        getHourlyCandles(ticker, '1W').catch(() => []),
        getHourlyCandles(ticker, '1M').catch(() => []),
      ]);
      hourlyCache.current = { '1W': hourly1W, '1M': hourly1M };
      // Set hourly candles immediately if current period needs them
      if (chartPeriod === '1W') setHourlyCandles(hourly1W);
      else if (chartPeriod === '1M') setHourlyCandles(hourly1M);
      setData(result);
      setIntradayCandles(intraday);
      setError(null);
      // Seed live prices with current price
      const now = new Date().toISOString();
      setLivePrices([{ time: now, price: result.quote.currentPrice }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock details');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  // Poll — refresh quote + intraday candles
  const pollQuote = useCallback(async () => {
    if (document.hidden) return;
    try {
      const [quote, intraday] = await Promise.all([
        getStockQuote(ticker),
        getIntradayCandles(ticker).catch(() => null),
      ]);
      setData(prev => {
        if (!prev) return prev;
        return { ...prev, quote };
      });
      if (intraday && intraday.length > 0) {
        setIntradayCandles(intraday);
      }
      // Append to live prices as fallback (use extended price if available)
      const now = new Date().toISOString();
      const livePrice = quote.extendedPrice ?? quote.currentPrice;
      setLivePrices(prev => {
        const next = [...prev, { time: now, price: livePrice }];
        return next.length > 500 ? next.slice(-500) : next;
      });
    } catch {
      // Silently fail on poll — keep existing data
    }
  }, [ticker]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setLivePrices([]);
    setIntradayCandles([]);
    fetchInitial();
  }, [fetchInitial]);

  // Set hourly candles from prefetched cache — instant switch
  useEffect(() => {
    if (chartPeriod === '1W' || chartPeriod === '1M') {
      setHourlyCandles(hourlyCache.current[chartPeriod] || []);
    } else {
      setHourlyCandles([]);
    }
  }, [chartPeriod]);

  // Polling interval — 12s during market, 60s when closed
  useEffect(() => {
    if (!data) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    const session = data.quote.session as MarketSession | undefined;
    const isActive = session === 'REG' || session === 'PRE' || session === 'POST';
    const pollMs = isActive ? 10000 : 30000;

    intervalRef.current = setInterval(pollQuote, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.quote.session, pollQuote]);

  // ESC key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onBack]);

  // Hover state for chart crosshair (must be before ALL conditional returns — Rules of Hooks)
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const handleHoverPrice = useCallback((price: number | null, label: string | null) => {
    setHoverPrice(price);
    setHoverLabel(label);
  }, []);

  // Compute period-specific change (must be before ALL conditional returns — Rules of Hooks)
  const periodChange = useMemo(() => {
    if (!data) return { change: 0, changePct: 0, label: 'Today' };
    const quote = data.quote;
    if (chartPeriod === '1D') {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const candles = data.candles;
    if (!candles || candles.closes.length === 0) {
      return { change: quote.change, changePct: quote.changePercent, label: 'Today' };
    }
    const now = new Date();
    let cutoff: Date;
    switch (chartPeriod) {
      case '1W': cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7); break;
      case '1M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); break;
      case '3M': cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); break;
      case 'YTD': cutoff = new Date(now.getFullYear(), 0, 1); break;
      case '1Y': default: cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    }
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let startPrice = candles.closes[0];
    for (let i = 0; i < candles.dates.length; i++) {
      if (candles.dates[i] >= cutoffStr) {
        startPrice = candles.closes[i];
        break;
      }
    }
    const change = quote.currentPrice - startPrice;
    const changePct = startPrice !== 0 ? (change / startPrice) * 100 : 0;
    const labels: Record<string, string> = { '1W': 'Past Week', '1M': 'Past Month', '3M': 'Past 3 Months', 'YTD': 'Year to Date', '1Y': 'Past Year' };
    return { change, changePct, label: labels[chartPeriod] || chartPeriod };
  }, [chartPeriod, data]);

  if (loading) {
    return (
      <div className="py-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-6 transition-colors">
          <span>&larr;</span> Back
        </button>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-rh-light-bg dark:bg-rh-dark rounded-lg" />
          <div className="h-12 w-32 bg-rh-light-bg dark:bg-rh-dark rounded-lg" />
          <div className="h-[300px] bg-rh-light-bg dark:bg-rh-dark rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-rh-light-bg dark:bg-rh-dark rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-6 transition-colors">
          <span>&larr;</span> Back
        </button>
        <div className="text-rh-red text-sm">{error || 'Failed to load'}</div>
      </div>
    );
  }

  const { quote, profile, metrics } = data;

  // Extended hours pricing from Yahoo Finance (returned by API)
  const hasExtended = quote.extendedPrice != null && quote.extendedPrice !== quote.currentPrice;
  const basePrice = hasExtended ? quote.extendedPrice! : quote.currentPrice;
  const displayPrice = hoverPrice ?? basePrice;
  const isHovering = hoverPrice !== null;

  // When hovering, compute change from the period's start price
  const periodStartPrice = basePrice - periodChange.change;
  const activeChange = isHovering ? displayPrice - periodStartPrice : periodChange.change;
  const activeChangePct = isHovering
    ? (periodStartPrice !== 0 ? (activeChange / periodStartPrice) * 100 : 0)
    : periodChange.changePct;

  const isGain = activeChange >= 0;
  const changeColor = isGain ? 'text-rh-green' : 'text-rh-red';

  // Infer exchange label from ticker suffix or profile
  const exchangeLabel = profile?.exchange || inferExchangeLabel(ticker);

  return (
    <div className="py-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text mb-4 transition-colors">
        <span>&larr;</span> Back to Portfolio
      </button>

      {/* Header: Company name + ticker */}
      <div className="mb-1">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">
          {profile?.name || ticker}
        </h1>
        <div className="flex items-center gap-2">
          {profile?.name && (
            <span className="text-sm text-rh-light-muted dark:text-rh-muted">{ticker}</span>
          )}
          {exchangeLabel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-rh-light-bg dark:bg-rh-dark text-rh-light-muted dark:text-rh-muted font-medium">
              {exchangeLabel}
            </span>
          )}
        </div>
      </div>

      {/* Price hero — fixed height to prevent layout shift on hover */}
      <div className="mb-6" style={{ minHeight: hasExtended ? '130px' : '100px' }}>
        <div className="text-4xl font-bold text-rh-light-text dark:text-rh-text tracking-tight">
          {formatCurrency(displayPrice)}
        </div>
        {/* Show hover time label or regular change */}
        {isHovering ? (
          <div className={`flex items-center gap-2 mt-1 ${changeColor}`}>
            <span className="text-lg font-semibold">
              {activeChange >= 0 ? '+' : ''}{formatCurrency(activeChange).replace('$', '').replace('-$', '-$')}
            </span>
            <span className="text-base">
              ({formatPercent(activeChangePct)})
            </span>
            <span className="text-xs text-rh-light-muted dark:text-rh-muted font-medium">{hoverLabel}</span>
          </div>
        ) : (
          <>
            <div className={`flex items-center gap-2 mt-1 ${changeColor}`}>
              <span className="text-lg font-semibold">
                {activeChange >= 0 ? '+' : ''}{formatCurrency(activeChange).replace('$', '').replace('-$', '-$')}
              </span>
              <span className="text-base">
                ({formatPercent(activeChangePct)})
              </span>
              <span className="text-xs text-rh-light-muted dark:text-rh-muted font-medium">{periodChange.label}</span>
            </div>
            {/* Extended hours price change line */}
            {hasExtended && (
              <div className={`flex items-center gap-2 mt-1 ${quote.extendedChange! >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>
                <span className="text-sm font-medium">
                  {quote.extendedChange! >= 0 ? '+' : ''}{formatCurrency(quote.extendedChange!).replace('$', '').replace('-$', '-$')}
                </span>
                <span className="text-sm">
                  ({formatPercent(quote.extendedChangePercent!)})
                </span>
                <span className="text-xs text-rh-light-muted dark:text-rh-muted font-medium">
                  {quote.session === 'PRE' ? 'Pre-Market' : 'After Hours'}
                </span>
              </div>
            )}
          </>
        )}
        {quote.session && quote.session !== 'REG' && (
          <span className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
            quote.session === 'CLOSED' ? 'bg-gray-500/10 text-gray-400' :
            quote.session === 'PRE' ? 'bg-blue-500/10 text-blue-400' :
            'bg-purple-500/10 text-purple-400'
          }`} title={getAcronymTitle(quote.session === 'PRE' ? 'PRE' : quote.session === 'POST' ? 'POST' : 'CLOSED') || ''}>
            {quote.session === 'PRE' ? 'Pre-Market' : quote.session === 'POST' ? 'After Hours' : 'Market Closed'}
          </span>
        )}
      </div>

      {/* Price Chart */}
      <div className="mb-8">
        <StockPriceChart
          candles={data.candles}
          intradayCandles={intradayCandles}
          hourlyCandles={hourlyCandles}
          livePrices={livePrices}
          selectedPeriod={chartPeriod}
          onPeriodChange={handlePeriodChange}
          currentPrice={quote.currentPrice}
          previousClose={quote.previousClose}
          onHoverPrice={handleHoverPrice}
        />
      </div>

      {/* Your Position */}
      {holding && (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text mb-3">Your Position</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <PositionCard label="Market Value" value={formatCurrency(holding.currentValue)} />
            <PositionCard label="Average Cost" value={formatCurrency(holding.averageCost)} />
            <PositionCard
              label="Today's Return"
              value={`${holding.dayChange >= 0 ? '+' : ''}${formatCurrency(holding.dayChange)}`}
              valueColor={holding.dayChange >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(holding.dayChangePercent)}
            />
            <PositionCard
              label="Total Return"
              value={`${holding.profitLoss >= 0 ? '+' : ''}${formatCurrency(holding.profitLoss)}`}
              valueColor={holding.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red'}
              sub={formatPercent(holding.profitLossPercent)}
            />
            <PositionCard label="Shares" value={holding.shares.toLocaleString()} />
            <PositionCard
              label="Portfolio Diversity"
              value={portfolioTotal > 0 ? `${((holding.currentValue / portfolioTotal) * 100).toFixed(1)}%` : 'N/A'}
            />
          </div>
        </div>
      )}

      {/* Key Statistics */}
      {(metrics || quote) && (
        <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border p-5 mb-6">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text mb-4">Key Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            {profile && profile.marketCapM > 0 && (
              <StatItem label="Market Cap" value={formatLargeNumber(profile.marketCapM)} />
            )}
            {metrics?.peRatio !== undefined && (
              <StatItem label={<><Acronym label="P/E" /> Ratio</>} value={metrics.peRatio !== null ? metrics.peRatio.toFixed(2) : 'N/A'} />
            )}
            {metrics?.dividendYield !== undefined && (
              <StatItem label="Dividend Yield" value={metrics.dividendYield !== null ? `${metrics.dividendYield.toFixed(2)}%` : 'N/A'} />
            )}
            {metrics?.avgVolume10D !== undefined && (
              <StatItem label="Avg Volume (10D)" value={formatVolume(metrics.avgVolume10D)} />
            )}
            <StatItem label="Open" value={quote.open > 0 ? formatCurrency(quote.open) : 'N/A'} />
            <StatItem label="High Today" value={quote.high > 0 ? formatCurrency(quote.high) : 'N/A'} />
            <StatItem label="Low Today" value={quote.low > 0 ? formatCurrency(quote.low) : 'N/A'} />
            <StatItem label="Prev Close" value={formatCurrency(quote.previousClose)} />
            {metrics?.week52High !== undefined && (
              <StatItem label="52 Week High" value={metrics.week52High !== null ? formatCurrency(metrics.week52High) : 'N/A'} />
            )}
            {metrics?.week52Low !== undefined && (
              <StatItem label="52 Week Low" value={metrics.week52Low !== null ? formatCurrency(metrics.week52Low) : 'N/A'} />
            )}
            {metrics?.beta !== undefined && (
              <StatItem label={<Acronym label="Beta" />} value={metrics.beta !== null ? metrics.beta.toFixed(2) : 'N/A'} />
            )}
            {metrics?.eps !== undefined && (
              <StatItem label={<><Acronym label="EPS" /> (<Acronym label="TTM" />)</>} value={metrics.eps !== null ? `$${metrics.eps.toFixed(2)}` : 'N/A'} />
            )}
          </div>
        </div>
      )}

      {/* About */}
      {profile && (profile.industry || profile.country || profile.ipoDate || profile.weburl) && (
        <div className="bg-rh-light-card dark:bg-rh-card rounded-xl border border-rh-light-border dark:border-rh-border p-5 mb-6">
          <h2 className="text-base font-semibold text-rh-light-text dark:text-rh-text mb-4">About</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {profile.industry && (
              <div>
                <div className="text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-0.5">Industry</div>
                <div className="text-rh-light-text dark:text-rh-text font-medium">{profile.industry}</div>
              </div>
            )}
            {profile.country && (
              <div>
                <div className="text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-0.5">Country</div>
                <div className="text-rh-light-text dark:text-rh-text font-medium">{profile.country}</div>
              </div>
            )}
            {profile.exchange && (
              <div>
                <div className="text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-0.5">Exchange</div>
                <div className="text-rh-light-text dark:text-rh-text font-medium">{profile.exchange}</div>
              </div>
            )}
            {profile.ipoDate && (
              <div>
                <div className="text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-0.5"><Acronym label="IPO" /> Date</div>
                <div className="text-rh-light-text dark:text-rh-text font-medium">{profile.ipoDate}</div>
              </div>
            )}
            {profile.weburl && (
              <div className="col-span-2">
                <div className="text-xs font-medium text-rh-light-muted dark:text-rh-muted mb-0.5">Website</div>
                <a
                  href={profile.weburl.startsWith('http') ? profile.weburl : `https://${profile.weburl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rh-green hover:underline font-medium"
                >
                  {profile.weburl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Update Holding */}
      <AddToPortfolioForm ticker={ticker} currentPrice={quote.currentPrice} onAdded={onHoldingAdded} holding={holding} />
    </div>
  );
}
