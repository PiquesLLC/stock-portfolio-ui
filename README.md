# Nala — Portfolio Intelligence Platform (Frontend)

A modern portfolio tracking and analytics UI built with React, TypeScript, and Tailwind CSS. Designed for the next generation of investors who want more than just a stock ticker.

**[Live App](https://stock-portfolio-api-production.up.railway.app)** · **[API Repo](https://github.com/PiquesLLC/stock-portfolio-api)**

---

## Features

### Portfolio & Holdings
- Real-time portfolio value tracking with interactive SVG charts
- Crosshair measurement tool (tap-to-measure on mobile, click on desktop)
- SPY benchmark overlay with outperformance calculation
- Moving averages (MA5, MA10, MA50, MA100, MA200) with session segmentation
- Period views: 1D, 1W, 1M, 3M, YTD, 1Y, MAX
- Options contract display with live pricing via Finnhub

### AI-Powered Insights
- **Daily Portfolio Briefing** — AI-generated summary of portfolio activity and market context
- **Behavioral Coach** — Detects patterns like concentration risk, loss aversion, and overtrading
- **Stock Q&A** — Ask natural language questions about any ticker
- **Catalyst Detection** — Upcoming events that could impact your holdings

### Market Intelligence
- S&P 500 **heatmap** with sector/sub-sector treemap visualization (tap-to-peek on mobile)
- Economic indicators dashboard with interactive chart drill-down
- Ticker search with autocomplete
- Stock detail pages with earnings, dividends, analyst events, and AI event overlays

### Brokerage Integration (Plaid)
- One-click brokerage linking via Plaid Link SDK
- Automatic holdings import (equities + options contracts)
- Connected accounts management in Settings
- Sync transparency: skipped holdings shown with reasons

### Watchlists
- Custom watchlists with color coding
- Display metric picker (Day Change, Total P/L, 1W, 1M, 1Y, P/E Ratio)
- Mini sparkline charts per holding
- After-hours price split display

### Social & Gamification
- Leaderboard with portfolio performance rankings
- User profiles with anonymized performance data
- Activity feed
- Nala Score: 5-dimension portfolio health rating (pentagon chart)

### Additional Features
- Light/dark theme with system preference detection
- Keyboard shortcuts with cheat sheet overlay
- Dividend income tracking with DRIP projections
- Price alerts and milestone notifications (52-week high/low, ATH/ATL)
- Pricing page with Stripe subscription integration
- Mobile-first responsive design across all features
- Public privacy policy and terms of service pages

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Styling | Tailwind CSS 3 |
| Build | Vite |
| Charts | Custom SVG (no charting library) |
| State | React hooks + context |
| Auth | JWT in httpOnly cookies |
| Payments | Stripe Checkout |
| Brokerage | Plaid Link SDK |

## Architecture

```
src/
├── components/       # 97 React components
│   ├── StockPriceChart.tsx      # ~2000 lines — full stock charting engine
│   ├── PortfolioValueChart.tsx  # Portfolio chart with measurement
│   ├── HeatmapChart.tsx         # S&P 500 treemap
│   ├── HoldingsTable.tsx        # Holdings with sparklines
│   ├── WatchlistPage.tsx        # Watchlist management
│   ├── EconomicIndicators.tsx   # Macro dashboard
│   └── ...
├── utils/
│   ├── stock-chart.ts    # Chart data pipeline (buildPoints, bridge logic)
│   ├── portfolio-chart.ts # Portfolio chart utilities
│   ├── format.ts          # Currency/percent formatting
│   └── occ-parser.ts      # Options contract symbol parser
├── context/
│   └── AuthContext.tsx     # JWT auth state management
├── api.ts                  # API client (all endpoints)
└── types.ts                # Shared TypeScript types
```

## Development

```bash
npm install
npm run dev     # Starts on http://localhost:5173
```

Requires the [API server](https://github.com/PiquesLLC/stock-portfolio-api) running on port 3001. Vite proxy rewrites `/api` requests automatically.

---

Built by [Piques LLC](https://github.com/PiquesLLC)
