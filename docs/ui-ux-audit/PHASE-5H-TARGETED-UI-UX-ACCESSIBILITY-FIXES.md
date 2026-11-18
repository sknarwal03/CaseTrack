# CaseTrack — Phase 5H Targeted UI/UX and Accessibility Fixes

**Date:** 2026-11-18  
**Result:** Implemented and regression-tested. UX-002 remains open.

## Scope and safety

The four Phase 5G acceptance defects were fixed without changing form validation rules, save mappings, Firebase configuration, or business logic. Browser tests used Chromium, the local Vite page, local Auth and Firestore emulators, and synthetic test fixtures. No production service or real case data was used. Existing visual baselines were not updated.

## Root causes and fixes

### 1. Mobile sticky footer overlap

**Root cause:** `scroll-padding-bottom` changed where a scroll target was placed but did not add scrollable content after the Witness controls. The end of the form therefore could not scroll far enough above the sticky footer.

**Fix:** Added measured bottom clearance to the mobile form content (`22px + 32px + env(safe-area-inset-bottom)`). The footer keeps its existing sticky behavior and safe-area padding. Desktop footer styles are unchanged. Playwright now scrolls “Add Another Witness” into view and asserts the full button rectangle is above the footer at 320, 375, 430, 768, and 780 px.

### 2. Section navigation clipping and active state

**Root cause:** The section links were kept in a horizontally scrolling, non-wrapping strip. Auto-scroll could leave its first label clipped. After wrapping was enabled, the active-section threshold still used a fixed small offset; at narrow widths a four-row sticky strip placed the target heading below that threshold, so the active marker reverted while the heading was correctly visible.

**Fix:** The strip wraps links and allows visible overflow, keeping the first and last links reachable without page-level horizontal scrolling. JavaScript measures the rendered strip, uses that height for scroll offset and section activation, and preserves the existing visible-section filtering and click/manual-scroll behavior. The final threshold includes a 32 px section-heading clearance for the wrapped layout. Keyboard activation continues to use the same links and target headings.

### 3. Visible Required indicators

**Root cause:** Controls with native `required` semantics had no visible Required indicator.

**Fix:** A form observer adds a small “Required” badge to the matching label only when its control is currently `[required]` and enabled. This covers the existing FIR fields (`firno`, `firdate`, `firyear`, `undersection`) and active conditional Court/UCR fields. `crimehead` remains optional. Native required state, existing validation, messages, and payload mapping remain unchanged. The badge is hidden from assistive technology because the input already exposes the native required state.

Programmatic contrast calculation for the badge colors returned **8.20:1** in dark theme and **6.80:1** in light theme, both above the WCAG AA 4.5:1 text contrast threshold. An axe-based scan was unavailable because axe-core is not installed.

### 4. Accused semantic groups

**Root cause:** Accused entries were visual `<div>` cards without a programmatic group name.

**Fix:** Converted the existing card wrapper to `<fieldset>` and its existing ordinal to `<legend>` (for example, “Accused 01”). Dynamic cards receive sequential legends and named Remove buttons. The original remains non-removable. Existing field IDs, labels, array names, values, focus behavior, and serialization are retained; no save mapping or business meaning changed.

## Source and test changes

- `components/add-case/add-case.css` — sticky-footer scroll clearance; wrapping section strip; Required badge theme styles; fieldset layout.
- `components/add-case/add-case.html` — semantic fieldset/legend for the original Accused entry.
- `components/add-case/add-case.js` — measured section activation threshold; conditional visible Required badges; dynamic Accused action wrapper and numbering.
- `e2e/playwright/add-case.spec.js` — footer obstruction assertions at five narrow/breakpoint widths; Required indicators; Accused group, names, IDs, labels and focus checks.
- `e2e/playwright/visual-matrix.spec.js` — 8-width × 2-theme geometry, nav reachability, active state, Required/Accused/Witness captures, footer clearance assertions.
- `docs/ui-ux-audit/evidence/phase-5h/` — 64 actual Playwright screenshots (four states at each width/theme pair).

