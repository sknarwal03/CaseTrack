# CaseTrack — Phase 5G Add Case Final Acceptance

**Date:** 2026-11-18  
**Overall result:** **PARTIAL — UX-002 remains open.**  
**Scope:** Acceptance verification only. No application source fixes were made.

## Environment and safety

- Playwright Test 1.64.1, Chromium, and the permanent isolated setup documented in `docs/testing/CASETRACK-PERMANENT-BROWSER-TESTING-SETUP.md`.
- Route: `http://127.0.0.1:5185/CaseTrack/pages/cases.html`.
- Auth and Firestore used only local emulators (`127.0.0.1:9099`, `127.0.0.1:8080`) with a randomly generated synthetic `@example.test` account and synthetic form fixtures.
- Browser network guard restricted requests to the local Vite app and emulators. No production Firebase operation, real case save, or external write was performed.
- Firebase emulator startup and a recurring Firestore WebChannel `unavailable` warning were observed; the covered tests completed successfully despite the warning.

## Acceptance results

| Criterion | Result | Evidence / limit |
|---|---|---|
| Add Case section link reaches target; active marker updates after click/manual scroll; hidden UCR section stays out of navigation; Enter activates link | PASS | `e2e/playwright/add-case.spec.js`; browser interaction suite. |
| Witness Add/Remove, retained values, numbering, unique IDs/labels, accessible Remove name, focus after add/remove, non-removable original | PASS | Dynamic synthetic rows verified in Chromium. |
| Accused dynamic add/reset, numbering and unique IDs/labels | PARTIAL | Reset test verifies removal, first-entry number, unique form IDs and associated name labels. Runtime checks do not validate every cloned Accused field/Remove accessible name. Source has no semantic group around Accused cards. |
| Reset pristine, dirty, Keep Editing, confirmed Reset, Escape, focus containment/return, validation clearing, repeat operation | PASS | Playwright interactions verify synthetic create/edit flows and focus. |
| Reset removes unsaved dynamic Accused/Witness rows and case/hearing draft state; preserves unrelated Register Diary mirror; edit mode restores loaded baseline | PASS | Isolated synthetic fixtures; no Save submitted. |
| Save/Cancel controls remain singular; Cancel closes as before; Save path not submitted | PASS / PARTIAL | One submit and one Cancel control plus Cancel close behavior verified. No case was submitted; persistence mapping was not re-exercised by an actual save. |
| Sticky footer and focused keyboard access to Witness Add control at 320 px | PARTIAL | Tab navigation scrolls the focused Add Witness button above the action bar. At the normal Witness viewport, the Add Another Witness control is visibly clipped/covered by the sticky footer (see 320 px captures); controls should not require focus just to become visible. |
| Visual matrix: 320, 375, 430, 768, 780, 1024, 1366, 1920 px × light/dark | PASS for automated geometry / PARTIAL for visual acceptance | 16/16 Chromium captures and assertions passed: theme applied, no document horizontal overflow, card stays inside viewport, target heading and active nav item visible. Visual review found sticky footer overlap at mobile and left-clipped section-nav labels after auto-scroll to Witness. See Visual Baseline Review. |
| Visible required indicators | FAIL | Required controls retain native `required`, but visible labels do not mark “Required”; Phase 5C approved spec asks for textual visible indication. No changes made. |
| Error associations and invalid-state clearing | PASS for exercised base field | `#firno` error gets `aria-invalid` and linked inline message; confirmed Reset clears both. This does not prove every conditional field/error path. |
| Accessible Witness group | PASS | Witness entries use `fieldset`/`legend`; dynamic accessible numbering/name verified. |
| Accessible Accused group | FAIL | Accused entries are `.accused-card` `<div>` elements with a visual ordinal but no fieldset/legend or equivalent `role=group`/`aria-labelledby`. |
| Reset confirmation dialog semantics and keyboard focus | PASS | Named/description-associated dialog; initial focus, Tab/Shift+Tab containment, Escape, Keep Editing, and return to Reset covered by browser tests. |
| Screen reader / full accessibility scan / contrast | BLOCKED | `axe-core` and `@axe-core/playwright` are not installed; NVDA executable and running Narrator were unavailable. No screen-reader or automated WCAG/contrast scan is claimed. |
| Authenticated production behavior | BLOCKED | Intentionally not accessed. Emulator account/session only. |
| Save payload mapping and persisted Add/Edit round trip | BLOCKED | No form submitted per safety scope. Source and previous phase compatibility checks remain evidence, but Phase 5G did not perform a persistence round trip. |

## Tests and checks

- `npm run test:e2e:interaction`: **13 passed, 0 failed**. Includes dedicated select-only Reset case.
- `npm run test:visual`: **16 passed, 0 failed** across all eight widths in both themes.
- `npm test`: **60 passed, 0 failed, 0 skipped**.
- `node --check components/add-case/add-case.js`: passed.
- `node --check e2e/playwright/add-case.spec.js`: passed.
- `node --check e2e/playwright/visual-matrix.spec.js`: passed.
- `npm run build`: passed; Vite emitted its existing advisory about large minified chunks.
- `git diff --check`: passed.

The dedicated select-only regression test edits only a synthetic existing-case fixture: with the edit baseline pristine, keyboard typeahead changes Witness Status to “Chief,” trusted input/change events are observed, Reset opens the confirmation, and Keep Editing retains the selection. It does not submit the record.

## Visual evidence

Sixteen real Chromium screenshots are stored in `docs/ui-ux-audit/evidence/phase-5g/`. Two 320 px captures make the sticky footer overlap visible: [light](evidence/phase-5g/add-case-320-light.png), [dark](evidence/phase-5g/add-case-320-dark.png). At 375 px the section strip is horizontally scrolled and its leftmost label is clipped: [light](evidence/phase-5g/add-case-375-light.png). All image files in the evidence folder are actual test browser screenshots, not generated mockups.

## Changed files

- `e2e/playwright/add-case.spec.js` — dedicated select-only edit-mode dirty-state acceptance test.
- `docs/ui-ux-audit/evidence/phase-5g/` — 16 visual captures and the preserved earlier select-only failure screenshot/trace.
- This acceptance report, the visual baseline review, and a dated UX-002 tracker update.

No application HTML, CSS, JavaScript, data mapping, Firebase, or backend source was changed in Phase 5G.

## Remaining issues and closure

1. Sticky action bar obscures part of the Add Another Witness control in the normal mobile viewport.
2. Section navigation auto-scroll leaves a clipped left label and gives a weak visual scroll cue at narrow widths.
3. Add Case required fields have no visible textual required indicator.
4. Accused repeated entries lack a semantic named group.
5. Real screen-reader, contrast, and production-authenticated checks remain unverified.
6. Save payload was not submitted or round-tripped in this acceptance run.

**UX-002 is not closed.** Recommended next work: owner review this acceptance; then approve targeted corrections for the mobile action overlap, required indicators and Accused group semantics, followed by screen-reader/contrast and isolated persistence round-trip verification.
