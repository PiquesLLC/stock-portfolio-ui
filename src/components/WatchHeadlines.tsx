import { useState, useEffect, useRef, useCallback } from 'react';
import { getMarketNews, MarketNewsItem } from '../api';
import { TickerChips, ChipData } from './TickerChips';

interface WatchHeadlinesProps {
  onTickerClick: (ticker: string) => void;
  onTickersExtracted?: (tickers: string[]) => void;
}

const TICKER_RE = /^[A-Z]{1,5}$/;
const REFRESH_MS = 150_000; // 2.5 min

// Common words that look like tickers but aren't
const TICKER_BLACKLIST = new Set([
  'A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT',
  'ME', 'MY', 'NO', 'OF', 'OK', 'ON', 'OR', 'OUR', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ANY', 'ARE', 'BIG', 'BUT', 'CAN', 'CEO', 'CFO', 'COO', 'CTO',
  'DAY', 'DID', 'EPS', 'ETF', 'FAQ', 'FOR', 'GDP', 'GET', 'GOT', 'HAS', 'HER', 'HIM',
  'HIS', 'HOW', 'IPO', 'IRS', 'ITS', 'LET', 'MAY', 'MOM', 'NBA', 'NEW', 'NFL', 'NOT',
  'NOW', 'NYC', 'OLD', 'ONE', 'OUT', 'OWN', 'PAY', 'PUT', 'RAN', 'RUN', 'SAY', 'SEC',
  'SET', 'SHE', 'TAX', 'THE', 'TOP', 'TRY', 'TWO', 'USA', 'USE', 'WAS', 'WAY', 'WHO',
  'WHY', 'WIN', 'WON', 'YES', 'YET', 'YOU',
  'ALSO', 'BACK', 'BEEN', 'BEST', 'BOTH', 'COME', 'DOWN', 'EACH', 'EVEN', 'FIND',
  'FIRST', 'FROM', 'GAVE', 'GOOD', 'HALF', 'HAVE', 'HERE', 'HIGH', 'HOME', 'INTO',
  'JUST', 'KEEP', 'LAST', 'LIKE', 'LONG', 'LOOK', 'MADE', 'MAKE', 'MANY', 'MEME',
  'MORE', 'MOST', 'MUCH', 'MUST', 'NEXT', 'ONLY', 'OPEN', 'OVER', 'PART', 'PLAN',
  'POST', 'RATE', 'REAL', 'SAID', 'SAME', 'SALE', 'SAYS', 'SELL', 'SHOW', 'SIDE',
  'SOME', 'STAR', 'STOP', 'SUCH', 'TAKE', 'TALK', 'TELL', 'THAN', 'THAT', 'THEM',
  'THEN', 'THEY', 'THIS', 'TIME', 'TOLD', 'VERY', 'WANT', 'WEEK', 'WELL', 'WERE',
  'WHAT', 'WHEN', 'WILL', 'WITH', 'WORK', 'YEAR', 'YOUR',
  'ABOUT', 'AFTER', 'COULD', 'FIRST', 'GREAT', 'LARGE', 'MONEY', 'NEVER',
  'OTHER', 'BEING', 'EVERY', 'STOCK', 'SHARE', 'PRICE', 'TRADE', 'INDEX',
]);

// Well-known tickers to extract from headlines
const KNOWN_TICKERS = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK',
  'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC',
  'XOM', 'KO', 'PFE', 'PEP', 'CSCO', 'NFLX', 'INTC', 'AMD', 'CRM',
  'ADBE', 'PYPL', 'QCOM', 'TXN', 'AVGO', 'COST', 'MRK', 'ABT', 'TMO',
  'ORCL', 'CVX', 'LLY', 'MCD', 'NKE', 'SBUX', 'BABA', 'SQ', 'SHOP',
  'UBER', 'LYFT', 'SNAP', 'PINS', 'ROKU', 'ZM', 'DOCU', 'SNOW', 'PLTR',
  'COIN', 'RIVN', 'LCID', 'SOFI', 'HOOD', 'ARM', 'SMCI', 'MSTR',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO',
]);