## Before/after evidence

The “before” images are preserved Phase 5G browser screenshots. The “after” images are from the Phase 5H isolated Chromium matrix.

| State | Before | After |
|---|---|---|
| 320 px light, footer in normal Witness view | [Phase 5G](evidence/phase-5g/add-case-320-light.png) | [Phase 5H Witness view](evidence/phase-5h/add-case-320-light.png) |
| 320 px light, Add Witness fully clear of footer | — | [Phase 5H clear button](evidence/phase-5h/add-case-witness-footer-clear-320-light.png) |
| 375 px light, section strip after Witness navigation | [Phase 5G](evidence/phase-5g/add-case-375-light.png) | [Phase 5H](evidence/phase-5h/add-case-375-light.png) |
| 320 px dark, Accused group | — | [Phase 5H](evidence/phase-5h/add-case-accused-320-dark.png) |
| 320 px light, Required labels | — | [Phase 5H](evidence/phase-5h/add-case-required-320-light.png) |
| 1920 px light, desktop Witness layout | — | [Phase 5H](evidence/phase-5h/add-case-1920-light.png) |

The full capture set includes `add-case-required-*`, `add-case-accused-*`, `add-case-*`, and `add-case-witness-footer-clear-*` for 320, 375, 430, 768, 780, 1024, 1366, and 1920 px in both themes. These are evidence captures, not approved golden baselines.

## Browser and regression results

| Check | Result |
|---|---|
| Full Add Case interaction suite | **21 passed, 0 failed** against the finished nav threshold. |
| Footer obstruction and section navigation spot checks (320 px light, 780 px dark, 1920 px dark) | **3 passed** on the finished threshold. |
| Full responsive visual matrix, 8 widths × 2 themes | **16 passed, 0 failed** on the finished threshold; 64 screenshots captured. |
| Existing unit tests | **60 passed, 0 failed**. |
| JavaScript syntax checks (`add-case.js`, both Playwright specs) | **Passed**. |
| Production build | **Passed**. Vite reports its existing advisory about chunks larger than 500 kB. |
| `git diff --check` | **Passed**; Git emitted a line-ending notice for the pre-existing modified issue register. |
| Required badge text contrast calculation | **Passed**, 8.20:1 dark and 6.80:1 light. |
| axe scan / real screen-reader test | **Blocked / not run**; axe-core is absent and no screen reader was used. No screen-reader verification is claimed. |

The E2E setup generated only a synthetic `@example.test` account in the demo emulators and constrained browser traffic to local services. Emulator logs included the known Firestore WebChannel `unavailable` warning; the covered tests passed despite it. The suite did not submit or persist a case.

## Regression and compatibility findings

- Accused and Witness add/remove, numbering, accessible names, data retention and focus behavior remain covered by synthetic browser tests.
- Required indicators follow existing required/disabled state, including conditional Court and UCR controls; optional `crimehead` remains unmarked.
- Section links remain keyboard-operable; all visible links fit inside the strip at each matrix width, the first FIR and last Witness links remain reachable, and the document has no horizontal overflow.
- The sticky footer remains present on mobile; its controls and desktop placement remain unchanged. No Reset, Save, Cancel, payload, FIR relationship, hearing, or Register Diary implementation was changed.
- The browser suite did not submit a case, so an end-to-end persisted Save round-trip remains unverified by this phase.

## Remaining limitations and UX-002 status

- **UX-002 remains open.** These four defects are addressed, but this phase does not close the full acceptance scope.
- No axe accessibility scan or assistive-technology screen-reader session was performed.
- Production-authenticated behavior and a persisted Save round-trip were intentionally not exercised.
- Responsive screenshots cover the requested dimensions and themes, but no mobile operating-system safe-area device or virtual keyboard was available; CSS safe-area handling is present and geometry was checked in Chromium.

