/**
 * Client-side sector mapping — mirrors the API's sectors.ts for local computation.
 * Used by the compare page to avoid extra API calls.
 */

const sectorGroups: Record<string, string[]> = {
  'Tech': [
    'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA',
    'AMD', 'INTC', 'TSM', 'ASML', 'AVGO', 'QCOM', 'TXN', 'MU',
    'MRVL', 'AMAT', 'LRCX', 'KLAC', 'ARM', 'SMCI', 'ON', 'MCHP',
    'ADI', 'NXPI', 'SNPS', 'CDNS',
    'CRM', 'ORCL', 'ADBE', 'NOW', 'SNOW', 'PLTR', 'SHOP', 'WDAY',
    'TEAM', 'ZM', 'DOCU', 'OKTA', 'HUBS', 'INTU', 'DDOG', 'MDB',
    'NET', 'ZS', 'CRWD', 'PANW', 'FTNT', 'DELL', 'HPQ',
    'CSCO', 'IBM', 'ADSK', 'ADP', 'PAYX', 'CTSH', 'CDW',
    'NFLX', 'UBER', 'ABNB', 'DASH', 'COIN', 'SQ', 'PYPL', 'ANET',
    'RDDT', 'SNAP', 'PINS', 'TTD', 'RBLX', 'SPOT',
    'BABA', 'BIDU', 'JD', 'PDD', 'NIO', 'XPEV', 'LI', 'BILI',
    'TME', 'TCEHY', 'KWEB',
  ],
  'Finance': [
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'SCHW', 'TFC', 'USB', 'PNC',
    'V', 'MA', 'AXP', 'COF', 'DFS', 'FIS', 'FISV', 'HOOD', 'SOFI',
    'BRK.A', 'BRK.B', 'BLK', 'SPGI', 'ICE', 'CME', 'MCO',
    'CB', 'MMC', 'AON', 'PGR', 'MET', 'AIG', 'TRV',
  ],
  'Healthcare': [
    'JNJ', 'PFE', 'ABBV', 'MRK', 'LLY', 'BMY', 'AMGN',
    'GILD', 'VRTX', 'REGN', 'MRNA', 'BIIB',
    'TMO', 'ABT', 'DHR', 'ISRG', 'MDT', 'SYK', 'ZTS',
    'DXCM', 'ILMN', 'IDXX', 'BSX', 'EW', 'A',
    'UNH', 'CVS', 'CI', 'ELV', 'HUM', 'HCA',
  ],
  'Energy': [
    'XOM', 'CVX', 'COP', 'EOG', 'OXY', 'DVN', 'FANG', 'HES', 'PXD',
    'SLB', 'MPC', 'PSX', 'VLO', 'BKR', 'HAL',
    'KMI', 'WMB', 'OKE', 'ET', 'CEG',
  ],
  'Consumer': [
    'WMT', 'PG', 'KO', 'PEP', 'COST', 'CL', 'MDLZ', 'MO', 'PM',
    'EL', 'KHC', 'GIS', 'SYY', 'HSY', 'K', 'STZ', 'KDP', 'MNST',
    'HD', 'LOW', 'TGT', 'ROST', 'TJX', 'NKE', 'LULU', 'ETSY', 'EBAY', 'W', 'DECK', 'ORLY', 'DLTR', 'CPRT',
    'MCD', 'SBUX', 'BKNG', 'MAR', 'CMG', 'DPZ', 'YUM',
    'TSLA', 'GM', 'F', 'RIVN', 'LCID',
  ],
  'Industrial': [
    'BA', 'LMT', 'GE', 'RTX', 'GD', 'NOC', 'LHX',
    'CAT', 'DE', 'HON', 'MMM', 'EMR', 'ITW', 'ETN', 'PCAR', 'CTAS', 'FAST',
    'UPS', 'UNP', 'CSX', 'NSC', 'FDX', 'WM', 'ODFL',
  ],
  'Communication': [
    'DIS', 'CMCSA', 'WBD', 'PARA', 'ROKU',
    'T', 'VZ', 'TMUS',
    'EA', 'TTWO', 'MTCH',
  ],
  'Materials': [
    'LIN', 'APD', 'SHW', 'ECL', 'DOW', 'DD', 'CF',
    'NEM', 'FCX', 'NUE', 'VMC', 'MLM',
  ],
  'Utilities': [
    'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'ED', 'WEC', 'ES',
    'AWK',
  ],
  'Real Estate': [
    'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'PSA', 'DLR',
    'WELL', 'AVB', 'EQR', 'VTR',
  ],
  'ETF/Index': [
    'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'SCHD',
    'VEA', 'VWO', 'EEM', 'EFA', 'INDA', 'FXI', 'IEMG',
    'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLP', 'XLY', 'XLU',
    'XLC', 'XLRE', 'XLB',
    'ARKK', 'ARKG', 'ARKW', 'ARKF',
    'VGT', 'SOXX', 'SMH', 'XBI', 'IBB', 'NLR',
    'GLD', 'SLV', 'GDX', 'USO', 'TAN', 'ICLN', 'LIT', 'BOTZ',
    'BND', 'AGG', 'TLT', 'HYG', 'LQD', 'VCSH', 'VCIT',
    'TQQQ', 'SQQQ', 'SPXL', 'UPRO', 'SOXL', 'SOXS',
    'VNQ',
  ],
};

// Pre-build reverse lookup for O(1) sector resolution
const tickerToSector = new Map<string, string>();
for (const [sector, tickers] of Object.entries(sectorGroups)) {
  for (const t of tickers) {
    tickerToSector.set(t, sector);
  }
}

export function getSector(ticker: string): string {
  return tickerToSector.get(ticker.toUpperCase()) ?? 'Other';
}

export function computeSectorExposure(
  holdings: { ticker: string; currentValue: number }[]
): { sector: string; exposurePercent: number }[] {
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  if (totalValue === 0) return [];

  const sectorValues = new Map<string, number>();
  for (const h of holdings) {
    const sector = getSector(h.ticker);
    sectorValues.set(sector, (sectorValues.get(sector) ?? 0) + h.currentValue);
  }

  return Array.from(sectorValues.entries())
    .map(([sector, value]) => ({
      sector,
      exposurePercent: Math.round((value / totalValue) * 1000) / 10,
    }))
    .sort((a, b) => b.exposurePercent - a.exposurePercent);
}
