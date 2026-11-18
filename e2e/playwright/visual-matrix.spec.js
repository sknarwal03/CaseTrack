import { test, expect } from '@playwright/test';
import { installLocalOnlyNetworkGuard, openCases, openAddCase, openChargesheetEditor } from './helpers.js';

const widths = [320, 375, 430, 768, 780, 1024, 1366, 1920];
for (const colorScheme of ['light', 'dark']) {
  for (const width of widths) {
    test(`Add Case visual capture ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem('caseTrackTheme', theme), colorScheme);
      await installLocalOnlyNetworkGuard(page);
      await openCases(page);
      await openAddCase(page);
      await openChargesheetEditor(page);
      const nav = page.locator('#caseModal .case-section-nav');
      const navBounds = await nav.boundingBox();
      const navLinkBounds = await nav.locator('a:visible').evaluateAll(links => links.map(link => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }));
      expect(navLinkBounds.every(link => link.left >= navBounds.x - 1 && link.right <= navBounds.x + navBounds.width + 1)).toBe(true);
      expect(await nav.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await nav.evaluate(element => element.clientWidth));
      await expect(nav.locator('a:visible').first()).toHaveAttribute('href', '#caseSectionFir');
      await expect(nav.locator('a:visible').last()).toHaveAttribute('href', '#caseSectionWitness');

      await nav.locator('a[href="#caseSectionFir"]').click();
      await expect(page.locator('#caseSectionFir')).toBeInViewport();
      for (const id of ['firno', 'firdate', 'firyear', 'undersection']) {
        await expect(page.locator(`label[for="${id}"] .required-indicator`)).toHaveText('Required');
      }
      await page.locator('#caseModal').screenshot({
        path: testInfo.outputPath(`add-case-required-${width}-${colorScheme}.png`),
        animations: 'disabled'
      });

      await nav.locator('a[href="#caseSectionAccused"]').click();
      await expect(page.locator('#caseSectionAccused')).toBeInViewport();
      await expect(page.getByRole('group', { name: 'Accused 01' })).toBeVisible();
      await page.locator('#caseModal').screenshot({
        path: testInfo.outputPath(`add-case-accused-${width}-${colorScheme}.png`),
        animations: 'disabled'
      });

      await page.locator('#caseModal .case-section-nav a[href="#caseSectionWitness"]').click();
      await expect(page.locator('#caseSectionWitness')).toBeInViewport();
      await expect(page.locator('#caseModal .case-section-nav a[href="#caseSectionWitness"]'))
        .toHaveAttribute('aria-current', 'location');

      const themeIsLight = await page.locator('body').evaluate(element => element.classList.contains('light-theme'));
      expect(themeIsLight).toBe(colorScheme === 'light');
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        modal: document.querySelector('#caseModal')?.getBoundingClientRect().width,
        witnessCard: (() => {
          const rect = document.querySelector('#witnessTableBody .witness-card')?.getBoundingClientRect();
          return rect && { width: rect.width, left: rect.left, right: rect.right };
        })()
      }));
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.witnessCard?.width).toBeGreaterThan(0);
      expect(dimensions.witnessCard?.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.witnessCard?.right).toBeLessThanOrEqual(dimensions.viewport);
      await page.locator('#caseModal').screenshot({
        path: testInfo.outputPath(`add-case-${width}-${colorScheme}.png`),
        animations: 'disabled'
      });
      await page.locator('#addWitness').evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const witnessButtonClearance = await page.evaluate(() => ({
        button: document.querySelector('#addWitness').getBoundingClientRect(),
        footer: document.querySelector('#caseForm > .modal-footer').getBoundingClientRect()
      }));
      expect(witnessButtonClearance.button.bottom).toBeLessThanOrEqual(witnessButtonClearance.footer.top);
      await page.locator('#caseModal').screenshot({
        path: testInfo.outputPath(`add-case-witness-footer-clear-${width}-${colorScheme}.png`),
        animations: 'disabled'
      });
    });
  }
}
