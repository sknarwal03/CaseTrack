import { test, expect } from '@playwright/test';
import { installLocalOnlyNetworkGuard, openCases, openAddCase, openChargesheetEditor } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyNetworkGuard(page);
  await openCases(page);
  await openAddCase(page);
});

test('section navigation reaches the Witness heading', async ({ page }) => {
  await openChargesheetEditor(page);
  const link = page.locator('#caseModal .case-section-nav a[href="#caseSectionWitness"]');
  await expect(link).toBeVisible();
  await expect(page.locator('#caseModal .case-section-nav a[href="#caseSectionUcr"]')).toBeHidden();
  await link.click();
  const heading = page.locator('#caseSectionWitness');
  await expect(heading).toBeInViewport();
  await expect(link).toHaveAttribute('aria-current', 'location');

  const accusedLink = page.locator('#caseModal .case-section-nav a[href="#caseSectionAccused"]');
  await page.locator('#caseSectionAccused').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await expect(accusedLink).toHaveAttribute('aria-current', 'location');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(link).toHaveAttribute('aria-current', 'location');
});

test('Witness cards add, preserve values, renumber, label, remove, and restore focus', async ({ page }) => {
  await openChargesheetEditor(page);
  const cards = page.locator('#witnessTableBody .witness-card');
  const addButton = page.locator('#addWitness');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('button')).toHaveCount(0);

  await addButton.click();
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toBeFocused();
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(0).fill('Synthetic Original');
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1).fill('Synthetic Middle');
  await addButton.click();
  await expect(cards).toHaveCount(3);
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(2).fill('Synthetic Final');

  await page.getByRole('button', { name: 'Remove Witness 2' }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toHaveValue('Synthetic Final');
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toHaveAttribute('aria-label', 'Witness 2 name');
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toBeFocused();
  await page.getByRole('button', { name: 'Remove Witness 2' }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').first()).toHaveValue('Synthetic Original');
  await expect(addButton).toBeFocused();
});

test('existing required controls show visible indicators and retain native required semantics', async ({ page }) => {
  const requiredIds = ['firno', 'firdate', 'firyear', 'undersection'];
  for (const id of requiredIds) {
    const control = page.locator(`#${id}`);
    await expect(control).toHaveAttribute('required', '');
    const label = page.locator(`label[for="${id}"]`);
    await expect(label.locator('.required-indicator')).toHaveText('Required');
  }
  await expect(page.locator('#crimehead')).not.toHaveAttribute('required', '');
  await expect(page.locator('label[for="crimehead"] .required-indicator')).toHaveCount(0);

  await openChargesheetEditor(page);
  for (const id of ['courttype', 'casestatus']) {
    await expect(page.locator(`#${id}`)).toBeEnabled();
    await expect(page.locator(`#${id}`)).toHaveAttribute('required', '');
    await expect(page.locator(`label[for="${id}"] .required-indicator`)).toHaveText('Required');
  }

});

test('existing UCR-only required fields show indicators only while UCR is active', async ({ page }) => {
  await page.locator('#addPoliceReport').click();
  await page.locator('[data-add-case-record="ucr"]').click();
  await expect(page.locator('#ucrRecordFields')).toBeVisible();
  for (const id of ['ucrSerial', 'ucrYear', 'report_type', 'ucr_dod']) {
    await expect(page.locator(`#${id}`)).toBeEnabled();
    await expect(page.locator(`#${id}`)).toHaveAttribute('required', '');
  }
  for (const id of ['ucrSerial', 'report_type', 'ucr_dod']) {
    await expect(page.locator(`label[for="${id}"] .required-indicator`)).toHaveText('Required');
  }
  await expect(page.locator('#courttype')).toBeDisabled();
  await expect(page.locator('label[for="courttype"] .required-indicator')).toHaveCount(0);
});

