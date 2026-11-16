# CaseTrack — UI/UX Implementation Checklist

Living implementation checklist. A checked item records completed work; unchecked items still require their stated approval gate. Link every delivery item to issue IDs and a separate small change set.

## Gate 0 — Before any implementation

- [ ] Review master plan, issue register, design spec, regression plan, canonical trackers and latest Phase 2B verification.
- [ ] Confirm test environment is isolated Firebase Emulator with synthetic data; do not access production police records.
- [ ] Capture current baseline and identify exact routes/components/files.
- [ ] Record behavior and business invariants that must remain unchanged.
- [ ] Obtain separate explicit approval for functional/backend work, design-system work, shared refactor, page-specific visual changes, dependencies, and data/schema migrations as applicable.
- [ ] Confirm rollback is a revert of the isolated increment and identify any external deployment step.

## Increment checklist

### A — Password Setup route/build diagnosis (UX-001)

- [x] Inspect Vite input list, `base`, hosting path and generated artifact using the configured setup URL (Increment 1A).
- [x] Confirm clean build includes exact `/CaseTrack/pages/password-setup.html` path (Increment 1A output: `dist/pages/password-setup.html`).
- [x] Keep route/config diagnosis separate from backend handler implementation.
- [x] Do not weaken authentication, token checks or CORS to conceal missing handlers.
- [x] Approval gate: frontend build-entry change approved for Increment 1A; no production deployment authorized.

### B1 — Password Setup token infrastructure (UX-001)

- [x] Add allowlisted `purpose` (`initial_setup` or `password_recovery`) to newly issued `operatorSetupActionCodes/{uid}` records; require trusted internal purpose on registration and transitions.
- [x] Fail closed for legacy token records without purpose; preserve the existing `{uid, token}` and `{uid, token, password}` browser request shapes.
- [x] Preserve `issued → consuming → used`, add explicit revocation, and reject expired/over-lifetime tokens.
- [x] Extend unit tests for purposes, legacy records, expiry, replay, revocation, replacement and concurrent claim attempts.
- [x] Verify Firestore transaction concurrency and stored state against an isolated local Firestore Emulator; no Rules or production data changes.
- [x] Record rate-limiter absence and defer persistent limits until approved infrastructure/schema is available.

### B2 — Password Setup token validation endpoint (UX-001; approved scope only)

- [x] Implement `validateOperatorSetupCode` with existing `{uid, token}` contract and stored-purpose validation; no token consumption.
- [x] Enforce strict method/content-type/body/CORS handling and generic responses.
- [x] Add atomic persistent Firestore rate limiting: 30 attempts / 15 minutes per hashed IPv4 /24 or IPv6 /56 identifier; no raw network data stored.
- [x] Extend unit and isolated Auth/Firestore Emulator tests for validation states, input handling, concurrent limits and persistence.
- [x] Build production frontend and run root/Functions tests; document emulator contention warnings and limitations.
- [x] Update API/security/test/implementation records; UX-001 remains Open.
- [x] B3 implementation approved and completed locally: completion handler, Auth password update and transactional claim/finalize path. See B3 record below.
- [ ] Run browser valid-link workflow and production/deployment verification only after their separate approval; do not deploy as part of B3.

### C — Accessible Add Case fields (UX-002)

- [x] Inventory every input/select/textarea in Add Case template; base FIR/court fields were already labeled. Added explicit associations for incident/complainant fields, registration parts, highlighted case, accused fields, witness table fields, and witness summaries.
- [x] Add stable IDs and label targets; clone helpers assign unique accused/witness IDs and rebind repeated labels. Witness-table controls retain row-specific accessible names. No radio groups require fieldset/legend.
- [x] Static DOM-style check: 51 visible controls, no unlabeled controls, duplicate IDs, or dangling `for` targets. Compared 66 controls before/after; names, types, values, required and disabled states are unchanged.
- [ ] Browser interaction checks: activate every label, keyboard traverse the form, add/remove repeated rows, and verify required validation and Add/Edit persistence. Browser access was unavailable; clone behavior is source-reviewed, not runtime-tested.
- [ ] Compare serialized values before/after; exercise create/edit without changing business rules.
- [ ] Approval gate: page-specific changes.

### D — Dialog behavior (UX-003, UX-016)

- [x] Inventory UX-003 dialogs: Add Case is a custom ARIA modal; Case Detail is a custom ARIA modal; Add/Edit IO can open as a nested native `<dialog>` from Add Case.
- [ ] Approve shared component/controller refactor separately.
- [x] Implement scoped shared focus control for Add Case and Case Detail: meaningful initial focus, Tab/Shift+Tab containment, focus redirection, Escape, opener/fallback restoration, and per-open listener cleanup. Existing titles, modal semantics, close actions, and body scroll lock are preserved.
- [ ] Runtime-check focus containment, background focus prevention, opener restoration, Escape/close behavior, nested IO behavior and dynamic Add Case controls. Browser access was unavailable; source review is not a runtime pass.
- [ ] Test validation/error/long content/mobile height for each dialog.
- [ ] Address Admin Manage dialog opaque surface in focused selector/token scope.
- [ ] Confirm role actions remain unchanged; do not apply role mutation in routine visual tests.

### E — Export actions (UX-004)

