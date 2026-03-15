import { expect, test } from '@playwright/test';

test('landing page pricing nav scrolls to the pricing section', async ({ page }) => {
  await page.goto('/');

  const pricingHeading = page.getByRole('heading', { name: /transparent pricing/i });

  await page.getByRole('button', { name: 'Pricing' }).first().click();

  await expect(pricingHeading).toBeVisible();
  await expect(pricingHeading).toBeInViewport();
  await expect(page.getByText(/start free\. upgrade when you need more power\./i)).toBeVisible();
});
