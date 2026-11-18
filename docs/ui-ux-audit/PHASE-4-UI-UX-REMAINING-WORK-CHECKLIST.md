# Phase 4 — UI/UX Remaining Work Checklist

Practical work plan for UX-001–UX-017 after the Phase 4 read-only consolidation. Checkbox status applies to the task, **not issue closure**. None of the issues is closed. Do not start authentication/infrastructure work from this checklist; follow separate approvals already required by the project.

## Completed implementation slices (not issue closure)

- [x] **DONE-01 · UX-001 · Route packaging** — add Password Setup to the Vite page entries. Source: `vite.config.js`. Evidence: register/build record. This does not complete issuance, delivery or operational reconciliation.
- [x] **DONE-02 · UX-002 · Static labels and IDs** — add control label associations and dynamic row naming logic. Source: `components/add-case/add-case.html`, `components/add-case/add-case.js`. Evidence: static audit in canonical register. Dynamic interaction remains pending.
- [x] **DONE-03 · UX-003 · Case Details Escape** — add existing close callback and verify shared modal behavior in component fixture. Source: `assets/js/cases.js`; evidence: Phase 3D-B. Authenticated integration remains pending.
- [x] **DONE-04 · UX-004 · Export implementation** — accessible format/scope dialog and CSV/XLSX/PDF output. Source: `assets/js/data-export.mjs`, `assets/js/export-dialog.js`, `assets/js/cases.js`, `assets/js/report.js`, page markup/CSS. Unit/synthetic download evidence exists; authenticated content remains pending.
- [x] **DONE-05 · UX-005/006 · Dashboard copy/presentation** — remove unsupported KPI deltas; clarify Tasks/local storage/no alerts. Source: `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`. Live route/state verification remains pending.
- [x] **DONE-06 · UX-007/008 · Status/navigation** — share FIR display mapping and add Dashboard destination/active page announcement. Sources: `assets/js/fir-status-presentation.mjs`, `assets/js/shared-layout.js`. Browser verification remains pending.
- [x] **DONE-07 · UX-010 · Approved Reports metric** — implement owner-approved Phase B proceeding count and quality warning. Source: `assets/js/report-pending-proceedings.mjs`, `assets/js/report.js`, `pages/report.html`, `assets/css/report.css`. Ten synthetic rule tests pass; authenticated reports remain pending.
- [x] **DONE-08 · UX-012–015 · Responsive components** — narrow Landing typography; Trends header; charts/legend; Diary row layout. Sources: `assets/css/landing-ux-012.css`, `assets/css/dashboard.css`, `pages/dashboard.html`, `assets/js/register-diary.js`, `assets/css/register-diary.css`. Evidence is route/component-scoped as detailed in the report.
- [x] **DONE-09 · UX-016/017 · Admin visual corrections** — opaque Manage dialog and light-theme contrast overrides. Sources: `assets/css/operator-management.css`, `assets/css/police-station-master.css`. Component measurements pass; current Admin action verification remains pending.

## Priority 1 — Accessibility and high-impact workflow verification

### P1-01 · UX-002 · Add Case dynamic accessible names — VERIFY

- [ ] Inspect current Add Case markup and component script in a synthetic local DOM fixture; do not authenticate.
- [ ] Check every visible input/select/textarea has a unique ID and programmatic name; every explicit label targets an existing control.
- [ ] Add/remove accused and witness rows; verify cloned IDs and label targets remain unique and correct.
- [ ] Verify witness names/status/examined/date fields receive row-specific accessible names after clone and reordering.
- [ ] Check label activation, keyboard traversal, required validation and create/edit serialization with synthetic values.
- [ ] Acceptance: zero duplicate IDs/unlabelled visible controls; labels activate the intended input; dynamic row names stay unique; serialized create/edit values match the entered synthetic fields.
- **Source/component:** `components/add-case/add-case.html`, `components/add-case/add-case.js`, `components/add-case/add-case.css`.
- **Prerequisites:** existing local Playwright/Chrome and DOM fixture; no Firebase, account or backend.
- **Evidence:** result JSON, tested control/row inventory, keyboard/validation results and page errors; mark fixture as synthetic.
- **Current status:** not yet run in Phase 4. **Effort: LOW.**

### P1-02 · UX-003 · Case Details and Add Case modal integration — VERIFY

