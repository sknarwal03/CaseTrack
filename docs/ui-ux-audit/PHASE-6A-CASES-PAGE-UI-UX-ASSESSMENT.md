# Phase 6A — Cases Page & Nested Dialogs UI/UX Assessment

**Date:** 18 November 2026  
**Status:** Assessment complete; no application UI was changed. UX-003 remains **High · Open**.

## Executive summary

The existing Cases, Case Details, Edit Case, and Add/Edit IO components were inspected and exercised in Chromium against the isolated Playwright environment. The tests used a temporary browser-only synthetic case row and did not write or save a case. Full viewport/theme captures and 80 axe scans completed. The current custom-modal focus paths passed the synthetic route checks, including Escape ordering and focus restoration. The assessment also confirmed actionable accessibility and responsive issues:

1. **Critical ARIA:** shared profile dropdown `.profile-dropdown` exposes `role="menu"` but contains ordinary buttons, which axe rejects under `aria-required-children`.
2. **Keyboard sorting:** the five clickable Cases table sort headers are plain `<th>` elements with click handlers only. They are not keyboard-focusable and have no keyboard activation handler.
3. **Case Details keyboard scrolling:** `.detail-modal-body` is vertically scrollable but not focusable, reported by axe as `scrollable-region-focusable`.
4. **Contrast:** axe reports serious text contrast failures across the Cases route, shared modal content, and embedded Add Case.
5. **Mobile Case Details clipping:** at 320px, the three-part `.detail-header-card` layout clips the right-side Next Date/Trial Stage label and value inside the modal.
6. **Accessible name mismatch:** the shared `.brand` element fails axe `label-content-name-mismatch` because visible text is not included in its computed accessible name.

No focus-management defect was reproduced in the tested current component paths. UX-003 remains open because the case row and record were synthetic browser data; authenticated persisted record loading, the normal data-backed route path, and a complete keyboard audit of every control remain unverified.

## Scope and test setup

- **Route:** `http://127.0.0.1:5185/CaseTrack/pages/cases.html`
- **Browser:** Chromium through the existing Playwright setup.
- **Environment:** existing `demo-casetrack-date-regression` Auth/Firestore emulators, synthetic test operator, local-only network guard, and disabled callable Functions stub.
- **Viewports:** 320, 375, 430, 768, 780, 1024, 1366, and 1920 px.
- **Themes:** light and dark.
- **Synthetic record:** test-only `fir_master` object and table row injected in browser memory to activate the real exported Case Details module and the existing Edit Case button handler. It was not inserted into Firestore or submitted.
- **Nested IO setup:** the isolated environment had no IO register data. The test modeled the enabled empty-register state in memory and activated the real Add/Manage IO button handler; the native IO dialog itself and the host modal were real current components.

The full run captured five meaningful states at each viewport/theme pair: Cases page, Case Details, Edit Case, Add Case validation errors, and nested Add IO. Both theme runs completed all eight viewport widths. The two Playwright tests ended FAIL because the newly asserted sortable-header keyboard defect reproduced at every width in each theme; all other scripted interaction checks passed and there were no page errors. No test submitted a case or IO record. No production Firebase configuration, business logic, or application source was modified.

## Current implementation findings

### Cases page hierarchy, search, filters, and table

