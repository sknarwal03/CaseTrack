# Phase 3E — Authenticated UI/UX Verification Approval Plan

**Assessment date:** 16 November 2026
**Task type:** Read-only assessment and approval planning
**Execution status:** Not started
**Decision:** **BLOCKED pending production-isolation approval and test-harness safeguards.**

## 1. Executive summary

The repository has a useful isolated test path: Vite `role-admin-local` aliases Firebase to a fixed demo project, connects Auth/Firestore/Functions to loopback, and the current Playwright harness creates random synthetic Admin/Operator accounts and refuses to seed non-empty emulators. Firebase Emulator config binds to `127.0.0.1`; no emulator or app server is running. The existing harness can exercise the Admin Panel and Register Diary at seven widths and two themes.

The current setup does **not** meet the requirement that authenticated tests cannot reach production. The normal Vite mode imports the production Firebase config and exposes a production Functions proxy. The Playwright request guard blocks and records only selected Firebase domains, and there is no process-wide outbound network restriction. The runner verifies local Vite module content, but this is not a network isolation boundary. The current 56-screenshot harness also covers only UX-015/016/017 paths; it does not cover most requested authenticated issues or the required export/report/dashboard flows.

Do not run authenticated verification yet. First obtain approval for a narrow isolation hardening increment, add and verify a deny-by-default outbound boundary for the test processes, and extend the harness/dataset. Then obtain separate approvals for each state-changing test action in Section 11. No app source, Firebase configuration, test account, emulator, production endpoint, or credential content was accessed or changed during this assessment. The documented temporary ADC copy remains in place and unchanged.

## 2. Current environment baseline

| Item | Current evidence |
|---|---|
| Branch / commit | `codex/increment-1b-b1-token-infrastructure` / `657f782323668f56d577153424988f8480374e21` |
| Existing staged changes | None reported by `git status --porcelain=v1` / `git diff --cached --name-status`. |
| Existing unstaged modifications | `assets/js/cases.js`; `docs/ui-ux-audit/MASTER-UI-UX-ISSUE-REGISTER.md`. These are pre-existing Phase 3D-B work and were preserved. |
| Existing untracked files | `docs/ui-ux-audit/PHASE-3D-A-KEYBOARD-ACCESSIBILITY-VERIFICATION.md`; `docs/ui-ux-audit/PHASE-3D-B-UX-003-FIX-AND-CHECKLIST.md`. Preserved. |
| Node / npm | Node `v24.22.0` at `C:\Program Files\nodejs\node.exe`; npm `11.19.1`. A cached Node `v22.23.5` executable is present under npm's `_npx` cache; no `node22` command is on PATH. |
| Playwright / Chrome | Existing nested Playwright `1.64.1`; installed Chrome `157.0.8103.51` at `C:\Program Files\Google\Chrome\Application\chrome.exe`. Phase 3B previously verified a fresh local Playwright/Chrome launch and screenshot capture. No browser was launched in this planning phase. |
| Firebase CLI | The recovery runner's local Firebase Tools package is present at version `14.27.0`; the documented runner points to that local package. No Firebase service command was run. |
| Emulator config | `firebase.ui-ux-local.json`: Auth `127.0.0.1:9198`, Firestore `127.0.0.1:8187`, Functions `127.0.0.1:5003`, `singleProjectMode: false`, Functions source `functions`, Node runtime `nodejs22`, Firestore Rules file `firestore.admin-panel.rules`. |
| Default config | `.firebaserc` defaults to production project `casetrack-97a4e`; `firebase.json` has Auth 9099, Firestore 8080, Functions 5001 and `singleProjectMode: true`. It is not the Phase 3E config. |
| Current loopback listeners | None on 5174, 9198, 8187, 5003, 4400, 4500, 9150, 9299, 9499, or 5173 at this check. The checks were limited to those named loopback ports. |
| Temporary ADC copy | The Phase 3A documented temp Firebase directory exists and contains one matching ADC-copy file (metadata only: 295 bytes; last write 15 November 2026). Contents/name were not opened or recorded. The file was not changed. |
| Local E2E harness | `e2e/run-ui-ux-infrastructure-recovery.ps1`, `e2e/run-ui-ux-emulator-checks.ps1`, and `e2e/ui-ux.browser.test.cjs` exist. The full corrected runner is documented as not yet verified end-to-end. |
| Browser host | Phase 3A recorded the managed CUA browser host as unavailable. This plan relies only on the historically verified local Playwright capability, subject to future execution approval. |

The only file added for this task is this approval plan. No tests, builds, emulators, application routes, Firebase CLI commands, authentication, or production services were run. No ADC content was read.

## 3. Production isolation assessment

### 3.1 Existing protections

