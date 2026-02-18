/**
 * Chart group computation for multi-period session highlighting.
 * Groups chart points by time unit (day, week, month, quarter, year)
 * so both PortfolioValueChart and StockPriceChart can render
 * alternating background bands.
 */

export interface ChartGroup {
  startIdx: number;  // inclusive index into points array
  endIdx: number;    // inclusive index into points array
  label: string;     // human-readable label (e.g., "Mon", "Feb 3", "Q1", "2025")
}

const etDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const etDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const etMonthFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short' });
const etYearFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' });
const etMonthDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });

/**
 * Compute chart groups for a given period.
 * Returns [] for '1D' (existing session highlighting handles that).
 */
export function computeChartGroups(
  points: { time: number }[],
  period: string,
): ChartGroup[] {
  if (period === '1D' || points.length < 2) return [];

  const groups: ChartGroup[] = [];
  let currentKey = '';
  let currentLabel = '';
  let startIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const d = new Date(points[i].time);
    let key: string;
    let label: string;

    switch (period) {
      case '1W': {
        // Group by calendar day
        key = etDateFmt.format(d);
        label = etDayFmt.format(d);
        break;
      }
      case '1M': {
        // Group by week (Monday-based)
        const dateStr = etDateFmt.format(d);
        const [y, m, dd] = dateStr.split('-').map(Number);
        const localD = new Date(y, m - 1, dd);
        const dow = localD.getDay();
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(y, m - 1, dd + mondayOffset);
        key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        label = etMonthDayFmt.format(monday);
        break;
      }
      case '3M':
      case 'YTD': {
        // Group by month
        const dateStr = etDateFmt.format(d);
        key = dateStr.slice(0, 7); // "YYYY-MM"
        label = etMonthFmt.format(d);
        break;
      }
      case '1Y': {
        // Group by quarter
        const dateStr = etDateFmt.format(d);
        const month = parseInt(dateStr.slice(5, 7));
        const year = dateStr.slice(0, 4);
        const q = Math.ceil(month / 3);
        key = `${year}-Q${q}`;
        label = `Q${q}`;
        break;
      }
      case 'ALL':
      case 'MAX': {
        // Group by year
        key = etYearFmt.format(d);
        label = key;
        break;
      }
      default:
        return [];
    }

    if (key !== currentKey) {
      if (i > 0) {
        groups.push({ startIdx, endIdx: i - 1, label: currentLabel });
      }
      currentKey = key;
      currentLabel = label;
      startIdx = i;
    }
  }

  // Close last group
  if (points.length > 0) {
    groups.push({ startIdx, endIdx: points.length - 1, label: currentLabel });
  }

  return groups;
}
