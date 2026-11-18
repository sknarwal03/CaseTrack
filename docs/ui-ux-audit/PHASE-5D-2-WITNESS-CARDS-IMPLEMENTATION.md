# CaseTrack — Phase 5D-2: Responsive Witness Cards Implementation

**Status:** Witness card conversion implemented; interactive and rendered verification are blocked by unavailable browser tooling. UX-002 remains open. Stop here pending owner review.

## Before and after

- **Before:** Witness entries were table rows inside a 650 px minimum-width table, with horizontal panning needed to reach fields at narrow widths. The table headings supplied the visual labels.
- **After:** Each entry is a semantic `fieldset` with a numbered `legend` and visible labels. Witness entries form a responsive card grid; fields use two columns when room permits and one column on narrow screens. The section no longer requires a horizontal table scroll region.

The original Witness card still has no Remove control. Dynamically added cards keep their contextual accessible Remove names. No fields or validation requirements were added.

## Files changed

- `components/add-case/add-case.html` — replaced the Witness table with the `#witnessTableBody.witness-cards` container and a labeled `fieldset.witness-card` template. Retained all four controls, IDs, names, classes, values, and initial disabled state.
- `components/add-case/add-case.js` — changed the Witness collection selectors used by reset, edit hydration, counting, cloning, removal, and serial numbering from table rows to `.witness-card`; dynamic Remove buttons now show “Remove”. Existing focus, ID assignment, row numbering, count, date-picker, and conditional date behavior remain in place.
- `components/add-case/add-case.css` — replaced table sizing with responsive card and field grids, theme-token surfaces, wrapped labels/errors, and touch-sized inputs and Remove buttons. Existing CaseTrack theme tokens cover light and dark surfaces.
- `docs/ui-ux-audit/PHASE-5D-2-WITNESS-CARDS-IMPLEMENTATION.md` — this implementation and verification record.

Existing unrelated and earlier Phase 5B/5D-1 worktree changes were preserved. This phase did not edit `assets/js/proceeding-fields.mjs`, backend code, Firebase, or other pages.

## Selector and data-mapping compatibility

The Witness DOM selectors that depended on `tbody tr` were identified in:

- `resetCaseForm()` dynamic-row cleanup;
- `applyProceedingFields()` row count and hydration;
- edit hydration from `caseItem.witnesses`;
- `updateWitnessCounts()`;
- `setupWitnessRow()` removal focus and event setup;
- `addWitnessRow()` cloning and serial assignment;
- `updateWitnessSerialNumbers()`.

These now select `.witness-card`. `#witnessTableBody` is retained for compatibility with existing lookup sites. The `.sr-no`, `.witness-action`, `witness_examined[]`, and `flatpickr-date` hooks remain available.

`proceedingFieldsFromForm()` continues to collect controls by the existing names `witness_name[]`, `witness_status[]`, `witness_examined[]`, and `witness_examined_date[]`, then creates the same `witnesses[]` structure. It was not modified. Add Case reset, serialization, and save logic were not changed.

## Accessibility results

- Each Witness is a fieldset with a numbered legend; numbering updates through the existing serial updater.
- All four fields retain explicit labels and their stable IDs. Static markup audit found no duplicate IDs and no missing Witness label targets.
- Original Witness entry remains non-removable; additional cards retain the existing `Remove Witness N` accessible naming and focus restoration behavior.
- Native DOM order remains Name, Status, Examined, Examined Date, Remove; added cards continue to receive focus in the Name field. Keyboard traversal follows the card controls in source order.
- Validation container classes remain on text/select/date fields, preserving the existing `aria-describedby` error-message handling.
- No screen-reader or rendered keyboard test was possible in this environment.

## Responsive results

CSS uses an auto-fitting card grid with a 360 px preferred card width, a two-column field layout where space allows, and a one-column card/field layout below 600 px. Controls have a 42 px minimum height; Remove buttons have a 44 px minimum target. Labels and validation messages can wrap. Light/dark colors use existing CaseTrack surface, text, and border tokens.

The requested rendered checks at 320, 375, 430, 768, 1024, 1366, and 1920 px in both themes are **BLOCKED**. Browser access was unavailable in this environment, and no local Playwright/Puppeteer package was available. No dependency or runtime was installed. The CSS layout was source-reviewed only; rendered overflow and clipping are not claimed as verified.

## Regression checks

| Check | Result |
|---|---|
| Static Witness markup audit: no table, four expected field names, explicit label targets | PASS |
| Static Add Case component ID audit | PASS — no duplicate IDs in the component HTML |
| `node --check components/add-case/add-case.js` | PASS |
| `npm test` | PASS — 60 passed, 0 failed, 0 skipped |
| `npm run build` | PASS with installed local dependencies; existing large generated chunk advisory remains |
| `git diff --check` | PASS |
| Add one/multiple entries, dynamic removal, data preservation after repeated cycles, original non-removable behavior, runtime focus/keyboard behavior | BLOCKED — no browser fixture available |
| Runtime validation announcements and dynamic `aria-describedby` behavior | BLOCKED — no browser fixture available; source validation and field/container hooks were preserved |
| Runtime save payload comparison after card interactions | BLOCKED — no browser fixture available. Mapper source and all four control names are unchanged; existing proceeding-field unit tests pass. |
| Phase 5D-1 section navigation regression | Source preserved; runtime navigation check BLOCKED with browser tooling unavailable |

No production access, emulators, infrastructure recovery, or authentication was used. No dependencies were installed. No push, merge, or deployment occurred.

## Remaining approved batches and limitations

- The previously approved mobile sticky Save/Cancel actions and reset confirmation remain separate future batches and were not changed here.
- Rendered responsive/theme checks, interactive repeated Add/Remove verification, browser accessibility inspection, and a runtime payload comparison remain necessary before UX-002 can be considered fully verified.
- This report does not mark UX-002 verified or closed.

**Recommended next step:** owner review this batch, then run the blocked interactive and viewport regression checks when a safe local browser fixture is available.
