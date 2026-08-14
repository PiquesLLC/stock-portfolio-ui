/**
 * Shared chart vocabulary for the stock-page financial panels.
 *
 * Financials and Earnings sit next to each other and draw different marks —
 * Financials plots multi-series absolute dollars, Earnings plots estimate vs
 * reported with beat/miss colour — but they have to read as one family. Every
 * value that governs the *frame* rather than the marks lives here, so the two
 * panels can't drift apart the way they had by 2026-08.
 */

export const CHART_W = 600;
export const CHART_H = 180;
export const CHART_PAD = { top: 8, right: 8, bottom: 28, left: 54 };

/** Series palette. Blue is the neutral measure; green/red carry a verdict. */
export const SERIES_BLUE = '#3b82f6';
export const SERIES_GREEN = '#00c805';
export const SERIES_RED = '#ff3b30';
/** For a bar that has data but no good/bad reading (e.g. an ungraded quarter). */
export const SERIES_NEUTRAL = 'rgba(150,150,150,0.55)';

export const GRID_STROKE = 'rgba(150,150,150,0.1)';
export const ZERO_STROKE = 'rgba(150,150,150,0.25)';
export const CROSSHAIR_STROKE = 'rgba(150,150,150,0.2)';
export const TOOLTIP_FILL = 'rgba(0,0,0,0.8)';

export const AXIS_FONT_SIZE = 7;
export const TOOLTIP_FONT_SIZE = 6.5;
export const AXIS_FONT_FAMILY = 'system-ui';
export const AXIS_TEXT_CLASS = 'fill-gray-500 dark:fill-white/80';

/** Resting bar opacity; hovering a group lifts its bars to 1. */
export const BAR_REST_OPACITY = 0.7;

/**
 * Bars are tinted with `opacity`, which would let the gridlines behind them
 * read straight through the fill. Paint this opaque backing under every bar
 * first: the tint then composites over the page colour instead of over a
 * gridline, so the bar keeps its exact shade and reads as solid.
 */
export const BAR_BACKING_CLASS = 'fill-white dark:fill-rh-black';
