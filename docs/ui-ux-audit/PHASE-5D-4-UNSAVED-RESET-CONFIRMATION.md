# CaseTrack — Phase 5D-4: Unsaved Reset Confirmation

**Status:** Confirmation implemented around the existing native Reset action. Automated checks pass. Interactive/browser regression is blocked by unavailable browser tooling. UX-002 remains open; stop here for owner review.

## Existing Reset semantics

The Add Case footer has a distinct `<button type="reset">Reset</button>`, separate from the `#cancelModal` button. Cancel continues to call `closeModal()` and was not changed.

The Reset button invokes the browser's native form reset event. Existing listeners clear required-field error state, refresh conditional/status presentation, and reset the IO selector state. This is distinct from `resetForm()`, which runs when opening the modal and clears broader modal/session state. This implementation preserves that distinction and does not route Reset through modal-open initialization, Save, or Cancel.

## Exact implementation and dirty-state detection

- A native `<dialog>` named by “Reset this form?” and described by the unsaved-change warning offers **Keep Editing** and **Reset Form**.
- The pristine form's native reset event proceeds with no confirmation.
- For a dirty form, a capture-phase reset listener cancels the native reset before other reset listeners run, then opens the confirmation. Existing reset listeners now return when the event was canceled, preserving values, dynamic entries, validation state, and related UI state on Keep Editing.
- **Keep Editing**, the dialog's Escape path, or its cancel event closes the confirmation and returns focus to the existing Reset button.
- **Reset Form** closes the confirmation and calls `form.reset()` once under a narrow bypass flag. The existing reset event listeners then run once, including required-error cleanup. Focus returns to FIR Number.
- The confirmation uses the platform modal `<dialog>` and the existing Add Case modal focus behavior. The outer modal's Escape callback dismisses the reset dialog first. Native dialog behavior contains Tab/Shift+Tab while it is open; the outer focus manager already defers to an open native dialog. Buttons have explicit names, the warning is associated through `aria-describedby`, and existing `:focus-visible` styling applies.

The dirty baseline is set clean immediately before the Add Case modal is shown, after the form's current add/edit values have been programmatically populated. User-trusted `input`/`change` events, Flatpickr's user-change callback, dynamic Accused/Witness add/remove actions, case-record creation, hearing-record creation/update, and Sessions successor creation mark it dirty. Programmatic population, focus movement, section navigation, and opening menus do not mark it dirty. The flag/listeners are initialized once with the component, not on each modal opening.

## Files changed

- `components/add-case/add-case.html` — added the accessible confirmation dialog outside the form, with no additional Reset/Save/Cancel submit controls.
- `components/add-case/add-case.js` — added the dirty flag and confirmation flow; made existing reset listeners skip canceled reset events; added dirty signals for user date and dynamic-record changes; Escape dismisses the nested confirmation before the parent modal.
- `components/add-case/add-case.css` — added responsive CaseTrack token-based dialog styling, warning/action layout, danger treatment, and visible focus support.
- `docs/ui-ux-audit/PHASE-5D-4-UNSAVED-RESET-CONFIRMATION.md` — this report.

No Save handler, Cancel click handler, required-field rule, validation rule, payload mapper, Firebase/backend code, or unrelated page was changed.

## Regression and validation results

| Check | Result |
|---|---|
| Explicit Reset exists and is distinct from Cancel | PASS — confirmed in actual footer markup and handler |
| Reset pristine form without confirmation | Source path PASS — clean flag allows the original native reset event |
| Dirty text/select/checkbox changes | Source path PASS — trusted input/change events mark dirty |
| Date-picker changes | Source path PASS — Flatpickr user `onChange` marks dirty; existing programmatic `setDate(..., false)` remains non-dirty |
| Dynamic Accused/Witness add/remove | Source path PASS — trusted form clicks mark dirty |
| Keep Editing preserves values/dynamic cards | Source path PASS — reset event is prevented; all other reset listeners skip canceled events |
| Reset Form runs reset once and clears existing validation state | Source path PASS — one guarded `form.reset()` call; original reset cleanup listeners run once |
| Original Accused/Witness entries remain non-removable | PASS by source inspection; their markup/handlers were not changed |
| Existing Save handler and Cancel click behavior | PASS by source inspection; Save handler and Cancel binding remain unchanged |
| Repeated reset attempts / duplicate listeners | PASS by source inspection — one-time component listeners; no listeners are added when opening the confirmation |
| Keyboard/modal focus behavior | Source PASS — native modal dialog, initial autofocus on Keep Editing, Escape dismisses confirmation first, focus returns to Reset or FIR Number |
| Sticky action bar and section navigation | Source preserved; reset dialog is top-layer and scroll offsets/layout were not changed |
| `node --check components/add-case/add-case.js` | PASS |
| `npm test` | PASS — 60 passed, 0 failed, 0 skipped |
| `npm run build` | PASS using local dependencies; existing large generated chunk advisory remains |
| `git diff --check` | PASS |
| Browser interaction for pristine/dirty, both choices, keyboard containment, focus restoration, and repeated attempts | BLOCKED — browser access unavailable; no browser dependencies were installed |
| Screen-reader announcement and light/dark rendered appearance | BLOCKED — no browser/screen-reader verification available |

No production service, authentication, Firebase, Firestore, or emulator was accessed. No dependency/runtime installation, push, merge, or deployment occurred.

## Remaining risks and next verification

The existing native Reset workflow has narrower scope than modal-open `resetForm()`: it resets form-control defaults and existing validation/IO/status listeners, but does not clear the in-memory `caseRecordDrafts` or hearing-record collection and does not remove additional Accused/Witness DOM entries. This phase preserves that existing workflow as directed; the confirmation does not claim to resolve those pre-existing Reset semantics. A broader reset-scope decision should be reviewed separately before changing draft/hearing business state.

Browser checks remain necessary for native dialog support/announcement, Keep Editing value preservation, one reset execution, dynamic controls, keyboard containment, focus restoration, mobile sticky actions, section navigation, and light/dark appearance. UX-002 is not marked fully verified or closed.

**Recommended next step:** owner review the confirmation and decide whether a later phase should separately define/reset in-memory case-record and hearing state; then complete the blocked browser checks.
