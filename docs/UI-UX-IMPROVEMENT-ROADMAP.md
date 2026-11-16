# CaseTrack — UI/UX Improvement Roadmap

Audit date: 12 November 2026. The sequence prioritizes broken user journeys and accessible interaction before visual polish. Each phase should be closed with the stated acceptance checks. Browser-based validation remains outstanding.

## Phase 1 — Restore critical workflows

**Issues:** UX-001, UX-004

1. Include the password-setup route in the production build and ensure deployment publishes it at the URL used by onboarding.
2. Decide and implement the Cases and Report export formats and scope; if export is not ready, remove the affordance until it is.
3. Verify the setup link and exported files against realistic records in a browser.

**Exit criteria:** A production build contains the password setup page; the onboarding URL opens it. Each visible export action downloads a correctly scoped file and announces success or failure.

## Phase 2 — Accessible forms and dialogs

**Issues:** UX-002, UX-003

1. Associate every Add Case field label with its input/select/textarea and use fieldsets for related controls.
2. Consolidate custom and native dialog behavior into a documented interaction pattern.
3. Review accessible names for other custom controls and icon-only actions in the form flows.

**Exit criteria:** Keyboard-only use can open, navigate, and close dialogs without focus escaping; focus returns to the opener. Screen-reader names match visible labels. No unlabeled Add Case inputs remain.

## Phase 3 — Make dashboard/report data trustworthy

**Issues:** UX-005, UX-006, UX-010

1. Define the comparison period and source data for KPI deltas; show values only when computed.
2. Decide whether the dashboard feature is a task list or an alerting reminder service and align the label, storage, sync, and notification behavior.
3. Publish definitions for Report metrics and reconcile them with the relevant status categories.

**Exit criteria:** Every displayed delta is reproducible from its stated period; task/reminder behavior is described accurately before save; report metric definitions and counts are clear.

## Phase 4 — Standardize navigation, statuses, and responsive registers

**Issues:** UX-007, UX-008, UX-009

1. Add a clear Dashboard destination to the shared navigation and check active-page indication.
2. Centralize FIR status color/text mappings across StatusMap, FIR Register, case list, and details.
3. Choose a consistent narrow-screen treatment for registers and verify table scroll, actions, and detail access.

**Exit criteria:** Dashboard is discoverable on every authenticated page; a status has the same meaning and treatment across views; key table actions work at 320/375/430/768 px and desktop at 1366/1920 px without unintended page-wide horizontal overflow.

## Phase 5 — Visual and assistive-technology QA

1. Review both themes at all target viewport widths (320, 375, 430, 768, 1366, 1920 px).
2. Check contrast, focus indicators, touch targets, chart text alternatives, empty/loading/error states, and zoom behavior.
3. Capture before/after screenshots and record browser/device and assistive-technology results for the shared components.

**Exit criteria:** The QA matrix is complete with reproducible screenshots and no unresolved high-severity interaction/accessibility findings.

## Suggested tracking fields

Use the issue IDs in `UI-UX-ISSUE-TRACKER.md`; record owner, target release, implementation link, verification evidence, and status as each issue moves through delivery. This audit created no source-code changes and does not imply any issue is already fixed.