test('Accused entries expose sequential named groups and preserve labels, focus and removal', async ({ page }) => {
  await openChargesheetEditor(page);
  const cards = page.locator('#accusedContainer fieldset.accused-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('legend')).toHaveText('Accused 01');
  await expect(cards.first().getByRole('button')).toHaveCount(0);

  await page.locator('#addAccused').click();
  await page.locator('#addAccused').click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1).locator('legend')).toHaveText('Accused 02');
  await expect(cards.nth(2).locator('legend')).toHaveText('Accused 03');
  await expect(page.getByRole('group', { name: 'Accused 02' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Accused 03' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove Accused 2' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove Accused 2' }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator('legend')).toHaveText('Accused 02');
  await expect(page.locator('#accusedContainer input[name="accused_name[]"]').nth(1)).toBeFocused();
  const ids = await page.locator('#caseForm [id]').evaluateAll(elements => elements.map(element => element.id));
  expect(ids.length).toBe(new Set(ids).size);
  const fields = await page.locator('#accusedContainer .accused-card input, #accusedContainer .accused-card select, #accusedContainer .accused-card textarea').evaluateAll(elements =>
    elements.map(element => ({ id: element.id, labelled: [...document.querySelectorAll('label[for]')].some(label => label.htmlFor === element.id) }))
  );
  expect(fields.every(field => field.labelled)).toBe(true);
});

test('dirty Reset confirmation supports Keep Editing, Escape, focus containment, and intended reset state', async ({ page }) => {
  const reset = page.locator('#caseForm button[type="reset"]');
  const firNumber = page.locator('#firno');
  await reset.click();
  await expect(page.locator('#caseResetConfirmDialog')).not.toBeVisible();

  await firNumber.fill('2026010501');
  await reset.click();
  const dialog = page.locator('#caseResetConfirmDialog');
  await expect(dialog).toBeVisible();
  const keep = page.locator('#keepEditingButton');
  const confirm = page.locator('#confirmCaseResetButton');
  await expect.soft(keep).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.soft(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.soft(keep).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.soft(confirm).toBeFocused();
  await keep.click();
  await expect(dialog).not.toBeVisible();
  await expect(firNumber).toHaveValue('2026010501');
  await expect(reset).toBeFocused();

  await reset.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(firNumber).toHaveValue('2026010501');
  await expect(reset).toBeFocused();

  await openChargesheetEditor(page);
  await page.locator('#addWitness').click();
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1).fill('Synthetic Dynamic Witness');
  await reset.click();
  await expect(dialog).toBeVisible();
  await keep.click();
  await expect(page.locator('#witnessTableBody .witness-card')).toHaveCount(2);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toHaveValue('Synthetic Dynamic Witness');
  await reset.click();
  await confirm.click();
  await expect(firNumber).toHaveValue('');
  await expect(firNumber).toBeFocused();
  await expect(page.locator('#witnessTableBody .witness-card')).toHaveCount(1);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').first()).toHaveValue('');
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(0);
});

test('Reset confirmation keyboard focus is contained and restored to Reset', async ({ page }) => {
  const reset = page.locator('#caseForm button[type="reset"]');
  const firNumber = page.locator('#firno');
  const dialog = page.locator('#caseResetConfirmDialog');
  const keep = page.locator('#keepEditingButton');
  const confirm = page.locator('#confirmCaseResetButton');

  await firNumber.fill('2026010511');
  await reset.click();
  await expect(dialog).toBeVisible();
  await expect(keep).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(keep).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await keep.click();
  await expect(dialog).not.toBeVisible();
  await expect(firNumber).toHaveValue('2026010511');
  await expect(reset).toBeFocused();

  await reset.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(reset).toBeFocused();
});

test('date edits trigger confirmation and select values survive Keep Editing; Accused changes are detected', async ({ page }) => {
  const reset = page.locator('#caseForm button[type="reset"]');
  const date = page.locator('#firdate');
  const witnessStatus = page.locator('#witnessStatus1');
  const dialog = page.locator('#caseResetConfirmDialog');

  // The production markup loads Flatpickr from a CDN. Network access is blocked
  // by this isolated suite, so enable typing on the date field to exercise the
  // browser's trusted input/change dirty-state path without an external asset.
  await date.evaluate(element => { element.readOnly = false; });
  await date.fill('2026-01-05');
  await reset.click();
  await expect(dialog).toBeVisible();
  await page.locator('#keepEditingButton').click();
  await expect(date).toHaveValue('2026-01-05');

  await openChargesheetEditor(page);
  await witnessStatus.selectOption('chief');
  await expect(witnessStatus).toHaveValue('chief');
  await reset.click();
  await expect(dialog).toBeVisible();
  await page.locator('#keepEditingButton').click();
  await expect(witnessStatus).toHaveValue('chief');

  const accusedCards = page.locator('#accusedContainer .accused-card');
  await page.locator('#addAccused').click();
  await expect(accusedCards).toHaveCount(2);
  await reset.click();
  await expect(dialog).toBeVisible();
  await page.locator('#confirmCaseResetButton').click();
  await expect(accusedCards).toHaveCount(1);
});

test('select-only edit triggers Reset confirmation', async ({ page }) => {
  const syntheticExistingCase = {
    id: 'synthetic-select-only-reset',
    _collectionName: 'cases',
    recordType: 'lower',
    firNo: '2026000188',
    firYear: '2026',
    policeStation: 'Synthetic Test Station',
    status: 'UT',
    courtType: 'Lower Court',
    accused: [{ name: 'Select Test Accused', fatherName: '', mobile: '', address: '' }],
    witnesses: [{ name: 'Select Test Witness', status: 'pending', examined: false }]
  };
  await page.evaluate(item => window.openAddCaseModal(item), syntheticExistingCase);
  const witnessStatus = page.locator('#witnessStatus1');
  await expect(witnessStatus).toBeVisible();
  await expect(witnessStatus).toHaveValue('');
  await page.evaluate(() => {
    window.__caseTrackSelectResetEvents = [];
    ['input', 'change'].forEach(type => document.getElementById('caseForm').addEventListener(type, event => {
      if (event.target.id === 'witnessStatus1') {
        window.__caseTrackSelectResetEvents.push({ type: event.type, isTrusted: event.isTrusted, value: event.target.value });
      }
    }, true));
  });

  await witnessStatus.focus();
  await page.keyboard.press('c');
  await page.keyboard.press('Enter');
  await expect(witnessStatus).toHaveValue('chief');
  console.log('Select-only browser events:', await page.evaluate(() => window.__caseTrackSelectResetEvents));
  const reset = page.locator('#caseForm button[type="reset"]');
  await reset.click();
  await expect(page.locator('#caseResetConfirmDialog')).toBeVisible();
  await page.locator('#keepEditingButton').click();
  await expect(witnessStatus).toHaveValue('chief');
});

test('Reset Form clears dynamic Witness cards and in-memory case-record drafts', async ({ page }) => {
  await openChargesheetEditor(page);
  await page.locator('#addWitness').click();
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1).fill('Synthetic reset witness');
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(1);

  await page.locator('#firno').fill('2026010502');
  await page.locator('#caseForm button[type="reset"]').click();
  await page.locator('#confirmCaseResetButton').click();

  await expect(page.locator('#witnessTableBody .witness-card')).toHaveCount(1);
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(0);
});

test('confirmed Reset removes added Accused and Witness entries and supports repeat entry', async ({ page }) => {
  await openChargesheetEditor(page);
  const reset = page.locator('#caseForm button[type="reset"]');
  const dialog = page.locator('#caseResetConfirmDialog');
  const accusedCards = page.locator('#accusedContainer .accused-card');
  const witnessCards = page.locator('#witnessTableBody .witness-card');

  await page.locator('#addAccused').click();
  await page.locator('#addAccused').click();
  await page.locator('#accusedContainer input[name="accused_name[]"]').nth(1).fill('Synthetic Accused A');
  await page.locator('#accusedContainer input[name="accused_name[]"]').nth(2).fill('Synthetic Accused B');
  await page.locator('#addWitness').click();
  await page.locator('#addWitness').click();
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1).fill('Synthetic Witness A');
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(2).fill('Synthetic Witness B');

  await reset.click();
  await expect(dialog).toBeVisible();
  await page.locator('#confirmCaseResetButton').click();
  await expect(accusedCards).toHaveCount(1);
  await expect(witnessCards).toHaveCount(1);
  await expect(page.locator('#accusedContainer input[name="accused_name[]"]').first()).toHaveValue('');
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').first()).toHaveValue('');
  await expect(page.locator('#accusedContainer .accused-number span').first()).toHaveText('01');
  await expect(page.locator('#witnessTableBody .sr-no').first()).toHaveText('1');
  const associations = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#caseForm [id]')].map(element => element.id);
    const fields = [...document.querySelectorAll('#accusedContainer input[name="accused_name[]"], #witnessTableBody input[name="witness_name[]"]')];
    return {
      uniqueIds: ids.length === new Set(ids).size,
      labels: fields.every(field => [...document.querySelectorAll('label[for]')].some(label => label.htmlFor === field.id))
    };
  });
  expect(associations.uniqueIds).toBe(true);
  expect(associations.labels).toBe(true);

  await openChargesheetEditor(page);
  await page.locator('#addWitness').click();
  await page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1).fill('Synthetic New Entry After Reset');
  await reset.click();
  await page.locator('#confirmCaseResetButton').click();
  await expect(witnessCards).toHaveCount(1);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').first()).toHaveValue('');
});

