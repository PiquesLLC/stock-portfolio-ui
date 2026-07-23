# Nala UI — Design System Rules

Robinhood-inspired, minimal, pure-black dark mode. These are the approved
recipes — reuse them verbatim instead of inventing new surface styles.
When a new component doesn't fit any recipe, propose on dev and get Jon's
visual OK before pushing (never ship styling unseen).

## Surfaces (dark mode is NEVER gray — jet black or transparent)

- **Floating menus / dropdowns / popovers** (needs opacity over content):
  `rounded-xl border border-gray-200/60 dark:border-white/[0.1] bg-white dark:bg-black/95 backdrop-blur-md shadow-xl`
  Jet black (`dark:bg-black/95`), never `#1a1a1e` or gray washes. Cap width
  with `max-w-[calc(100vw-2rem)]` so it can't overhang the viewport.
- **In-page glass cards**:
  `rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-transparent backdrop-blur-xl`
  Dark = fully transparent (page black shows through). No `dark:bg-white/[0.0x]` washes.
- **Dividers / hairlines**: `border-gray-200/40 dark:border-white/[0.06]`
- **Modals**: `bg-white dark:bg-[#1a1a1e]` is legacy — prefer jet black for new ones.

## Section headers

`<h2 class="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-rh-light-muted/50 dark:text-rh-muted/50 mb-4"><span class="w-0.5 h-3.5 bg-rh-green rounded-full" />Title</h2>`
Every page section uses this. Card-internal labels: `text-[10px] font-medium uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50`.

## Color vocabulary (ONE severity/status language)

- Positive/low-risk: `text-rh-green` · Negative/high-risk: `text-rh-red`
- Middle state: `text-amber-600 dark:text-yellow-400`
- Severity/status reads through a **dot + colored text/value**, never a colored
  background wash. Dot: `w-1.5 h-1.5 rounded-full` + level/entity color.
- Item-specific colors (chart overlays, compare tickers): hex + alpha suffix —
  active border `${color}59` (35% — 25% is too quiet on pure black), fill
  `${color}14`, text `color`, solid dot.

## Selection chips / toggle pills

- Resting: `rounded-lg border border-gray-200/40 dark:border-white/[0.08] text-rh-light-muted dark:text-rh-muted` + hollow dot (`border border-gray-300 dark:border-white/25`), hover: `hover:text-rh-light-text dark:hover:text-rh-text hover:border-gray-300/60 dark:hover:border-white/[0.15]`
- Active: item color at 25% border / 8% fill / colored text / solid dot (see above). Green (`text-rh-green border-rh-green/25 bg-rh-green/[0.06]`) when there's no item color.

## Typography & data

- Numbers: `tabular-nums`; money deltas keep explicit `+`/`-` signs, percent in parens after the dollar value.
- Labels muted, values `font-medium`/`font-semibold`.
- NO emoji icons — stroke SVGs only. NO animated gradient text. Tone stays calm.

## Interaction

- Interactive rows: `hover:bg-gray-50/60 dark:hover:bg-white/[0.02]`, `type="button"`, `aria-expanded` on toggles.
- Small click targets: extend hitboxes with negative-margin + padding compensation (visual position unchanged) rather than growing the element.
- Thin meters/progress: `h-1 rounded-full` track `bg-gray-200/60 dark:bg-white/[0.06]`, solid single-color fill (no multi-stop gradients).

## Process rules

- **Styling changes need Jon's visual OK on dev BEFORE pushing.** Review verdicts don't substitute.
- Mobile fit problems: tune spacing/compression (+ `flex-wrap` safety) — do NOT build structural mobile-only layout variants (rejected 2026-07-10). Standing exception, Jon-approved 2026-07-16: the stock-page Your Position swipe carousel (Market Value ⇄ Average Cost, page dots). New exceptions need the same explicit OK.
- Measure real runtime values for UI-fit work (screenshots, getBoundingClientRect) — never estimate geometry.
- `sm:`+ must stay byte-identical when fixing mobile-only issues; don't break a working screen to fix another.
- Dev servers run under pm2 (`nala-ui` :5173, `nala-api` :3001) — never start duplicate `npm run dev`.