| Mechanism | Repository evidence | Assessment |
|---|---|---|
| Explicit local app mode | `vite.config.js` selects `firebase/local-role-admin` only for `role-admin-local` serve mode. | Good separation when the mode is selected. |
| Local Firebase client | `firebase/local-role-admin/firebase-config.js` requires `import.meta.env.MODE === 'role-admin-local'`, uses fixed project `demo-casetrack-role-prototype`, and connects Auth, Firestore, and Functions to `127.0.0.1`. | Client emulator routing is explicit in this mode. Its port helper has local defaults 9099/8080/5001; the runner overrides them to 9198/8187/5003. Missing required environment values do not themselves throw. |
| Functions project policy | `assets/js/firebase-project-policy.js` returns the local endpoint only when local mode and the demo project agree; production endpoint is available only outside local mode with the production project. Other combinations throw. | Good mode/project mismatch guard for these Functions calls. |
| Runner preconditions | `e2e/run-ui-ux-infrastructure-recovery.ps1` sets explicit `GCLOUD_PROJECT`, emulator hosts and local Vite mode; rejects set `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_TOKEN`, `FIREBASE_CONFIG`, a non-demo existing `GCLOUD_PROJECT`, or occupied listed ports. It verifies transformed Vite config text for the demo project, emulator connectors/ports and absence of the production Functions hostname. | Useful checks, but they inspect selected inputs/output and do not restrict all network egress. |
| Browser route guard | `e2e/ui-ux.browser.test.cjs` intercepts `googleapis.com`, `cloudfunctions.net`, and `firebaseio.com` requests and fails if any are observed. Service workers are blocked. | Blocks some browser requests before connection; the allow/deny list is incomplete and does not govern Node/Firebase Admin SDK traffic or other processes. |
| Emulator project/config | Runner uses `demo-casetrack-role-prototype`, explicit `--config firebase.ui-ux-local.json`, no import/export dataset, and `singleProjectMode: false`. | Correct target if the command line/environment remain intact. |

### 3.2 Production exposure paths and missing safeguards

1. **Default Vite mode is production-connected.** `vite.config.js` aliases to `firebase/firebase-config.js` outside `role-admin-local`; that module contains production project configuration. The normal development server also defines a proxy to the production Functions host. A wrong or omitted mode can therefore use production services.
2. **No host-level egress deny exists.** The Playwright route hook is browser-context scoped, covers selected host suffixes only, and does not constrain Node processes, Firebase CLI, Functions, Java, or child processes. It cannot prove “no possibility” of production traffic.
3. **Remote domain matching is incomplete.** Current patterns do not deny every Firebase/Google/Firebase Hosting or arbitrary external hostname. Local mode should not need these connections, but absence of expected traffic is not a deny-by-default guarantee.
4. **The E2E guard is not an OS isolation boundary.** It validates selected variables and reports browser requests. It does not verify all project-selection inputs, all credential-related variables, or every outgoing socket made by child processes.
5. **Port mismatch can fail closed operationally but is not sufficient proof.** The local alias defaults to 9099/8080/5001 while the selected emulator config uses 9198/8187/5003. The runner sets overrides and checks the served module; direct Vite startup without the runner can use the wrong local ports.
6. **Cloud CLI credential side effect is known.** The Phase 3A/recovery reports record that Firebase CLI generated a temporary ADC copy in an isolated APPDATA directory. The known copy remains unchanged. Emulator client traffic itself can use the explicit emulator hosts; however, CLI behavior must be shown not to require/use production credentials. If credentials are requested or cloud auth is necessary, stop.

**Conclusion: Production isolation is BLOCKED, not guaranteed.** Before testing, request approval for a narrowly scoped hardening change and an OS/process-level network boundary that denies all non-loopback traffic from Vite, Chrome/Playwright, Firebase CLI, Node/Admin SDK, Functions Emulator, and child processes. Add fail-closed checks for project ID, mode, all emulator hosts, and required ports; validate the served Firebase module; abort on any non-loopback request/connection; and prove the guards with intentional negative tests. Do not use production credentials as a fallback. If the environment cannot provide the outbound deny boundary, do not run authenticated tests.

## 4. Firebase Emulator requirements and proposed commands

### Required services

- **Auth Emulator — required:** synthetic email/password login through CaseTrack's existing Login page.
- **Firestore Emulator — required:** synthetic roles, station, FIR Master, linked proceeding, legacy case, judge, and related test records.
- **Functions Emulator — required for the Admin UI path:** the Admin Panel calls `listUserRoles` and `policeStations`; it also exposes role-management endpoints. The current test should validate display and non-mutating controls only. Do not exercise operator provisioning/recovery or email delivery.
- **Firebase Emulator internal ports:** 4400, 4500, 9150, 9299, 9499 are checked by the existing runner; only services actually launched by Firebase CLI should own them.
- **Vite — required:** bind to `127.0.0.1:5174`, strict port, local mode.

No `--import` or `--export-on-exit` is configured. Freshness is intended to be checked by `assertFreshEmulator()` before creating records. The runner runs Auth/Firestore/Functions browser work in one `emulators:exec` session and Functions tests in a separate fresh Auth/Firestore session, both with `singleProjectMode: false` config.

