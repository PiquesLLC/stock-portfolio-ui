# Stock Portfolio UI — Agent Instructions

## Project Overview
React + Vite + Tailwind CSS frontend for a stock portfolio tracker. Communicates with stock-portfolio-api on port 3001.

## Tech Stack
- **Framework**: React 18 + TypeScript
- **Build**: Vite (dev on port 5173)
- **Styling**: Tailwind CSS with custom theme classes
- **API Proxy**: Vite rewrites `/api` -> `http://127.0.0.1:3001` (strips `/api` prefix)

## Key Architecture
- Main app state lives in `src/App.tsx` (large file, ~900 lines)
- Stock chart: `src/components/StockPriceChart.tsx` (~2000 lines, be very careful editing)
- API functions: `src/api.ts`
- Types: `src/types.ts`
- Pages: InsightsPage, NalaAIPage, DailyReportModal, UserProfileView, StockDetailView

## Tailwind Theme Classes
- Colors: `rh-green`, `rh-red`
- Cards: `rh-light-card` / `rh-card` (dark)
- Backgrounds: `rh-light-bg` / `rh-dark`
- Text: `rh-light-text` / `rh-text`, `rh-light-muted` / `rh-muted`

## Critical Rules
- NEVER reference a `const` in a `useCallback`/`useMemo` dependency array before it's declared (causes TDZ crash)
- After ANY edit to StockPriceChart.tsx, run `npx tsc --noEmit` to catch errors
- After ANY edit, verify the page loads in the browser
- Safe pattern for forward references: use a ref (`useRef`) and read `.current` inside callback body

## Commands
- `npm run dev` — start Vite dev server (port 5173)
- `npx tsc --noEmit` — type check without building
- `npm run build` — production build

## Branch Strategy
- Work on `codex/*` branches, never commit directly to `master`
- Create focused, single-purpose commits