- [x] Owner decisions applied: All Cases and Reports; CSV, XLSX and PDF; user-selected Filtered Records or All Records.
- [x] Added an accessible format/scope dialog to both existing export actions, with live count, keyboard focus/Escape, cancellation, duplicate-submit protection, progress and safe error feedback.
- [x] All Cases exports only the five displayed data columns; active filters/search/sort are applied to all matching rows. All Records uses the page’s already-loaded role-authorized cache and ignores filters; no extra query is added.
- [x] Reports export the four displayed summary metrics plus displayed chart/list aggregates (up to five categories each) in one consistent three-column table. This page has no filters, so both scopes use the same authorized report dataset; no new calculations or UX-010 interpretation was added.
- [x] Synthetic unit and browser checks cover CSV quoting/BOM/formula injection, Unicode and leading zeros, text-only XLSX, PDF settings/download, empty data, scopes, count, dialog focus, themes and mobile/desktop width.
- [ ] Run authenticated All Cases and Reports verification for current user/role scopes and compare downloaded rows to the actual page dataset before closing UX-004.

### F — KPI, task and report content (UX-005/006/010)

- [x] UX-005: confirmed all five Dashboard KPI counts are data-bound through `loadCaseRecords(db)` and existing `renderDashboard()` calculations; removed the four static HTML deltas (`↑ 12%`, `↑ 8%`, `↓ 25%`, `↑ 16%`) and their KPI-only `.stat em` / `.stat .down` styles. No new comparison metric was introduced. Chart breakdown/tooltip percentages remain unchanged.
- [x] UX-005 source/build checks and unit suite passed; authenticated Dashboard runtime, loading/error/empty states, navigation, theme and seven-width visual checks remain pending. Keep UX-005 High · Open.
- [x] UX-006 copy: renamed the dashboard feature “Tasks”; explained browser/device-local storage and stated that due dates organize the list but no automatic alerts are sent. Removed reminder promises from task empty states; preserved persistence and task interactions.
- [ ] UX-006 browser-check copy/readability at mobile and desktop widths in both themes; verify Add/complete/Delete and local persistence. Browser access unavailable; keep issue Open pending rendered verification.
- [x] UX-010 Phase B: replaced FIR-summary Pending with a Reports-scoped count of distinct eligible linked court proceedings; implemented approved active/terminal/UCR/unknown status handling and the accessible unknown-status count warning. The same result feeds the KPI and Pending Court Proceedings export row.
- [x] UX-010 synthetic coverage includes supported statuses/aliases, unknown and blank, UCR/cancellation, per-proceeding counting, same-path and legacyCaseId deduplication, PO flags, hearing-date independence and export label/value. `npm test`, syntax, production build and scoped diff check results are recorded in the UX-010 decision package.
- [ ] UX-010 browser-check authenticated Reports behavior, role-scoped exports, seven widths and both themes. Synthetic fixture only; keep Medium · Open pending runtime regression.
- [ ] Preserve status and task storage behavior unless separately approved.

### G — Admin contrast and local mobile fixes (UX-009/013–017)

- [x] UX-007 audited existing FIR values/aliases and kept FIR status separate from linked court-case status. Added a shared FIR presentation map and tokens across the FIR Index, FIR Register details and Status Map. Preserved all classification logic and stored values.
- [x] UX-007 maps UI to blue, UCR/untraced/cancellation to yellow, UT to red, and Disposed to green; missing/unknown/duplicate remain neutral. Added presentation tests; `npm test` passed 43/43 and production build/syntax checks passed.
- [ ] UX-007 browser verification: synthetic records for each status in FIR Register, FIR Index, FIR Details and Status Map; both themes; representative mobile/desktop sizes; inspect computed/composited contrast and linked-case status distinction. Browser access unavailable; no screenshots captured. Keep UX-007 Open pending this work.
- [ ] Correct Admin light-theme contrast with alpha-composited measurements.
- [ ] Verify dialog surface in both themes at 320 and 1366.
- [ ] Resolve Dashboard title/control collision and chart label crowding.
- [ ] Resolve populated Register Diary row overlap without changing dates/status updates.
- [ ] Preserve UX-009 as one issue with per-register subchecks; choose strategy before hiding/reflowing any field.
- [x] UX-009 inventory and treatment: retain tabular semantics and all columns; make the All Cases, FIR Index, Admin Users, and nested accused-table overflow regions named, keyboard-focusable, focus-visible, and visibly signposted. Changes are scoped to those table wrappers; Police Station Master and UX-017 styles are preserved.
- [ ] UX-009 responsive evidence: test each table at 320, 375, 430, 768, 1024, 1366, and 1920px in both themes using synthetic long values and multiple rows; capture screenshots and measure document overflow. Browser access was unavailable in this increment.
- [ ] UX-009 functional regression: verify keyboard/touch scrolling, search, sorting, filtering, pagination, row navigation, Admin actions, and FIR Index Page No editing. No authenticated workflow was run.
- [ ] Inspect Landing preview and Setup visuals only when valid setup state is available.

### H — Shared design system and page refinement

- [ ] Inventory actual existing token values before proposing replacements.
- [ ] Reuse existing CaseTrack visual identity and components.
- [ ] Keep changes to one concern per increment/page; document exceptions.
- [ ] No framework/dependency additions without explicit approval.
- [ ] Update component matrix and issue links with observed evidence.

## Definition of Done for each increment

- [ ] Objective and issue IDs are explicit.
- [ ] Only approved files/scope changed; no Firebase production change.
- [ ] Acceptance criteria are demonstrated with synthetic fixtures.
- [ ] Relevant unit/E2E/emulator/browser checks from regression plan pass.
- [ ] Before/after screenshots or interaction evidence attached for visual changes.
- [ ] Business invariants, role access and data relationships remain intact.
- [ ] Accessibility checks cover names, keyboard, focus and contrast as relevant.
- [ ] Rollback path is documented and low-risk.
- [ ] Issue status remains Open until evidence is reviewed and recorded; no planned work is pre-closed.