- [ ] Preserve current `onEscape` fix; do not edit without reproducible regression.
- [ ] When a separately approved synthetic authenticated route is available, test Case Details open, initial focus, Tab/Shift+Tab, background focus, Escape, close-button focus restoration and repeat cycles.
- [ ] Test Add Case/Edit and nested IO dialog Escape ownership, dynamically inserted controls and state preservation.
- [ ] Acceptance: only the top/authorized dialog closes; focus is contained/restored; no unrelated form state or workflow regresses.
- **Source/component:** `assets/js/cases.js`, `assets/js/shared-utils.js`, `components/add-case/add-case.js`.
- **Prerequisites:** authorized synthetic authenticated route for integration. Component callback itself already passed in Phase 3D-B.
- **Evidence:** route/role provenance, keyboard sequence, dialog/ARIA state, focus target and page errors.
- **Current status:** component fix verified; integration outstanding. **Effort: MEDIUM.**

### P1-03 · UX-004 · Authorized export content — VERIFY

- [ ] On separately approved authenticated All Cases/Reports routes, compare displayed records, filters, totals and chosen scope to each downloaded CSV/XLSX/PDF.
- [ ] Verify role/station boundaries and ensure action/internal metadata fields are not exported.
- [ ] Check All Cases filtered search/status/sort scope and Reports’ shared summary rows.
- [ ] Acceptance: each file’s rows/counts equal the role-authorized UI dataset and selected scope; formatting/identifiers remain correct; no unauthorized or hidden metadata appears.
- **Source/component:** `assets/js/cases.js`, `assets/js/report.js`, `assets/js/data-export.mjs`, `assets/js/export-dialog.js`, `pages/cases.html`, `pages/report.html`.
- **Prerequisites:** separate approval for synthetic authenticated data; existing unit/synthetic file tests already pass.
- **Evidence:** redacted UI/file row comparison, role/scope/filter provenance and download checks.
- **Current status:** synthetic exports passed; authenticated data boundary unverified. **Effort: HIGH.**

### P1-04 · UX-009 · Mobile register discoverability — INVESTIGATE / VERIFY

- [ ] Obtain owner preference per register: horizontal scroll with cue, priority columns/details, or compact row presentation; do not presume a redesign.
- [ ] Recheck current All Cases, FIR Index, Admin Users, nested FIR accused/register tables at 320/375/430/768 and desktop.
- [ ] Confirm focus entry/visible cue/keyboard reachability/touch scroll, row identity/actions, sorting/filtering and no page-wide overflow.
- [ ] Repeat ArrowRight from start and after focus entry; record each key and scroll delta. Do not add handlers for the single inconsistent miss unless current route reproduction supports it.
- [ ] Acceptance: primary identity/action is apparent; all columns/actions reachable; scroll/region is announced and operable; nested content and page have no accidental overflow.
- **Source/component:** `pages/cases.html`, `pages/fir-index.html`, `pages/admin-panel.html`, nested FIR table generation in `assets/js/fir-register.js`, related table CSS.
- **Prerequisites:** owner design choice; current route evidence for functional table actions requires separately approved synthetic auth.
- **Evidence:** viewport/theme captures, keyboard/touch log, scroll bounds and action/filter results.
- **Current status:** partially verified component fixture; current route inconclusive. **Effort: HIGH.**

### P1-05 · UX-016/017 · Current Admin dialog and contrast — VERIFY

- [ ] Recheck current Manage dialog opaque surface and computed composited contrast in light/dark at narrow and desktop widths.
- [ ] Verify initial focus, Tab/Shift+Tab, Escape, close, validation and the actual Manage action; resolve the immediate Shift+Tab fixture ambiguity on route.
- [ ] Inspect all normal-size table text and action/focus/hover states, not only the two previously measured pairs.
- [ ] Acceptance: no background text visible through dialog; normal text ≥4.5:1 against rendered surface; role management actions and keyboard behavior unchanged.
- **Source/component:** `pages/admin-panel.html`, `assets/css/operator-management.css`, `assets/css/police-station-master.css`.
- **Prerequisites:** separate synthetic authenticated Admin route approval.
- **Evidence:** computed foreground/background/ratio, route/role, keyboard sequence, screenshots and action result.
- **Current status:** component visual checks passed; authenticated action regression outstanding. **Effort: MEDIUM.**

## Priority 2 — Functional and route-level verification

### P2-01 · UX-005 · Dashboard KPIs — VERIFY

