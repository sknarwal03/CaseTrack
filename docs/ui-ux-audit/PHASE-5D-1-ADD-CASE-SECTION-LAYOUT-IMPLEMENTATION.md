# CaseTrack — Phase 5D-1: Add Case Section Layout Implementation

**Status:** First implementation batch complete; rendered viewport/theme verification is blocked by unavailable browser tooling. Stop here pending owner review of this batch.

## Implementation summary

Added a one-page section index to the existing Add Case dialog and improved section presentation for Court Status, which previously had no visible section heading. Navigation uses standard fragment links, so pointer and keyboard activation retain native link behavior. Target headings are programmatically focusable and have visible focus styling. The modal body remains the scroll container; target scroll offset accounts for the sticky index.

The active link updates from the heading positions during the existing modal-body scroll path. This adds no additional scroll listener. A single `MutationObserver` tracks visibility changes on the existing record sections so navigation links are hidden when their destination is hidden. Court links, Accused, and Witness follow the active court-record visibility; UCR follows its existing conditional visibility.

## Files changed

- `components/add-case/add-case.html` — semantic navigation links and section heading targets; added the missing Court Status heading within its existing section.
- `components/add-case/add-case.css` — sticky horizontal navigation, active/focus states, target scroll offset, narrow-screen touch sizing, and Court Status heading spacing.
- `components/add-case/add-case.js` — active-section indication, conditional link visibility, and navigation target focus using the existing modal-body scroll handler.
- `docs/ui-ux-audit/PHASE-5D-1-ADD-CASE-SECTION-LAYOUT-IMPLEMENTATION.md` — this implementation and verification record.

No fields, input names, existing input IDs, validation rules, data mappings, Save/Reset behavior, or business logic were changed. No Witness card conversion, mobile sticky action bar, or reset confirmation was implemented. Existing Phase 5B worktree edits were preserved.

## Sections included

The index targets FIR Details, Complaint Details, Case Records, Court Status, Court Registration, Hearings Records, UCR Report Details, Accused Details, and Witness Details. The existing File No/FIR Status metadata strip is not a data-entry section and is not separately indexed. Conditional sections are omitted from navigation while hidden.

## Before/after observations

- **Before:** the long form had no section index; users had to scroll through the modal body. Court Status fields had no section heading.
- **After:** a sticky, horizontally scrollable section index jumps to existing major sections. The active destination is marked with `aria-current="location"`; focused links and headings have visible focus treatment. Court Status now has a heading without adding fields or changing section order.

## Verification results

| Check | Result |
|---|---|
| `node --check components/add-case/add-case.js` | PASS |
| `npm test` | PASS — 60 passed, 0 failed, 0 skipped |
| `npm run build` | PASS using installed local dependencies; Vite reports the existing large generated chunk advisory |
| `git diff --check` | PASS |
| Requested visual matrix: 320, 375, 430, 768, 1024, 1366, 1920 px in light/dark | BLOCKED — browser access host unavailable; no local Playwright/Puppeteer package is installed. No dependencies or runtimes were installed. |
| Rendered link navigation, sticky overlap, focus, overflow, theme, and active-link behavior | BLOCKED — requires browser rendering. Source uses native fragment navigation, the modal’s scroll container, conditional hidden-link syncing, and a single passive scroll listener. |
| Interactive regression of Add/Remove, field validation, and Save/Reset | BLOCKED — no browser fixture was available. Source changes do not edit those handlers or form controls; automated existing tests passed but do not exercise this UI. |

No production Firebase, authenticated services, live police data, emulators, credentials, or infrastructure were accessed. No installation, push, merge, or deployment occurred.

## Known limitations and remaining verification

- Full visual verification across all seven widths and both themes remains outstanding.
- Keyboard navigation, sticky header overlap, actual section scroll positioning, active-link updates, and conditional link visibility need rendered browser verification.
- Add Case dynamic interactions and create/edit flows were not re-run in an interactive fixture during this batch. Phase 5B’s recorded checks remain historical evidence, not a new Phase 5D-1 regression run.
- Automated unit tests cover shared modules, not the new navigation DOM behavior.

## Remaining approved design batches

The owner-approved design also includes responsive Witness cards, a mobile sticky Save/Cancel bar, and confirmation before resetting entered data. The Phase 5D-1 brief explicitly excludes these from this first implementation batch; implement them only in a later authorized phase.

**Recommendation:** review this section-navigation batch and, after rendered regression verification is available, proceed to the separately scoped responsive Witness-card batch.