## Increment 1A completion record — 15 November 2026

- **Code change:** added `passwordSetup` to the explicit Vite build inputs in `vite.config.js`.
- **URL mapping:** `OPERATOR_SETUP_URL` example is `https://sknarwal03.github.io/CaseTrack/pages/password-setup.html`; Vite base is `/CaseTrack/`; generated output is `dist/pages/password-setup.html`. `firebase.json` contains no Firebase Hosting configuration.
- **Build:** clean `npm run build -- --emptyOutDir` passed. All 16 expected nested HTML pages emitted; no existing page entry was removed. All 9 generated local CSS/JS/manifest/icon references resolve.
- **Invalid link:** local preview returned 200 and displayed the invalid-link message with the form hidden; no asset requests failed. The malformed UID/token is rejected before any backend request.
- **Automated tests:** `npm test` — 42 passed; `node --test functions/tests/operator-email.test.cjs` — 5 passed.
- **Files changed:** `vite.config.js`, this checklist, and `MASTER-UI-UX-ISSUE-REGISTER.md`. Generated `dist/` output is ignored build output. No Firebase/Functions/auth/token/UI code was changed.
- **Remaining backend dependency:** `validateOperatorSetupCode` and `completeOperatorPasswordSetup` remain absent; valid-link workflow and completion are not verified. Increment 1B requires separate approval.
- **Rollback:** remove the single `passwordSetup` input line from `vite.config.js` and rebuild; no backend, data, or deployment rollback is required.
- **Issue state:** UX-001 remains Open pending complete backend-backed flow and deployment verification.

## Increment 1B-B1 completion record — 15 November 2026

- **Branch:** `codex/increment-1b-b1-token-infrastructure`.
- **Files changed:** `functions/operator-email.cjs`, `functions/tests/operator-email.test.cjs`, `functions/tests/operator-email.firestore-emulator.test.cjs`, `e2e/admin-panel.browser.test.cjs`, the master issue register, this checklist, `PASSWORD-SETUP-IMPLEMENTATION-LOG.md`, and the Password Setup architecture, security, API contract and emulator test-plan documents.
- **Token records:** newly issued records require the allowlisted `purpose` field. Token registration, internal purpose lookup, validation, claim, and completion-state transitions reject missing or mismatched purpose. A legacy record with no purpose is invalid; issuing a fresh token replaces it with an explicitly purposed record.
- **State and expiry:** retained `issued`, `consuming`, and `used`; added explicit `revoked`. Expiry remains timestamp-based; validation/claim reject expired, malformed, or greater-than-24-hour lifetimes. Token claims remain transactional and one-time.
- **Tests:** `functions/npm test` — 8 passed, 1 emulator test skipped in the normal run. Isolated emulator run — 1 passed, 0 failed. Syntax and `git diff --check` passed. Details and limitations are in the implementation log.
- **Rate limiting:** no limiter exists. Persistent shared rate limits require an additional counter store/schema fields or approved external edge service, neither included in the purpose-only approval; no rate limiter was implemented.
- **Scope:** no handlers, password update path, provisioning integration, Authentication config, Rules, production data, or deployment were changed. UX-001 remains Open.
- **Rollback:** reverse the Increment 1B-B1 changes listed in the implementation log only; preserve other working-tree changes. No production rollback or data migration is needed.
- **Next gate:** Increment 1B-B2 endpoint work requires separate explicit approval. Do not proceed automatically.

## Increment 1B-B2 completion record — 15 November 2026

- **Files added/changed:** added `functions/password-setup.cjs` and its unit/Firestore Emulator tests; updated `functions/index.js`; updated the issue register, checklist, implementation log, security review, API contract and test plan. No frontend, Rules, Firebase configuration or production resource was changed.
- **Endpoint:** exported `validateOperatorSetupCode` as an HTTP `onRequest` handler in `us-central1`. Contract stays `{uid, token}`; purpose comes from matching stored token state. It checks active token eligibility without consuming it and returns only `{valid:true|false}` for credential outcomes.
- **Limiter:** new collection `operatorSetupRateLimits`; atomic 30 attempts / 15 minutes per hashed IPv4 /24 or IPv6 /56 source prefix. At most 10 expired entries are opportunistically cleaned per request. No custom index, Rules change, IAM change or external service was required. This is not production-grade abuse protection.
- **Tests:** root `npm test` — 42 passed. Functions `npm test` — 15 passed, 0 failed, 2 emulator tests skipped because the ordinary run had no emulator hosts. Dedicated Auth + Firestore Emulator run for B2 — 1 passed, 0 failed, 0 skipped; validation states, token non-consumption, concurrency threshold and persistence across limiter reconstruction were checked. The emulator emitted transaction-lock-timeout warnings during concurrent limiter stress despite the test passing; this indicates emulator contention and remains a limitation. Production build passed; syntax checks and `git diff --check` passed.
- **Remaining blockers:** `completeOperatorPasswordSetup`, Auth password update, recovery issuance/reissue, email delivery/provisioning integration, ambiguous cross-service recovery, production abuse controls and deployed URL behavior remain unimplemented/unverified. A valid token can be validated, but password setup cannot be completed yet. UX-001 stays Critical · Open.
- **Rollback:** revert only B2 additions in `functions/index.js`, remove `functions/password-setup.cjs` and the two B2 test files, and revert B2 documentation sections. Do not restore the entire audit directory or reset unrelated work. No production data, Rules, deployment or configuration rollback is required; emulator limiter records are disposable synthetic data.
- **Next increment:** B3 should implement password completion only after separate approval, including Auth/Firestore failure recovery and concurrent completion semantics. No B3 work was started.