- [ ] Verify all five current data bindings/calculations, loading/error/empty behavior and card destinations on current Dashboard route.
- [ ] Confirm unsupported percent deltas remain absent and genuine chart percentages remain unchanged.
- [ ] Acceptance: displayed counts match loaded synthetic authorized records and status, responsive layout, themes and navigation work.
- **Source/component:** `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`.
- **Prerequisites:** authenticated route/data for dynamic acceptance; no need to reopen the static removal.
- **Evidence:** synthetic record-to-KPI reconciliation, state transitions, viewport/theme captures.
- **Current status:** source and component layout evidence; live state unverified. **Effort: MEDIUM.**

### P2-02 · UX-006 · Tasks interactions and persistence — VERIFY

- [ ] Check copy remains “Tasks,” explains browser-local storage and no automatic alert; check empty, storage error and populated states.
- [ ] Add, complete, delete, sort and reload tasks in a fresh profile; verify per-user key behavior when signed-in route later becomes available.
- [ ] Acceptance: behavior and copy match; data persists only in intended browser/user scope; controls are keyboard/touch operable.
- **Source/component:** `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`.
- **Prerequisites:** local browser fixture can verify guest storage; per-user scope requires approved auth.
- **Evidence:** interaction/state log and small/mobile/desktop render evidence.
- **Current status:** source behavior reviewed; runtime pending. **Effort: LOW.**

### P2-03 · UX-007 · FIR status consistency — VERIFY

- [ ] Render UI, UCR/Untrace, Cancellation, UT, Disposed, unknown/missing and duplicate examples in FIR Status Map, FIR Index and FIR Register details.
- [ ] Compare rendered text/color/legend and ensure linked court-case status remains distinct.
- [ ] Acceptance: same FIR meaning/label/color across views; unknown/missing neutral; no classification/data change.
- **Source/component:** `assets/js/fir-status-presentation.mjs`, `assets/js/fir-statusmap-model.mjs`, `assets/js/fir-index.js`, `assets/js/fir-register.js`.
- **Prerequisites:** existing pure unit tests pass; route/data check uses synthetic records.
- **Evidence:** status matrix, computed styles and viewport/theme captures.
- **Current status:** static/unit verified, route rendering outstanding. **Effort: MEDIUM.**

### P2-04 · UX-008 · Dashboard navigation — VERIFY

- [ ] Verify Dashboard link target, active state and `aria-current` on Dashboard and other pages.
- [ ] Verify desktop sidebar/mobile drawer, visible keyboard focus and Admin/Operator nav visibility.
- [ ] Acceptance: one named Dashboard destination reaches correct route, active announcement is correct, existing role rules remain intact.
- **Source/component:** `assets/js/shared-layout.js`, shared shell styles.
- **Prerequisites:** static shell fixture is sufficient for basic check; role view needs synthetic route fixture.
- **Evidence:** link target/ARIA values, keyboard and viewport/theme results.
- **Current status:** static source verified; browser pending. **Effort: LOW.**

### P2-05 · UX-010 · Pending Court Proceedings current data — VERIFY

- [ ] Preserve the Phase B owner-approved rules; do not reopen them as part of verification.
- [ ] Compare distinct authorized proceeding records to KPI, unknown-status warning and CSV/XLSX/PDF summary row.
- [ ] Include known UT/UI/In Progress aliases, excluded Committed/Disposed/UCR/Cancellation, blank/unknown, duplicate path/legacy link, multiple proceedings per FIR, date/PO/stage independence.
- [ ] Acceptance: UI/export count match helper; unknown warning reports count without case details; unaffected FIR-grain metrics and authorization remain unchanged.
- **Source/component:** `assets/js/report-pending-proceedings.mjs`, `assets/js/report.js`, `pages/report.html`, `assets/css/report.css`.
- **Prerequisites:** 10 helper tests pass; rendered role-scoped data requires separate synthetic auth approval.
- **Evidence:** synthetic authenticated record ledger, UI/warning/export comparison, viewport/theme captures.
- **Current status:** approved rules and unit/helper/presentation checks pass; real role data unverified. **Effort: MEDIUM.**

### P2-06 · UX-013 · Dashboard Trends header — VERIFY

