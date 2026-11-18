import { chromium } from '@playwright/test';

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 1 });
  await page.setContent('<main>CaseTrack browser readiness</main>');
  const text = await page.locator('main').textContent();
  if (text !== 'CaseTrack browser readiness') throw new Error('Chromium smoke page did not render expected text.');
  console.log(`Chromium ready: ${browser.version()}`);
} catch (error) {
  console.error(`Chromium readiness failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