## Increment 1B-B3 completion record — 15 November 2026

- **Branch:** `codex/increment-1b-b1-token-infrastructure`; pre-existing B1/B2 and unrelated working-tree changes preserved.
- **Files changed for B3:** `functions/index.js`, `functions/operator-email.cjs`, `functions/password-setup.cjs`, `functions/tests/password-setup.test.cjs`, new `functions/tests/password-setup-completion.firestore-emulator.test.cjs`, this checklist, issue register, implementation log, security review, API contract, test plan, and backend architecture addendum.
- **Endpoint:** exported `completeOperatorPasswordSetup` as v2 HTTP `onRequest` in `us-central1`, preserving `{uid, token, password}` and `{completed:true}` success. Purpose comes from stored token state; no login session or client purpose is accepted.
- **Policy/state:** server enforces 12–128 Unicode code points. Transactional transition is `issued → consuming → used`; confirmed success deletes the digest and clears only initial-setup `mustChangePassword`. Recovery leaves it false. Role/status/station/other fields stay unchanged.
- **Failure handling:** every post-claim Auth error is treated as ambiguous; no release to `issued` and no automatic retry. Fixed, safe failure-stage metadata is written to the existing token document when possible. Finalization failure returns 503 and leaves the token `consuming` or `used`; replay cannot update Auth again. Manual authorized reconciliation/fresh issuance remains unavailable and is a release blocker.
- **Limiter:** reuses the B2 Firestore limiter, 30 attempts / 15 minutes per hashed IPv4 /24 or IPv6 /56; completion and validation share the source-prefix bucket. UID changes do not bypass it. Users sharing a network share quota; source rotation and production-scale behavior remain limitations.
- **Tests:** root `npm test` — 42 passed. Functions `npm test` — 22 passed, 0 failed, 3 emulator tests skipped without emulator hosts. B1 Firestore Emulator — 1 passed; B2 Auth/Firestore Emulator — 1 passed; B3 Auth/Firestore Emulator — 1 passed. Emulator concurrency emitted Firestore transaction-lock-timeout warnings even though B2/B3 assertions passed. Syntax checks, `git diff --check`, and production build passed. New Auth Emulator assertions signed in with the changed password and verified replay did not replace it.
- **Not verified:** production deployment/configuration, live HTTP Functions endpoint, browser valid-link E2E, actual process termination, production Auth password policy, and operational reconciliation.
- **Rollback:** remove only the `completeOperatorPasswordSetup` export/wiring from `functions/index.js`; remove B3 handler logic and completion-registry helpers from `functions/password-setup.cjs` and `functions/operator-email.cjs`; remove the new B3 emulator test and B3 unit cases; revert B3 documentation addenda. Preserve B1/B2 implementation and unrelated work. No production rollback or data migration is needed; synthetic emulator data is removed by test cleanup.
- **Issue state:** UX-001 remains **Critical · Open**. B4/B5 are not started and require separate explicit approval.

## Increment 1B-B4 gate record — 15 November 2026

- [x] Reviewed existing B1-B3 source, tests, and Password Setup documentation.
- [x] Confirmed Admin authorization uses Firebase ID-token verification and trusted active Admin role lookup.
- [x] Recorded approved policies: in-person verification attestation, manual Admin-controlled handoff, dedicated secret-free audit, reviewed revoke/reissue, and target limits of 3 per 24 hours with a 15-minute interval.
- [x] Created `PASSWORD-SETUP-B4-SECURITY-DESIGN.md` with source discrepancies, exact proposed schemas/contracts, state machines, limits, threat analysis, failures, and test matrix.
- [x] Confirmed implementation requires new Firestore operation/audit/limit schemas and new Admin UI; existing Admin UI cannot safely support the flow.
- [x] Recorded updated owner policies: Admin issuance cap 20 per 24 hours, audit retention 365 days, global active-Admin scope, same-Admin review after fresh verification, and recent reauthentication.
- [ ] Exact approval for operation/audit/issuance-limit schemas and optional token operation ID field.
- [ ] Exact approval for provider-aware recent reauthentication and target confirmation/attestation UI changes.
- [ ] Confirm five-minute auth age and proposed attestation/display windows; decide durable attestation API versus later server-only primitive.
- [ ] Resume B4.2 only after its exact schema and frontend/auth dependencies are approved. Do not start B4.3/B4.4/B4.5 or B5 automatically.

B4.1 and B4.2 gate review are documentation-only. No application runtime, tests, schema, Rules, indexes, or deployment changed; no code tests/build were run for B4.2. UX-001 remains Critical · Open. Rollback is documentation-only; preserve B1-B3 and unrelated workspace changes.

## Increment 1B-B4.2A exact approval review

- [x] Inspected current Admin auth middleware, Admin Users UI, role/eligibility model, token registry, Rules, and proposed B4 schemas/contracts.
- [x] Created `PASSWORD-SETUP-B4-EXACT-APPROVAL-MATRIX.md` with exact proposed field-level structures, API boundaries, risks, increment assignments, and numbered decisions.
- [x] Reconciled superseded B4.1 recommendations: Admin cap is 20 successful issues per rolling 24 hours; audit duration is 365 days. Retention mechanics and exact schemas remain open.
- [ ] Obtain explicit approval for exact operation/audit/limit schemas and token link field.
- [ ] Approve B4.2 endpoint, idempotency/retry contract, and verification-attempt throttle.
- [ ] Approve provider-aware reauthentication and target-summary/attestation UI details.
- [ ] Do not implement B4.2 until approvals are recorded; B4.3–B4.5 remain separately gated.

