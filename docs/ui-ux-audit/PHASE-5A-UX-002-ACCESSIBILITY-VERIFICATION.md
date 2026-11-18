# CaseTrack — Phase 5A: UX-002 Dynamic Accessibility & Interaction Verification

**Result: PARTIAL**  
**Scope:** Add Case Accused and Witness repeated-entry controls, keyboard interaction, accessible names and relationships, validation feedback, and responsive layout.  
**Execution date:** 2026-11-16

## Summary

The dynamic controls add and remove rows, preserve surviving values, reset new rows, maintain unique control IDs, and update Witness numbering and summary counts. The focused UX-002 review found six failures, five partial results, and two blocked checks in 31 numbered functional/accessibility checks. Eighteen checks passed. A separate responsive pass covered 14 viewport/theme combinations and passed the measured layout criteria.

Confirmed interaction issues are duplicate visible Accused numbering after a middle-card removal followed by an add, keyboard Tab skipping newly inserted entries, focus loss after removing the focused entry, and an emoji-only accessible name for dynamically added Witness remove buttons. The required-field validation path marks invalid fields and focuses the first one, but does not expose associated error text. This validation finding is adjacent to UX-002 and should be triaged with the form accessibility work.

## Execution method and limits

The browser checks used the actual Add Case component HTML and CSS and executed the source functions for dynamic Accused/Witness add, reset, ID/label assignment, numbering/count updates, remove handlers, and required-field validation in headless Chrome 157.0.8103.51 with Playwright 1.64.1. The functions were loaded as source excerpts with a small test adapter because the full page script also initializes unrelated application and Firebase behavior. The adapter revealed the initially hidden case details, made the modal visible, and stubbed date-picker initialization. Dynamic row behavior and validation were not replaced by mocks.

The pass did not sign in, connect to Firebase, start emulators, use production data, or run a screen reader. Playwright's browser accessibility snapshot was used to inspect computed accessible names. Therefore this is source-with-test-adapters verification, not a full authenticated production-route test or assistive-technology certification.

## Numbered check results

Status counts below cover ACC-001–015, WIT-001–015, and MIX-001: **18 PASS, 6 FAIL, 5 PARTIAL, 2 BLOCKED**.

| ID | Status | Result |
|---|---|---|
| ACC-001 | PASS | Add one Accused card. |
| ACC-002 | PASS | Add multiple cards. |
| ACC-003 | PASS | Remove a middle card while retaining the other entered values. |
| ACC-004 | BLOCKED | The original/template card has no Remove control. No minimum-card or template-removal rule was specified in the supplied acceptance material. |
| ACC-005 | PASS | Remove the only added card; the original card remains. |
| ACC-006 | FAIL | Remove a middle card and add again; visible card numbering duplicates. |
| ACC-007 | PASS | Dynamic control IDs remain unique through add/remove/re-add cycles. |
| ACC-008 | PASS | Accused labels target controls within their own card. |
| ACC-009 | PASS | New cards start empty and surviving values remain unchanged. |
| ACC-010 | FAIL | After adding a card, Tab from the Add button skips the inserted controls and moves to the Witness section. |
| ACC-011 | PARTIAL | Focus remains on the Add button after insertion; it is not moved into the new card. No explicit focus destination was specified. |
| ACC-012 | FAIL | Removing the currently focused card's Remove button leaves focus on the document body. |
| ACC-013 | PARTIAL | Required-field validation sets `aria-invalid` and focuses the first invalid field, but provides no associated error text or `aria-describedby` relationship. This check covered the general required-field path; Accused/Witness fields themselves are not marked required. |
| ACC-014 | PARTIAL | The Add button has a descriptive name. Accused Remove buttons are exposed as generic “Remove” controls without card context. |
| ACC-015 | PASS | Repeated add/remove cycles retain unique IDs and label associations. |
| WIT-001 | PASS | Add one Witness row. |
| WIT-002 | PASS | Add multiple rows. |
| WIT-003 | PASS | Remove a middle row; remaining values persist, serials update, and row-specific control names follow the new positions. |
| WIT-004 | BLOCKED | The original/template row has no Remove control. No minimum-row policy was specified in the supplied acceptance material. |
| WIT-005 | PASS | Remove the only added row; the original row remains. |
| WIT-006 | PASS | Add after a removal; serials and accessible names renumber and IDs remain unique. |
| WIT-007 | PASS | IDs remain unique across Accused and Witness controls. |
| WIT-008 | PASS | Witness labels target controls within their own row. |
| WIT-009 | PASS | New rows start empty and existing values do not transfer or change. |
| WIT-010 | FAIL | After adding a row, Tab from the Add button skips the inserted Witness controls and moves to the summary fields. |
| WIT-011 | PARTIAL | Focus remains on the Add button after insertion rather than moving into the new row. No explicit focus destination was specified. |
| WIT-012 | FAIL | Removing the currently focused row's Remove button leaves focus on the document body. |
| WIT-013 | PARTIAL | Dynamic Witness fields are not required. The general required-field validation check is recorded under ACC-013; no Witness-specific error feedback is implemented by this path. |
| WIT-014 | FAIL | The dynamically added Witness remove control is exposed in the accessibility snapshot as a button named only “🗑”. |
| WIT-015 | PASS | Mixed add/remove cycles preserve unrelated values, keep IDs unique, and update Witness summary counts; six repeated Witness add/fill/remove cycles also passed. |
| MIX-001 | PASS | Witness total, examined, and left counts updated correctly after entering two rows and marking one examined. |