// Company name → ticker mapping for headline detection (case-insensitive match)
const COMPANY_TO_TICKER: Record<string, string> = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'nvidia': 'NVDA', 'meta': 'META', 'facebook': 'META',
  'tesla': 'TSLA', 'berkshire': 'BRK', 'jpmorgan': 'JPM', 'jp morgan': 'JPM',
  'johnson & johnson': 'JNJ', 'walmart': 'WMT', 'procter & gamble': 'PG',
  'unitedhealth': 'UNH', 'home depot': 'HD', 'disney': 'DIS', 'walt disney': 'DIS',
  'bank of america': 'BAC', 'exxon': 'XOM', 'exxonmobil': 'XOM',
  'coca-cola': 'KO', 'coca cola': 'KO', 'pfizer': 'PFE', 'pepsi': 'PEP',
  'pepsico': 'PEP', 'cisco': 'CSCO', 'netflix': 'NFLX', 'intel': 'INTC',
  'amd': 'AMD', 'salesforce': 'CRM', 'adobe': 'ADBE', 'paypal': 'PYPL',
  'qualcomm': 'QCOM', 'broadcom': 'AVGO', 'costco': 'COST', 'merck': 'MRK',
  'oracle': 'ORCL', 'chevron': 'CVX', 'eli lilly': 'LLY', 'lilly': 'LLY',
  "mcdonald's": 'MCD', 'mcdonalds': 'MCD', 'nike': 'NKE', 'starbucks': 'SBUX',
  'alibaba': 'BABA', 'block': 'SQ', 'square': 'SQ', 'shopify': 'SHOP',
  'uber': 'UBER', 'lyft': 'LYFT', 'snap': 'SNAP', 'snapchat': 'SNAP',
  'pinterest': 'PINS', 'roku': 'ROKU', 'zoom': 'ZM', 'docusign': 'DOCU',
  'snowflake': 'SNOW', 'palantir': 'PLTR', 'coinbase': 'COIN',
  'rivian': 'RIVN', 'lucid': 'LCID', 'sofi': 'SOFI', 'robinhood': 'HOOD',
  'arm': 'ARM', 'super micro': 'SMCI', 'supermicro': 'SMCI', 'microstrategy': 'MSTR',
  'visa': 'V', 'mastercard': 'MA', 'texas instruments': 'TXN',
  'abbott': 'ABT', 'thermo fisher': 'TMO',
  'boeing': 'BA', 'general motors': 'GM', 'ford': 'F', 'general electric': 'GE',
  'caterpillar': 'CAT', 'ibm': 'IBM', 'goldman sachs': 'GS', 'morgan stanley': 'MS',
  'citigroup': 'C', 'wells fargo': 'WFC', 'american express': 'AXP', 'amex': 'AXP',
  'target': 'TGT', "lowe's": 'LOW', 'lowes': 'LOW', 'ups': 'UPS', 'fedex': 'FDX',
  'airbnb': 'ABNB', 'doordash': 'DASH', 'crowdstrike': 'CRWD', 'datadog': 'DDOG',
  'moderna': 'MRNA', 'gilead': 'GILD', 'regeneron': 'REGN', 'biogen': 'BIIB',
  'micron': 'MU', 'applied materials': 'AMAT', 'lam research': 'LRCX',
  'advanced micro': 'AMD', 'berkshire hathaway': 'BRK',
  'marathon': 'MARA', 'roblox': 'RBLX', 'unity': 'U', 'twilio': 'TWLO',
  'spotify': 'SPOT', 'draft kings': 'DKNG', 'draftkings': 'DKNG',
};