- The page has a clear Case Management hero, a toolbar with Export/Add Case, a Registered Cases panel, five status filters, a live total count, and a six-column table. The shared top bar provides the global FIR/complainant search.
- On mobile, the filters wrap into multiple rows and remain visible. The table keeps an 820px minimum width within a horizontally scrollable, keyboard-focusable region labelled “All Cases table; scroll horizontally to view all columns.”
- Measured page document width equaled the viewport width in all 16 viewport/theme combinations. Narrow screens therefore require horizontal panning within the table region, but do not create page-level horizontal overflow.
- The test environment supplied no persisted case rows. A browser-only row was added only to open the actual Case Details/Edit path. The captures of the initial route show zero records and cannot establish real authorized-data filtering, sorting, or row-action rendering.
- **Confirmed keyboard defect:** `pages/cases.html` uses five `<th class="sortable" data-sort=...>` headers. `assets/js/cases.js` binds only `click` handlers. The headers have no `tabindex`, button/link child, button role, or key handler. The final full-matrix keyboard probe confirmed the headers are not keyboard reachable at all eight widths in both themes. Both theme tests report this failure; the other modal focus checks passed.
- The FIR number trigger in generated rows is also a clickable `<strong>`, not a native control. The separate View and Edit action buttons provide alternate controls, but keyboard behavior should be preserved and tested when the actual row renderer is available.

### Case Details and Edit Case

- `#caseDetailsModal` is a custom modal with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="caseDetailsTitle"`. The `setupModal()` configuration in `assets/js/cases.js` requests initial focus on the Close button, uses the active case filter as fallback, and routes Escape through `modalHelper.closeModal()`.
- The dynamic header adds Share and Edit Case buttons. Edit Case closes Details and opens the existing Add/Edit Case modal; the two custom dialogs are serial rather than simultaneously stacked.
- The Add/Edit modal uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="modalTitle"`; the synthetic route opened it through the actual Edit Case button and showed the expected Edit Case title.
- **Confirmed mobile clipping:** at 320px, the detail summary card retains its horizontal three-part layout. The right-side Next Date/Trial Stage content is clipped by the card/modal. The [320px light Details screenshot](evidence/phase-6a/details-320-light.png) shows the clipped label and value. The page itself still has no horizontal overflow.
- Axe reports `.detail-modal-body` under `scrollable-region-focusable`: it has `overflow-y: auto` but no focusability. Keyboard focus remained contained in the modal during tested Tab/Shift+Tab sequences, but the scroll region itself cannot receive focus to provide a direct keyboard scroll target.

### Nested Add/Edit IO dialog

- Add/Edit IO is a native `<dialog id="ioDialog" aria-labelledby="ioDialogTitle">` opened with `showModal()`. Its own Escape handler stops propagation so the host dialog should remain open on the first Escape.
- The browser interaction check confirmed: focus entered the IO dialog; the IO dialog closed on Escape while Add Case stayed open; a second Escape closed Add Case and restored focus to its launcher. Tab and Shift+Tab remained inside the native dialog during the full matrix run.
- The [320px nested IO screenshot](evidence/phase-6a/nested-io-320-light.png) shows the native IO dialog fitting within the viewport with Cancel and Save IO visible. This screenshot was captured during a synthetic Edit Case host pass; the final full matrix also tested the same native dialog under Add Case.
- The IO register data path could not be verified because the isolated setup does not seed authorized station officers. No IO was saved.

## Accessibility scan results

The assessment used `axe-core` via `@axe-core/playwright`, with default enabled rules and no disabled checks. It scanned the full page/modal tree for 5 states × 8 widths × 2 themes: **80 scans**. The full scan completed; **64 scans contained violations**. Aggregate node counts below are scan occurrences, not counts of distinct source elements.

