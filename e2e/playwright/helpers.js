import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const expectedOrigin = process.env.CASETRACK_E2E_ORIGIN;
const allowedOrigins = new Set([
  expectedOrigin && new URL(expectedOrigin).origin,
  'http://127.0.0.1:9099',
  'http://127.0.0.1:8080'
].filter(Boolean));

export async function installLocalOnlyNetworkGuard(page) {
  if (!expectedOrigin) throw new Error('CASETRACK_E2E_ORIGIN is required; refusing to run browser tests.');
  const blocked = [];
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === expectedOrigin && requestUrl.pathname.startsWith('/__casetrack_test_functions_disabled__/')) {
      if (requestUrl.pathname.endsWith('/getMyAccess') && route.request().headers().authorization?.startsWith('Bearer ')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            role: 'operator',
            status: 'active',
            policeStationId: 'e2e-synthetic-station',
            policeStationName: 'Synthetic Test Station',
            mustChangePassword: false
          })
        });
      }
      if (requestUrl.pathname.endsWith('/listUserRoles')) {
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic operator is not an administrator.' }) });
      }
      return route.fulfill({ status: 501, body: 'Functions are disabled in CaseTrack E2E mode.' });
    }
    if (allowedOrigins.has(requestUrl.origin)) return route.continue();
    blocked.push(`${requestUrl.origin}${requestUrl.pathname}`);
    return route.abort('blockedbyclient');
  });
  return blocked;
}

export async function assertIsolatedTestEnvironment(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.__CASETRACK_TEST_ENV__))).toBe(true);
  const environment = await page.evaluate(() => window.__CASETRACK_TEST_ENV__);
  expect(environment.projectId).toBe('demo-casetrack-date-regression');
  expect(environment.authEmulator).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(environment.firestoreEmulator).toMatch(/^127\.0\.0\.1:\d+$/);
  expect(environment.projectId).not.toBe('casetrack-97a4e');
  return environment;
}

export async function openCases(page) {
  const fixture = JSON.parse(await readFile(path.resolve('test-results/e2e-fixture.json'), 'utf8'));
  const loginResponse = await page.goto('/CaseTrack/pages/login.html', { waitUntil: 'domcontentloaded' });
  expect(loginResponse?.ok()).toBeTruthy();
  await assertIsolatedTestEnvironment(page);
  await page.locator('#email').fill(fixture.email);
  await page.locator('#password').fill(fixture.password);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForURL('**/CaseTrack/pages/dashboard.html', { timeout: 20_000 });

  const response = await page.goto('/CaseTrack/pages/cases.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await assertIsolatedTestEnvironment(page);
  await expect(page.locator('h1')).toContainText('Cases');
}

export async function openAddCase(page) {
  await page.getByRole('button', { name: 'Add Case' }).click();
  await expect(page.locator('#caseModal')).toHaveClass(/show/);
  await expect(page.locator('#caseForm')).toBeVisible();
}

export async function openChargesheetEditor(page) {
  await page.locator('#addPoliceReport').click();
  await page.locator('#chooseChargesheet').click();
  await expect(page.locator('#sectionWitness')).toBeVisible();
  await expect(page.locator('#sectionAccused')).toBeVisible();
}