## Confirmed findings and minimal recommendations

### UX-002-A — Accused numbering duplicates after deletion and re-add

**Reproduction:** Add at least three Accused cards, remove a middle card, then add another. The new card is numbered from the current card count plus one, while the remaining cards keep their old numbers; the resulting visible labels include duplicate numbers.

**Source behavior:** `addAccusedCard()` derives the new visible number from `cards.length + 1`; the removal handler does not renumber surviving cards.

**Recommendation:** Renumber visible card headings after removal and assign the next visible number consistently on add. Preserve unique control IDs independently of the displayed ordinal.

### UX-002-B — Tab order skips newly inserted rows

**Reproduction:** Activate Add Accused or Add Witness by keyboard. Focus remains on that Add button. Press Tab: focus advances to a later form control instead of entering the row/card inserted immediately before the button in DOM order.

**Recommendation:** After insertion, move focus to the first enabled field of the new entry, or adjust insertion/focus behavior so normal Tab navigation reaches the inserted controls in order.

### UX-002-C — Removing the focused entry loses focus

**Reproduction:** Focus a dynamic entry's Remove button and activate it. After that entry is removed, `document.activeElement` is the body.

**Recommendation:** Restore focus to a predictable surviving control, such as the next entry's first field, the previous entry's Remove button, or the Add button when only the template entry remains.

### UX-002-D — Witness remove button has an emoji-only name

**Observed name:** `button "🗑"` in the browser accessibility snapshot.

**Recommendation:** Give each dynamic remove button a text or `aria-label` that identifies the action and row, such as “Remove Witness 2”. Keep the visible icon if desired.

### UX-002-E — Required-field errors are not associated with fields

The inspected `validateRequiredFields()` path sets `aria-invalid` and focuses the first invalid field, but did not add a textual error or an `aria-describedby` association. This is a form-wide validation gap surfaced during the requested error-association check; it was not specific to Accused or Witness controls.

**Recommendation:** When a required field fails validation, render a concise field-level message and associate it with the control; clear the message and invalid state when corrected.

### Grouping and screen-reader context

The browser accessibility snapshot did not expose each Accused card as a named group, and each repeated Accused Remove control had no card context. Witness field names do include row numbers. No screen reader was run, so this is a browser accessibility-tree observation rather than a claim about spoken output. Consider grouping each repeated entry with a semantic fieldset/legend or equivalent named group, and include the entry identity in removal names.

## Responsive and visual check

The component HTML and Add Case/shared CSS were checked at **320, 375, 430, 768, 1024, 1366, and 1920 CSS pixels**, in both dark and light themes (**14 combinations**). At every width, document/body width matched the viewport and the Add buttons remained inside the viewport. At narrow widths, the 694 px Witness table content is contained by `.table-container` with horizontal scrolling (`overflow-x: auto`), rather than expanding the page. Keyboard focus reached by Tab displayed the visible focus outline.

Screenshots captured from the 320 px dark-theme fixture:

- [Accused section](evidence/phase-5a/accused-fields-320-dark.png)
- [Witness section](evidence/phase-5a/witness-fields-320-dark.png)

## Verification commands

- `npm test` — **60 passed, 0 failed**.
- `node --check components/add-case/add-case.js` — passed.
- `git diff --check` — passed.

These checks do not resolve the interaction findings above. No application source, master issue register, checklist, Firebase configuration, or credentials were changed for Phase 5A. The only Phase 5A artifacts are this report and the two screenshots.

## Next step

Address UX-002-A through UX-002-E in the Add Case component, then rerun this focused matrix. Resolve the two blocked template-removal checks by documenting the intended minimum-entry policy. A separate approved authenticated-flow pass is still required to verify the complete application route and live integration behavior.
