# CaseTrack — Phase 5G Visual Baseline Review

**Review date:** 2026-11-18  
**Result:** **PARTIAL — captures are available for review; no visual baseline is approved or updated.**

## Capture set

Playwright Chromium captured the authenticated local Add Case UI at 320, 375, 430, 768, 780, 1024, 1366 and 1920 CSS pixels, in light and dark themes. All 16 screenshots are retained under `docs/ui-ux-audit/evidence/phase-5g/`. The `npm run test:visual` matrix passed 16/16 geometry/theme/navigation assertions. These screenshots are review evidence, not golden images.

| Width | Light | Dark |
|---:|---|---|
| 320 | [PNG](evidence/phase-5g/add-case-320-light.png) | [PNG](evidence/phase-5g/add-case-320-dark.png) |
| 375 | [PNG](evidence/phase-5g/add-case-375-light.png) | [PNG](evidence/phase-5g/add-case-375-dark.png) |
| 430 | [PNG](evidence/phase-5g/add-case-430-light.png) | [PNG](evidence/phase-5g/add-case-430-dark.png) |
| 768 | [PNG](evidence/phase-5g/add-case-768-light.png) | [PNG](evidence/phase-5g/add-case-768-dark.png) |
| 780 | [PNG](evidence/phase-5g/add-case-780-light.png) | [PNG](evidence/phase-5g/add-case-780-dark.png) |
| 1024 | [PNG](evidence/phase-5g/add-case-1024-light.png) | [PNG](evidence/phase-5g/add-case-1024-dark.png) |
| 1366 | [PNG](evidence/phase-5g/add-case-1366-light.png) | [PNG](evidence/phase-5g/add-case-1366-dark.png) |
| 1920 | [PNG](evidence/phase-5g/add-case-1920-light.png) | [PNG](evidence/phase-5g/add-case-1920-dark.png) |

## Visual review findings

### Passed observations

- Light/dark surfaces, card borders, labels and actions render in the intended theme.
- Witness card remains within the viewport at every tested width; the automated document width assertion found no horizontal page overflow.
- At 320 px, card fields remain single-column and readable.
- The section navigation target and active marker are visible in each capture.
- Desktop screenshots retain a centered readable modal rather than stretching to screen width.

### Defects / owner review

1. **Mobile sticky footer overlap — FAIL.** At 320 px in both themes, “Add Another Witness” is partly obscured by the sticky Reset/Cancel/Save footer in the passive screenshot state. A keyboard-focus test can scroll the button above the footer, but it does not remove the passive-view overlap. Review captures: [320 light](evidence/phase-5g/add-case-320-light.png), [320 dark](evidence/phase-5g/add-case-320-dark.png). This conflicts with the Phase 5D-3 requirement that the footer not cover controls.
2. **Section strip discoverability — PARTIAL.** After navigation auto-scrolls the horizontal section strip to Witness, the leftmost label is cut off at narrow widths (example [375 light](evidence/phase-5g/add-case-375-light.png)). The strip has a navigation name and horizontal scrolling, but no obvious persistent scroll cue; a first-time user may see a truncated section name. `aria-label` helps assistive technology but doesn't resolve the visual discoverability concern.
3. **Capture scope is incomplete for baselines.** These captures focus the Witness section after opening a synthetic chargesheet fixture. They do not cover initial form, all conditional UCR/court sections, Accused details, validation errors, Reset dialog, focus outlines, loading states, or the virtual keyboard/safe-area device behavior. Do not treat this set as a complete Add Case golden baseline.
4. **No approved visual reference exists in this task.** No pixel-diff comparison or baseline update was run. The set should remain candidate review material until the owner selects representative states and approves a baseline scope.

## Baseline decision

**No baseline approved.** Keep every Phase 5G PNG as dated browser evidence only. Do not auto-approve or replace visual snapshots. A future baseline should include initial state, required/invalid state, dialog, dynamic Accused and Witness cards, conditional UCR/court state, desktop footer, and mobile footer unobstructed states in both themes.
