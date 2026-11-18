import { defineConfig } from '@playwright/test';

const origin = 'http://127.0.0.1:5185';
process.env.CASETRACK_E2E_ORIGIN = origin;

export default defineConfig({
  testDir: './e2e/playwright',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  globalSetup: './e2e/playwright/global-setup.js',
  use: {
    baseURL: origin,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-GB',
    timezoneId: 'Asia/Kolkata',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000
  },
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      command: 'npm run firebase:e2e:emulators',
      port: 9099,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'npm run dev:e2e',
      url: `${origin}/CaseTrack/pages/cases.html`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ]
});
