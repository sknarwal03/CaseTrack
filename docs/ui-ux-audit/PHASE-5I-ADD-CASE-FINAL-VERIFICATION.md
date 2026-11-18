# CaseTrack — Phase 5I Add Case Final Verification

**Date:** 18 November 2026  
**Scope:** Final planned Add Case accessibility, data integrity, and handover verification. No application-source changes were made in this phase.

## Outcome

The existing Add Case interaction and responsive suites pass. Unit tests, syntax checks, production build, and `git diff --check` pass. Automated accessibility scans do **not** pass: axe found a critical ARIA misuse and serious contrast violations. A supported screen reader was not available for audible/manual verification. The requested persistence round-trip could not be performed because the approved isolated test setup deliberately disables the `saveFirMaster` callable used by Add Case.

**UX-002 remains open. Do not recommend closure yet.** The axe findings are confirmed defects that need owner review and a targeted remediation phase; screen-reader verification, a safe callable-enabled emulator round-trip, and owner visual acceptance also remain outstanding. This report does not modify application behavior or automatically approve visual baselines.

## Review and preserved implementation

Reviewed the Phase 5H implementation report, UX-002 issue register entry, existing Playwright setup/specs, Add Case source, and Firebase emulator isolation configuration. The Phase 5H behavior remains in place: sticky section navigation and active indication, mobile footer clearance, Witness cards, semantic Accused groups, visible indicators for existing required fields, Reset confirmation/state restoration, and keyboard focus handling.

This phase added axe as a development-only dependency and an accessibility Playwright spec. It did not alter application HTML, CSS, JavaScript, Firebase configuration, business rules, or saved data mappings. No production endpoint or data was accessed.

## Automated accessibility

Added `axe-core` (`^4.14.1`) and `@axe-core/playwright` (`^4.14.0`) as development dependencies. The new `e2e/playwright/accessibility.spec.js` runs axe's default enabled rules scoped to `#caseModal`, with no disabled rules or excluded findings.

| Dimension | Coverage |
|---|---|
| Themes | Light, dark |
| Viewports | 320 px, 1366 px |
| States | Initial, validation errors, dynamic Accused, dynamic Witness, Reset confirmation dialog |
| Total scans | 20 |

**Result: FAIL.** Both theme tests failed as intended because violations were found. 15 of 20 scans contain violations. Across the scan results axe reported 8 critical-impact nodes and 43 serious-impact nodes (grouped into 13 serious violation instances). Findings include:

- **Critical ARIA:** `#regprefix` uses `aria-expanded="false"` although its current role does not support that attribute. This repeats in dynamic Accused/Witness states across themes and viewports.
- **Serious contrast:** Light theme examples include the active section link at 3.53:1, `label[for="fir_Status"]` at 3.98:1, and validation messages at 3.96:1 against white; required text contrast is 4.5:1 for these text sizes.
- **Serious contrast:** Dark theme examples include validation messages at 4.37:1, Accused/Witness labels and legends at 4.15:1, and the Reset confirmation action at 4.09:1.

The exact per-scan violation IDs, targets, and axe failure summaries are in [axe-accessibility-results.json](evidence/phase-5i/axe-accessibility-results.json). These are actual findings from the running isolated browser, not static inspection. The combined results intentionally remain failing; no rule was weakened to get a green run.

The `npm install` operation reported 30 dependency audit findings in the full dependency tree (16 high, 14 moderate, zero critical). No `npm audit fix` was run. Those counts are not attributed specifically to the two axe packages; they should be reviewed separately before a later dependency update.

## Screen-reader verification

**Status: BLOCKED — manual audible verification not performed.** NVDA is not installed/discoverable. Windows Narrator is present, but it was not running and this environment cannot hear or validate its spoken output. DOM semantics and axe results are not substitutes for screen-reader testing.

Manual checklist for an owner/tester with a supported screen reader:

1. Navigate the Add Case section links and confirm section names/current-section announcements.
2. Add Accused and Witness entries; confirm each group and sequential legend/name is announced.
3. Confirm existing required inputs announce their required state.
4. Submit invalid data and confirm each message is associated with and announced for its input.
5. Open Reset confirmation and verify dialog name/description, initial focus, Tab and Shift+Tab containment, Escape dismissal, and focus restoration after Keep Editing and Reset Form.

## Synthetic persistence round-trip

**Status: BLOCKED before the first save; no Create → Save → Reload → View → Edit → Save → Reload round-trip was claimed or attempted.**

The existing permanent Playwright isolation starts only Auth and Firestore emulators, uses `demo-casetrack-date-regression`, and explicitly disables callable functions through `vite.e2e.config.js` and `e2e/fixtures/firebase-functions.test.js`. Add Case uses the `saveFirMaster` callable (`assets/js/fir-case-model.js`) for the FIR master save. The test Firestore rules also deny direct `firMasters` create/update/delete. Therefore the approved test app cannot execute the real Add Case persistence path. Enabling a callable or loosening rules would bypass the current fail-closed test boundary; this phase did not do so. No real or synthetic case record was persisted, and no production Firebase write occurred.