// Theme/sector keyword → ETF mapping (matches phrases in headlines)
const THEME_TO_ETF: Record<string, string> = {
  'gold miner': 'GDX', 'gold mining': 'GDX', 'gold-miner': 'GDX',
  'silver miner': 'SIL', 'silver mining': 'SIL',
  'gold': 'GLD', 'silver': 'SLV',
  'oil': 'USO', 'crude oil': 'USO', 'crude': 'USO',
  'natural gas': 'UNG',
  'uranium': 'URA',
  'lithium': 'LIT',
  'copper': 'COPX',
  'semiconductor': 'SOXX', 'semiconductors': 'SOXX', 'chip stocks': 'SOXX', 'chipmaker': 'SOXX', 'chipmakers': 'SOXX',
  'biotech': 'XBI', 'biotechnology': 'XBI',
  'cannabis': 'MSOS', 'marijuana': 'MSOS', 'weed stocks': 'MSOS',
  'clean energy': 'ICLN', 'renewable energy': 'ICLN', 'solar': 'TAN', 'solar energy': 'TAN',
  'ev stocks': 'DRIV', 'electric vehicle': 'DRIV',
  'real estate': 'VNQ', 'reit': 'VNQ', 'reits': 'VNQ',
  'treasury': 'TLT', 'treasuries': 'TLT', 'long bond': 'TLT',
  'high yield': 'HYG', 'junk bond': 'HYG',
  'emerging market': 'EEM', 'emerging markets': 'EEM',
  'china stocks': 'FXI', 'chinese stocks': 'FXI',
  'japan': 'EWJ', 'japanese stocks': 'EWJ',
  'india': 'INDA', 'indian stocks': 'INDA',
  'regional bank': 'KRE', 'regional banks': 'KRE',
  'big bank': 'XLF', 'financial sector': 'XLF', 'financials': 'XLF',
  'tech stocks': 'XLK', 'technology sector': 'XLK',
  'health care': 'XLV', 'healthcare': 'XLV',
  'energy sector': 'XLE', 'energy stocks': 'XLE',
  'utilities': 'XLU', 'utility stocks': 'XLU',
  'defense stocks': 'ITA', 'defense sector': 'ITA', 'aerospace': 'ITA',
  'retail stocks': 'XRT', 'retail sector': 'XRT',
  'small cap': 'IWM', 'small-cap': 'IWM', 'russell 2000': 'IWM',
  'bitcoin': 'IBIT', 'btc': 'IBIT', 'crypto': 'IBIT', 'cryptocurrency': 'IBIT',
  'ethereum': 'ETHA', 'eth': 'ETHA',
  'ai stocks': 'BOTZ', 'artificial intelligence': 'BOTZ', 'robotics': 'BOTZ',
  'cybersecurity': 'HACK', 'cyber security': 'HACK',
  'cloud computing': 'SKYY', 'cloud stocks': 'SKYY',
  'water stocks': 'PHO', 'water sector': 'PHO',
  'commodities': 'DBC', 'commodity': 'DBC',
  'volatility': 'VXX', 'vix': 'VXX',
  's&p 500': 'SPY', 's&p500': 'SPY',
  'nasdaq': 'QQQ', 'nasdaq 100': 'QQQ',
  'dow jones': 'DIA', 'dow': 'DIA',
};

const THEME_NAMES_RE = new RegExp(
  '\\b(' + Object.keys(THEME_TO_ETF)
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')\\b',
  'gi'
);

// Theme inference: keyword clusters that map to ETFs when ≥2 keywords hit or a strong phrase matches.
// Runs AFTER explicit ticker, company-name, and group ETF detection.
interface ThemeRule {
  etf: string;
  strong: RegExp[];   // single match sufficient
  weak: string[];     // need ≥2 hits
}

