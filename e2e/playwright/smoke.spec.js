import { test, expect } from '@playwright/test';
import { installLocalOnlyNetworkGuard, openCases } from './helpers.js';

test('isolated CaseTrack shell loads in Chromium and saves a screenshot', async ({ page }, testInfo) => {
  await installLocalOnlyNetworkGuard(page);
  await openCases(page);
  await expect(page.locator('.cases-page-toolbar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Case' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('casetrack-smoke.png'), fullPage: true, animations: 'disabled' });
});