B4.2A changed documentation only; no tests/build were run. UX-001 remains Critical · Open. Rollback is limited to the matrix and B4.2A documentation addenda; preserve prior increments and unrelated workspace changes.

## B4.2 final technical approval package

- [x] Prepared `PASSWORD-SETUP-B4.2-FINAL-APPROVAL-PACKAGE.md` with exact B4.2 operation, idempotency, and audit schemas and endpoint/UI contracts.
- [x] Defined UUID v4 key validation, request fingerprint, binding, atomic duplicate handling, 24-hour replay, stale-key rejection and lost-response recovery.
- [x] Defined accepted durable audit event and rejected/pre-operation structured logging without an unauthenticated Firestore write primitive.
- [x] Limited UI to target confirmation, genuine reauthentication, in-person acknowledgement, reason selection, stable-key submission and safe result state; no token handoff.
- [ ] Obtain explicit owner approval for schema, replay/tombstone retention, audit access/holds, auth-time boundary, attestation window, provider support, UI wording and API contract.
- [ ] Do not implement B4.2 until separate explicit authorization is recorded. Do not begin B4.3–B5.

Documentation only; no tests/build run. UX-001 remains Critical · Open.

### UX-017 — Admin table light-theme contrast

- [x] Inspected audit documents, Admin markup, scoped table selectors, shared light/dark theme variables, and baseline computed contrast evidence.
- [x] Changed only `body.light-theme .admin-users-table td:first-child` in `assets/css/operator-management.css` and `body.light-theme .station-master-table th` in `assets/css/police-station-master.css`.
- [x] Captured 14 viewport/theme combinations with synthetic display rows; document width equals viewport width in all combinations. Narrow tables retain their existing internal horizontal scroll.
- [x] Verified focus outline, Admin row hover, and a disabled button style in the CSS fixture. There is no selected-row state in the current Admin Users table; Police Station Master is read-only.
- [x] Measured light contrast: Admin UID baseline 2.33:1 → 13.60–15.29:1 across normal/alternating/hover backgrounds; station heading baseline 1.24:1 → 11.52–11.62:1 after compositing the translucent header over the light panel gradient. Dark-theme computed foregrounds remain unchanged.
- [x] Root `npm test`: 42 passed. Functions `npm test`: 22 passed, 0 failed, 3 emulator-only tests skipped. `npm run build -- --emptyOutDir`: passed.
- [ ] Admin browser action regression: existing browser E2E was attempted with the fixed demo emulators and synthetic users but stopped before Admin Panel because browser sign-in returned `auth/network-request-failed`. No action workflow is claimed verified.

**Status:** UX-017 remains High · Open pending successful Admin browser regression. Evidence: `screenshots/ux-017-admin-tables-<width>-<theme>.png` (CSS fixture, synthetic rows, application JS stubbed) and `screenshots/ux-017-visual-measurements.json`. No JavaScript, Firebase behavior, data, markup, or unrelated styles changed. Temporary visual harness removed; 14 requested screenshots and measurements retained.

### UX-016 — Manage account dialog surface correction

- [x] Root cause confirmed: `#roleManagementDialog` used undefined `--panel`; shared theme provides opaque `--surface`.
- [x] Changed only the default and light-theme `#roleManagementDialog` background declarations in `assets/css/operator-management.css`; preserved backdrop and UX-017 rules.
- [x] Browser computed styles resolve to opaque light/dark surfaces at 320, 375, 430, 768, 1024, 1366 and 1920 px; dialog dimensions fit the viewport and document width did not overflow.
- [x] Isolated native-dialog open/Escape smoke-check at 320/375/430 in both themes; existing backdrop remains `rgba(0, 0, 0, 0.65)`.
- [ ] After screenshots: capture attempt failed with Chrome `Page.captureScreenshot: Unable to capture screenshot`; existing before screenshots are retained, but no after screenshots are claimed.
- [ ] Authenticated Admin regression: button opening/closing, Escape, validation, keyboard/focus behavior, and Admin actions remain unverified. Prior browser run was blocked by synthetic Admin sign-in `auth/network-request-failed`.
- [x] Root `npm test`: 42 passed; production build passed; `git diff --check` passed with unrelated line-ending warnings.

**Status:** UX-016 remains High · Open pending screenshot and authenticated functional verification. Rollback only the two dialog background declarations to their previous `var(--panel)` value. UX-017 remains unchanged.

### UX-015 — Register Diary hearing-row responsive correction

- [x] Traced collision to session metadata (`width:max-content` / nowrap), fixed-width court marker, and status/FIR controls sharing the generic flex row.
- [x] Added only the presentation class `diary-session-file-item` for session rows in `createDiaryFileItem()`; added scoped wrapping, phone stacking, and 44px mobile/tablet targets in `register-diary.css`.
- [x] Synthetic CSS fixture: long Judge and Court names, missing metadata, populated/empty linked dates, multiple rows, and varied status states across seven widths and both themes. No row overlap, text overflow, or page-wide overflow; controls at least 44×44px through 768px.
- [ ] After screenshots: Chrome `Page.captureScreenshot` returned `Unable to capture screenshot`; no after images claimed. Prior before evidence retained in screenshot index.
- [x] `npm test`: 42 passed; `npm run build -- --emptyOutDir`: passed; `node --check assets/js/register-diary.js` and `git diff --check`: passed.
- [ ] Functional regression: authenticated FIR navigation, status updates/persistence, and keyboard traversal not run. No business logic or Firebase code changed.