To complete this evidence later, provide an approved, isolated callable-capable emulator environment for `saveFirMaster` with test-only credentials/data and confirmed Auth/Firestore/Functions emulator routing. Then compare synthetic values after reload for FIR/complaint, linked case records, court registration, hearings, Accused, Witnesses, applicable UCR data, status/date mappings, and Register Diary behavior, including the supported edit-mode path. If Register Diary persistence is separate from the Add Case callable, exercise and verify it independently in that same isolated environment.

## Browser regression and responsive results

| Check | Result | Evidence |
|---|---|---|
| Existing Add Case Playwright interaction suite | **PASS — 21 passed** | `npm run test:e2e:interaction`; includes section navigation, dynamic entries, Reset, validation, focus, keyboard, sticky footer, and the 780 px breakpoint |
| Existing responsive visual matrix | **PASS — 16 passed** | `npm run test:visual`; eight widths (320, 375, 430, 768, 780, 1024, 1366, 1920 px) × light/dark; geometry, no page overflow, navigation reachability/current marker, required indicators, Accused/Witness layout, and footer clearance assertions |
| Visual baseline approval | **Not performed** | Test captures were not used to update/approve baselines |
| Unit tests | **PASS — 60 passed, 0 failed** | `npm test` |
| Production build | **PASS** | `npm run build`; completed with the existing large-chunk-size advisory |
| Syntax checks | **PASS** | `node --check e2e/playwright/accessibility.spec.js`; `node --check components/add-case/add-case.js` |
| Whitespace/error check | **PASS** | `git diff --check`; Git emitted only a line-ending normalization notice for the already modified issue register |
| Axe accessibility | **FAIL** | 20 scans; see findings and evidence above |
| Persistence round-trip | **BLOCKED** | Existing isolated test setup disables the required callable |
| Manual screen reader | **BLOCKED** | No NVDA; Narrator output could not be heard/verified |

The Playwright emulator runs used synthetic test authentication and demo IDs. The current app's callable stub prevents case persistence; no case was saved. Firestore connection warnings for unrelated page listeners appeared during browser runs, but the interaction/responsive assertions completed successfully.

Representative real browser captures from the responsive run are preserved here:

- [320 px light initial form](evidence/phase-5i/add-case-320-light.png)
- [320 px dark initial form](evidence/phase-5i/add-case-320-dark.png)
- [320 px light Accused group](evidence/phase-5i/add-case-accused-320-light.png)
- [320 px light required-field indicators](evidence/phase-5i/add-case-required-320-light.png)
- [320 px light Witness button/footer clearance](evidence/phase-5i/add-case-witness-footer-clear-320-light.png)
- [1366 px light initial form](evidence/phase-5i/add-case-1366-light.png)
- [1366 px dark initial form](evidence/phase-5i/add-case-1366-dark.png)

## Files changed in this phase

- `package.json`, `package-lock.json` — development-only axe packages.
- `e2e/playwright/accessibility.spec.js` — strict multi-state, two-theme axe scans.
- `docs/ui-ux-audit/PHASE-5I-ADD-CASE-FINAL-VERIFICATION.md` — this report.
- `docs/ui-ux-audit/evidence/phase-5i/` — detailed scan JSON and selected actual responsive screenshots.

Pre-existing worktree changes from earlier phases were preserved. No Add Case application source was changed in Phase 5I.

## Remaining issues and UX-002 recommendation

**Recommendation: keep UX-002 open; do not mark it fully verified or closed.**

- Critical invalid ARIA attribute on `#regprefix` requires a narrowly scoped follow-up fix and regression scan.
- Serious text contrast violations remain in section navigation, labels, inline validation, dynamic Accused/Witness semantics, and Reset dialog action styling.
- Screen-reader announcements and focus workflow require manual verification with audible output.
- Synthetic persistence and edit round-trip, including Register Diary consistency, require a callable-enabled isolated emulator path that preserves production/test separation.
- Owner visual review remains pending; screenshots are supplied but no visual baseline was approved automatically.

### Owner acceptance checklist

- [ ] Review the axe findings and approve targeted ARIA/contrast corrections.
- [ ] After remediation, rerun all 20 axe scans and resolve or explicitly accept each remaining finding.
- [ ] Complete the screen-reader checklist with NVDA or another supported screen reader and record the actual spoken results.
- [ ] Approve a safe isolated `saveFirMaster` emulator setup and complete the synthetic create/reload/view/edit/reload workflow.
- [ ] Review the responsive captures and approve the visual result.
- [ ] Update UX-002 status only after mandatory acceptance evidence is complete.

## Next CaseTrack UI/UX screen

Continue with **Cases → Case Details and nested Add/Edit IO modal workflow (UX-003)**, the next high-priority issue identified by the project-wide audit after Add Case. Focus the next increment on real authenticated-route integration verification: initial focus, dialog naming and semantics, Tab/Shift+Tab containment, background focus, Escape ownership for nested dialogs, close-button focus restoration, and repeat open/close cycles. Preserve existing record relationships and avoid revisiting already verified source behavior without a reproduced failure.

**Phase 5I stops here for owner review. No subsequent Add Case implementation phase has been started.**