const THEME_RULES: ThemeRule[] = [
  {
    etf: 'SOXX',
    strong: [
      /\bai chips?\b/i, /\bchip boom\b/i, /\bgpu demand\b/i,
      /\bdata[- ]center chips?\b/i, /\bai hardware\b/i, /\bchip stocks?\b/i,
      /\bsemiconductor stocks?\b/i, /\bchipmaker/i,
    ],
    weak: ['ai', 'chip', 'chips', 'semiconductor', 'gpu', 'data center', 'hardware', 'silicon', 'foundry', 'fab', 'wafer'],
  },
  {
    etf: 'SKYY',
    strong: [/\bcloud computing\b/i, /\bcloud stocks?\b/i, /\bcloud infrastructure\b/i],
    weak: ['cloud', 'saas', 'iaas', 'paas', 'aws', 'azure'],
  },
  {
    etf: 'BOTZ',
    strong: [/\bai stocks?\b/i, /\bartificial intelligence stocks?\b/i, /\brobotics stocks?\b/i],
    weak: ['ai', 'artificial intelligence', 'robotics', 'automation', 'machine learning'],
  },
];

function inferThemeEtf(headline: string): string | null {
  const h = headline.toLowerCase();
  for (const rule of THEME_RULES) {
    // Strong phrase: single match is enough
    for (const re of rule.strong) {
      if (re.test(headline)) return rule.etf;
    }
    // Weak keywords: need ≥2 distinct hits
    let hits = 0;
    for (const kw of rule.weak) {
      if (h.includes(kw)) hits++;
      if (hits >= 2) return rule.etf;
    }
  }
  return null;
}

// Build regex from company names (longest first to match "Bank of America" before "America")
const COMPANY_NAMES_RE = new RegExp(
  '\\b(' + Object.keys(COMPANY_TO_TICKER)
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') + ')\\b',
  'gi'
);

interface TickerResult {
  ticker: string;
  isEtf: boolean;
}

// All ETF tickers from the theme map (for identification)
const ETF_TICKERS = new Set(Object.values(THEME_TO_ETF));

