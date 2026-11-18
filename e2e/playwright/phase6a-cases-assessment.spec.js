import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installLocalOnlyNetworkGuard, openCases } from './helpers.js';

const fullWidths = [320, 375, 430, 768, 780, 1024, 1366, 1920];
const keyboardOnly = process.env.CASETRACK_PHASE6A_KEYBOARD_ONLY === '1';
const widths = keyboardOnly ? [320, 1366] : fullWidths;
const syntheticCase = {
  id: 'phase6a-synthetic-case-only',
  recordType: 'fir_master',
  _collectionName: 'firMasters',
  firNo: '6A-TEST-001', firYear: '2026', firDate: '12/10/2026',
  underSection: 'Synthetic test only', crimeHead: 'Assessment fixture',
  policeStation: 'Synthetic Test Station', status: 'Under Investigation',
  nextDate: '12/12/2026', trialStage: 'Evidence', courtType: 'Lower Court',
  courtName: 'Synthetic District Court', regPrefix: 'SYN', regNo: '101', regYear: '2026',
  complainantName: 'Synthetic Complainant',
  accused: [{ name: 'Synthetic Accused', fatherName: 'Synthetic Parent' }],
  witnesses: [{ name: 'Synthetic Witness', status: 'Present' }]
};

for (const colorScheme of ['light', 'dark']) {
  test(`Phase 6A Cases route, dialogs and axe assessment (${colorScheme})`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await installLocalOnlyNetworkGuard(page);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await openCases(page);

    const results = { colorScheme, widths: [], axeScans: [], interactionFindings: [], pageErrors };
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(theme => {
        localStorage.setItem('caseTrackTheme', theme);
        document.body.classList.toggle('light-theme', theme === 'light');
      }, colorScheme);
      await page.waitForTimeout(50);

      const viewportResult = { width, theme: colorScheme, states: {} };
      const scan = async state => {
        if (keyboardOnly) return;
        const axe = await new AxeBuilder({ page }).analyze();
        results.axeScans.push({
          width,
          theme: colorScheme,
          state,
          violations: axe.violations.map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary }))
          }))
        });
      };
      const measure = async () => page.evaluate(() => {
        const modal = [...document.querySelectorAll('[role="dialog"]')].find(element => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
        });
        return {
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          modalId: modal?.id || modal?.closest('[id]')?.id || null,
          modalBounds: modal ? (() => {
            const rect = modal.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          })() : null,
          duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index)
        };
      });
      const reportFocus = async (name, condition) => {
        const passed = await condition();
        if (!passed) results.interactionFindings.push({ width, theme: colorScheme, finding: name });
      };

      if (!keyboardOnly) await page.screenshot({ path: testInfo.outputPath(`cases-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
      await scan('cases-page');
      viewportResult.states.page = await measure();
      const sortableHeadersKeyboardReachable = await page.locator('.cases-table th.sortable').evaluateAll(headers => headers.every(header =>
        header.tabIndex >= 0 || Boolean(header.querySelector('button, a, [tabindex="0"]'))
      ));
      if (!sortableHeadersKeyboardReachable) {
        results.interactionFindings.push({ width, theme: colorScheme, finding: 'Sortable case table headers are not keyboard focusable' });
      }

      await page.locator('#casesTableBody').evaluate((tbody, item) => {
        tbody.querySelector('[data-phase6a-synthetic="true"]')?.remove();
        const row = document.createElement('tr');
        row.dataset.phase6aSynthetic = 'true';
        row.innerHTML = '<td>6A-TEST-001/26</td><td>12/10/2026</td><td>Synthetic test only</td><td>Synthetic District Court</td><td>12/12/2026</td><td><button id="phase6aViewSynthetic" type="button">View synthetic FIR</button></td>';
        tbody.append(row);
        row.querySelector('button').addEventListener('click', async () => {
          const module = await import('/CaseTrack/assets/js/cases.js');
          module.openCaseDetailsModal(item);
        });
      }, syntheticCase);
      await page.locator('#phase6aViewSynthetic').click();
      await expect(page.locator('#caseDetailsModal')).toHaveClass(/show/);
      await reportFocus('Case Details initial focus did not enter the dialog', async () => page.locator('#caseDetailsModal').evaluate(modal => modal.contains(document.activeElement)));
      await reportFocus('Case Details dialog lacks modal semantics or a valid title reference', async () => page.locator('#caseDetailsModal section[role="dialog"]').evaluate(dialog => dialog.getAttribute('aria-modal') === 'true' && Boolean(document.getElementById(dialog.getAttribute('aria-labelledby')))));
      await reportFocus('Case Details initial focus is not on Close', async () => page.locator('#caseDetailsModal .modal-header .close').evaluate(button => button === document.activeElement));
      if (!keyboardOnly) await page.screenshot({ path: testInfo.outputPath(`details-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
      await scan('case-details');
      viewportResult.states.details = await measure();

      for (let tab = 0; tab < 4; tab += 1) {
        await page.keyboard.press(tab % 2 ? 'Shift+Tab' : 'Tab');
        await reportFocus('Case Details Tab/Shift+Tab left the dialog', async () => page.locator('#caseDetailsModal').evaluate(modal => modal.contains(document.activeElement)));
      }

      await page.evaluate(() => document.getElementById('globalSearch')?.focus());
      await reportFocus('Case Details did not redirect background focus into the dialog', async () => page.locator('#caseDetailsModal').evaluate(modal => modal.contains(document.activeElement)));
      await page.keyboard.press('Escape');
      await expect(page.locator('#caseDetailsModal')).not.toHaveClass(/show/);
      await reportFocus('Case Details did not restore focus to the synthetic case-row trigger', async () => page.locator('#phase6aViewSynthetic').evaluate(button => button === document.activeElement));

      await page.locator('#phase6aViewSynthetic').click();
      await page.locator('#editCaseModalBtn').click();
      await expect(page.locator('#caseModal')).toHaveClass(/show/);
      await expect(page.locator('#modalTitle')).toContainText('Edit Case');
      await reportFocus('Edit Case initial focus did not enter the dialog', async () => page.locator('#caseModal').evaluate(modal => modal.contains(document.activeElement)));
      await reportFocus('Edit Case dialog lacks modal semantics or a valid title reference', async () => page.locator('#caseModal section[role="dialog"]').evaluate(dialog => dialog.getAttribute('aria-modal') === 'true' && Boolean(document.getElementById(dialog.getAttribute('aria-labelledby')))));
      if (!keyboardOnly) await page.screenshot({ path: testInfo.outputPath(`edit-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
      await scan('edit-case');
      viewportResult.states.edit = await measure();
      for (let tab = 0; tab < 8; tab += 1) {
        await page.keyboard.press(tab === 7 ? 'Shift+Tab' : 'Tab');
        await reportFocus('Edit Case Tab/Shift+Tab left the dialog', async () => page.locator('#caseModal').evaluate(modal => modal.contains(document.activeElement)));
      }

      await page.keyboard.press('Escape');
      await expect(page.locator('#caseModal')).not.toHaveClass(/show/);
      await reportFocus('Edit Case did not restore focus to the case-row trigger', async () => page.locator('#phase6aViewSynthetic').evaluate(button => button === document.activeElement));

      await page.locator('[data-open-add-case]').click();
      await expect(page.locator('#caseModal')).toHaveClass(/show/);
      await expect(page.locator('#modalTitle')).toContainText('Add New Case');
      await page.locator('#firno').fill('');
      await page.locator('#caseForm').evaluate(form => form.requestSubmit());
      await expect(page.locator('#firno')).toHaveAttribute('aria-invalid', 'true');
      await reportFocus('Add Case required-field error is not associated with FIR Number', async () => page.locator('#firno').evaluate(input => {
        const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        return ids.some(id => document.getElementById(id)?.textContent.includes('required'));
      }));
      if (!keyboardOnly) await page.screenshot({ path: testInfo.outputPath(`validation-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
      await scan('add-case-validation-errors');
      viewportResult.states.validation = await measure();

      await page.locator('#addPoliceReport').click();
      await page.locator('#chooseChargesheet').click();
      const ioTriggerAvailability = await page.locator('#openManageIO').evaluate(button => ({ disabled: button.disabled, hidden: button.hidden }));
      viewportResult.states.ioTriggerAvailability = ioTriggerAvailability;
      // The isolated emulator has no seeded IO-register entries, so model the
      // existing successful-load UI state (enabled selector with an empty list)
      // in memory and activate the real application button handler.
      await page.locator('#caseIoSelect').evaluate(select => { select.disabled = false; });
      await page.locator('#openManageIO').click();
      const ioDialog = page.locator('#ioDialog');
      await expect(ioDialog).toBeVisible();
      await reportFocus('Native Add IO dialog did not receive focus', async () => ioDialog.evaluate(dialog => dialog.contains(document.activeElement)));
      await reportFocus('Native Add IO dialog lacks a valid accessible title reference', async () => ioDialog.evaluate(dialog => Boolean(document.getElementById(dialog.getAttribute('aria-labelledby')))));
      if (!keyboardOnly) await page.screenshot({ path: testInfo.outputPath(`nested-io-${width}-${colorScheme}.png`), fullPage: true, animations: 'disabled' });
      await scan('nested-add-io-dialog');
      viewportResult.states.io = await measure();
      for (const key of ['Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        await reportFocus('Native IO dialog Tab/Shift+Tab left the top-level dialog', async () => ioDialog.evaluate(dialog => dialog.contains(document.activeElement)));
      }

      await page.keyboard.press('Escape');
      await expect(ioDialog).not.toBeVisible();
      await reportFocus('Escape from native IO dialog closed the host Add Case dialog', async () => page.locator('#caseModal').evaluate(modal => modal.classList.contains('show')));
      await page.keyboard.press('Escape');
      await expect(page.locator('#caseModal')).not.toHaveClass(/show/);
      await reportFocus('Closing Add Case did not restore focus to its Add Case trigger', async () => page.locator('[data-open-add-case]').evaluate(button => button === document.activeElement));

      results.widths.push(viewportResult);
    }

    await testInfo.attach(`phase6a-${colorScheme}-assessment.json`, {
      body: Buffer.from(JSON.stringify(results, null, 2)),
      contentType: 'application/json'
    });
    expect(results.interactionFindings, JSON.stringify(results.interactionFindings, null, 2)).toEqual([]);
    expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
  });
}