| Impact | Rule ID | Exact target(s) | Result / reproduction |
|---|---|---|---|
| Critical | `aria-required-children` | `.profile-dropdown` | Present in Cases page, Case Details, Edit Case, and validation states. The element has `role="menu"` but contains `button` children without menuitem roles. Open the Cases route with the synthetic operator and scan; axe reports “Element has children which are not allowed: button.” 64 node occurrences (32 in each theme). |
| Serious | `color-contrast` | `#detailStatusBadge`, `a[href$="#caseSectionFir"]`, `a[href$="#caseSectionComplaint"]`, `label[for="fir_Status"]`, `#firno-error`, `.case-record-options > .section-header > .section-icon`, `#addPoliceReport` | Occurs in Details/Edit/validation states. Light examples: `#detailStatusBadge` **1.27:1**, active section links **3.53:1**, `fir_Status` label **3.98:1**, validation errors **3.96:1**, section icon **3.34:1**, Add Police Report **4.28:1**. Dark examples: validation errors **4.37:1**, section icon **3.62:1**, Add Police Report **3.77:1**. Axe’s expected ratio is 4.5:1 for these text styles. **118 node occurrences** in this final run (74 light, 44 dark); validation errors account for four required fields per validation scan. |
| Serious | `scrollable-region-focusable` | `.detail-modal-body` | Reproduces in all Case Details viewport/theme combinations. The vertical scroll area is not focusable. 16 node occurrences. |
| Serious | `label-content-name-mismatch` | `.brand` | Present in Cases page, Details, Edit, and validation states. Visible text is not included in the element’s computed accessible name. 24 node occurrences. |

The native/custom dialog roles, names, and title references did not produce axe dialog-name violations. The test also measured duplicate IDs across each page/dialog state and found none. Full per-scan selectors and failure summaries are in [phase6a-light-assessment.json](evidence/phase-6a/phase6a-light-assessment.json) and [phase6a-dark-assessment.json](evidence/phase-6a/phase6a-dark-assessment.json).

### Keyboard and dialog interaction results

| Check | Result |
|---|---|
| Case Details opens and receives initial focus | PASS across full viewport/theme matrix |
| Case Details role, modal state, and heading reference | PASS |
| Programmatic attempt to focus background search while Details is open | PASS — focus is redirected into the open modal |
| Case Details Escape close and focus return to synthetic row trigger | PASS |
| Edit Case opens from Details; title and initial focus | PASS |
| Edit Case Escape and focus return to row trigger | PASS |
| Native IO initial focus, title reference, Escape ownership, and host preservation | PASS |
| Tab/Shift+Tab containment in Details, Edit Case, and native IO dialog | PASS across all eight widths in both themes |
| Sortable table headers reachable by keyboard | **FAIL** — the five `<th>` controls have click-only behavior |
| Form required-field validation and error association | PASS in clean Add Case mode: blank FIR Number receives `aria-invalid="true"` and an `aria-describedby` reference to the visible “This field is required.” message |
| Duplicate IDs | PASS — none found in measured states |
| Page-level horizontal overflow | PASS — document width equals viewport width in all 16 matrix combinations |

The synthetic Edit Case record was not present in the emulator. Its submit path attempts to load linked records before reaching form validation, so the validation check was performed on a clean Add Case form. No edit/save payload behavior was tested.

The final full matrix Playwright run reports **2 failed theme tests** because the five sortable headers are not keyboard reachable. Each theme records this defect at all eight widths (16 width/theme findings total); no uncaught browser page errors were observed. The complete final run evidence, including all 80 axe scans, is preserved in [light results](evidence/phase-6a/phase6a-light-assessment.json) and [dark results](evidence/phase-6a/phase6a-dark-assessment.json). Earlier focused keyboard-only evidence is also retained in [light keyboard results](evidence/phase-6a/phase6a-light-assessment-keyboard.json) and [dark keyboard results](evidence/phase-6a/phase6a-dark-assessment-keyboard.json).

## Screenshots

Twenty actual Chromium screenshots are preserved in `docs/ui-ux-audit/evidence/phase-6a/`: Cases page, Details, Edit Case, Add Case validation, and nested IO at 320px and 1366px in light and dark themes. Selected captures:

- [Cases page, 320px light](evidence/phase-6a/page-320-light.png)
- [Cases page, 1366px dark](evidence/phase-6a/page-1366-dark.png)
- [Case Details, 320px light — clipped summary content](evidence/phase-6a/details-320-light.png)
- [Case Details, 1366px light](evidence/phase-6a/details-1366-light.png)
- [Edit Case, 320px dark](evidence/phase-6a/edit-320-dark.png)
- [Add Case validation, 320px light](evidence/phase-6a/validation-320-light.png)
- [Nested IO, 320px light](evidence/phase-6a/nested-io-320-light.png)

