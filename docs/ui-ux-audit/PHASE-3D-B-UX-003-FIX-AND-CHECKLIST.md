# Phase 3D-B â€” UX-003 Escape Fix and Verification Checklist

**Date:** 16 November 2026
**Scope:** Case Details Escape-key correction; checklist and regression verification
**Browser:** Google Chrome 157.0.8103.51; existing Playwright 1.64.1

## Root cause and fix

Phase 3D-A confirmed that `setupCustomModalFocus()` in `assets/js/shared-utils.js` prevents Escape and calls an optional `onEscape` callback. The Case Details configuration in `assets/js/cases.js` supplied initial and fallback focus selectors but no callback, so Escape was consumed while the custom modal remained open.

Added this callback to the Case Details `setupModal()` options in `assets/js/cases.js`:

```js
onEscape: () => modalHelper?.closeModal()
```

This uses the existing close mechanism. It removes the modal's `show` state, restores body scrolling, deactivates focus listeners, updates `aria-hidden`, and returns focus to the opener. The callback closes over `modalHelper`; the browser fixture exercised the same `const` initialization and callback form successfully.

Case Details is read-only. Its markup has no form or editable control, and the close path has no dirty-state, confirmation, or unsaved-change guard. Therefore, unsaved-change protection is **not applicable** to this dialog. Case Details also contains no nested dialog. The Add Case flow and shared modal utility were not edited.

## Exact files changed

- `assets/js/cases.js` â€” added the `onEscape` callback to the Case Details modal configuration.
- `docs/ui-ux-audit/MASTER-UI-UX-ISSUE-REGISTER.md` â€” updated UX-003 implementation and verification state; status remains High / Open.
- `docs/ui-ux-audit/PHASE-3D-B-UX-003-FIX-AND-CHECKLIST.md` â€” this report and actionable checklist.

The pre-existing untracked Phase 3D-A report was preserved. No other source files, tests, dependencies, Firebase configuration, or data were changed.

## Browser verification

The fixture used the exact Case Details modal markup from `pages/cases.html`, the actual `setupCustomModalFocus()` and `setupModal()` implementation from `assets/js/shared-utils.js`, and the Case Details selectors/callback as configured in `assets/js/cases.js`. It did not load authenticated application routes or replace the focus manager. A test trigger called the modal helper in place of the authenticated case-row flow.

All eight combinations passed at 320px, 375px, 768px and 1366px in dark and light themes:

- Opening placed focus on `.modal-header .close` inside the labelled dialog.
- Tab and Shift+Tab remained within the modal.
- Attempting to focus a background control redirected focus back inside.
- Escape closed the modal, cleared its open/ARIA state, restored body scrolling, and returned focus to the trigger.
- The close button closed the modal and restored focus.
- Repeated open/close cycles restored focus and cleaned up listeners.
- No browser page errors occurred.

A separate native top-layer dialog probe, modelled as a sibling because the existing IO dialog is appended to `document.body`, confirmed that Escape closed the native dialog while Case Details remained open. This is a component fixture, not authenticated Add Case/IO route verification.

Three screenshots were captured outside the repository:

