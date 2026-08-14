// Desktop right-sidebar analytics panel for the portfolio tab.
// All four widgets (VS Benchmark, mini heatmap, movers, pulse) use real data.

import { useState, useEffect } from 'react';
import type { Holding } from '../types';
import { getHeatColor } from '../utils/format';
import { getPrices, getAccountHistory, type PriceData, type AccountHistoryEntry } from '../api';

interface Props {
  holdings?: Holding[];
  onTickerClick?: (ticker: string) => void;
  /** Today's portfolio % change. Drives the VS Benchmark outperform calc. */
  portfolioDayChangePct?: number;
}

const MOCK_HOLDINGS = [
  { ticker: 'GOOGL', currentValue: 76900, dayChangePercent: 10.0, dayChange: 6998 },
  { ticker: 'NVDA',  currentValue: 84500, dayChangePercent: 2.55, dayChange: 2103 },
  { ticker: 'AMZN',  currentValue: 60100, dayChangePercent: 2.54, dayChange: 1489 },
  { ticker: 'ASML',  currentValue: 44400, dayChangePercent: 4.28, dayChange: 1822 },
  { ticker: 'WMT',   currentValue: 37340, dayChangePercent: 3.33, dayChange: 1202 },
  { ticker: 'AAPL',  currentValue: 65200, dayChangePercent: 2.34, dayChange: 1489 },
  { ticker: 'MSFT',  currentValue: 58300, dayChangePercent: -1.04, dayChange: -612 },
  { ticker: 'TSM',   currentValue: 27460, dayChangePercent: -0.06, dayChange: -16 },
];

const fmtUSDShort = (n: number) =>
  Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const BENCH_TICKERS: ('SPY' | 'QQQ' | 'DIA')[] = ['SPY', 'QQQ', 'DIA'];