### Current runner command (reviewed, not executed)

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\e2e\run-ui-ux-infrastructure-recovery.ps1
```

**Purpose/effects:** sets process-local demo/emulator variables; starts Vite; starts Auth, Firestore and Functions emulators; creates synthetic accounts/records; runs the current 56-image Admin/Diary Playwright matrix, root unit tests, build and syntax checks; then runs Functions unit/emulator tests in a separate session. It writes screenshots, JSON/logs under `docs/ui-ux-audit/screenshots/infrastructure-recovery/<run-id>/` and a temporary build/runtime directory.

**Not approved for execution as-is.** The runner invokes `npx.cmd --yes --package=node@22`, which may access the network/download a runtime despite a cached Node 22 executable being available. Its finalizer removes test-owned runtime ADC copies and may leave diagnostic files/services on failures. The known old ADC copy is outside a new unique runtime, but remains untouched. The browser guard is not a host-level egress deny. It also does not implement the expanded UX-002/004/005/007/008/009/010/012/013/014 coverage.

### Proposed command pattern after approvals and isolation hardening (not executed)

Use only the already-present cached Node `v22.23.5`; do not invoke `npx` or download Node. After a separate approved change updates the runner to resolve and verify that binary, its emulator invocation should be equivalent to:

```powershell
& $node22 `
  (Join-Path $repositoryRoot 'security-prototypes\role-management\node_modules\firebase-tools\lib\bin\firebase.js') `
  emulators:exec --only auth,firestore,functions `
  --config (Join-Path $repositoryRoot 'firebase.ui-ux-local.json') `
  --project 'demo-casetrack-role-prototype' `
  $commandFile
```

`$node22` must resolve to the already cached `node.exe` and pass an exact `v22.23.5` check. `$commandFile` must be generated under a unique, checked temp directory and invoke the approved emulator test runner. The app command in that runner must remain:

```powershell
npm run dev -- --mode role-admin-local --host 127.0.0.1 --port 5174 --strictPort
```