Screenshots use synthetic values and are evidence only; no visual baseline was approved.

## Severity, priority, and proposed improvements

### P1 — Accessibility blockers

1. **Correct the shared profile dropdown semantics** (`aria-required-children`, Critical). Either provide valid menu/menuitem semantics and required keyboard behavior or use ordinary disclosure/popover semantics appropriate to the existing buttons. Avoid adding menu roles without implementing their interaction model.
2. **Make all sortable table headers keyboard-operable.** Use native buttons inside headers (or equivalent keyboard semantics), preserve the existing sort mappings, and expose correct `aria-sort` state. Keep column widths and horizontal scroll behavior unchanged.
3. **Make the Case Details scroll container keyboard accessible.** Add an appropriate focus target and visible focus style to `.detail-modal-body`; verify arrow/page-key scrolling while preserving modal focus containment.

### P1/P2 — Readability and responsive layout

4. **Fix contrast** for the Details status badge, section navigation, labels/errors, section icons, and Add Police Report control. Use existing CaseTrack theme tokens and verify computed ratios in both themes; do not change status meanings.
5. **Reflow the Case Details summary card at narrow widths.** Stack or wrap FIR number, status, and next-date/stage content at mobile widths so long values remain visible. Keep desktop presentation stable.
6. **Align `.brand` visible and accessible names.** Preserve the current brand text while ensuring the computed name includes what users see.

### Verification batch after implementation

7. Retest current Cases route with an approved synthetic persisted record fixture so the production table renderer, search/filter/sort mappings, View/Edit buttons, and linked edit data can be exercised. Preserve the Functions stub and test rules; do not loosen the safety boundary merely to create a test record.
8. Rerun the 80-state axe matrix or equivalent full route/state coverage, the eight-width/two-theme layout matrix, keyboard-only sort and dialog checks, unit/build/syntax checks, and review fresh screenshots. Manually verify screen-reader announcements if a supported screen reader becomes available.

## UX-003 status and remaining verification

**UX-003 remains High · Open. Do not close.** The current synthetic browser route verified Case Details focus entry, close/Escape behavior, background focus redirection, focus restoration, Edit Case transition, native IO Escape ownership, and Tab/Shift+Tab containment at representative widths. The authenticated route’s real record row, actual data-backed Edit Case loading, dynamic controls, permission-scoped data, and screen-reader output remain unverified. The new axe findings and table keyboard gap also need owner triage; the Cases page must not be represented as fully accessible.

## Phase 5I Add Case items retained in the issue register

The master issue register now explicitly retains all outstanding UX-002 items:

- Critical ARIA violation.
- Serious contrast failures.
- Manual screen-reader verification.
- Isolated persistence round-trip blocked by the disabled `saveFirMaster` callable.
- Owner visual approval pending.

UX-002 remains High · Open. The register addendum is recorded in `MASTER-UI-UX-ISSUE-REGISTER.md`; Phase 5I evidence remains unchanged.

## Changed files and boundaries

- `e2e/playwright/phase6a-cases-assessment.spec.js` — assessment-only browser harness for the Cases route, modal flow, screenshots, axe, and keyboard checks.
- `docs/ui-ux-audit/PHASE-6A-CASES-PAGE-UI-UX-ASSESSMENT.md` — this report and implementation plan.
- `docs/ui-ux-audit/MASTER-UI-UX-ISSUE-REGISTER.md` — appended Phase 5I outstanding UX-002 acceptance items.
- `docs/ui-ux-audit/evidence/phase-6a/` — scan JSON, keyboard result JSON, and 20 actual browser screenshots.

No application source, Firebase configuration, business logic, production data, or visual baseline was changed. No deployment, push, or merge was performed.

**Stop for owner approval before implementation. UX-002 and UX-003 remain open.**