test('confirmed Reset clears unsaved case-record and hearing drafts', async ({ page }) => {
  await openChargesheetEditor(page);
  const reset = page.locator('#caseForm button[type="reset"]');
  const date = page.locator('#nextDateStageDate');
  const existingHearingMirror = JSON.stringify({ syntheticExistingCase: { dateRecords: [] } });
  await page.evaluate(value => localStorage.setItem('register-diary-file-statuses', value), existingHearingMirror);

  await date.evaluate(element => { element.readOnly = false; });
  await date.fill('2099-12-31');
  await page.locator('#nextDateStageTrial').selectOption('App');
  await page.locator('#addHearingRecord').click();
  await expect(page.locator('#hearingRecordList .hearing-record-row')).toHaveCount(1);
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(1);

  await page.locator('#firno').fill('2026010599');
  await reset.click();
  await page.locator('#confirmCaseResetButton').click();
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(0);
  await expect(page.locator('#caseRecordDetails')).toBeHidden();
  await expect(page.locator('#hearingRecordList .hearing-record-row')).toHaveCount(0);
  await expect(date).toHaveValue('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('register-diary-file-statuses')))
    .toBe(existingHearingMirror);

  await reset.click();
  await expect(page.locator('#caseResetConfirmDialog')).not.toBeVisible();
  await openChargesheetEditor(page);
  await page.locator('#firno').fill('2026010503');
  await expect(page.locator('#caseRecordList .case-record-item')).toHaveCount(1);
});

test('Reset clears validation messages and invalid states from the form', async ({ page }) => {
  const form = page.locator('#caseForm');
  await form.evaluate(element => element.requestSubmit());
  await expect(page.locator('#firno')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#firno-error')).toHaveText('This field is required.');

  await page.locator('#firno').fill('2026010598');
  const reset = form.locator('button[type="reset"]');
  await reset.click();
  await page.locator('#confirmCaseResetButton').click();

  await expect(page.locator('#firno')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#firno-error')).toHaveCount(0);
  await expect(form.locator('.field-validation-message')).toHaveCount(0);
});

test('Cancel keeps its existing close behavior and edit-mode Reset restores the loaded baseline', async ({ page }) => {
  await page.locator('#firno').fill('2026000199');
  await page.locator('#cancelModal').click();
  await expect(page.locator('#caseModal')).not.toHaveClass(/show/);
  await openAddCase(page);

  const syntheticExistingCase = {
    id: 'synthetic-existing-case-reset',
    _collectionName: 'cases',
    recordType: 'lower',
    firNo: '2026000101',
    firYear: '2026',
    policeStation: 'Synthetic Test Station',
    status: 'UT',
    courtType: 'Lower Court',
    accused: [
      { name: 'Saved Accused One', fatherName: '', mobile: '', address: '' },
      { name: 'Saved Accused Two', fatherName: '', mobile: '', address: '' }
    ],
    witnesses: [
      { name: 'Saved Witness One', status: 'chief', examined: false },
      { name: 'Saved Witness Two', status: 'pending', examined: false }
    ]
  };
  await page.evaluate(item => window.openAddCaseModal(item), syntheticExistingCase);
  await expect(page.locator('#modalTitle')).toHaveText('Edit Case');
  await expect(page.locator('#accusedContainer .accused-card')).toHaveCount(2);
  await expect(page.locator('#witnessTableBody .witness-card')).toHaveCount(2);

  await page.locator('#firno').fill('2026000777');
  await page.locator('#addAccused').click();
  await page.locator('#addWitness').click();
  await page.locator('#caseForm button[type="reset"]').click();
  await page.locator('#confirmCaseResetButton').click();

  await expect(page.locator('#modalTitle')).toHaveText('Edit Case');
  await expect(page.locator('#caseForm')).toHaveAttribute('data-edit-id', syntheticExistingCase.id);
  await expect(page.locator('#firno')).toHaveValue('2026000101');
  await expect(page.locator('#accusedContainer .accused-card')).toHaveCount(2);
  await expect(page.locator('#accusedContainer input[name="accused_name[]"]').nth(0)).toHaveValue('Saved Accused One');
  await expect(page.locator('#accusedContainer input[name="accused_name[]"]').nth(1)).toHaveValue('Saved Accused Two');
  await expect(page.locator('#witnessTableBody .witness-card')).toHaveCount(2);
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(0)).toHaveValue('Saved Witness One');
  await expect(page.locator('#witnessTableBody input[name="witness_name[]"]').nth(1)).toHaveValue('Saved Witness Two');
  await expect(page.locator('#firno')).toBeFocused();
});

test('mobile action placement is singular and desktop action placement remains visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('#caseForm button[type="submit"]')).toHaveCount(1);
  await expect(page.locator('#cancelModal')).toHaveCount(1);
  await expect(page.locator('#caseForm button[type="submit"]')).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(page.locator('#caseForm button[type="submit"]')).toBeVisible();
  await expect(page.locator('#cancelModal')).toBeVisible();
});

test('320px keyboard navigation can reach Add Witness above the sticky action bar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openChargesheetEditor(page);
  await page.locator('#caseModal .case-section-nav a[href="#caseSectionWitness"]').click();

  const addWitness = page.locator('#addWitness');
  await page.locator('#witnessExamined1').focus();
  await page.keyboard.press('Tab');
  await expect(addWitness).toBeFocused();

  const bounds = await page.evaluate(() => {
    const button = document.querySelector('#addWitness').getBoundingClientRect();
    const actions = document.querySelector('#caseModal #caseForm > .modal-footer').getBoundingClientRect();
    return {
      buttonBottom: button.bottom,
      actionsTop: actions.top,
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth
    };
  });
  expect(bounds.buttonBottom).toBeLessThanOrEqual(bounds.actionsTop);
  expect(bounds.documentWidth).toBeLessThanOrEqual(320);
  await page.locator('#caseModal').screenshot({
    path: testInfo.outputPath('mobile-witness-add-control-above-sticky-actions.png'),
    animations: 'disabled'
  });
});