function parseTickers(related: string, headline: string): TickerResult[] {
  const exact = new Set<string>();
  const etfs = new Set<string>();

  // 1. From Finnhub related field
  if (related) {
    for (const t of related.split(',')) {
      const clean = t.trim().toUpperCase();
      if (TICKER_RE.test(clean) && !TICKER_BLACKLIST.has(clean)) {
        exact.add(clean);
      }
    }
  }

  // 2. Explicit $TICKER format (e.g. "$AAPL", "$TSLA")
  const dollarMatches = headline.matchAll(/\$([A-Z]{1,5})\b/g);
  for (const m of dollarMatches) {
    if (!TICKER_BLACKLIST.has(m[1])) exact.add(m[1]);
  }

  // 3. Parenthesized tickers (e.g. "(AAPL)", "(NASDAQ: TSLA)")
  const parenMatches = headline.matchAll(/\((?:NASDAQ|NYSE|AMEX)?:?\s*([A-Z]{1,5})\)/g);
  for (const m of parenMatches) {
    if (!TICKER_BLACKLIST.has(m[1])) exact.add(m[1]);
  }

  // 4. Known tickers as standalone words
  const words = headline.split(/[\s,.:;!?'"()\-/]+/);
  for (const w of words) {
    const upper = w.toUpperCase();
    if (KNOWN_TICKERS.has(upper) && TICKER_RE.test(upper)) {
      exact.add(upper);
    }
  }

  // 5. Company name → ticker mapping (e.g. "Microsoft" → MSFT)
  const nameMatches = headline.matchAll(COMPANY_NAMES_RE);
  for (const m of nameMatches) {
    const ticker = COMPANY_TO_TICKER[m[1].toLowerCase()];
    if (ticker) exact.add(ticker);
  }

  // 6. Theme/sector → ETF mapping (e.g. "gold-miner stocks" → GDX)
  const themeMatches = headline.matchAll(THEME_NAMES_RE);
  for (const m of themeMatches) {
    const etf = THEME_TO_ETF[m[1].toLowerCase()];
    if (etf) etfs.add(etf);
  }

  // 7. Theme inference (keyword clusters, e.g. "AI chip boom" → SOXX)
  // Only runs if slots may remain
  if (exact.size + etfs.size < 2) {
    const inferred = inferThemeEtf(headline);
    if (inferred && !etfs.has(inferred)) etfs.add(inferred);
  }

  // Prioritization + confidence gating:
  // - If we have exact tickers, those take priority
  // - ETFs only fill remaining slots
  // - Never more than 2 total to avoid chip spam
  const results: TickerResult[] = [];
  for (const t of exact) {
    if (results.length >= 2) break;
    // Skip broad ETFs (SPY/QQQ/DIA) when we already have an exact ticker
    if (ETF_TICKERS.has(t) && results.length > 0) continue;
    results.push({ ticker: t, isEtf: false });
  }
  for (const t of etfs) {
    if (results.length >= 2) break;
    if (exact.has(t)) continue; // already added as exact
    results.push({ ticker: t, isEtf: true });
  }

  return results;
}

function timeAgo(unix: number): string {
  const secs = Math.floor((Date.now() / 1000) - unix);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type TopicColor = 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'neutral';

function classifyTopic(headline: string, category: string): TopicColor {
  const h = headline.toLowerCase();
  const c = category.toLowerCase();

  // Earnings
  if (/\b(earnings|revenue|profit|eps|beat|miss|guidance|quarter|q[1-4])\b/.test(h) || c === 'earnings')
    return 'purple';
  // Commodities / Crypto
  if (/\b(oil|gold|silver|bitcoin|btc|ethereum|eth|crypto|commodity|crude)\b/.test(h) || c === 'crypto')
    return 'yellow';
  // Macro / Fed / Rates
  if (/\b(fed|federal reserve|interest rate|inflation|cpi|ppi|gdp|treasury|bond|yield|fomc|powell|recession)\b/.test(h) || c === 'macro')
    return 'blue';
  // Market gains
  if (/\b(rally|surge|soar|jump|gain|record high|all.time high|bull|up \d)/i.test(h))
    return 'green';
  // Market declines
  if (/\b(crash|plunge|drop|sink|tumble|sell.?off|bear|down \d|decline|loss)\b/.test(h))
    return 'red';

  return 'neutral';
}

type ImpactLabel = { text: string; cls: string } | null;

function classifyImpact(headline: string): ImpactLabel {
  const h = headline.toLowerCase();
  if (/\b(breaking|just in|alert)\b/.test(h))
    return { text: 'Market moving', cls: 'bg-red-500/10 text-red-500 dark:text-red-400' };
  if (/\b(surge|soar|crash|plunge|record|all.time)\b/.test(h))
    return { text: 'High impact', cls: 'bg-amber-500/10 text-amber-500 dark:text-amber-400' };
  if (/\b(upgrade|downgrade|beat|miss|guidance|forecast)\b/.test(h))
    return { text: 'Analyst signal', cls: 'bg-blue-500/10 text-blue-500 dark:text-blue-400' };
  return null;
}

const ACCENT_COLORS: Record<TopicColor, { bar: string; label: string; text: string }> = {
  green:   { bar: 'bg-emerald-500', label: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400', text: 'Markets' },
  red:     { bar: 'bg-red-500',     label: 'bg-red-500/10 text-red-500 dark:text-red-400',           text: 'Markets' },
  blue:    { bar: 'bg-blue-500',    label: 'bg-blue-500/10 text-blue-500 dark:text-blue-400',         text: 'Macro' },
  purple:  { bar: 'bg-purple-500',  label: 'bg-purple-500/10 text-purple-500 dark:text-purple-400',   text: 'Earnings' },
  yellow:  { bar: 'bg-amber-500',   label: 'bg-amber-500/10 text-amber-500 dark:text-amber-400',     text: 'Commodities' },
  neutral: { bar: 'bg-rh-light-muted/30 dark:bg-rh-muted/30', label: 'bg-rh-light-muted/10 dark:bg-white/5 text-rh-light-muted dark:text-rh-muted', text: 'News' },
};

function highlightHeadline(
  headline: string,
  tickerResults: TickerResult[],
  onTickerClick: (ticker: string) => void,
): React.ReactNode[] {
  if (tickerResults.length === 0) return [headline];

  const tickerSet = new Set(tickerResults.map(t => t.ticker));

  // Build a combined regex matching company names and ticker symbols found in this headline
  const patterns: { re: RegExp; ticker: string }[] = [];

  // Add company name patterns
  for (const [name, ticker] of Object.entries(COMPANY_TO_TICKER)) {
    if (tickerSet.has(ticker)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push({ re: new RegExp(`\\b${escaped}(?:'s)?\\b`, 'gi'), ticker });
    }
  }

  // Add theme/sector → ETF patterns
  for (const [theme, etf] of Object.entries(THEME_TO_ETF)) {
    if (tickerSet.has(etf)) {
      const escaped = theme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push({ re: new RegExp(`\\b${escaped}\\b`, 'gi'), ticker: etf });
    }
  }

  // Add theme inference strong-phrase patterns
  for (const rule of THEME_RULES) {
    if (tickerSet.has(rule.etf)) {
      for (const re of rule.strong) {
        patterns.push({ re: new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), ticker: rule.etf });
      }
    }
  }

  // Add ticker symbol patterns ($AAPL, standalone AAPL)
  for (const t of tickerSet) {
    patterns.push({ re: new RegExp(`\\$${t}\\b|\\b${t}\\b`, 'g'), ticker: t });
  }

  if (patterns.length === 0) return [headline];

  // Find all matches with positions
  const matches: { start: number; end: number; ticker: string; text: string }[] = [];
  for (const { re, ticker } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(headline)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, ticker, text: m[0] });
    }
  }

  if (matches.length === 0) return [headline];

  // Sort by position, deduplicate overlaps (keep earliest/longest)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const deduped: typeof matches = [];
  for (const m of matches) {
    if (deduped.length === 0 || m.start >= deduped[deduped.length - 1].end) {
      deduped.push(m);
    }
  }

  // Build React nodes
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of deduped) {
    if (m.start > cursor) {
      nodes.push(headline.slice(cursor, m.start));
    }
    nodes.push(
      <span
        key={`${m.start}-${m.ticker}`}
        role="link"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); onTickerClick(m.ticker); }}
        className="text-rh-green hover:underline cursor-pointer font-semibold"
      >
        {m.text}
      </span>
    );
    cursor = m.end;
  }
  if (cursor < headline.length) {
    nodes.push(headline.slice(cursor));
  }

  return nodes;
}