**Status:** UX-015 remains Medium · Open pending screenshot and functional interaction verification. Rollback the session-row presentation class and its scoped CSS only.

## UI/UX testing infrastructure recovery (15 November 2026)

- [x] Reproduced `Page.captureScreenshot: Unable to capture screenshot` on static HTML with Chrome 157.0.8103.51 and Playwright 1.64.1; verified the same capture succeeds with `--disable-gpu --disable-dev-shm-usage`.
- [x] Captured and decoded five basic PNGs: static page, CaseTrack landing page, and unauthenticated Login page at 320 and 1366 px.
- [x] Started Auth, Firestore and Functions emulators on 9198/8187/5003 using Node 22.23.5; current Functions source discovery loaded ten exports.
- [x] Root unit suite: 42 passed, 0 failed, 0 skipped.
- [x] Added a current-page browser harness, local test config with multi-project mode, and a one-command runner. These are prepared test utilities, not yet end-to-end verified.
- [ ] Remove the generated temporary Firebase CLI ADC copy through the environment's approved cleanup mechanism before another emulator run. Do not rerun while it remains.
- [ ] Verify the split fresh-emulator workflow. Prior Functions test execution failed because several `demo-casetrack-password-*` projects were used with the single-project Admin emulator config; exact Functions suite counts were not retained.
- [ ] Retain the authenticated Admin/Diary JSON report and all 56 valid PNGs; no authenticated Browser E2E result or complete matrix is currently claimed.
- [x] Production build passed in an isolated temporary output directory; required `index.html`, Admin Panel, Register Diary, and Password Setup outputs were present.
- [x] Final Node syntax check, all three PowerShell parser checks, local emulator JSON parse, and `git diff --check` passed.
- [ ] Rerun the Functions tests after the temporary Firebase CLI ADC copy is removed by an approved mechanism and the split emulator setup is exercised safely.

**Status:** UX-015 Medium/Open, UX-016 High/Open, UX-017 High/Open. This recovery did not change issue statuses. Details, exact outputs, blockers and rollback are recorded in `UI-UX-TEST-INFRASTRUCTURE-RECOVERY.md`.

## UX-013 — Dashboard Case Trends heading and period selector

- [x] Root cause: generic dashboard `select` rule applies `width: 100%` to `#trendPeriod` inside the horizontal `.panel-heading`; `.panel-title h2` uses `white-space: nowrap`, causing flex items to collide at constrained widths.
- [x] Scoped CSS in `assets/css/dashboard.css`: `.period` now uses intrinsic width with `max-width: 100%`; at `max-width: 500px`, `.panel-trend .panel-heading` stacks, title may wrap, and the selector fills the available panel width.
- [x] Browser DOM geometry checks with the current `shared.css` and `dashboard.css` and matching Case Trends markup passed at 320, 375, 430, 768, 1024, 1366 and 1920 px in dark and light themes (14/14): no heading/selector overlap, no document-wide horizontal overflow, heading text fits, and selector remains visible.
- [x] Selector operation check selected and read back `lastYear` at each viewport/theme (14/14). Header stacks through 500px and retains a horizontal row at 768px and wider.
- [x] Captured and decoded 14 CSS/markup fixture screenshots at the seven requested widths in light/dark themes under `screenshots/ux-013/`, using the previously confirmed Chrome launch flags. These show the Case Trends panel only, not the authenticated full Dashboard route.
- [x] `npm test`: 42 passed, 0 failed, 0 skipped; `node --check assets/js/dashboard.js` passed; isolated Vite production build passed and emitted `pages/dashboard.html`.
- [ ] Full dashboard-route visual review remains outstanding. Geometry tests and screenshots used the exact current stylesheets and matching header markup, without Firebase or chart data. No chart logic, period-filter handler, or Firebase code changed.

**Status:** UX-013 remains Medium · Open pending full-page visual evidence. Rollback by restoring the `.period` rule's previous default width behavior (remove `width: auto` and `max-width: 100%`) and removing the scoped `@media (max-width: 500px)` `.panel-trend` rules. Do not revert unrelated dashboard stylesheet changes.

## UX-014 — Dashboard chart and legend responsive readability

- [x] Root cause confirmed: the fixed 720-unit Case Trends SVG was compressed to panel width (making axis text tiny); its three-item flex key did not wrap and used color-only circular marks. The Case Status donut and fixed-width legend shared a non-wrapping row; long category text was no-wrap and ellipsized.
- [x] Changed only `pages/dashboard.html` presentation markup and `assets/css/dashboard.css`. The trend SVG is in a labeled, keyboard-focusable horizontal scroll region with a visible scroll hint at widths up to 1100px. Series keys wrap and use solid/dashed/dotted line marks that match their series. The status chart and legend wrap; category labels and values wrap instead of being truncated. UX-013's trend title/period stacking and styles are preserved.
- [x] Tested the current page chart markup/styles and extracted current `renderCaseTrends`/`renderDonut` renderer functions with synthetic data: empty dataset, one category, multiple categories, long category labels, and 1,234 records with large totals. All 70 scenario × theme × viewport combinations passed across 320, 375, 430, 768, 1024, 1366 and 1920px in both themes.
- [x] Verified readable chart text, empty-state output, legend category/value content, no text clipping, trend-key/chart and donut/legend separation, no document-wide horizontal overflow, scroll region focusability and scroll cue, period selector changing to `last6Months` and rendering six labels, and 1,234-record donut total. No browser console/page errors. No chart calculation, data mapping, or Firebase code was changed.
- [x] Captured and decoded 14 synthetic after screenshots in `screenshots/ux-014/`; before evidence remains `dashboard-320-light.png` and `dashboard-320-dark.png`. The fixture uses the exact current chart panel markup and styles plus the existing chart renderer functions, but is not the authenticated full Dashboard route.
- [x] `npm test`: 42 passed, 0 failed, 0 skipped. `node --check assets/js/dashboard.js` passed. Isolated production build passed and emitted `pages/dashboard.html`. `git diff --check` passed.
- [x] UX-014 synthetic chart fixture acceptance passed (70 scenario/theme/viewport checks; 14 captures). This is implementation evidence only under Phase 3 closure rules; it does not verify the actual authenticated Dashboard route.