- [ ] Verify full Dashboard composition at seven target widths and both themes; select periods and confirm rendered series labels update correctly.
- [ ] Acceptance: header/selector never overlap; selector works; no page overflow; desktop header remains grouped.
- **Source/component:** `pages/dashboard.html`, `assets/css/dashboard.css`, `assets/js/dashboard.js`.
- **Prerequisites:** component geometry fixture already passes; full data behavior needs current route fixture.
- **Evidence:** full route captures, selector before/after, bounds and console errors.
- **Current status:** component verified, route pending. **Effort: LOW.**

### P2-07 · UX-014 · Dynamic charts and legend — VERIFY

- [ ] Compare live synthetic rendered SVG series/status values to source records and legend marks at seven widths/two themes.
- [ ] Verify no clipping, mark association, empty state, focus outline and horizontal keyboard scroll on actual rendered route.
- [ ] Resolve differing fixture ArrowRight results by current-route reproduction; do not add custom keyboard behavior unless failure repeats.
- [ ] Acceptance: labels/legend match data and remain readable; keyboard users can reach all chart content; no page overflow.
- **Source/component:** `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/css/dashboard.css`.
- **Prerequisites:** current component renderer has synthetic 70-case evidence; authenticated dashboard acceptance needs separate synthetic auth approval.
- **Evidence:** record-to-chart reconciliation, scroll deltas, viewport/theme captures and errors.
- **Current status:** partially verified; actual dynamic route unknown. **Effort: MEDIUM.**

### P2-08 · UX-015 · Register Diary populated rows — VERIFY

- [ ] Check current populated and empty day, long judge/court names, status controls and FIR navigation across mobile/tablet/desktop and themes.
- [ ] Verify row actions, keyboard focus, touch targets and status persistence.
- [ ] Acceptance: no overlap; judge/court/FIR/status remain identifiable; hit areas and actions meet requirements without changing date/status semantics.
- **Source/component:** `pages/register-diary.html`, `assets/js/register-diary.js`, `assets/css/register-diary.css`.
- **Prerequisites:** existing synthetic row CSS fixture passed; action/persistence route needs approved synthetic data.
- **Evidence:** actual row captures, bounds/hit-area measurements and action/persistence log.
- **Current status:** component verified; route behavior outstanding. **Effort: MEDIUM.**

### P2-09 · UX-012 · Landing preview/CTA finishing pass — VERIFY

- [ ] Inspect preview text and CTA at 320/375/430 and representative tablet/desktop widths; follow CTA only to public/local destinations.
- [ ] Acceptance: readable or clearly decorative preview; no clipping/overlap/page overflow; CTA visible and usable; desktop appearance preserved.
- **Source/component:** `index.html`, `assets/css/landing-ux-012.css`, landing styles.
- **Prerequisites:** actual route was verified for layout at seven widths; no auth required. No light theme exists.
- **Evidence:** current page captures and CTA target check.
- **Current status:** actual route visual scope verified; CTA/readability details open. **Effort: LOW.**

## Priority 0 — Explicitly deferred / owner decision

### P0-01 · UX-001 — Setup issuance/recovery workflow — DEFERRED

- [ ] Keep blocked until an owner-approved issuance/delivery and operational reconciliation plan exists.
- [ ] Do not implement backend or deployment work under this checklist.
- **Affected:** `pages/password-setup.html`, existing setup handlers/route.
- **Prerequisite:** separate owner decision and implementation authorization.
- **Acceptance/evidence:** follow the separate UX-001 plan; route presence alone is not closure.
- **Current status:** blocked; no Phase 4 action. **Effort: HIGH / not estimated until approved.**

### P0-02 · UX-011 — Valid-state visual system — DEFERRED

- [ ] Wait for UX-001 to supply a real valid setup state before proposing visual corrections.
- [ ] Do not fabricate setup state or backend response in a way that implies production readiness.
- **Affected:** Password Setup page and account-flow styles.
- **Prerequisite:** working approved validator/completion behavior from separately authorized work.
- **Acceptance/evidence:** valid/invalid/expired/success visual and accessible state matrix across agreed widths/themes.
- **Current status:** blocked/deferred. **Effort: MEDIUM after prerequisite.**

## Closeout rules

- [ ] Record the exact route/component, source revision, role/data provenance, browser, viewport/theme and test method for each verification item.
- [ ] Keep synthetic/component evidence labelled as such; do not count it as authenticated route verification.
- [ ] Close an issue only after every canonical acceptance criterion passes on the current implementation and evidence is reviewable.
- [ ] Preserve all existing staged, unstaged and untracked changes. Do not edit the canonical issue register or existing implementation checklist as part of Phase 4 consolidation.
