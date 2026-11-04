import { test, expect } from '@playwright/test';

// First create approved baselines with `npm run qa:visual:baseline`.
// Later runs compare against these files. Images are masked so CDN/photo
// differences do not create false-positive layout diffs.
test('MOOD homepage visual baseline @visual', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready);
  await page.addStyleTag({ content: '.hero{background-image:none!important;background-color:#38140E!important} img{visibility:hidden!important}' });
  await expect(page.locator('#top')).toBeVisible();
  await expect(page).toHaveScreenshot('mood-homepage.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015
  });
});

test('MOOD calculator visual baseline @visual', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready);
  await page.getByRole('button', { name: /розрахувати вартість бенкету/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveScreenshot('mood-calculator.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015
  });
});
