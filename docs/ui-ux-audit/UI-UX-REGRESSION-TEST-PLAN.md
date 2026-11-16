# CaseTrack — UI/UX Regression Test Plan

Planning specification for post-implementation verification. No tests were run or added as part of this planning task. Use synthetic fixtures in isolated emulator/browser environments only; never access production police records.

## 1. Build, unit, integration and E2E layers

| Layer | Planned checks | Evidence / gate |
|---|---|---|
| Production build | Clean Vite build; inspect generated entry files and exact Password Setup path/base URL. | UX-001 route output and hosting/staging route smoke. |
| Unit | Existing status/FIR model, hearing date, proceeding fields, report aggregation and export serialization where those implementations change. Add focused tests only during separately approved implementation. | Preserve FIR Master identity, linked proceedings, UI/UCR/UT/Disposed mapping and date transitions. |
| Firebase Emulator | Approved endpoint tests for Password Setup validation/completion, token expiry/consumption, role gates; any approved data workflow changes against emulator only. | Active synthetic token succeeds once; invalid/expired/reused cases reject; no unauthenticated bypass. No production connection. |
| E2E | Authenticated synthetic Admin and Operator journeys, route navigation, case search/filter, dialog open/cancel, report/export, diary date navigation, PO/disposed view, password change/setup. Mutating test actions scoped to synthetic records and cleaned up. | Role checks remain enforced; records and relationships reconcile before/after. |
| Browser visual | Screenshot baseline comparison for routes/states at seven sizes and both themes; focus on UX-009 and UX-011–017. | Attach captures and note viewport, theme, browser, data fixture. Visual diffs reviewed, not blindly accepted. |

## 2. Viewport and theme matrix

Capture authenticated Operator routes and Admin views at: **320×700, 375×812, 430×932, 768×1024, 1024×768, 1366×768, 1920×1080**. Inspect both light and dark theme for authenticated app; public Landing/Login in their available theme. Password Setup valid/invalid states require working approved emulator handlers before the valid matrix can run.

Check page width against viewport; no accidental document-level horizontal overflow; all table content/actions remain reachable; sticky headers and scroll regions do not obscure focused controls. Include browser zoom at 200% and a narrow-height dialog check in the accessibility phase (not evidenced by existing audit).

## 3. Functional regression workflows

Use fixed synthetic records with representative UI/UCR/UT/Disposed FIRs, multiple linked courts and accused, hearing records, a PO accused, a disposed proceeding, judges, IOs, station and synthetic users. Existing browser evidence describes such fixture shapes; refresh only in emulator and avoid production data.

- **FIR identity and linkage:** add/edit/display multiple court proceedings and accused; verify stable FIR Master identity and links. No accidental duplicate master records.
- **Status:** exercise existing state display/filter transitions and verify UI/UCR/UT/Disposed semantics unchanged. Do not infer or redesign transitions from visual findings.
- **Hearing dates / Register Diary:** view and update synthetic hearing date via approved workflow; diary entry/date persists and appears on the intended date; cancellation/rollback paths preserve existing behavior.
- **PO and Disposed:** verify PO filtering and accused relationship; disposed archive month/year and court proceeding remain correct.
- **Reports/KPIs:** count synthetic fixtures against named status definitions; export scope matches active filters and authorized view.
- **Task storage:** verify current local persistence/user key semantics if only copy changes; any sync/notification work needs separate approval and expanded tests.
- **Auth/Admin:** sign in as synthetic roles; verify route restrictions, no unauthorized user/station operation, and successful/failed setup cases only through approved backend handlers.

## 4. Accessibility and interaction matrix