// ── Markets-only STRICT relevance filter ──────────────────────────

// A) Macro-market terms
const MACRO_RE = /\b(fed(eral reserve)?|powell|fomc|interest rates?|rate cuts?|rate hikes?|inflation|cpi|pce|jobs? reports?|payrolls?|nonfarm|treasury|treasuries|yields?|bonds?|recession|gdp|ppi)\b/i;

// B) Equity/market terms
const EQUITY_RE = /\b(stocks?|shares?|equit(y|ies)|index(es)?|s&p|nasdaq|dow|earnings|guidance|eps|revenue|profit|forecast|ipo|buyback|dividend|merger|acquisition|antitrust|market cap|valuation|bull(ish)?|bear(ish)?|correction|etf|rally|crash|sell[- ]?off)\b/i;

// C) Market-impact policy/supply chain
const POLICY_RE = /\b(tariffs?|sanctions?|export controls?|embargo|chip ban|semiconductors?|chips?|china export|supply chain|opec|oil\b|crude|shipping disruption|ports?)\b/i;

// Explicit non-market suppression (only blocks if no strong signal)
const SUPPRESS_RE = /\b(how do i|should i|is it wise|can i afford|can't afford|credit card points?|down payment|mortgage (assistance|tips)|social security|pension|survivor benefits?|workplace|my manager|my boss|my direct report|ice (operation|raid|deport|arrest|agent)|immigration (raid|enforcement)|election poll|crime|local politic|celebrity|entertainment|recipe|fitness|wellness|self[- ]care|parenting|travel tips?|vacation|wedding|divorce|dating|relationship advice|budgeting tips?|credit score)\b/i;

interface RelevanceResult {
  keep: boolean;
  reason: string;
  signals: string[];
}

function isMarketRelevant(
  headline: string,
  tickerResults: TickerResult[],
): RelevanceResult {
  const signals: string[] = [];

  // A) Validated symbol
  const exactTicker = tickerResults.find(t => !t.isEtf);
  if (exactTicker) signals.push(`ticker:${exactTicker.ticker}`);

  const etfTicker = tickerResults.find(t => t.isEtf);
  if (etfTicker) signals.push(`etf:${etfTicker.ticker}`);

  // B) Macro terms
  if (MACRO_RE.test(headline)) signals.push('macro');

  // C) Equity terms
  if (EQUITY_RE.test(headline)) signals.push('equity');

  // D) Policy/supply chain
  if (POLICY_RE.test(headline)) signals.push('policy');

  // STRICT: must have at least one strong signal
  if (signals.length > 0) {
    return { keep: true, reason: signals.join(', '), signals };
  }

  // No signals — HIDE (strict mode, no default pass)
  const suppressed = SUPPRESS_RE.test(headline);
  return {
    keep: false,
    reason: suppressed ? 'suppressed: non-market content' : 'no market signals',
    signals,
  };
}

const HEADLINE_KEYFRAMES = `@keyframes headlineFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`;

export function WatchHeadlines({ onTickerClick, onTickersExtracted }: WatchHeadlinesProps) {
  const [headlines, setHeadlines] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [marketsOnly, setMarketsOnly] = useState(true);
  const mountedRef = useRef(true);

  const fetchNews = useCallback(async () => {
    try {
      const data = await getMarketNews(15);
      if (!mountedRef.current) return;
      setHeadlines(data);
      setLoading(false);

      const freq: Record<string, number> = {};
      for (const item of data) {
        for (const t of parseTickers(item.related, item.headline)) {
          freq[t.ticker] = (freq[t.ticker] || 0) + 1;
        }
      }
      const sorted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([t]) => t);
      onTickersExtracted?.(sorted);
    } catch (e) {
      console.error('Headlines fetch error:', e);
      if (mountedRef.current) setLoading(false);
    }
  }, [onTickersExtracted]);

  useEffect(() => {
    mountedRef.current = true;
    fetchNews();
    const id = setInterval(fetchNews, REFRESH_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetchNews]);

  if (loading) {
    return (
      <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/3" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-1 rounded-full bg-gray-100/60 dark:bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-full" />
                <div className="h-3 bg-gray-100/60 dark:bg-white/[0.06] rounded w-3/4" />
                <div className="h-2 bg-gray-100/60 dark:bg-white/[0.06] rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (headlines.length === 0) return null;

  // Apply strict markets-only filter
  const filtered = headlines.filter((item) => {
    if (!marketsOnly) return true;
    const tickers = parseTickers(item.related, item.headline);
    const result = isMarketRelevant(item.headline, tickers);
    if (import.meta.env.DEV) {
      console.log(`[MarketsOnly] ${result.keep ? 'KEEP' : 'HIDE'} | ${result.reason} | "${item.headline.slice(0, 70)}"`);
    }
    return result.keep;
  });

  const visible = expanded ? filtered : filtered.slice(0, 3);

  return (
    <div className="bg-gray-50/80 dark:bg-white/[0.04] backdrop-blur-sm rounded-xl p-5">
      <style>{HEADLINE_KEYFRAMES}</style>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 group/toggle"
        >
          <h3 className="text-sm font-semibold text-rh-light-text dark:text-rh-text">Headlines</h3>
          <svg
            className={`w-3.5 h-3.5 text-rh-light-muted dark:text-rh-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5">
          {(['Markets only', 'All'] as const).map((label) => {
            const active = label === 'Markets only' ? marketsOnly : !marketsOnly;
            return (
              <button
                key={label}
                onClick={() => setMarketsOnly(label === 'Markets only')}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors duration-150
                  ${active
                    ? 'bg-rh-green/10 text-rh-green'
                    : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {filtered.length === 0 && marketsOnly ? (
        <p className="text-xs text-rh-light-muted dark:text-rh-muted py-3 text-center">
          No market headlines right now.{' '}
          <button onClick={() => setMarketsOnly(false)} className="text-rh-green hover:underline">Try All</button>.
        </p>
      ) : <div className="space-y-2.5">
        {visible.map((item, idx) => {
          const tickerResults = parseTickers(item.related, item.headline);
          const chips: ChipData[] = tickerResults;
          const primaryTicker = tickerResults[0]?.ticker;
          const topic = classifyTopic(item.headline, item.category);
          const accent = ACCENT_COLORS[topic];
          const impact = classifyImpact(item.headline);

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={primaryTicker ? `Open ${primaryTicker} chart` : `Read: ${item.headline}`}
              onClick={() => {
                if (primaryTicker) {
                  onTickerClick(primaryTicker);
                } else {
                  window.open(item.url, '_blank', 'noopener,noreferrer');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (primaryTicker) onTickerClick(primaryTicker);
                  else window.open(item.url, '_blank', 'noopener,noreferrer');
                }
              }}
              className="group flex gap-0 rounded-xl cursor-pointer
                bg-gray-50/40 dark:bg-white/[0.02]
                border border-gray-200/30 dark:border-white/[0.04]
                hover:border-gray-200/60 dark:hover:border-white/[0.08]
                hover:bg-gray-100/60 dark:hover:bg-white/[0.04]
                hover:-translate-y-[3px] hover:shadow-md hover:shadow-black/[0.04] dark:hover:shadow-black/20
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-green/30 focus-visible:ring-offset-1
                transition-all duration-150 overflow-hidden"
              style={{
                animation: 'headlineFadeIn 300ms ease-out both',
                animationDelay: `${idx * 60}ms`,
              }}
            >
              {/* Left accent bar */}
              <div className={`w-1 flex-shrink-0 ${accent.bar} transition-shadow duration-150 group-hover:shadow-[0_0_6px_0] group-hover:shadow-current`} />

              {/* Content */}
              <div className="flex-1 min-w-0 px-3.5 py-2.5">
                {/* Category label */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${accent.label}`}>
                    {accent.text}
                  </span>
                  {impact && (
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${impact.cls}`}>
                      {impact.text}
                    </span>
                  )}
                  <span className="text-[10px] tabular-nums text-rh-light-muted/40 dark:text-rh-muted/40">
                    {timeAgo(item.datetime)}
                  </span>
                </div>

                {/* Headline with inline ticker + company name highlights */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="block text-sm font-semibold text-rh-light-text dark:text-rh-text
                    hover:text-rh-green leading-snug line-clamp-2 transition-colors"
                >
                  {highlightHeadline(item.headline, tickerResults, onTickerClick)}
                </a>

                {/* Source */}
                <span className="text-[11px] text-rh-light-muted/60 dark:text-rh-muted/50 mt-1 block">
                  {item.source}
                </span>

                {/* Ticker chips */}
                {chips.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] text-rh-light-muted/50 dark:text-rh-muted/40 mb-1 block">
                      {chips.some(c => c.isEtf) ? 'Exposure' : 'Related'}
                    </span>
                    <TickerChips chips={chips} onTickerClick={onTickerClick} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
