// Capture a screenshot of the restored "Today's Brief" modal in isolation.
// Uses /screenshot-harness.html which mounts DailyReportModal directly with
// window.fetch monkey-patched to return fake data. No auth, no Insights tab,
// no HoldingsTable — just the modal at full width.
//
// Run: npx playwright test daily-brief-screenshot --project=chromium

import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('capture restored Today\'s Brief modal', async ({ page }) => {
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || msg.text().includes('[harness')) console.log(`[${t}]`, msg.text().slice(0, 300));
  });

  page.on('pageerror', (err) => console.log('[pageerror]', err.message.slice(0, 400)));

  await page.setViewportSize({ width: 1440, height: 1700 });
  await page.goto('http://127.0.0.1:5173/screenshot-harness.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const buf = await page.screenshot({ fullPage: true });
  const out = resolve(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'todays-brief-restored.png');
  writeFileSync(out, buf);
  console.log('Screenshot written to', out);
});