| Area | Required verification |
|---|---|
| Names/labels | Every visible form control has accessible name matching visible label; labels focus control; grouped fields expose legend; errors/help linked to input. |
| Keyboard | Complete Tab/Shift+Tab traversal; visible focus; no keyboard trap outside intended modal; all actions operable; no lost focus on route changes. |
| Dialogs | Meaningful initial focus, tab containment, Escape/cancel policy, background inertness, close button name, scroll behavior, focus returned to opener. Test Add Case, case details, Dashboard task, Admin Manage, date/other native dialogs. |
| Contrast | WCAG 2.2 AA text target: 4.5:1 normal, 3:1 large; non-text controls/focus boundaries target 3:1 where applicable. Compose alpha backgrounds before calculation. Include both themes and hover/focus/disabled/status states. UX-017 starts with known 1.24:1 and 2.33:1 failures. |
| Color and charts | Status text accompanies color; chart has accessible title/summary or data explanation; legends remain linked to visual series. |
| Touch/reflow | Primary targets comfortably usable; text/control does not overlap at 320/375/430; responsive scroll regions have cue and keyboard access. |
| Errors and status | Success/error messages announced and remain visible; loading, empty, unavailable, invalid and expired states have clear meaning. |
| Reduced motion/zoom | Review motion preference where animation exists; 200% zoom and reflow for forms, dialogs, nav and tables. |

A full WCAG conformance claim requires broader manual and assistive technology coverage than the existing audit performed. Record tested browser, screen reader and OS; do not claim untested combinations.

## 5. Issue-specific verification map

| Issue | Minimum focused checks |
|---|---|
| UX-001 | Clean artifact route; staging URL; synthetic valid/invalid/expired/reused setup token through real handlers; auth and single-use behavior. Never bypass auth. |
| UX-002 | Add Case DOM name scan and label click; keyboard; create/edit payload parity. |
| UX-003 | Every custom/native dialog keyboard sequence, focus containment/restoration, Escape policy, mobile/long-content behavior. |
| UX-004 | File headers/data/filter scope, special characters/date encoding, empty/error feedback, authorized fields. |
| UX-005 | Recompute sample deltas across comparison windows, zero/no baseline, no misleading static display. |
| UX-006 | Wording accurately describes local persistence and no scheduled alert; user isolation and storage persistence. |
| UX-007 | Four FIR states and unknown state across Status Map/Register/details/filters, color + text, no stored status mutation. |
| UX-008 | Dashboard available and current-page indication on desktop/mobile for each authenticated route and role. |
| UX-009 | Cases, FIR Index, Admin Users and any confirmed related table at all widths; row identity/actions reachable, no accidental page overflow, scroll accessible. |
| UX-010 | Each named Pending status included/excluded; totals reconcile to synthetic data and explanation is accessible. |
| UX-011 | Must wait for valid endpoint. Capture valid, invalid, expired, success in CaseTrack theme; all widths/themes, labels/errors/contrast. Existing invalid screenshot does not establish valid behavior. |
| UX-012 | 320/375 preview legibility or clear decorative role; hero action and text remain dominant; no clip. |
| UX-013 | Dashboard title and period control bounds at 320/375/430 both themes; selector works and period data unchanged. |
| UX-014 | Chart labels/legend readability and screen-reader summary at 320/375/430; all categories retained. |
| UX-015 | Populated/empty Diary rows, long judge/court names, 320/375/430, independent control targets; hearing date/status behavior unchanged. |
| UX-016 | Admin dialog opaque surface, no text showing through, 320/1366 both themes; keyboard and validation behavior. |
| UX-017 | Computed composited contrast for table header/UID and all normal text, both themes; focus/hover states; seven widths. |

## 6. Data protection and cleanup

- Use project IDs explicitly designated for demos/emulators and block remote Firebase calls in the test browser.
- Do not load or copy real police records into synthetic fixtures.
- Use fake `@example.test` accounts and synthetic FIR/court identities only.
- Avoid credential reset/role mutation success tests unless a separately approved isolated scenario explicitly requires them.
- Record fixture creation and cleanup; ensure emulator documents/users are removed after the run.
- Preserve existing schemas/rules unless migration scope is separately approved. No data migration is part of this plan.

## 7. Exit criteria

A final verification report records build result, test results, browser/viewport/theme matrix, synthetic fixture summary, failures/deviations, screenshots, accessibility measurements, issue status evidence and cleanup. All approved acceptance criteria pass or have explicit residual issues. Valid Password Setup remains marked unverified until a genuine local handler-backed flow is tested; visual audit completion must not be claimed before then.
