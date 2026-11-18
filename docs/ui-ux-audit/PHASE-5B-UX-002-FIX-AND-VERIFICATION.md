# CaseTrack — Phase 5B: UX-002 Targeted Accessibility Fix & Verification

**Result: FIXES IMPLEMENTED; UX-002 remains open pending owner review and authenticated verification.**  
**Date:** 2026-11-16  
**Scope:** Phase 5A findings for dynamic Add Case Accused and Witness entries, and the inspected required-field validation path.

## Summary

The Add Case component now recalculates visible Accused numbering after additions and removals, focuses newly added entries, restores focus after removal, and exposes row-specific accessible names for dynamic remove buttons. Required-field validation now creates a field-level message related through `aria-describedby`; its invalid state and message clear when the field is corrected or the form is reset. Stable, monotonic control IDs remain independent of visible entry numbers.

The fixes were checked against the actual component HTML/CSS and actual modified source-function excerpts in a local synthetic browser fixture. No authentication or Firebase integration was used. The automated suite and production build pass. The report does not close UX-002.

## Exact defects fixed and before/after behavior

| Finding | Before | After |
|---|---|---|
| Accused numbering after removal and re-add | New number used the current card count while surviving cards retained old numbers; this could duplicate visible numbers. | `updateAccusedCardNumbers()` renumbers every visible card sequentially after add/remove. Input IDs continue using the monotonic control sequence. |
| Keyboard sequence after add | Focus stayed on the Add button, so the next Tab skipped the inserted entry. | Add handlers focus the new entry’s first enabled field. Native Tab then proceeds to the next field in that entry. No positive `tabindex` was added. |
| Focus after removal | Removing the focused control detached it and left focus on `body`. | Removal focuses the next entry’s first enabled field, the previous entry’s Remove button, or the Add button when there is no dynamic entry left. |
| Witness Remove accessible name | A dynamically added button was named only by its trash icon. | It is named “Remove Witness N”; the name is updated with the visible row numbering. |
| Required-field validation feedback | Invalid required controls got `aria-invalid`, but no associated error text was rendered. | Each invalid field gets “This field is required.” with a unique error ID referenced by `aria-describedby`. Existing description references are retained. Correcting the value removes the error reference/message and clears `aria-invalid`; form reset clears them as well. Existing required-field selection, first-invalid focus, and submission behavior remain. |

The original template Accused and Witness entries still have no Remove buttons. No minimum-entry rule or new required field was introduced.

## Files and functions changed

Only the following files were changed for Phase 5B:

- `components/add-case/add-case.js`
  - `setupAccusedCard()` — restore focus and renumber after removal.
  - `updateAccusedCardNumbers()` — sequentially update visible Accused numbers and contextual remove names.
  - `addAccusedCard()` — update numbering and focus the new card.
  - `setupWitnessRow()` — restore focus after removal.
  - `addWitnessRow()` — focus the new row.
  - `updateWitnessSerialNumbers()` — synchronize Witness input labels and Remove accessible names.
  - `setRequiredFieldError()` / `clearRequiredFieldError()` — add and clear associated field-level feedback.
  - form reset handler — clear field messages, relationships, and invalid styling.
- `components/add-case/add-case.css`
  - `.field-validation-message` — visible, scoped validation message styling.
- `docs/ui-ux-audit/PHASE-5B-UX-002-FIX-AND-VERIFICATION.md` — this record.

No master register, checklist, Firebase/auth/backend, FIR, court-case, or form business-rule code was changed.

## Regression verification

The test fixture used the actual Add Case HTML and CSS and extracted the relevant modified source functions. Its only adapters revealed the case details/modal and stubbed date-picker initialization. Dynamic add/remove, reset, naming, counting, and validation logic came from the component source. This is a component/source-fixture result, not a full application route test.

| Check | Result |
|---|---|
| Repeated Accused add/remove and visible numbering | PASS — six additions, middle removal, and re-add maintained sequential visible numbers. |
| Repeated Witness add/remove and serial numbering | PASS — six additions and middle removal maintained sequential serials. |
| Stable unique control IDs | PASS — no duplicate IDs found after mixed repeated operations; IDs remain monotonic across removal/re-add. |
| Label-to-control relationships | PASS — dynamic Accused and Witness labels resolved to controls in their own entry after repeated operations. |
| Data preservation | PASS — values in surviving Accused and Witness entries remained after removing another entry; new entries were reset. |
| Keyboard insertion order | PASS — focus entered the new Accused name or Witness name field; Tab moved to the next field within that entry. No positive `tabindex` values exist. |
| Focus after removal | PASS — removal of the last dynamic entry returned focus to its Add button; middle removal focused a surviving entry control. Focus did not remain on detached nodes or fall to `body`. |
| Remove accessible names | PASS — Accused names use “Remove Accused N”; Witness names use “Remove Witness N” and update with serial numbering. |
| Required-field feedback | PASS — invalid submission produced a message and `aria-describedby` reference, set `aria-invalid=true`, and retained first-invalid focus. Entering a valid value removed the associated message/reference and set `aria-invalid=false`. |
| Form reset validation cleanup | PASS — reset handler clears validation messages, invalid styling, and error relationships. |
| Witness summary counts | PASS — existing count update behavior remains in place and passed mixed synthetic entry checks. |
| Responsive/theme matrix | PASS — 320, 375, 430, 768, 1024, 1366, and 1920 px in dark and light themes. Body/document width matched viewport at all 14 combinations; Add buttons stayed in bounds and the Witness table retained its local horizontal scroll behavior. |
| Browser fixture errors | PASS — no page errors in the focused interaction or viewport fixtures. |

### Automated checks

- `npm test` — **60 passed, 0 failed, 0 skipped**.
- `node --check components/add-case/add-case.js` — passed.
- `npm run build` — passed using the existing local Vite dependency. Vite emitted its existing advisory for large generated chunks; no build failure occurred.
- `git diff --check` — passed.

No dependencies were installed and no network access, emulator, production data, authentication, or credential access was used.

## Remaining issues and blockers

- **Authenticated verification gap:** The full Add Case route, create/edit serialization, application-level modal lifecycle, and live integrations were not authenticated or tested. UX-002 must remain open pending the separately authorized authenticated verification.
- **Screen reader verification gap:** The browser accessibility tree and computed names were checked, but no screen reader was used. Accused entries also lack an explicit named group/fieldset relationship; that observation from Phase 5A remains for owner triage and assistive-technology verification.
- **Minimum-entry decision pending:** Original template entries remain non-removable as requested. The product owner still needs to decide/document the intended minimum-entry policy. No behavior was added for removing the original entries.
- The next step is owner review of this implementation and report. Do not mark UX-002 closed based on this component fixture alone.

## Minimum-entry decision record

**Pending owner decision.** Phase 5B preserves the current behavior: the original Accused card and original Witness row have no Remove controls. The component does not enforce a newly invented minimum count. UX-002-ACC-004 and UX-002-WIT-004 remain unresolved until the intended minimum-entry rule is documented and reviewed.