`C:\Users\LENOVO\AppData\Local\Temp\casetrack-phase3db-80258e384bf446d990d67873ff04109a\`

- `case-details-320-dark.png`
- `case-details-1366-light.png`
- `native-dialog-does-not-close-case-details.png`

## Actionable checklist

Each item records status, evidence, and any remaining action. **BLOCKED** items are not complete.

### A. Confirmed Fix

| Item | Status | Evidence | Remaining action |
|---|---|---|---|
| Locate missing `onEscape` configuration | PASS | Phase 3D-A evidence and current Case Details `setupModal()` options identified the omission. | None. |
| Implement minimal fix | PASS | Added only `onEscape: () => modalHelper?.closeModal()` in `assets/js/cases.js`. | None. |
| Confirm correct close handler | PASS | Playwright confirmed the existing `closeModal()` path closes and restores focus/state on Escape in 8/8 viewport/theme combinations. | Verify on the authenticated Cases route when approved. |
| Verify no unrelated source changes | PASS | Source diff contains only the Case Details callback; Add Case, shared modal utility, and other application source are unchanged. | None. |

### B. Keyboard Accessibility

| Item | Status | Evidence | Remaining action |
|---|---|---|---|
| Escape closes permitted Case Details modal | PASS | 8/8 isolated component runs; modal closed, `aria-hidden` became `true`, body scrolling restored, focus returned to trigger. | Confirm on authenticated route. |
| Escape preserves unsaved-change protection, if applicable | NOT APPLICABLE | Case Details is read-only, has no form/editable control, and has no unsaved-change guard. | None for Case Details. |
| Initial focus is correct | PASS | 8/8 runs focused `.modal-header .close` inside dialog named by `caseDetailsTitle`. | Confirm with populated authenticated details. |
| Tab containment | PASS | Tab stayed inside the active Case Details fixture in all 8 runs. | Confirm with any runtime-inserted interactive details. |
| Shift+Tab containment | PASS | Shift+Tab stayed inside the active Case Details fixture in all 8 runs. | Confirm with any runtime-inserted interactive details. |
| Background controls cannot take focus | PASS | Direct focus attempt redirected to the active modal in all 8 runs. | Confirm on authenticated route. |
| Focus restoration | PASS | Escape and close-button paths restored the opener in all 8 runs. | Confirm when opened from a real case row. |
| Nested dialog does not close the wrong modal | PASS | Sibling native-dialog probe: Escape closed the native dialog and left Case Details open. | Verify the Add Case/IO interaction in its authenticated route. |
| Repeated open/close cycles | PASS | Repeated Escape and close-button cycles succeeded in all 8 runs; focus listeners were removed on close. | Confirm on authenticated route. |

### C. Regression

| Item | Status | Evidence | Remaining action |
|---|---|---|---|
| Add Case source and callback remain unchanged | PASS | No diff in `components/add-case/add-case.js`, `components/add-case/add-case.html`, or `assets/js/shared-utils.js`; its existing Escape callback remains present. | None for source regression. |
| Add Case runtime behavior | NOT TESTED | Dashboard authentication was not created or bypassed; no Add Case route/component runtime was loaded. | Verify open, Escape, focus, and IO behavior in the approved authenticated environment. |
| Required viewport matrix | PASS | Case Details component fixture tested at 320, 375, 768 and 1366px. | Actual route confirmation remains pending. |
| Light and dark themes | PASS | All four widths tested in both themes. | Actual route confirmation remains pending. |
| Focused modal test | PASS | Existing Playwright/Chrome component test: 8/8 viewport/theme runs plus native sibling-dialog probe; 0 page errors. | Authenticated integration remains pending. |
| `npm test` | PASS | 60 passed, 0 failed, 0 skipped. | None. |
| JavaScript syntax checks | PASS | `node --check` passed for `assets/js/cases.js`, `assets/js/shared-utils.js`, `components/add-case/add-case.js`, `assets/js/dashboard.js`, and `assets/js/admin-panel.js`. | None. |
| Production build | PASS | `npm run build`: Vite 8.3.0 transformed 107 modules and built successfully. Existing advisory remains for chunks over 500 kB. | No build follow-up required for this increment. |
| `git diff --check` | PASS | Passed after source and documentation changes. | None. |

### D. Remaining Verification Gaps

| Item | Status | Evidence | Remaining action |
|---|---|---|---|
| UX-003 authenticated runtime verification | BLOCKED | No authenticated session was created or bypassed; this phase exercised actual component code/markup in an isolated fixture only. | Run against authorized synthetic authenticated records when that environment is separately available. UX-003 remains High / Open. |
| UX-009 authenticated table interactions | BLOCKED | No authenticated table route or live row/action data was loaded in this increment. | Verify All Cases, FIR Index, Admin Users, nested FIR tables, and row actions in the approved isolated environment. |
| UX-014 authenticated chart rendering and scrolling | BLOCKED | No authenticated Dashboard renderer, chart data, or live legend was loaded in this increment. | Verify rendered chart, legend/data association, controls, and scrolling in the approved isolated environment. |

## Before / after behavior

| State | Case Details Escape behavior |
|---|---|
| Before | Shared focus utility intercepted Escape, but no callback closed the modal; focus remained in the open modal. |
| After | Escape calls the existing `modalHelper.closeModal()` path, which closes the modal and restores focus to its opener. |

## Boundaries and remaining blockers

- No Firebase Emulator was started; no production Firebase endpoint, ADC, or credential was accessed.
- No authentication session was created or bypassed.
- The actual authenticated Cases, Dashboard, and Admin routes remain outside this verification. Component fixtures do not establish authenticated route behavior.
- No tests were added or changed; the targeted Playwright script and screenshots remain in the temporary workspace.
- No issue was closed. UX-003 remains **High / Open**; UX-009 and UX-014 remain unchanged and open.

## Recommended next action

Keep UX-003 Open until its authenticated Cases and Add Case integration is verified with synthetic records, including populated case details and Add Case/IO interaction. Keep UX-009 and UX-014 open until their authorized authenticated route checks are complete. No further code change is needed for the confirmed Case Details Escape defect.