export function PortfolioSidebarMock({ holdings, onTickerClick, portfolioDayChangePct = 0 }: Props) {
  const goTo = (ticker: string) => onTickerClick?.(ticker);
  const [bench, setBench] = useState<'SPY' | 'QQQ' | 'DIA'>('SPY');
  const [benchPrices, setBenchPrices] = useState<Record<string, PriceData>>({});

  // Fetch real benchmark prices on mount + refresh every 60s while the page is open.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      getPrices(BENCH_TICKERS).then((p) => { if (!cancelled) setBenchPrices((prev) => ({ ...prev, ...p })); }).catch(() => {});
    };
    fetchOnce();
    const id = window.setInterval(fetchOnce, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Recent Activity — last 5 events (trades, cash moves, adjustments).
  // Server merges ActivityEvent + PortfolioTrade + LedgerEvent into a unified
  // shape with normalized category + description. Refreshed on mount only;
  // not polling since events are user-driven (not market-tick).
  const [recentActivity, setRecentActivity] = useState<AccountHistoryEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    getAccountHistory({ limit: 5 })
      .then((res) => { if (!cancelled) setRecentActivity(res.entries); })
      .catch(() => { /* silent — widget hides if empty */ });
    return () => { cancelled = true; };
  }, []);

  const data: { ticker: string; currentValue: number; dayChangePercent: number; dayChange: number }[] =
    holdings && holdings.length > 0
      ? [...holdings]
          .map((h) => ({
            ticker: h.ticker,
            currentValue: h.currentValue,
            dayChangePercent: h.dayChangePercent,
            dayChange: h.dayChange,
          }))
          .sort((a, b) => b.currentValue - a.currentValue)
      : MOCK_HOLDINGS;

  const top8 = data.slice(0, 8);
  const sortedByDayChange = [...data].sort((a, b) => b.dayChange - a.dayChange);
  const contributors = sortedByDayChange.slice(0, 3).filter((h) => h.dayChange > 0);
  const detractors = sortedByDayChange.slice(-3).reverse().filter((h) => h.dayChange < 0);

  const benchPct = benchPrices[bench]?.changePercent ?? 0;
  const outperformPct = portfolioDayChangePct - benchPct;
  const isOutperforming = outperformPct >= 0;

  const winners = data.filter((h) => h.dayChangePercent > 0).length;
  const losers = data.filter((h) => h.dayChangePercent < 0).length;
  const winRate = data.length > 0 ? Math.round((winners / data.length) * 100) : 0;
  const biggestMover = [...data].sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange))[0];
  const totalAbsDayChange = data.reduce((s, h) => s + Math.abs(h.dayChange), 0);
  const topConcPct = totalAbsDayChange > 0 ? Math.round((Math.abs(biggestMover?.dayChange || 0) / totalAbsDayChange) * 100) : 0;

  // De-chromed: widgets sit on the page background, separated by subtle dividers
  // applied at the parent (divide-y). Each widget gets its own vertical padding;
  // small horizontal padding keeps content off the sidebar's flush left edge.
  const widgetClass = 'px-1 py-4';
  const sectionLabel =
    'text-[10px] uppercase tracking-wider font-bold text-rh-light-text/70 dark:text-white/80';

  return (
    <aside
      className="hidden lg:flex flex-col lg:w-[320px] lg:shrink-0 lg:self-start lg:overflow-y-auto scrollbar-minimal pr-1 divide-y divide-gray-200/40 dark:divide-white/[0.06]"
      // Cap sidebar height to exactly the left column's chart-card height (value heading
      // minHeight ~150px + chart's min(50vh, 480px) + a small buffer for the heading's
      // mb-5). When content overflows, the wheel scrolls inside the sidebar so the
      // user can reach Pulse stats without growing the panel past the chart bottom.
      style={{ maxHeight: 'min(calc(50vh + 170px), 650px)' }}
    >
      {/* VS BENCHMARK */}
      <div className={widgetClass}>
        <div className="flex items-center justify-between mb-3">
          <span className={sectionLabel}>VS Benchmark</span>
          <div className="flex gap-0.5 text-[10px] font-bold">
            {(['SPY', 'QQQ', 'DIA'] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBench(b)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  bench === b
                    ? 'bg-rh-green/15 text-rh-green'
                    : 'text-rh-light-text dark:text-white hover:text-rh-light-text dark:hover:text-white'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`text-2xl font-bold ${isOutperforming ? 'text-rh-green' : 'text-rh-red'}`}>
            {isOutperforming ? '+' : ''}{outperformPct.toFixed(2)}%
          </span>
          <span className="text-[11px] text-rh-light-text dark:text-white">
            {isOutperforming ? 'outperforming today' : 'underperforming today'}
          </span>
        </div>
        <div className="text-[11px] text-rh-light-text dark:text-white flex items-center gap-2">
          <span>You <span className={`font-semibold ${portfolioDayChangePct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{portfolioDayChangePct >= 0 ? '+' : ''}{portfolioDayChangePct.toFixed(2)}%</span></span>
          <span className="opacity-30">|</span>
          <span>{bench} <span className={`font-semibold ${benchPct >= 0 ? 'text-rh-green' : 'text-rh-red'}`}>{benchPct >= 0 ? '+' : ''}{benchPct.toFixed(2)}%</span></span>
        </div>
      </div>

      {/* MINI HEATMAP — your portfolio today. Splits into 2 rows when there are
          enough holdings to fill them; falls back to a single row otherwise. */}
      <div className={widgetClass}>
        <div className={`${sectionLabel} mb-2`}>Your portfolio today</div>
        {(() => {
          const rowSize = Math.ceil(top8.length / 2);
          const row1 = top8.slice(0, rowSize);
          const row2 = top8.slice(rowSize);
          return (
            <div className="h-[180px] flex flex-col gap-0.5">
              <div className="flex gap-0.5 flex-1">
                {row1.map((h) => (
                  <button
                    key={h.ticker}
                    type="button"
                    onClick={() => goTo(h.ticker)}
                    style={{ flexGrow: h.currentValue, backgroundColor: getHeatColor(h.dayChangePercent, true) }}
                    className="flex flex-col items-center justify-center text-white px-1 overflow-hidden rounded-md cursor-pointer hover:brightness-110 active:brightness-95 transition-[filter] outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                  >
                    <span className="text-[11px] font-bold truncate" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>{h.ticker}</span>
                    <span className="text-[9px] opacity-90" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>
                      {h.dayChangePercent >= 0 ? '+' : ''}{h.dayChangePercent.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
              {row2.length > 0 && (
                <div className="flex gap-0.5 flex-1">
                  {row2.map((h) => (
                    <button
                      key={h.ticker}
                      type="button"
                      onClick={() => goTo(h.ticker)}
                      style={{ flexGrow: h.currentValue, backgroundColor: getHeatColor(h.dayChangePercent, true) }}
                      className="flex flex-col items-center justify-center text-white px-1 overflow-hidden rounded-md cursor-pointer hover:brightness-110 active:brightness-95 transition-[filter] outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                    >
                      <span className="text-[11px] font-bold truncate" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>{h.ticker}</span>
                      <span className="text-[9px] opacity-90" style={{ textShadow: '0 0 2px rgba(0,0,0,0.85)' }}>
                        {h.dayChangePercent >= 0 ? '+' : ''}{h.dayChangePercent.toFixed(2)}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* TODAY'S MOVERS */}
      <div className={widgetClass}>
        <div className={`${sectionLabel} mb-3`}>Today's Movers</div>
        <div className="space-y-3">
          {contributors.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-rh-green/90 mb-1.5 uppercase tracking-wider">Contributors</div>
              {(() => {
                const max = Math.max(...contributors.map((c) => Math.abs(c.dayChange)));
                return contributors.map((h) => {
                const rawPct = max > 0 ? (h.dayChange / max) * 100 : 0;
                // Floor at 6% so tiny entries stay discoverable instead of disappearing
                const pct = h.dayChange > 0 ? Math.max(rawPct, 6) : rawPct;
                return (
                  <button
                    key={h.ticker}
                    type="button"
                    onClick={() => goTo(h.ticker)}
                    className="w-full flex items-center gap-2 mb-1 cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-[11px] font-bold text-rh-light-text dark:text-white w-12 shrink-0 text-left">{h.ticker}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-rh-green/15 overflow-hidden">
                      <div className="h-full bg-rh-green rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-rh-green font-semibold tabular-nums w-14 text-right shrink-0">+${fmtUSDShort(h.dayChange)}</span>
                  </button>
                );
                });
              })()}
            </div>
          )}
          {detractors.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-rh-red/90 mb-1.5 uppercase tracking-wider">Detractors</div>
              {(() => {
                const max = Math.max(...detractors.map((c) => Math.abs(c.dayChange)));
                return detractors.map((h) => {
                const rawPct = max > 0 ? (Math.abs(h.dayChange) / max) * 100 : 0;
                // Floor at 6% so tiny entries stay discoverable
                const pct = Math.abs(h.dayChange) > 0 ? Math.max(rawPct, 6) : rawPct;
                return (
                  <button
                    key={h.ticker}
                    type="button"
                    onClick={() => goTo(h.ticker)}
                    className="w-full flex items-center gap-2 mb-1 cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-[11px] font-bold text-rh-light-text dark:text-white w-12 shrink-0 text-left">{h.ticker}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-rh-red/15 overflow-hidden">
                      <div className="h-full bg-rh-red rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-rh-red font-semibold tabular-nums w-14 text-right shrink-0">-${fmtUSDShort(h.dayChange)}</span>
                  </button>
                );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* PORTFOLIO PULSE */}
      <div className={widgetClass}>
        <div className={`${sectionLabel} mb-3`}>Portfolio Pulse</div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-rh-light-text/70 dark:text-white/80 font-semibold mb-0.5">Win Rate</div>
            <div className="text-base font-bold text-rh-light-text dark:text-white">{winRate}%</div>
            <div className="text-[9px] text-rh-light-text dark:text-white">{winners} up · {losers} down</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-rh-light-text/70 dark:text-white/80 font-semibold mb-0.5">Top Mover</div>
            {biggestMover ? (
              <button
                type="button"
                onClick={() => goTo(biggestMover.ticker)}
                className="text-base font-bold text-rh-green truncate hover:underline cursor-pointer"
              >
                {biggestMover.ticker}
              </button>
            ) : (
              <div className="text-base font-bold text-rh-green truncate">—</div>
            )}
            <div className="text-[9px] text-rh-light-text dark:text-white">${fmtUSDShort(biggestMover?.dayChange || 0)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-rh-light-text/70 dark:text-white/80 font-semibold mb-0.5">Top Conc.</div>
            <div className="text-base font-bold text-rh-light-text dark:text-white">{topConcPct}%</div>
            <div className="text-[9px] text-rh-light-text dark:text-white">of movement</div>
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY — last 5 events: buys, sells, dividends, deposits, etc.
          Hidden when no activity yet (avoids an empty widget for new accounts).
          Verbs + share/price tail are reconstructed client-side from raw fields
          so the wording matches what users say in real life ("Bought" / "Sold")
          rather than the server's audit-log phrasing ("Added" / "Removed"). */}
      {recentActivity.length > 0 && (
        <div className={widgetClass}>
          <div className={`${sectionLabel} mb-3`}>Recent Activity</div>
          <div className="space-y-2">
            {recentActivity.map((entry) => {
              const isBuy = entry.type === 'buy' || entry.type === 'holding_added';
              const isSell = entry.type === 'sell' || entry.type === 'holding_removed';
              const isDividend = entry.type === 'CASH_DIVIDEND' || entry.type === 'DIV_REINVEST';
              const tone = isBuy
                ? 'text-rh-green'
                : isSell
                  ? 'text-rh-red'
                  : isDividend
                    ? 'text-emerald-400'
                    : 'text-rh-light-text dark:text-white';
              const iconPath = isBuy
                ? 'M12 4v16m8-8H4' // plus
                : isSell
                  ? 'M20 12H4' // minus
                  : isDividend
                    ? 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' // dollar
                    : 'M12 6v6h4'; // generic clock
              // Build the line client-side so buys + sells both get the
              // "Bought/Sold N TICKER @ $X" treatment, regardless of whether
              // the source was a UI delete (holding_removed, no shares) or a
              // broker import (sell, has shares).
              let line: string;
              if (isBuy || isSell) {
                const verb = isBuy ? 'Bought' : 'Sold';
                const sharesPart = entry.shares != null ? ` ${entry.shares}` : '';
                const tickerPart = entry.ticker ? ` ${entry.ticker}` : '';
                const pricePart = entry.price != null ? ` @ $${entry.price.toFixed(2)}` : '';
                line = `${verb}${sharesPart}${tickerPart}${pricePart}`;
              } else {
                line = entry.description;
              }
              // Date in user's local Pacific Time so events near midnight
              // don't shift to the wrong calendar day vs the browser TZ.
              const dateStr = new Date(entry.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'America/Los_Angeles',
              });
              const interactive = entry.ticker && onTickerClick;
              const Wrapper: React.ElementType = interactive ? 'button' : 'div';
              return (
                <Wrapper
                  key={`${entry.source}-${entry.id}`}
                  type={interactive ? 'button' : undefined}
                  onClick={interactive ? () => goTo(entry.ticker!) : undefined}
                  className={`flex items-start gap-2 w-full text-left ${interactive ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.03] -mx-1 px-1 py-1 rounded-md transition-colors' : ''}`}
                >
                  <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${tone}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-rh-light-text dark:text-rh-text truncate">{line}</div>
                    <div className="text-[10px] text-rh-light-text dark:text-white">{dateStr}</div>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
