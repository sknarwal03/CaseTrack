import { test, expect } from '@playwright/test';
import { assertIsolatedTestEnvironment, installLocalOnlyNetworkGuard, openCases } from './helpers.js';

test('test route uses only the emulator-configured demo project and blocks every other origin', async ({ page }, testInfo) => {
  const blockedOrigins = await installLocalOnlyNetworkGuard(page);
  await openCases(page);
  const environment = await assertIsolatedTestEnvironment(page);
  await page.waitForTimeout(500);

  expect(environment.projectId).toBe('demo-casetrack-date-regression');
  expect(blockedOrigins.every(origin => new URL(origin).origin !== 'http://127.0.0.1:5185')).toBe(true);
  await testInfo.attach('isolation-summary.json', {
    body: JSON.stringify({ projectId: environment.projectId, blockedOrigins }, null, 2),
    contentType: 'application/json'
  });
});
