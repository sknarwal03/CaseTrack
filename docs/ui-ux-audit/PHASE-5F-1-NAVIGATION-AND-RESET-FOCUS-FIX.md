# CaseTrack — Phase 5F-1: Navigation and Reset Dialog Focus Fix

**Status:** Targeted navigation and dialog focus defects fixed and browser verified. Three existing Reset data-state assertions remain failing and are outside this batch. UX-002 remains open.

**Date:** 2026-11-18

## Root causes

### Section navigation active marker

Two related issues caused the marker to lag behind the visible section:

- The active-section threshold was compared in viewport coordinates, but only included a small fixed offset. The section headings use `scroll-margin-top: 76px` to clear the sticky section index, so the target heading could be visible below the index while still falling outside the old threshold.
- The scroll listener was attached only to `.modal-body`. At widths up to 780px, CSS moves vertical scrolling to `#caseForm` and makes `.modal-body` overflow visible. Manual scrolls at those widths therefore never triggered active-state synchronization.

The implementation now uses the sticky nav's viewport bounds, heading scroll margin, and nav height to find the current section. It binds one passive scroll listener to the active scroll container and moves that listener when the viewport crosses the existing 780px breakpoint. It recalculates the marker on resize and continues to omit hidden sections. It does not add per-section observers or new scroll handlers for each section.

### Reset dialog keyboard focus

Chromium's native `autofocus` placed initial focus on **Keep Editing** and the first Tab moved to **Reset Form**. Reproduction showed the focus loop failed at the boundary: another Tab moved focus outside the two dialog actions instead of returning to **Keep Editing**. The initial focus itself was not failing in the reproduced run.

The dialog now explicitly focuses **Keep Editing** after `showModal()` and handles Tab only at the two focus boundaries, wrapping focus within the existing native dialog. Keep Editing and Escape restore focus to the Reset button; Reset Form restores focus to FIR Number after the existing reset workflow. Save and Cancel bindings are unchanged.

## Files changed in this batch

- `components/add-case/add-case.js` — corrected section threshold and responsive scroll-container binding; explicit reset-dialog initial focus and Tab boundary containment.
- `e2e/playwright/add-case.spec.js` — added manual-scroll, keyboard activation, conditional hidden-link, and standalone dialog-focus assertions.
- `e2e/playwright/visual-matrix.spec.js` — added the 780px breakpoint and active-marker assertion to each visual capture.
- `docs/ui-ux-audit/evidence/phase-5f-1/` — six passing Chromium screenshots for 320px, 780px, and 1366px in light and dark themes.
- This report.

Earlier Phase 5 changes already present in the shared worktree were preserved. This batch did not change Firebase configuration, data models, Save payloads, Reset data-clearing behavior, authentication, or production services.

## Before and after browser results

- **Before:** the Witness heading scrolled into view but the Accused link stayed marked active. At mobile widths, manual scroll updates did not reach the marker handler because the form, rather than `.modal-body`, was the scroll container.
- **After:** clicking the Witness link and manually scrolling to Accused updated `aria-current="location"`; keyboard Enter on the Witness link activated the same destination. The conditionally hidden UCR link remained hidden and did not become active.
- **Before:** the reset confirmation's focus loop did not wrap from Reset Form to Keep Editing.
- **After:** opening places focus on Keep Editing; Tab, Tab, and Shift+Tab stay within and wrap between the two actions. Keep Editing and Escape return focus to Reset. Reset Form returns focus to FIR Number.

Earlier browser evidence: [pre-fix active marker](../testing/evidence/witness-nav-highlight-not-updated.png) and [pre-fix reset focus run](../testing/evidence/reset-confirmation-focus-failure.png). The latter was captured after the dialog closed and is not presented as an open-dialog screenshot.

Passing screenshots from the final visual run:

- 320px: [light](evidence/phase-5f-1/320-light.png), [dark](evidence/phase-5f-1/320-dark.png)
- 780px breakpoint: [light](evidence/phase-5f-1/780-light.png), [dark](evidence/phase-5f-1/780-dark.png)
- 1366px desktop: [light](evidence/phase-5f-1/1366-light.png), [dark](evidence/phase-5f-1/1366-dark.png)

These are review evidence only; no visual baselines were updated or approved. Playwright's failure traces are configured to be retained under ignored `test-results/` when a test fails. Subsequent runs cleaned the earlier reproduction traces, so no pre-fix trace archive is retained in this batch. The last visual run result is in ignored `test-results/results.json`.

## Playwright and regression results

| Check | Result | Details |
|---|---|---|
| Reproduction before fix | FAIL, confirmed | Witness heading visible while active marker remained on Accused; reset keyboard loop failed on the forward wrap boundary. |
| Final focused navigation and dialog focus run | PASS, 2/2 | `npm run test:e2e:interaction -- --grep "section navigation|Reset confirmation keyboard focus"`; click, manual scroll, hidden link, keyboard Enter, initial focus, Tab/Shift+Tab wrapping, Keep Editing, Escape, and focus restoration passed. |
| Responsive light/dark checks | PASS, 6/6 | `npm run test:visual -- --grep "320px|780px|1366px"`; active marker and overflow/card bounds passed at 320px, 780px, and 1366px in both themes. Screenshots are preserved above. |
| Full Add Case interaction suite | PARTIAL, 5/8 pass | Run before the final responsive scroll-container refinement. Navigation and dialog-focused assertions passed. Three failures were existing Reset assertions for dynamic Accused/Witness entries and in-memory case-record drafts remaining after Reset. The final focused tests and visual matrix were rerun after the scroll-container change. |
| Unit tests | PASS | `npm test`: 60 passed, 0 failed. |
| Production build | PASS | `npm run build`; existing warning remains for generated chunks above 500 kB. |
| Syntax | PASS | `node --check` on `components/add-case/add-case.js`, `e2e/playwright/add-case.spec.js`, and `e2e/playwright/visual-matrix.spec.js`. |
| Whitespace | PASS | `git diff --check`. |

The browser suite ran through the existing local E2E Vite server and Auth/Firestore emulators using a generated synthetic test account. No production Firebase writes, real case submissions, package installs, deployments, pushes, or merges occurred.

## Remaining failures and limits

- Existing Reset behavior still retains added Accused/Witness entries and may retain an in-memory case-record draft. These are separate from the dialog-focus fix, explicitly outside Phase 5F-1, and unchanged.
- Full `npm run test:e2e:interaction` is therefore still expected to exit nonzero on those three Reset data-state assertions. The final rerun focused on the authorized navigation and dialog-focus acceptance criteria, plus responsive browser coverage.
- Visual coverage in this batch is 320px, 780px, and 1366px in both themes. Other viewport widths from the permanent matrix were not rerun after the responsive scroll-container adjustment.
- No screen reader or physical mobile device was used.
- The local Firestore emulator continues to emit the previously documented WebChannel connection warning; tests remained on the demo emulator and local Vite origin.

No Phase 5F-2 work was started. UX-002 is not marked closed.