for (const width of [320, 375, 430, 768, 780]) {
  test(`${width}px Witness add control scrolls above the sticky footer without nav clipping`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 760 });
    await openChargesheetEditor(page);
    const nav = page.locator('#caseModal .case-section-nav');
    const navLinks = nav.locator('a:visible');
    const navBounds = await nav.boundingBox();
    const linkBounds = await navLinks.evaluateAll(links => links.map(link => {
      const rect = link.getBoundingClientRect();
      return { left: rect.left, right: rect.right, text: link.innerText.trim() };
    }));
    expect(linkBounds.length).toBeGreaterThan(1);
    expect(linkBounds.every(link => link.left >= navBounds.x - 1 && link.right <= navBounds.x + navBounds.width + 1)).toBe(true);
    expect(await nav.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await nav.evaluate(element => element.clientWidth));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const witnessLink = nav.locator('a[href="#caseSectionWitness"]');
    await witnessLink.click();
    await expect(witnessLink).toHaveAttribute('aria-current', 'location');
    const witnessHeadingTop = await page.locator('#caseSectionWitness').evaluate(element => element.getBoundingClientRect().top);
    const navBottom = await nav.evaluate(element => element.getBoundingClientRect().bottom);
    expect(witnessHeadingTop).toBeGreaterThanOrEqual(navBottom - 1);
    const addWitness = page.locator('#addWitness');
    await addWitness.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const clearance = await page.evaluate(() => {
      const button = document.querySelector('#addWitness').getBoundingClientRect();
      const footer = document.querySelector('#caseForm > .modal-footer').getBoundingClientRect();
      return { buttonTop: button.top, buttonBottom: button.bottom, footerTop: footer.top, viewportHeight: innerHeight };
    });
    expect(clearance.buttonTop).toBeGreaterThanOrEqual(0);
    expect(clearance.buttonBottom).toBeLessThanOrEqual(clearance.footerTop);
    await page.locator('#caseModal').screenshot({ path: testInfo.outputPath(`phase-5h-${width}-witness-scroll.png`), animations: 'disabled' });
  });
}
