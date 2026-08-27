/**
 * Regression coverage for the native nav-dropdown stacking/hit-testing bug
 * (iOS Mac/Xcode acceptance gate).
 *
 * OBSERVED: with the More dropdown open on the Feed page, the page's "Social"
 * button — which has NO z-index of its own — painted OVER the dropdown, and
 * tapping a dropdown row activated whatever control sat physically underneath
 * it instead.
 *
 * ROOT CAUSE (App.tsx): the app-chrome wrapper around the top bar + mobile nav
 * was `isNative ? 'z-30' : 'sticky z-30'`. On native that box is `position:
 * static` and not a flex item, so `z-index: 30` is IGNORED — while the inline
 * `WebkitBackfaceVisibility: 'hidden'` still forces it to form a stacking
 * context. The result is a stacking context pinned to the normal-flow paint
 * layer: the dropdowns' `z-50` orders them only INSIDE it, and anything
 * positioned on the page paints above the lot. The web branch escaped this
 * purely because `sticky` made its z-index apply.
 *
 * ── HONEST SCOPE OF THESE TESTS ──────────────────────────────────────────
 * jsdom does not lay out, paint, or hit-test. No unit test here can prove
 * stacking order or that a tap lands on the right element — that proof is the
 * iOS simulator, and nothing below substitutes for it.
 *
 * What these tests DO pin down is the structural contract the fix depends on:
 *   1. both nav dropdowns still render inside the nav, opaque, at z-50, and
 *      still behave (open, navigate, filter, close-on-outside-tap); and
 *   2. the App chrome wrapper carries a POSITIONING class on both branches
 *      (so its z-index cannot be silently inert) at a value above the
 *      page-content band and below the modal band.
 *
 * Test group 2 asserts against the source text on purpose. The invariant is
 * "this className expression is well-formed", which has no runtime
 * representation in jsdom — rendering App here would prove nothing about paint
 * order and would be exactly the fake confidence worth avoiding.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, within, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Navigation } from './Navigation';

// ── The layer bands this app is built on ─────────────────────────────────────
// page content/controls <= 40  |  app chrome 45  |  modal backdrop 49  |
// modal/dialog panel 50  |  above-modal UI > 50
/** Highest z-index used by ordinary page content and page controls. */
const PAGE_BAND_MAX = 40;
/** Lowest z-index used by modal/dialog panels and the iOS status-bar shield. */
const MODAL_PANEL_Z = 50;

const zOf = (cls: string): number | null => {
  const m = cls.match(/\bz-\[?(\d+)\]?\b/);
  return m ? Number(m[1]) : null;
};

const appSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'),
  'utf8',
);