The runner must set and verify process-only values before launch: `GCLOUD_PROJECT=demo-casetrack-role-prototype`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8187`, `VITE_ROLE_ADMIN_AUTH_PORT=9198`, `VITE_ROLE_ADMIN_FIRESTORE_PORT=8187`, `VITE_ROLE_ADMIN_FUNCTIONS_PORT=5003`, and `CASETRACK_E2E_MODE=role-admin-local`. It must reject credential-bearing/cloud-selection variables rather than display them, and restore the prior process environment in `finally`.

### Prerequisites, effects, safety and rollback

| Action | Prerequisites | Expected effects / affected resources | Production checks | Rollback / approval |
|---|---|---|---|---|
| Start local Vite | Isolation hardening approved; 5174 free; exact local module served; process variables validated. | One Vite child process on loopback; no persistent config change. | Verify local mode and demo/emulator endpoints before browser navigation; host egress deny active. | Stop only the recorded child PID; verify 5174 closed. Separate approval #6. |
| Start Firebase emulators | Node 22 cached runtime verified; local Firebase Tools 14.27.0; explicit config and demo ID; all required ports free; fresh in-memory state. | Auth/Firestore/Functions plus Firebase internal child processes. Firestore Rules file is loaded in emulator only. | Verify command-line project/config, loopback bind, project guards and network deny before test data setup. No import/export. | `emulators:exec` should stop its owned emulators after command; verify only owned listeners are gone. Separate approval #2. |
| Run browser tests | Local endpoints listening; synthetic seed approved; no external request possible. | Fresh isolated Chrome context(s), screenshots/report and emulator reads; test-owned users/data. | Egress boundary plus browser request deny; any unexpected attempt fails immediately. | Close owned browser contexts/process; delete only test-owned records/users; separate approval #7. |

**Expected emulator order:** preflight ports and deny boundary → start Vite in isolated mode and assert its transformed config → start `emulators:exec` with explicit demo project/config → verify service health → assert empty emulator → seed → run tests. **Shutdown:** test cleanup and emptiness check while emulators remain live → close browser → emulator command exits → stop only owned Vite → restore process environment → verify no owned listeners → preserve evidence and the previously documented ADC file.

## 5. ADC dependency assessment

**Application/emulator traffic ADC requirement: NOT REQUIRED**, provided all Admin SDK calls have explicit local Auth/Firestore emulator host variables and the Functions Emulator is selected. The test project is a `demo-*` project and no production service account is needed.

**CLI side-effect risk remains.** Phase 3A/recovery documents record an incidental temporary ADC copy generated by Firebase CLI. Current metadata-only check confirms one matching file in the exact previously documented temp Firebase directory; its content/name were not accessed. It must remain unchanged in this phase and the next one. The proposed workflow must use a fresh isolated runtime/config directory, must not read or modify this existing file, and must stop if Firebase CLI requests cloud credentials or attempts remote Firebase access. Do not run Firebase login/logout, ADC login/revoke, cleanup, copy, permission change, or cloud authentication. If the CLI cannot run without ADC, mark the workflow blocked and request a distinct credential-specific owner decision; do not reuse production credentials.

## 6. Node runtime assessment

- Node 24.22.0 is installed and has already run the root scripts/Vite/Playwright in prior documented phases.
- Functions declares Node `22`; Firebase CLI/emulator discovery was previously run successfully under cached Node 22.23.5. A cached Node 22.23.5 executable currently exists, but it is not on PATH.
- Firebase Tools 14.27.0 and Playwright 1.64.1 are already installed locally. Chrome is installed. No dependencies need to be added.
- The current wrapper's `npx --yes --package=node@22` is not acceptable for a no-download approval. A narrowly scoped, separately approved test-tooling change should use the verified cached Node 22 binary directly and fail if it is absent/version-mismatched. Do not install Node or use `npx` during the proposed run.

**Runtime installation/download approval:** not required if the verified cached Node 22.23.5 is used. If it is absent at execution time, stop and seek a separate runtime approval instead of downloading.

## 7. Synthetic authentication strategy

All identities must be created only through Firebase Auth Emulator using the existing Login page for browser sign-in. Use unique run-ID emails under reserved `example.test`, generated in-memory passwords, fresh Playwright browser contexts per role, and no persistent browser profile. Never log passwords, tokens, or ID tokens.

Proposed identities:

1. Active Admin with no station assignment.
2. Active Operator assigned to synthetic Station A.
3. Active Operator assigned to synthetic Station B, for station-isolation assertions.
4. Optional inactive/no-role identity for denial tests only after the role contract is confirmed against current authorization code.

Existing harness covers only one active Admin and one active Operator. Role-boundary coverage beyond those roles requires a test-harness extension and synthetic setup/teardown. Admin test should verify user/station visibility but must not submit role changes, create operators, issue recovery, or send email. Browser auth must use the real emulator-backed login flow; no injected auth state, custom-token bypass, production identity, or real account is allowed.

Cleanup must delete only run-ID Auth users and documents created by that run. Existing harness catches and suppresses individual cleanup failures; approved hardening should make cleanup failures visible and verify that emulator Auth and Firestore are empty before shutdown. If rollback cannot prove test-owned data removal, keep the local emulator stopped and report retained synthetic fixture IDs (not credentials) for operator cleanup.

## 8. Synthetic Firestore dataset and expected results

Use a deterministic logical fixture with run-prefixed IDs, based on the documented existing model in `add-edit-case-modal-flow.md`, `fir-case-model.js`, and `fir-status.mjs`. Actual stored fields must follow these sources and must not change business rules.

### Dataset specification

- **Station A:** ten FIR Master identities `3E-A-01` … `3E-A-10`; Station A active.
- **Station B:** two FIR Master identities `3E-B-01` and `3E-B-02`; Station B active.
- Seed linked proceedings in `linkedCases` with `firMasterId`/`firId`, `recordType`, status, station identity, court/judge, accused/witness arrays, and hearing fields using existing page schema. Include a legacy `cases` record paired with one `linkedCases.legacyCaseId` to exercise adapter deduplication.
- Station A status cases: A-01 no proceeding (UI); A-02 one UT; A-03 one UI plus one Disposed proceeding; A-04 all Disposed; A-05 Untraced UCR only; A-06 Cancellation UCR only; A-07 Committed predecessor only; A-08 UCR plus active UI proceeding; A-09 one unrecognized-status court proceeding; A-10 UI/no-proceeding baseline as needed to exercise empty linked details without changing the counts stated below.
- Station B: B-01 one UT proceeding; B-02 one Disposed proceeding.
- Include multiple accused in one proceeding, multiple courts/judges, long Judge/Court names, populated/empty hearing dates, multiple Register Diary rows, and a legacy mirrored record. Use distinct synthetic FIR values/years and no real names, addresses, phone numbers, or records.
- Include only minimal fields required by existing Rules and queries. Seed through an emulator-only Admin SDK client after checking the demo project and emulator hosts. Security Rules are loaded as-is; do not edit them.

For a stable oracle, assign one future `nextDate` to A-02 UT, A-03 UI, A-08 UI, A-09 unknown, and B-01 UT; leave A-03 Disposed, A-04 Disposed, A-07 Committed, B-02 Disposed, all UCR records, and master-only A-01/A-10 without `nextDate`. The exact synthetic date should be computed as local today + 14 days at seed time and recorded in the run manifest. This yields four eligible future dates on Station A and five across both stations.

### Expected calculation oracle for the 12-master fixture

Assuming the above records are seeded exactly once and the existing station-scoped loader returns only authorized stations:

| Result | Operator on Station A | Admin on Stations A+B | Reason |
|---|---:|---:|---|
| Unique FIRs / Dashboard total | 10 | 12 | One summary per master; linked and legacy proceeding records group with their master. |
| Court proceedings / Dashboard count | 7 | 9 | UCR records and FIR Masters are excluded by `isCourtProceeding`; the mirrored legacy record is deduplicated. |
| Dashboard active UI/UT proceedings | 3 | 4 | A-02 UT, A-03 UI, A-08 UI; plus B-01 UT. |
| Dashboard closed Disposed proceedings | 2 | 3 | A-03 Disposed, A-04 Disposed, plus B-02 Disposed. |
| Dashboard unknown/pending bucket | 1 | 1 | A-09 unrecognized non-terminal status; committed predecessor is intentionally excluded from active/closed/pending buckets. |
| Dashboard upcoming hearing count | 4 | 5 | Four future-dated eligible Station A hearings plus B-01; committed predecessor and records without future date excluded. |
| Reports Disposed FIRs | 1 | 2 | A-04 and B-02 are the only FIR summaries derived Disposed. |
| Reports Pending Court Proceedings | 3 | 4 | Active eligible records with raw linked `status` UI/UT; UCR, Committed and Disposed excluded. |
| Reports unknown-status warning | 1 | 1 | A-09 status unrecognized; it remains an eligible court proceeding but is reported separately, not counted pending. |
| Reports hearing count | 4 | 5 | Records with `nextDate`, per existing Reports calculation; test records must be assigned the exact dates above. |

The A-10 baseline is a master-only FIR and contributes one unique FIR but no court proceeding. Therefore Station A must contain nine listed statuses plus A-10, and the oracle above is unchanged. FIR derivation expectations: A-01/A-10 UI; A-02/A-03/A-07/A-08/A-09 UT; A-04 Disposed; A-05 UCR; A-06 Cancelled. UCR status remains separate from linked court status. A-07 with only Committed court proceedings remains UT under existing derivation, while Reports excludes Committed from pending.

Before browser execution, compute this oracle from the exact seed manifest and compare it with pure helper output. If the fixture schema or current source produces a different result, stop and reconcile the fixture to source; do not adjust code or invent a business rule during test execution.

## 9. Authenticated Playwright test matrix

Use the existing Playwright 1.64.1 and Chrome executable, fresh isolated contexts, real emulator-backed login, synthetic records only, service workers blocked, and the approved process-wide no-egress boundary. Capture the actual route, role, viewport, theme, test fixture ID, and result with each screenshot. Required responsive widths: **320, 375, 430, 768, 1024, 1366, 1920px**. Test light/dark where the app supports both; Landing is documented as dark-only.

| Issue / group | Authenticated route and role | Required checks and pass evidence |
|---|---|---|
| UX-001 / UX-011 | Password Setup route; no valid recovery account | Do not test valid token or completion. Keep UX-001 Critical/Open and UX-011 Open/deferred because workflow issuance/release prerequisites remain. If checking blocked/invalid visual state, ensure no real link/token and no production endpoint; this is not closure evidence. |
| UX-002 | Dashboard Add Case; Operator and Admin only if authorized | Accessible names for every control; label activation; unique IDs on dynamic accused/witness rows; required validation; keyboard order; create/edit round-trip using a synthetic record; compare serialized fields before/after. |
| UX-003 | Cases detail + Dashboard Add Case; Operator; Admin if permitted | Case Details Escape closes and restores opener; initial focus; Tab/Shift+Tab containment; background focus prevention; close button; repeated cycles; dynamic controls; nested Add/Edit IO native dialog Escape closes only the top dialog; form dirty/unsaved protection is preserved. |
| UX-004 | All Cases and Reports; Operator and Admin | CSV/XLSX/PDF downloads; compare exact headers/rows/counts to page data. All Cases: filtered scope includes all matching rows independent of pagination; all-record scope uses only loaded authorized cache. Reports scopes match displayed summaries and do not leak Station B to Operator. Formula/Unicode/leading-zero fixtures retained. |
| UX-005 | Dashboard; Operator and Admin | KPI values match oracle (10/12 total FIRs, 7/9 proceedings, 3/4 active, 2/3 closed, 1 unknown bucket, 4/5 future hearings); loading/error/empty behavior; navigation; no comparison percentages; data re-render follows actual fixture. |
| UX-006 | Dashboard; both roles | Copy states browser-local task persistence and no alerts; Add/complete/Delete and sort remain unchanged; per-user localStorage separation and reload persistence; mobile readability. |
| UX-007 | FIR Register, FIR Index, FIR Status Map and FIR Details; Operator/Admin | UI, UT, Disposed, UCR, Cancelled aliases and unknown/missing records show canonical label/color/neutral state; computed contrast in both themes; linked proceeding status remains visually distinct from FIR status; navigation unaffected. |
| UX-008 | Authenticated shared sidebar; both roles | One explicit Dashboard link, correct destination, active state/`aria-current`, mobile drawer, keyboard focus, light/dark, role visibility; no duplicate destination. |
| UX-009 | All Cases, FIR Index, Admin Users, nested FIR tables; appropriate roles | All information/actions reachable; no page-wide overflow; visible scroll hint; keyboard and touch scroll; search/sort/filter/pagination/row actions/FIR page edits; long IDs/names and nested rows; Admin-only controls not visible to Operator. |
| UX-010 | Reports; Operator/Admin | Pending Court Proceedings exactly 3/4; unknown warning 1; UCR, Committed, Disposed exclusion; no FIR/proceeding double-count; same KPI/export value; authorized scope. |
| UX-012 | Landing, unauthenticated and no Firebase login | Readable hero preview, wrapping/CTA/no overflow at seven widths; Landing is dark-only according to prior evidence. No emulator data needed for this route. |
| UX-013 | Dashboard; Operator/Admin | Heading and period selector never overlap, selector remains operable, mobile stacking, no overflow; desktop geometry remains correct. |
| UX-014 | Dashboard; Operator/Admin | Actual SVG charts, legends, values/category associations; empty/single/multiple/long labels/large values; scroll region keyboard behavior; no color-only dependence, clipping, or page overflow. |
| UX-015 | Register Diary; Operator/Admin if available | Long Judge/Court, missing values, multiple hearing rows, empty/populated dates and status states; no overlap; FIR navigation/status interaction/persistence; touch target and keyboard behavior. |
| UX-016 | Admin Panel; active Admin | Manage dialog opaque in both themes, no bleed-through, responsive layout; open/close/Escape/validation/focus; do not submit role mutation. |
| UX-017 | Admin Panel; active Admin | Computed/composited normal-text contrast >=4.5:1 for UID and Police Station headers across row/hover/focus/selected/disabled states; table actions remain unchanged. |

**Coverage gap:** the current `e2e/ui-ux.browser.test.cjs` covers Admin Manage dialog/table contrast and Register Diary layout/status interactions only. Its 56 images are 7 widths × 2 themes × 2 component flows. It seeds only one Admin, one Operator, one station, and four legacy `cases` rows. It does not currently test Dashboard, Reports/export, FIR Master/status map, full UX-002 interactions, UX-007, UX-008, UX-010, UX-012, UX-013, or full UX-014 rendering. The broad Phase 3E matrix requires a separately approved harness/dataset extension; a 56-image pass must not be presented as all-issue verification.

## 10. Dependency-ordered execution phases

| Phase | Work | Entry gate | Exit evidence |
|---|---|---|---|
| **3E-1 — Environment safety gate** | Approve and implement isolation hardening; use cached Node 22 only; validate project/config/mode/hosts/ports; establish process-wide outbound deny; test guard with deliberate production-host requests that are blocked before connection; confirm old ADC copy untouched. | Owner approval #10 and #3; no credential requirement; working tree snapshot. | Signed preflight record listing exact project ID/config, endpoint mappings, negative guard results, Node/CLI/browser versions, ports free, and zero production connections. If any cannot be proven: stop. |
| **3E-2 — Emulator startup** | Start only Auth/Firestore/Functions on the loopback ports under `demo-casetrack-role-prototype` and `firebase.ui-ux-local.json`; no import/export. | Separate approval #2; clean ports; exact cached Node; egress deny active; demo ID verified. | Emulator health checks, PIDs/process ownership, config/host verification, no external connection. |
| **3E-3 — Synthetic data setup** | Assert fresh empty Auth/Firestore, create approved synthetic roles/stations/records and save run manifest (no passwords/tokens). | Separate approvals #4/#5; manifest expected oracle verified against pure functions; all writes target emulator hosts. | Auth user list and seeded collection counts/IDs match manifest; Admin/Operator authorization queries return expected station scope. |
| **3E-4 — Authenticated Playwright verification** | Run approved tests in fresh contexts; capture route/role/viewport/theme/screenshots; compare KPI/report/export data against oracle; test all applicable issue criteria. Run `npm test`, `npm test --prefix functions` in its separate fresh Auth/Firestore session, relevant `node --check` commands, and production build directed to a run-owned temporary directory. | Approvals #6/#7; isolation and seed checks pass; scripts extended/verified; no real credentials or production endpoints. | Machine-readable report with per-issue PASS/FAIL/BLOCKED/NOT TESTED, console/network results, screenshots, exports, root/Functions test results, syntax/build results and no hidden failures. No issue closes solely from synthetic component fixtures. |
| **3E-5 — Cleanup and rollback** | Verify test cleanup while emulator alive; remove only run-owned synthetic accounts/records; stop only owned emulators/Vite/browser; restore process env; verify ports; preserve unrelated processes/files and existing ADC. | Separate approval #8; run manifest and process IDs available. | Empty test Auth/Firestore state; no owned listeners; environment restored; artifact list and retained evidence recorded. If cleanup fails, stop and report exact run-scoped identifiers; do not delete broader data. |

These are proposed phases only; none has been executed by this plan.

## 11. Owner approval matrix

Approvals are independent. “Required” means separate explicit approval before the corresponding effect. Current status for every action is **NOT APPROVED**.

| Approval ID | Proposed action | Why required | Preconditions | Risk | Production exposure risk | Expected effects | Rollback | Owner approval required | Current status |
|---|---|---|---|---|---|---|---|---|---|
| **3E-A1 Runtime** | Use cached Node 22.23.5; install/download only if that runtime is absent. | Functions declares Node 22; current runner invokes `npx` and may download. | Prefer direct verified cached binary. If absent, halt. | Low if cached; Medium if installed/downloaded. | Low, but downloads add network and supply-chain exposure. | Direct use has no persistent change; download would add runtime files/cache. | No rollback needed for cached use; installed runtime removal would be separate. | **No** for cached use; **Yes** for any install/download. | NOT APPROVED; cached use recommended. |
| **3E-A2 Emulator startup** | Start Auth/Firestore/Functions emulators with explicit demo project/config. | Needed for real emulator-backed sign-in, Admin calls and Firestore data. | A1 runtime verified; 3E-1 isolation proven; ports free; no ADC use. | Medium. | Low only with verified host deny; otherwise not acceptable. | Starts Firebase CLI, Java, Node and emulator child processes; loads existing Rules in emulator. | `emulators:exec` plus owned-process/port verification. | **Yes**. | NOT APPROVED. |
| **3E-A3 Temporary config / network boundary** | Set process-only emulator/demo variables and establish temporary deny-by-default non-loopback egress for all test processes. | Current code cannot prove no production network access. | Owner/operator can configure a scoped local test boundary; exact process/port scope documented. | Medium. | This approval is the primary control to reduce exposure to near zero. | Process environment and temporary host/network policy; no repository Firebase config change. | Restore prior process values and remove only test-owned temporary policy after confirming no test process remains. | **Yes**. | NOT APPROVED; BLOCKING. |
| **3E-A4 Synthetic Auth accounts** | Create run-scoped Auth Emulator users (Admin, Operators, optional denied identity). | Role and authenticated route testing. | Emulator project/hosts verified; passwords generated in memory, never logged. | Medium. | None if isolation gate holds; otherwise unacceptable. | Temporary synthetic Auth records and browser sessions. | Delete only run-ID users and verify empty Auth emulator. | **Yes**. | NOT APPROVED. |
| **3E-A5 Synthetic Firestore seeding** | Seed stations, roles, FIR Masters, linked proceedings, legacy records and related synthetic data. | Exercise data scoping, rendering, reports and exports. | Exact manifest/oracle reviewed; empty emulator verified; uses existing schema and Rules unchanged. | Medium. | None if isolation gate holds; otherwise unacceptable. | Temporary Firestore writes, some through Admin SDK against emulator only. | Delete only manifest-owned docs; verify empty test collections before shutdown. | **Yes**. | NOT APPROVED. |
| **3E-A6 Local app server** | Start Vite on `127.0.0.1:5174` in `role-admin-local`, strict port. | Serve current routes and assets to local Chrome. | Local alias checked, endpoint variables match emulator ports, egress deny active. | Low. | Low only if local mode and deny boundary both verified. | Temporary Vite child process/listener. | Stop only owned PID and confirm port is free. | **Yes**. | NOT APPROVED. |
| **3E-A7 Authenticated Playwright** | Run the extended browser suite in fresh isolated Chrome contexts. | Direct route-level evidence across roles, viewports, themes and interactions. | All previous gates pass; test harness coverage updated; page egress is deny-by-default; no real account. | Medium. | Low only with host and browser request guards. | Browser processes, synthetic auth sessions, screenshots/reports, local downloads. | Close only owned contexts/processes; remove test downloads only if separately covered by A8. | **Yes**. | NOT APPROVED. |
| **3E-A8 Temporary artifact cleanup** | Remove test-owned temp profile/build/logs/downloads; retain approved screenshots and report as evidence. | Avoid leftover sensitive test artifacts/process data. | Exact run-ID paths and file list verified; no recursive cleanup of shared directories. | Low to Medium. | None. | Deletes only files created by this run; does not include the known ADC file or existing screenshots. | Evidence copies remain; deleted temporary data is not recoverable. | **Yes**. | NOT APPROVED. |
| **3E-A9 ADC handling (conditional)** | Only if a future CLI run proves ADC unavoidable, request an independent decision for the specific credential operation. | The CLI has previously generated an isolated temp ADC copy; current copy must remain unchanged. | Demonstrate why no-ADC emulator execution fails; identify exact file/effect without reading contents; never use production credentials. | High. | High if credentials could reach production. | Potential credential reads/writes/deletion. | No safe rollback for credential deletion or revocation. | **Yes, if unavoidable**; do not bundle with other approvals. | NOT APPROVED; NOT REQUESTED; avoid ADC and stop if required. |
| **3E-A10 Isolation/test-harness source changes** | Add fail-closed project/endpoint assertions, complete non-loopback request denial, require explicit hosts, replace `npx` with cached Node 22 use, surface cleanup failures, and extend route/data coverage. | Current harness does not guarantee isolation and covers only part of UX matrix. | Separate scoped source/tooling change review; no product/backend/Rules changes. | Medium. | This is required to make the workflow auditable; not sufficient without A3 network deny. | Test-only code/script changes and unit/negative-guard tests. | Revert only approved test-harness files; no Firebase/app data rollback. | **Yes**. | NOT APPROVED; BLOCKING. |

**Approval count:** eight approvals are required for the recommended path: A2–A8 plus A10. A1 does not require approval if the existing cached Node 22.23.5 is used. A9 is conditional and should remain unapproved unless a distinct, proven need emerges. This count excludes the separate decision to install/download a runtime.

## 12. Risks and safeguards

| Risk | Required safeguard / stop response |
|---|---|
| Wrong Vite mode or production project selected | Require exact demo ID, local mode, explicit config/ports; inspect transformed module; reject production ID; non-loopback egress deny. Stop before browser or seeding if any mismatch. |
| Browser or child process reaches production | Host/process-level egress deny plus Playwright request deny and test-report assertion. Any attempted non-loopback request fails the run; no retry or alternate endpoint. |
| Emulator contains prior data | `assertFreshEmulator()` must pass before writes; if any Auth account/root collection document exists, stop and preserve it. Never clear existing emulator data. |
| Credentials/ADC unexpectedly requested | Do not read, log, copy, change or use credential material. Stop and report the requesting command. Preserve the known temp ADC copy. |
| Runtime auto-download | No `npx`, package install, browser download or network runtime fetch. Use the verified cached Node 22.23.5 or stop. |
| Test leaks synthetic data | Run manifest, explicit ownership tracking, non-suppressed cleanup errors, post-clean emptiness assertion. If cleanup fails, leave emulators stopped and report exact synthetic IDs only. |
| Admin test mutates roles/sends email | Do not submit provisioning/recovery/role mutation forms. Restrict UI steps to read-only table/dialog display and validation that makes no request. |
| Report/export mismatch | Compare UI, helper oracle and downloaded CSV/XLSX/PDF to the same role-scoped synthetic fixture; do not alter business logic to make test expected values pass. |
| Incomplete screenshot coverage interpreted as closure | Per-issue status is recorded independently; synthetic source fixtures and route screenshots are evidence but never substitute for missing interactions or role checks. |
| Existing workspace changes overwritten | Capture baseline; edit only the approval-plan document now; future change sets preserve all staged/unstaged/untracked user work. |

## 13. Stop conditions

Stop immediately, do not seed or retry, and retain diagnostic evidence if:

1. Selected project is not exactly `demo-casetrack-role-prototype` or a `casetrack-97a4e` project path appears in the served app.
2. Any required emulator host/port is absent, invalid, non-loopback, or mismatched.
3. Vite resolves the production Firebase module or production Functions proxy.
4. Any process attempts a non-loopback connection; do not allow fallback or retry against a different endpoint.
5. Firebase CLI, Admin SDK, or test requires ADC/service-account credentials or cloud login.
6. Any existing Auth user or Firestore root document is found in the target emulator before seeding.
7. Seed manifest, project ID, Rules file, app mode, or emulator status cannot be proven.
8. A test requires a real identity, production data, real email delivery, password recovery issuance, or a business-side mutation outside the approved synthetic scope.
9. A port is occupied by an unrelated or unverified process; do not terminate it.
10. Cleanup cannot prove ownership or would require changing the known ADC file, shared logs, existing screenshots, or unrelated workspace changes.

Expected response for every stop: abort the run, preserve services/data not owned by this test, do not switch to production or another emulator, report the failed gate and exact safe evidence, and request a separately scoped owner decision if a change is necessary.

## 14. Cleanup and rollback plan

1. Track every run-owned user UID, Firestore document path, browser PID/context, Vite PID, emulator process/listener, download, and artifact directory in a run manifest. Never record passwords, tokens or credentials.
2. Run test cleanup while the emulator is still running. Delete only run-manifest records and users; assert Auth has zero users and test collections are empty. Make cleanup errors fail the run rather than swallowing them.
3. Close Playwright contexts and only the browser process created by the test. Never attach to or stop the user's existing Chrome/Edge process.
4. Allow `emulators:exec` to stop emulators it started. Stop only Vite PID recorded by the runner. Confirm approved loopback ports are no longer listening; do not stop unknown owners.
5. Restore process-local environment. Revert only a temporary host/network rule created for this run, after verifying all owned processes exited.
6. Keep the required screenshot/report evidence under an explicit run-ID path after review. Delete other run-owned temp build/profile/log files only under A8 approval and a verified path boundary.
7. Preserve the previously documented ADC copy and any global Firebase/Google configuration unchanged. Do not call Firebase login/logout, ADC cleanup, or recursive-delete the containing temp directory.
8. Roll back any approved harness hardening by reverting only files named in A10; retain this approval plan, existing UX fixes, and pre-existing workspace modifications.

## 15. Exact owner decisions requested

Please decide each independently before execution:

1. **A10 — Isolation/test-harness code changes:** approve or reject the narrowly scoped fail-closed guards, cached Node invocation, cleanup checks, and expanded authenticated test coverage. No product/Firebase/backend/Rules changes are included.
2. **A3 — Temporary process/network configuration:** approve or reject establishing a temporary deny-by-default non-loopback boundary for all test processes, with documented rollback. This is a mandatory gate; without it production access cannot be ruled out.
3. **A2 — Emulator startup:** approve or reject Auth/Firestore/Functions Emulator startup on the specified loopback ports under the explicit demo project/config.
4. **A4 — Synthetic Auth:** approve or reject run-scoped synthetic Admin/Operator/denial-test accounts in Auth Emulator only.
5. **A5 — Synthetic Firestore:** approve or reject run-scoped synthetic records matching Section 8 in Firestore Emulator only.
6. **A6 — Local Vite server:** approve or reject local Vite server startup on 127.0.0.1:5174 in `role-admin-local` mode.
7. **A7 — Authenticated Playwright:** approve or reject actual local login and browser tests in fresh Chrome contexts after gates pass.
8. **A8 — Temporary artifact cleanup:** approve or reject deletion of only explicitly listed run-owned temporary files, preserving screenshot evidence and the known ADC copy.

No approval is requested for A1 runtime installation/download if the cached Node 22 runtime is used. No approval is requested for A9 ADC handling; the required existing ADC copy must remain unchanged, and any credential requirement is a stop condition.

## 16. Safest next phase

The next action is **Phase 3E-1 only**, after A10 and A3 receive separate approval. Implement and negatively test the isolation guard, verify that the direct cached Node 22.23.5 and local Firebase CLI can run without accessing or modifying the known ADC copy, and prove every test process is denied non-loopback access. Do not start emulators, create accounts, seed data, or open authenticated routes as part of that gate. If no reliable host-level egress boundary is available, stop Phase 3E and retain authenticated verification as blocked.

**Phase 3E status:** Approval plan prepared; no owner approval has been recorded; no execution phase has begun. UX-001 remains Critical/Open; all other issue statuses remain unchanged.