**Status:** UX-014 Medium · Implemented/Open pending actual-route verification under Phase 3 rules; synthetic CSS/chart fixture passed but is insufficient to close the issue. Full authenticated Dashboard testing was not run. **Rollback:** revert only the UX-014 markup wrapper and scroll-hint around `#caseTrendChart`, the UX-014 chart-key/scroll/status/legend CSS rules and responsive declarations in `assets/css/dashboard.css`, and remove the 14 files in `screenshots/ux-014/`. Preserve the UX-013 `.period` width override and `.panel-trend` narrow-screen rules.

### UX-008 — Explicit Dashboard navigation destination

- [x] Added one explicit Dashboard link to the shared authenticated sidebar, using the existing `dashboard.html` destination and a decorative dashboard-grid SVG icon.
- [x] The item inherits existing sidebar styling and mobile-drawer behavior. `markActiveNav()` highlights the matching item and sets `aria-current="page"` only for the active destination. Existing role visibility rules remain unchanged; Dashboard is shown wherever the shared authenticated sidebar is shown.
- [x] Static source checks confirm one Dashboard sidebar destination and the existing Dashboard route on `body[data-page="dashboard"]`; no route, authentication, or business logic was changed.
- [ ] Browser-check desktop/mobile navigation, active announcement, keyboard focus, both themes, and Admin/Operator role views at 320, 375, 430, 768, 1024, 1366, and 1920px. Browser testing was unavailable in this increment; no visual or role-specific runtime result is claimed.
- [x] `npm test`: 42 passed, 0 failed, 0 skipped; `node --check assets/js/shared-layout.js`, production build and scoped `git diff --check` passed.

**Status:** UX-008 Medium · Open pending browser verification. **Rollback:** remove only the Dashboard `<a data-page="dashboard">` from `SIDEBAR_HTML` and revert the `aria-current` updates in `markActiveNav()` in `assets/js/shared-layout.js`; revert the UX-008 entry and this checklist section. Preserve unrelated changes.

### UX-006 — Dashboard Tasks wording

- [x] Confirmed storage is browser `localStorage`, keyed by authenticated UID with a guest fallback. There is no notification API, scheduler, background alert, or cross-device sync. Due date/time is used for ordering and overdue visual styling only.
- [x] Replaced “Tasks & Reminders” with “Tasks”; removed “task or reminder” empty-state copy; clarified browser/device-local storage and no automatic notifications; renamed Date/Time inputs to Due date/Due time. Add, complete/incomplete, delete, sorting and persistence logic are unchanged. There is no existing Edit action in this feature.
- [x] `npm test`: 43 passed, 0 failed, 0 skipped; `node --check assets/js/dashboard.js`, production build and scoped `git diff --check` passed.
- [ ] Browser-check mobile readability, light/dark text, task interactions and local persistence. Browser access unavailable, so no runtime or screenshot result is claimed.

**Status:** UX-006 Medium · Open pending browser verification. **Rollback:** restore the former Tasks & Reminders headings, reminder empty-state text and Date/Time labels in `pages/dashboard.html`/`assets/js/dashboard.js`; remove `.task-scope-note` from `assets/css/dashboard.css`; revert only the UX-006 documentation. Preserve unrelated Dashboard changes.

### UX-012 — Landing hero preview mobile readability

- [x] Inspected landing hero preview labels, base font sizes, truncation/wrapping, fixed badge width, and mobile breakpoints. Root issue: 7–10px nested preview labels and constrained three-card/flex content.
- [x] Added `assets/css/landing-ux-012.css`, linked after `landing.css`, scoped to widths <=480px. Vite bundles it into the main CSS asset before base landing CSS; higher-specificity scoped selectors preserve the intended override. Preview text increases to 11–12px, line heights 1.2–1.45 as appropriate, long copy wraps, nested items may shrink, and the three-stat layout is preserved. Desktop rules remain unaffected.
- [x] Static source and built-CSS checks passed, including CTA/link presence and production stylesheet cascade. `npm test`: 43 passed; `node --check assets/js/dashboard.js`, production build and scoped `git diff --check` passed. No JavaScript changed for UX-012.
- [ ] Browser verification at 320, 375, 430, 768, 1024, 1366, 1920px: readability, wrapping, no clipping/overlap/page overflow, CTA visibility and desktop regression. Browser access unavailable; no screenshots produced. Landing page has no light-theme toggle.

**Status:** UX-012 Low · Open pending browser verification. **Rollback:** remove the `landing-ux-012.css` link from `index.html`, delete that new stylesheet, and revert this UX-012 checklist and register entry. Preserve unrelated landing changes.

### UX-004 — Functional exports (15 November 2026)

