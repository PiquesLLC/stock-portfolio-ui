import { OptionWithQuote } from '../types';

interface Props {
  options: OptionWithQuote[];
  onTickerClick?: (ticker: string) => void;
}

export function OptionsTable({ options, onTickerClick }: Props) {
  if (options.length === 0) return null;

  const sorted = [...options].sort((a, b) => {
    // Sort by underlying, then by expiry, then by strike
    const ua = a.optionUnderlying ?? '';
    const ub = b.optionUnderlying ?? '';
    if (ua !== ub) return ua.localeCompare(ub);
    const ea = a.optionExpiry ?? '';
    const eb = b.optionExpiry ?? '';
    if (ea !== eb) return ea.localeCompare(eb);
    return (a.optionStrike ?? 0) - (b.optionStrike ?? 0);
  });

  const totalValue = sorted.reduce((sum, o) => sum + (o.priceUnavailable ? 0 : o.currentValue), 0);
  const totalPL = sorted.reduce((sum, o) => sum + (o.priceUnavailable ? 0 : o.profitLoss), 0);
  const totalCost = sorted.reduce((sum, o) => sum + o.totalCost, 0);
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">
            Options
          </h2>
          <span className="text-xs text-rh-light-muted dark:text-rh-muted px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-rh-border/40">
            {sorted.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-rh-light-muted dark:text-rh-muted">
            Value: <span className="text-rh-light-text dark:text-rh-text font-medium">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
          <span className={totalPL >= 0 ? 'text-rh-green' : 'text-rh-red'}>
            {totalPL >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200/50 dark:border-rh-border/30">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50/50 dark:bg-rh-border/10 text-rh-light-muted dark:text-rh-muted">
              <th className="text-left py-2 px-3 font-medium">Contract</th>
              <th className="text-right py-2 px-3 font-medium">Contracts</th>
              <th className="text-right py-2 px-3 font-medium">Price</th>
              <th className="text-right py-2 px-3 font-medium">Bid/Ask</th>
              <th className="text-right py-2 px-3 font-medium">Value</th>
              <th className="text-right py-2 px-3 font-medium">P/L</th>
              <th className="text-right py-2 px-3 font-medium">IV</th>
              <th className="text-right py-2 px-3 font-medium">DTE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-rh-border/20">
            {sorted.map((opt) => (
              <OptionRow key={opt.id} option={opt} onTickerClick={onTickerClick} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {sorted.map((opt) => (
          <OptionCard key={opt.id} option={opt} onTickerClick={onTickerClick} />
        ))}
      </div>
    </div>
  );
}

function OptionRow({ option: opt, onTickerClick }: { option: OptionWithQuote; onTickerClick?: (ticker: string) => void }) {
  const isCall = opt.optionType === 'call';
  const plColor = opt.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red';

  return (
    <tr
      className="hover:bg-gray-50/50 dark:hover:bg-rh-border/10 cursor-pointer transition-colors"
      onClick={() => opt.optionUnderlying && onTickerClick?.(opt.optionUnderlying)}
    >
      {/* Contract name */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isCall
              ? 'bg-rh-green/10 text-rh-green'
              : 'bg-rh-red/10 text-rh-red'
          }`}>
            {isCall ? 'C' : 'P'}
          </span>
          <div>
            <span className="font-medium text-rh-light-text dark:text-rh-text">
              {opt.optionUnderlying} ${opt.optionStrike}
            </span>
            <span className="ml-1.5 text-rh-light-muted dark:text-rh-muted">
              {formatExpiry(opt.optionExpiry)}
            </span>
          </div>
          <ExpiryBadge days={opt.daysToExpiry} />
        </div>
      </td>

      {/* Contracts */}
      <td className="py-2.5 px-3 text-right text-rh-light-text dark:text-rh-text">
        {opt.shares}
      </td>

      {/* Mid price */}
      <td className="py-2.5 px-3 text-right text-rh-light-text dark:text-rh-text">
        {opt.priceUnavailable ? '—' : `$${opt.currentPrice.toFixed(2)}`}
      </td>

      {/* Bid/Ask */}
      <td className="py-2.5 px-3 text-right text-rh-light-muted dark:text-rh-muted">
        {opt.priceUnavailable ? '—' : `${opt.bid.toFixed(2)} / ${opt.ask.toFixed(2)}`}
      </td>

      {/* Value */}
      <td className="py-2.5 px-3 text-right text-rh-light-text dark:text-rh-text font-medium">
        {opt.priceUnavailable ? '—' : `$${opt.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </td>

      {/* P/L */}
      <td className={`py-2.5 px-3 text-right font-medium ${plColor}`}>
        {opt.priceUnavailable ? '—' : (
          <>
            {opt.profitLoss >= 0 ? '+' : ''}{opt.profitLossPercent.toFixed(2)}%
            <div className="text-[10px] opacity-70">
              {opt.profitLoss >= 0 ? '+' : ''}${opt.profitLoss.toFixed(2)}
            </div>
          </>
        )}
      </td>

      {/* IV */}
      <td className="py-2.5 px-3 text-right text-rh-light-muted dark:text-rh-muted">
        {opt.priceUnavailable ? '—' : `${opt.impliedVolatility.toFixed(1)}%`}
      </td>

      {/* DTE */}
      <td className="py-2.5 px-3 text-right">
        <span className={opt.daysToExpiry <= 7 ? 'text-rh-red font-medium' : opt.daysToExpiry <= 30 ? 'text-yellow-600 dark:text-yellow-400' : 'text-rh-light-muted dark:text-rh-muted'}>
          {opt.daysToExpiry}d
        </span>
      </td>
    </tr>
  );
}

function OptionCard({ option: opt, onTickerClick }: { option: OptionWithQuote; onTickerClick?: (ticker: string) => void }) {
  const isCall = opt.optionType === 'call';
  const plColor = opt.profitLoss >= 0 ? 'text-rh-green' : 'text-rh-red';

  return (
    <div
      className="p-3 rounded-lg bg-gray-50 dark:bg-rh-border/20 border border-gray-200/50 dark:border-rh-border/30 active:bg-gray-100 dark:active:bg-rh-border/30"
      onClick={() => opt.optionUnderlying && onTickerClick?.(opt.optionUnderlying)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isCall
              ? 'bg-rh-green/10 text-rh-green'
              : 'bg-rh-red/10 text-rh-red'
          }`}>
            {isCall ? 'CALL' : 'PUT'}
          </span>
          <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">
            {opt.optionUnderlying} ${opt.optionStrike}
          </span>
          <ExpiryBadge days={opt.daysToExpiry} />
        </div>
        <span className={`text-sm font-medium ${plColor}`}>
          {opt.priceUnavailable ? '—' : `${opt.profitLoss >= 0 ? '+' : ''}$${opt.profitLoss.toFixed(2)}`}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-rh-light-muted dark:text-rh-muted">
        <span>{opt.shares} contract{opt.shares !== 1 ? 's' : ''} · {formatExpiry(opt.optionExpiry)} · {opt.daysToExpiry}d</span>
        <span>{opt.priceUnavailable ? '—' : `$${opt.currentValue.toFixed(2)}`}</span>
      </div>
    </div>
  );
}

function ExpiryBadge({ days }: { days: number }) {
  if (days <= 7) {
    return (
      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-rh-red/10 text-rh-red uppercase">
        Expiring
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 uppercase">
        Soon
      </span>
    );
  }
  return null;
}

function formatExpiry(expiry: string | null): string {
  if (!expiry) return '';
  const [year, month, day] = expiry.split('-');
  return `${parseInt(month)}/${parseInt(day)}/${year.slice(2)}`;
}
