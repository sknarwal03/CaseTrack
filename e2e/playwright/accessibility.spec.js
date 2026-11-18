import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installLocalOnlyNetworkGuard, openCases, openAddCase, openChargesheetEditor } from './helpers.js';

for (const colorScheme of ['light', 'dark']) {
  test(`axe Add Case accessibility states in ${colorScheme} theme on mobile and desktop`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.addInitScript(theme => localStorage.setItem('caseTrackTheme', theme), colorScheme);
    await installLocalOnlyNetworkGuard(page);
    await openCases(page);
    await openAddCase(page);

    const findings = [];
    const scanAtBothViewports = async state => {
      for (const width of [320, 1366]) {
        await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
        const result = await new AxeBuilder({ page }).include('#caseModal').analyze();
        findings.push({
          state,
          width,
          violations: result.violations.map(violation => ({
            id: violation.id,
            impact: violation.impact,
            description: violation.description,
            help: violation.help,
            nodes: violation.nodes.map(node => ({
              target: node.target,
              failureSummary: node.failureSummary
            }))
          }))
        });
      }
    };

    await scanAtBothViewports('initial');

    await page.locator('#caseForm').evaluate(form => form.requestSubmit());
    await expect(page.locator('#firno')).toHaveAttribute('aria-invalid', 'true');
    await scanAtBothViewports('validation-errors');
    await page.locator('#caseForm button[type="reset"]').click();

    await openChargesheetEditor(page);
    await page.locator('#addAccused').click();
    await scanAtBothViewports('dynamic-accused');
    await page.locator('#addWitness').click();
    await scanAtBothViewports('dynamic-witness');

    await page.locator('#firno').fill('2026999991');
    await page.locator('#caseForm button[type="reset"]').click();
    await expect(page.locator('#caseResetConfirmDialog')).toBeVisible();
    await scanAtBothViewports('reset-confirmation-dialog');

    const violations = findings.flatMap(result => result.violations.map(violation => ({
      state: result.state,
      width: result.width,
      ...violation
    })));
    await testInfo.attach(`axe-${colorScheme}-results.json`, {
      body: Buffer.from(JSON.stringify({ colorScheme, findings }, null, 2)),
      contentType: 'application/json'
    });
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}