- **Files added:** `assets/js/data-export.mjs`, `assets/js/export-dialog.js`, `assets/css/export-dialog.css`, `assets/fonts/NotoSansDevanagari.ttf`, `assets/fonts/NotoSansDevanagari-OFL.txt`, `test/data-export.test.mjs`, `test/fixtures/export-smoke.html`, `e2e/ux-004-export.browser.test.cjs`.
- **Files changed:** `pages/cases.html`, `assets/js/cases.js`, `pages/report.html`, `assets/js/report.js`, `package.json`, `package-lock.json`, this checklist and the master issue register.
- **All Cases columns:** FIR No., Date of FIR, Under Section, In the court of, Next Hearing / PO details. Filtered rows follow current search/status filters and displayed sort; all rows use the existing authorized in-memory page cache. Pagination is not present. Exports omit the Action column and all internal Firestore metadata.
- **Reports structure:** Report section, Metric or category, Count. Includes the four current summary metrics and existing displayed status/stage/court/station aggregates. Existing top-five behavior and all calculations remain unchanged. Both scopes match because the page has no filters.
- **Library/bundle impact:** ExcelJS 4.4.0 (MIT), PDFMake 0.3.14 (MIT); dynamic format chunks are about 930 KB and 771 KB raw (256 KB and 289 KB gzip). Noto Sans Devanagari variable TTF is 642 KB under SIL OFL. ExcelJS UUID dependency is overridden to 11.1.1; remaining npm audit findings are three high advisories in the pre-existing Vite 8.3.0 development dependency.
- **Verification:** `npm test` — 50 passed, 0 failed; syntax checks for the two page scripts and export modules passed. Playwright synthetic fixture passed at 320px and 1366px in light/dark surfaces, including open, Cancel/Escape, focus restoration, scope counts, generic error feedback, and actual CSV/XLSX/PDF downloads. CSV contents and XLSX workbook cells were read back; PDF signature, embedded TrueType font, and Unicode text map were checked. `npm run build -- --emptyOutDir` passed; Vite warns that both lazy format chunks exceed its 500 KB raw chunk advisory. `git diff --check` passed with only Git line-ending normalization warnings.
- **Not yet verified:** authenticated page routes, real role-scoped record contents, very large export performance, and cross-browser PDF font rendering. No Firebase, Auth, Rules, database schema, backend, or report calculation changes were made.
- **Status:** UX-004 remains **High · Open** until authenticated dataset and permission-boundary verification is completed.
- **Rollback:** remove the two page dialogs/CSS links and restore inert button markup; remove the controller imports/wiring; delete the added export utilities, stylesheet, synthetic tests/fixture/runner and font/license; revert only this increment’s package/lock and documentation changes. Keep all prior UX work and unrelated workspace changes intact.


#### UX-005 implementation record

- **Removed:** the four static KPI delta labels `↑ 12%`, `↑ 8%`, `↓ 25%`, and `↑ 16%` from Unique FIRs, Active Cases, Pending Hearings and Disposed Cases.
- **Preserved:** all five KPI titles/count element IDs, existing data source/calculations in `assets/js/dashboard.js`, state handling, card interactions, and the unrelated chart percentage breakdown/tooltip.
- **Changed:** `pages/dashboard.html`, `assets/css/dashboard.css`, issue register and this checklist. Removed KPI-only `.stat em` / `.stat .down` CSS including the narrow-screen rule. No JavaScript behavior changed.
- **Verification:** `npm test` passed 50 tests (0 failed, 0 skipped); `node --check assets/js/dashboard.js` passed; `npm run build -- --emptyOutDir` passed with Vite's >500 KB chunk advisory. A Playwright fixture using actual KPI markup and Dashboard CSS passed at all seven widths in both theme classes with synthetic large counts, with no overlap, clipping beyond the viewport or page overflow. It did not load Dashboard JavaScript or authenticate. Authenticated live data/state behavior and navigation remain pending; no screenshots were captured.
- **Status:** UX-005 High · Open pending authenticated/rendered verification. **Rollback:** restore only the four KPI HTML fragments and their scoped CSS rules, then revert these UX-005 documentation records. Do not revert unrelated dashboard changes.

## Phase 3 — Consolidated final verification (15 November 2026)

- Reviewed all 17 canonical issues, UX-001–UX-017, against the current register and indexed evidence. No new issue was observed; actual route testing was blocked.
- `npm test`: **60 passed, 0 failed, 0 skipped**. Relevant syntax checks: **14 passed**. `npm run build -- --emptyOutDir`: **passed**, 17 HTML page entries emitted; existing >500 kB dependency-chunk advisory remains.
- Browser host unavailable and no isolated Firebase emulator service was already running. Per scope, no emulator/browser infrastructure was started or reconfigured, no accounts/data were created, and no authenticated route was tested. No Phase 3 screenshots were captured; `SCREENSHOT-INDEX.md` is unchanged.
- `git diff --check` passed for unstaged changes (with Git's existing line-ending warnings). `git diff --cached --check` reported pre-existing whitespace findings in staged files. They were not normalized or cleaned.
- No issue meets the Phase 3 closure gate. UX-001 and UX-011 remain Blocked/Open or deferred. UX-002–UX-010 and UX-012–UX-017 remain Implemented/Open pending actual-route evidence; this includes UX-014, whose prior synthetic fixture does not satisfy Phase 3 verification. Full issue matrix and exact environment details: [`PHASE-3-FINAL-VERIFICATION-REPORT.md`](PHASE-3-FINAL-VERIFICATION-REPORT.md).