/** The `isNative ? … : …` className expression on the chrome wrapper. */
const chrome = (() => {
  const m = appSource.match(
    /className=\{isNative \? '([^']*)' : '([^']*)'\}\s+style=\{\{ top: isNative/,
  );
  if (!m) throw new Error('chrome wrapper className expression not found in App.tsx');
  return { native: m[1], web: m[2] };
})();

/** Chrome z-index read from App.tsx, so these tests track the real value. */
const CHROME_Z = (() => {
  const z = zOf(chrome.native);
  if (z === null) throw new Error('chrome wrapper has no z-index');
  return z;
})();

/**
 * Navigation renders the desktop row AND the mobile row into the DOM (Tailwind
 * `hidden sm:flex` / `flex sm:hidden` are CSS-only), so every tab label appears
 * twice. Scope all queries to the mobile row — the one this bug is about.
 */
function mobileRow(container: HTMLElement): HTMLElement {
  const el = container.querySelector('div.justify-around');
  if (!(el instanceof HTMLElement)) throw new Error('mobile nav row not found');
  return el;
}

/** The dropdown element is the `[data-no-tab-swipe]` box wrapping a row. */
function dropdownContaining(scope: HTMLElement, rowLabel: string): HTMLElement {
  const row = within(scope).getByText(rowLabel);
  const box = row.closest('[data-no-tab-swipe]');
  if (!(box instanceof HTMLElement)) throw new Error(`no dropdown box around "${rowLabel}"`);
  return box;
}

function openMore(container: HTMLElement): HTMLElement {
  const mobile = mobileRow(container);
  fireEvent.click(within(mobile).getByText('More'));
  return mobile;
}

describe('Navigation — dropdown stacking contract', () => {
  it('More dropdown renders inside the nav, opaque, at z-50', () => {
    const { container } = render(<Navigation activeTab="feed" onTabChange={vi.fn()} />);

    const menu = dropdownContaining(openMore(container), 'Nala AI');

    // Inside the nav — so the nav's stacking context governs it, which is why
    // the fix belongs on the chrome wrapper and not on this element.
    expect(menu.closest('nav')).not.toBeNull();
    expect(menu.className).toMatch(/\bz-50\b/);
    // Criterion 8: opaque background. Not `bg-white/80`, not a transparent dark
    // variant — the bug was never about opacity and must not be "fixed" there.
    expect(menu.className).toMatch(/\bbg-white\b/);
    expect(menu.className).toMatch(/dark:bg-\[#1a1a1b\]/);
    expect(menu.className).not.toMatch(/bg-white\/\d/);
    expect(menu.className).not.toMatch(/dark:bg-transparent/);
  });

  it('Portfolio dropdown shares the same contract', () => {
    const { container } = render(
      <Navigation
        activeTab="portfolio"
        onTabChange={vi.fn()}
        portfolioMenuOpen
        portfolioMenu={<button type="button">Main Portfolio</button>}
      />,
    );

    const menu = dropdownContaining(mobileRow(container), 'Main Portfolio');

    expect(menu.closest('nav')).not.toBeNull();
    expect(menu.className).toMatch(/\bz-50\b/);
    expect(menu.className).toMatch(/\bbg-white\b/);
    expect(menu.className).toMatch(/dark:bg-\[#1c1c1f\]/);
    expect(menu.className).not.toMatch(/bg-white\/\d/);
  });

  it('tapping a dropdown row navigates and closes the dropdown', () => {
    const onTabChange = vi.fn();
    const { container } = render(<Navigation activeTab="feed" onTabChange={onTabChange} />);

    const mobile = openMore(container);
    fireEvent.click(within(mobile).getByText('Pricing'));

    expect(onTabChange).toHaveBeenCalledWith('pricing');
    expect(within(mobile).queryByText('Nala AI')).toBeNull();
  });

  it('every overflow row is reachable (Nala AI / Watchlists / Profile / Pricing)', () => {
    for (const [label, id] of [
      ['Nala AI', 'nala'],
      ['Watchlists', 'watchlists'],
      ['Profile', 'profile'],
      ['Pricing', 'pricing'],
    ] as const) {
      const onTabChange = vi.fn();
      const view = render(<Navigation activeTab="feed" onTabChange={onTabChange} />);
      const mobile = openMore(view.container);
      fireEvent.click(within(mobile).getByText(label));
      expect(onTabChange).toHaveBeenCalledWith(id);
      view.unmount();
    }
  });

  it('paid users do not see the Pricing row (filtering preserved)', () => {
    const { container } = render(
      <Navigation activeTab="feed" onTabChange={vi.fn()} userPlan="pro" />,
    );

    const mobile = openMore(container);

    expect(within(mobile).getByText('Nala AI')).toBeTruthy();
    expect(within(mobile).queryByText('Pricing')).toBeNull();
  });

  it('tapping outside closes the dropdown', () => {
    const { container } = render(<Navigation activeTab="feed" onTabChange={vi.fn()} />);

    const mobile = openMore(container);
    expect(within(mobile).getByText('Nala AI')).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(within(mobile).queryByText('Nala AI')).toBeNull();
  });
});

describe('App chrome wrapper — stacking-context contract', () => {
  const POSITIONED = /\b(relative|absolute|fixed|sticky)\b/;

  it('is POSITIONED on both branches — a bare z-index is inert and was the bug', () => {
    // `z-30` alone on a static, non-flex-item box does nothing. This single
    // assertion would have caught the original defect.
    expect(chrome.native).toMatch(POSITIONED);
    expect(chrome.web).toMatch(POSITIONED);
  });

  it('uses the SAME z-index on both branches', () => {
    // A per-platform z-index divergence is what let this rot undetected on iOS
    // while web looked fine.
    expect(zOf(chrome.native)).toBe(zOf(chrome.web));
  });

  it('sits above the page-content band and below the modal band', () => {
    const z = zOf(chrome.native);
    expect(z).not.toBeNull();
    // Page content/controls in this codebase top out at z-40; modals, drawer
    // panels and the iOS status-bar shield start at z-50.
    expect(z as number).toBeGreaterThan(PAGE_BAND_MAX);
    expect(z as number).toBeLessThan(MODAL_PANEL_Z);
  });
});

/**
 * The full layer hierarchy, pinned end to end.
 *
 * Raising the chrome to z-[45] put it ABOVE the z-40 backdrops that true modal
 * drawers use. Those backdrops are not decoration: each carries
 * `onClick={onClose}`, so chrome painting above one meant the backdrop could no
 * longer receive the dismiss tap over the header/nav, and the nav stayed
 * interactive behind an open `role="dialog"`. The delta raises those backdrops
 * — and only those — to z-[49].
 *
 * Deliberately NOT raised: the three transparent full-screen click-outside
 * catchers for ordinary dropdown menus (HoldingsTable, LeaderboardPage,
 * WatchlistPage). They have no dimming background, no `aria-hidden`, and no
 * `role="dialog"` partner; their job is outside-click detection for a
 * non-modal menu, not blocking interaction. Raising them above the chrome would
 * make a transparent sheet swallow nav taps whenever a display/sort menu was
 * open — a new bug, not a fix. That exclusion is pinned below so it stays a
 * decision rather than an oversight.
 *
 * Still not a hit-test proof: jsdom neither paints nor dispatches by geometry.
 * This pins the ordering the runtime behaviour depends on.
 */
describe('overlay layer hierarchy', () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8');

  /** Drawers whose dimming backdrop sits behind a role="dialog" panel. */
  const TRUE_MODAL_DRAWERS = [
    'BottleneckDrawer',
    'DividendDetailDrawer',
    'ETFDetailsPanel',
    'IncomeInsights',
  ] as const;

  /** Transparent outside-click catchers for non-modal dropdown menus. */
  const MENU_CLICK_CATCHERS = [
    'HoldingsTable',
    'LeaderboardPage',
    'WatchlistPage',
  ] as const;

  const backdropOf = (name: string) => {
    const m = read(`./${name}.tsx`).match(/fixed inset-0 bg-black\/\d+ z-\[?(\d+)\]?/);
    return m ? Number(m[1]) : null;
  };

  it.each(TRUE_MODAL_DRAWERS)('%s backdrop sits between the chrome and its panel', (name) => {
    const z = backdropOf(name);
    expect(z).not.toBeNull();
    expect(z as number).toBeGreaterThan(CHROME_Z);
    expect(z as number).toBeLessThan(MODAL_PANEL_Z);
  });

  it.each(TRUE_MODAL_DRAWERS)('%s backdrop still dismisses and still fronts a z-50 dialog', (name) => {
    const src = read(`./${name}.tsx`);
    // The reason the layer matters at all — losing this makes the whole fix
    // moot. Deliberately value-agnostic: the z-index itself is pinned by the
    // test above, so a legitimate re-layer changes one assertion, not two.
    expect(src).toMatch(/fixed inset-0 bg-black\/\d+ z-\[?\d+\]?[^"]*"\s*\n\s*onClick=\{onClose\}/);
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/\bz-50\b/);
  });

  it.each(MENU_CLICK_CATCHERS)('%s keeps its non-modal click catcher at z-40', (name) => {
    // Guards the exclusion: these must NOT be swept up in a future
    // "raise every z-40 backdrop" pass.
    expect(read(`./${name}.tsx`)).toMatch(/className="fixed inset-0 z-40"/);
  });

  it('orders the whole stack: page <= 40 < chrome < modal backdrop < panel', () => {
    const backdrops = TRUE_MODAL_DRAWERS.map(backdropOf) as number[];
    const backdropZ = backdrops[0];
    // One shared value across every true modal backdrop.
    expect(new Set(backdrops).size).toBe(1);
    expect(PAGE_BAND_MAX).toBeLessThan(CHROME_Z);
    expect(CHROME_Z).toBeLessThan(backdropZ);
    expect(backdropZ).toBeLessThan(MODAL_PANEL_Z);
    expect(MODAL_PANEL_Z).toBeGreaterThanOrEqual(50);
  });
});
