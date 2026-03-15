import { expect, test, type Page } from '@playwright/test';
import { attachLocalAuthCookie } from './helpers/auth';

test.describe.configure({ mode: 'serial' });

async function dismissDailyBriefIfPresent(page: Page) {
  const continueButton = page.getByRole('button', { name: /continue to portfolio/i });
  await continueButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
    await continueButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

test('authenticated stock detail loads core panels for AAPL', async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required');
  }

  await attachLocalAuthCookie(context, baseURL);

  await page.goto('/#tab=portfolio&stock=AAPL');
  await dismissDailyBriefIfPresent(page);

  await expect(page.getByRole('button', { name: /follow|following/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nala Score' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Financials' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Earnings' }).first()).toBeVisible();
  await expect(page.getByText(/Ask about AAPL/i)).toBeVisible();
});

test('ETF constituent click navigates stock detail to the selected ticker', async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required');
  }

  await attachLocalAuthCookie(context, baseURL);

  await page.goto('/#tab=portfolio&stock=SPY');
  await dismissDailyBriefIfPresent(page);

  await expect(page.getByRole('heading', { name: 'ETF Details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SPY', exact: true })).toBeVisible();

  await dismissDailyBriefIfPresent(page);
  await page.getByRole('button', { name: 'AAPL', exact: true }).click();

  await expect(page).toHaveURL(/stock=AAPL/);
  await expect(page.getByRole('heading', { name: /Apple Inc/i })).toBeVisible();
  await expect(page.getByText(/Ask about AAPL/i)).toBeVisible();
});

test('notification click navigates to the linked stock detail', async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required');
  }

  await attachLocalAuthCookie(context, baseURL);

  await page.goto('/');
  await dismissDailyBriefIfPresent(page);

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

  const vrtNotificationMessage = page.getByText('VRT hit a new all-time high of $265.77', { exact: true });
  await expect(vrtNotificationMessage).toBeVisible();
  await vrtNotificationMessage.click();

  await expect(page).toHaveURL(/stock=VRT/);
  await expect(page.getByRole('heading', { name: /Vertiv|VRT/i }).first()).toBeVisible();
  await expect(page.getByText(/Ask about VRT/i)).toBeVisible();
});

test('header search navigates to the selected stock detail', async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required');
  }

  await attachLocalAuthCookie(context, baseURL);

  await page.goto('/');
  await dismissDailyBriefIfPresent(page);

  const searchInput = page.locator('input[placeholder="Search stocks..."]:visible').first();
  await searchInput.fill('AAPL');

  const aaplResult = page.getByRole('option').filter({ hasText: 'AAPL' }).first();
  await expect(aaplResult).toBeVisible();
  await aaplResult.click();

  await expect(page).toHaveURL(/stock=AAPL/);
  await expect(page.getByRole('heading', { name: /Apple Inc/i })).toBeVisible();
  await expect(page.getByText(/Ask about AAPL/i)).toBeVisible();
});

test('discover top 100 preview and second click navigate to stock detail', async ({ context, page, baseURL }) => {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required');
  }

  await attachLocalAuthCookie(context, baseURL);

  await page.goto('/#tab=discover');
  await dismissDailyBriefIfPresent(page);

  await page.getByRole('button', { name: 'Top 100', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Top 100/i })).toBeVisible();

  const nvdaTicker = page.getByText('NVDA', { exact: true }).first();
  await expect(nvdaTicker).toBeVisible({ timeout: 10000 });

  await nvdaTicker.click();
  await expect(page.getByText('Click a stock to preview')).toBeHidden();

  await nvdaTicker.click();

  await expect(page).toHaveURL(/stock=NVDA/);
  await expect(page.getByRole('heading', { name: /NVIDIA|NVDA/i }).first()).toBeVisible();
  await expect(page.getByText(/Ask about NVDA/i)).toBeVisible();
});
