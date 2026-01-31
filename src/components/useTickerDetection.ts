import { useMemo } from 'react';

const TICKER_RE = /\$([A-Z]{1,5})\b|\b([A-Z]{1,5})\b/g;

const BLACKLIST = new Set([
  'A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT',
  'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ANY', 'ARE', 'BIG', 'BUT', 'CAN', 'CEO', 'CFO', 'DAY', 'DID',
  'EPS', 'ETF', 'FAQ', 'FOR', 'GDP', 'GET', 'GOT', 'HAS', 'HER', 'HIM', 'HIS',
  'HOW', 'IPO', 'IRS', 'ITS', 'LET', 'MAY', 'NBA', 'NEW', 'NFL', 'NOT', 'NOW',
  'NYC', 'OLD', 'ONE', 'OUT', 'OWN', 'PAY', 'PUT', 'RAN', 'RUN', 'SAY', 'SEC',
  'SET', 'SHE', 'TAX', 'THE', 'TOP', 'TRY', 'TWO', 'USA', 'USE', 'WAS', 'WAY',
  'WHO', 'WHY', 'WIN', 'WON', 'YES', 'YET', 'YOU',
  'ALSO', 'BACK', 'BEEN', 'BEST', 'BOTH', 'COME', 'DOWN', 'EACH', 'EVEN', 'FIND',
  'FIRST', 'FROM', 'GAVE', 'GOOD', 'HALF', 'HAVE', 'HERE', 'HIGH', 'HOME', 'INTO',
  'JUST', 'KEEP', 'LAST', 'LIKE', 'LONG', 'LOOK', 'MADE', 'MAKE', 'MANY', 'MORE',
  'MOST', 'MUCH', 'MUST', 'NEXT', 'ONLY', 'OPEN', 'OVER', 'PART', 'PLAN', 'POST',
  'RATE', 'REAL', 'SAID', 'SAME', 'SALE', 'SAYS', 'SELL', 'SHOW', 'SIDE', 'SOME',
  'STAR', 'STOP', 'SUCH', 'TAKE', 'TALK', 'TELL', 'THAN', 'THAT', 'THEM', 'THEN',
  'THEY', 'THIS', 'TIME', 'TOLD', 'VERY', 'WANT', 'WEEK', 'WELL', 'WERE', 'WHAT',
  'WHEN', 'WILL', 'WITH', 'WORK', 'YEAR', 'YOUR', 'ABOUT', 'AFTER', 'COULD',
  'GREAT', 'LARGE', 'MONEY', 'NEVER', 'OTHER', 'BEING', 'EVERY', 'STOCK', 'SHARE',
  'PRICE', 'TRADE', 'INDEX', 'MEME',
]);

const KNOWN = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V',
  'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC', 'XOM', 'KO', 'PFE',
  'PEP', 'CSCO', 'NFLX', 'INTC', 'AMD', 'CRM', 'ADBE', 'PYPL', 'QCOM', 'TXN',
  'AVGO', 'COST', 'MRK', 'ABT', 'TMO', 'ORCL', 'CVX', 'LLY', 'MCD', 'NKE',
  'SBUX', 'BABA', 'SQ', 'SHOP', 'UBER', 'LYFT', 'SNAP', 'PINS', 'ROKU', 'ZM',
  'DOCU', 'SNOW', 'PLTR', 'COIN', 'RIVN', 'LCID', 'SOFI', 'HOOD', 'ARM', 'SMCI',
  'MSTR', 'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'SOXX', 'SMH', 'GDX',
  'BA', 'GM', 'F', 'GE', 'CAT', 'IBM', 'GS', 'MS', 'C', 'WFC', 'AXP',
  'TGT', 'LOW', 'UPS', 'FDX', 'ABNB', 'DASH', 'CRWD', 'DDOG', 'MRNA', 'GILD',
  'MU', 'AMAT', 'LRCX', 'SPOT', 'DKNG', 'RBLX', 'U', 'TWLO',
]);

const COMPANY_MAP: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'nvidia': 'NVDA', 'meta': 'META', 'tesla': 'TSLA',
  'netflix': 'NFLX', 'disney': 'DIS', 'boeing': 'BA', 'intel': 'INTC',
  'amd': 'AMD', 'salesforce': 'CRM', 'adobe': 'ADBE', 'paypal': 'PYPL',
  'walmart': 'WMT', 'costco': 'COST', 'starbucks': 'SBUX', 'oracle': 'ORCL',
  'chevron': 'CVX', 'exxon': 'XOM', 'jpmorgan': 'JPM', 'goldman sachs': 'GS',
  'coinbase': 'COIN', 'palantir': 'PLTR', 'snowflake': 'SNOW', 'uber': 'UBER',
  'shopify': 'SHOP', 'robinhood': 'HOOD', 'rivian': 'RIVN', 'lucid': 'LCID',
  'airbnb': 'ABNB', 'moderna': 'MRNA', 'crowdstrike': 'CRWD', 'spotify': 'SPOT',
  'micron': 'MU', 'broadcom': 'AVGO', 'qualcomm': 'QCOM',
};

const COMPANY_RE = new RegExp(
  '\\b(' + Object.keys(COMPANY_MAP)
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')\\b',
  'gi'
);

export interface DetectedTicker {
  ticker: string;
  count: number;
}

/** Extract tickers from a set of headline strings, sorted by frequency. */
export function useTickerDetection(headlines: string[]): DetectedTicker[] {
  return useMemo(() => {
    const freq: Record<string, number> = {};

    for (const text of headlines) {
      const found = new Set<string>();

      // $TICKER and standalone TICKER
      let m: RegExpExecArray | null;
      const re = new RegExp(TICKER_RE.source, 'g');
      while ((m = re.exec(text)) !== null) {
        const t = (m[1] || m[2]).toUpperCase();
        if (KNOWN.has(t) && !BLACKLIST.has(t)) found.add(t);
      }

      // Company names
      const nameRe = new RegExp(COMPANY_RE.source, 'gi');
      while ((m = nameRe.exec(text)) !== null) {
        const ticker = COMPANY_MAP[m[1].toLowerCase()];
        if (ticker) found.add(ticker);
      }

      for (const t of found) {
        freq[t] = (freq[t] || 0) + 1;
      }
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ticker, count]) => ({ ticker, count }));
  }, [headlines]);
}
