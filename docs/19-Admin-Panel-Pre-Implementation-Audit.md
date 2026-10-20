# CaseTrack Admin Panel — Read-Only Pre-Implementation Audit

**Audit conclusion:** The repository has an Admin Panel and a local role-management prototype, but does **not** demonstrate a production-ready, multi-station Admin Panel. The prototype’s privileged endpoints are tied to local Firebase Emulators. The main application’s role routing and station checks are largely client-side, and the repository does not contain production Firestore Rules or a production Rules deployment configuration. The live Firebase authorization state therefore remains **Unverified**.

This is a source audit, not proof of deployed behavior. **No project files, Firebase data, deployment settings, or Git state were changed.**

**Decision reconciliation:** This report preserves its audit-time findings and evidence. The later confirmed Admin, SP/Senior Officer, and approved-role boundaries are recorded in [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md). That record resolves the product-scope questions noted here; it does not change the audit's implementation, Rules, or production-verification status.

## 1. Executive Summary

- The project overview describes a **single-user current scope** and broader multi-station administration as future direction—not an implemented system. See [00-Project-Overview(1).md](./00-Project-Overview(1).md#31-current-objective) and [00-Project-Overview(1).md](./00-Project-Overview(1).md#13-future-expansion).
- Firebase email/password sign-in exists, but successful login always routes to the general dashboard; the inspected flow does not resolve a trusted role or select a role-specific destination. See [login.js](../assets/js/login.js#L22).
- Admin user listing, station creation, and Operator creation exist **in the local prototype**. Its endpoints verify a token and active Admin role, but are hard-coded to the demo project and loopback Functions Emulator. They are not a remote production backend. See [admin-access.js](../assets/js/admin-access.js#L4) and [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L6).
- The main app reads FIR Masters, linked proceedings, and legacy cases directly from Firestore. Its station checks are performed in frontend code. There are no checked-in production Firestore Rules to establish that direct reads, queries, or writes are restricted by station. See [fir-case-model.js](../assets/js/fir-case-model.js#L53) and [add-case.js](../components/add-case/add-case.js#L385).
- Several requested Admin capabilities are absent: SP/Senior Officer and multi-station Read-Only roles, production account provisioning, deactivation/reassignment, comprehensive audit history, server-authorized reports/exports, and last-Admin transition protection.
- The requested access model also conflicts with approved architecture: the ADR gives Admin all-station FIR/proceeding access, including create/read/update/delete—not merely cross-station read-only access. That conflict needs an explicit decision.

### Significant findings

**F-01 — Login does not resolve roles or route by role**\
**Severity:** High · **Status:** Partially Verified\
**Evidence:** [login.js](../assets/js/login.js#L22) signs in and then sends every successful user to `dashboard.html` at line 24. [shared-layout.js](../assets/js/shared-layout.js#L381) displays a hard-coded “Administrator” label; its Auth listener redirects signed-out users and only conditionally hides the Admin navigation item at lines 390–402.\
**Impact:** Admin, Operator, revoked, unassigned, and other users do not receive distinct trusted-role routing in this flow. A hidden navigation link is not a protected route.\
**Recommended follow-up:** Resolve the approved role/status and station assignment from a trusted source on protected entry points; separately verify direct URLs and stale sessions.

**F-02 — Admin UI is not a complete protected route**\
**Severity:** High · **Status:** Risk\
**Evidence:** [admin-panel.js](../assets/js/admin-panel.js#L202) reveals panel content after detecting a signed-in user at line 214; denial occurs after the Users endpoint responds with 403 at lines 123–124. [admin-access.js](../assets/js/admin-access.js#L4) uses a hard-coded local endpoint. The prototype Functions perform their own active-Admin checks in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L154).\
**Impact:** A non-Admin can reach and briefly render the shell. The protected prototype API calls have server-side checks, but the main app has no production role-aware route guard established by this code.\
**Recommended follow-up:** Treat UI visibility only as presentation; verify authorization independently at every protected data and backend boundary.

**F-03 — Production Firestore authorization cannot be established from this repository**\
**Severity:** High · **Status:** Unverified\
**Evidence:** Tracked configuration contains [firebase.test.json](../firebase.test.json#L1) pointing at [firestore.test.rules](../firestore.test.rules#L3) and the isolated prototype’s [firebase.json](../security-prototypes/role-management/firebase.json#L1); no root production `firebase.json` or root production `firestore.rules` was found. The test rules allow any authenticated user access to `cases` and broad reads/writes to other top-level collections at [firestore.test.rules](../firestore.test.rules#L4) and [firestore.test.rules](../firestore.test.rules#L10). The prototype rules instead deny all client access at [firestore.rules](../security-prototypes/role-management/firestore.rules#L4).\
**Impact:** Neither test nor prototype rules demonstrate production protection. The deployed rules could not be verified, so this audit cannot conclude whether production data is exposed or properly isolated.\
**Recommended follow-up:** Obtain an authorized, read-only view of deployed Rules and deployment target; do not infer live policy from test or prototype files.

**F-04 — Main-app station isolation is frontend-only in inspected code**\
**Severity:** High · **Status:** Risk\
**Evidence:** [fir-case-model.js](../assets/js/fir-case-model.js#L53) loads all three collections; station comparisons and assignment checks appear in [add-case.js](../components/add-case/add-case.js#L385) and its edit/delete paths. The project’s own approved requirement says UI filtering is not authorization in [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#5-authorization-enforcement-requirements).\
**Impact:** The inspected frontend checks do not establish that a user cannot bypass the UI with direct document reads, crafted queries, or writes. The actual deployed rules remain unknown.\
**Recommended follow-up:** Verify direct-document, query, create, update, and delete behavior for multiple stations against deployed or explicitly isolated test Rules.

**F-05 — FIR identity and multi-document workflow carry integrity risks relevant to station rollout**\
**Severity:** High · **Status:** Risk\
**Evidence:** [fir-case-model.js](../assets/js/fir-case-model.js#L31) falls back to station-name matching when stable IDs are unavailable; [fir-case-model.js](../assets/js/fir-case-model.js#L65) uses `firMasterId || firId` when overlaying master data. The duplicate check is on create at [fir-case-model.js](../assets/js/fir-case-model.js#L180), while updates are saved separately at line 196. [add-case.js](../components/add-case/add-case.js#L3217) writes proceedings individually, updates transfer counterparts separately at line 3240, and records per-record save failures at lines 3173 and 3284.\
**Impact:** Legacy records with ambiguous station identity may be misassociated; concurrent creates, identity corrections, or partial multi-document saves may leave duplicates or inconsistent relationships. These are code-level risks, not confirmed production incidents.\
**Recommended follow-up:** Inventory legacy ownership and IDs, then validate duplicate, migration, transfer, and partial-failure cases in an isolated environment before enabling station authorization.

**F-06 — Hearing history exists, but it is not a comprehensive audit log**\
**Severity:** Medium · **Status:** Partially Verified\
**Evidence:** Proceeding records store `hearingDateRecord` and update `nextDate` in [add-case.js](../components/add-case/add-case.js#L3209) and [register-diary.js](../assets/js/register-diary.js#L177). Register Diary file status is stored in browser `localStorage` at [register-diary.js](../assets/js/register-diary.js#L152).\
**Impact:** Hearing dates have history-like data, but the inspected model does not establish immutable actor/action/before-after audit events for those changes. Local file-status storage is not shared, server-audited history.\
**Recommended follow-up:** Keep hearing history distinct from privileged-action audit requirements; establish what official record of actor, time, action, target, and changes is required before relying on either.

## 2. Repository and Architecture Map

- **Documents and decisions:** Required files were located and read. The actual paths for three include literal `(1)` suffixes: [00-Project-Overview(1).md](./00-Project-Overview(1).md), [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md), and [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md). [11-Phase-1-Audit-Findings.md](./11-Phase-1-Audit-Findings.md) has the requested exact filename.
- **Frontend entry points:** [index.html](../index.html) is the landing page. Multi-page app entries include login, dashboard, cases, calendar, reports, settings, Admin Panel, Register Diary, judges, and IO management, configured in [vite.config.js](../vite.config.js#L21). The Admin page is [pages/admin-panel.html](../pages/admin-panel.html#L16).
- **Shared/application logic:** [assets/js/shared-layout.js](../assets/js/shared-layout.js#L1) injects shared navigation and profile behavior; [assets/js/fir-case-model.js](../assets/js/fir-case-model.js#L13) handles `firMasters`, `linkedCases`, and legacy `cases`; [components/add-case/add-case.js](../components/add-case/add-case.js#L1) contains case creation/editing and related writes.
- **Firebase:** [firebase/firebase-config.js](../firebase/firebase-config.js) initializes Firebase Auth and Firestore for the main frontend. The separate [firebase/local-role-admin/firebase-config.js](../firebase/local-role-admin/firebase-config.js) connects to local Auth, Firestore, and Functions emulators.
- **Build/dependencies:** [package.json](../package.json) declares Firebase and Vite, with `dev`, `build`, `preview`, and `test` scripts. [vite.config.js](../vite.config.js#L5) prevents building in `role-admin-local` mode and selects the local Firebase alias only for that development mode.
- **Deployment:** [deploy.yml](../.github/workflows/deploy.yml#L18) builds the static site and deploys the `dist` artifact to GitHub Pages. It does not deploy Firebase Functions or Firestore Rules.
- **Prototype boundary:** [security-prototypes/role-management/README.md](../security-prototypes/role-management/README.md) describes a local-only Emulator prototype. Its [firebase.json](../security-prototypes/role-management/firebase.json#L1) fixes loopback emulator endpoints, and its [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L6) requires the demo project ID.
- **Worktree:** The current branch is `main`. The repository already has staged, unstaged, and untracked Admin Panel/prototype-related work. I preserved it; the audit did not add to or clean it.

## 3. Authentication and Authorization Findings

**F-07 — Main authentication is present; role lifecycle is not integrated into login**\
**Severity:** High · **Status:** Partially Verified\
**Evidence:** [login.js](../assets/js/login.js#L22) uses Firebase email/password sign-in and redirects to the general dashboard at line 24. [shared-layout.js](../assets/js/shared-layout.js#L390) redirects unauthenticated users, but the role label is hard-coded at line 381.\
**Impact:** Authentication establishes a Firebase session, but the inspected path does not establish active role, account status, or Operator station assignment before routing. Disabled/revoked account behavior was not exercised.\
**Recommended follow-up:** Verify login and session-expiry behavior for active, revoked, disabled, missing-role, and unassigned accounts in a safe environment.

**F-08 — The local prototype has limited trusted Admin endpoints, not a production authorization service**\
**Severity:** High · **Status:** Partially Verified\
**Evidence:** The prototype exports only `listUserRoles`, `policeStations`, and `createOperator` in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L706). It verifies tokens with revocation checking at line 649 and reads the caller’s role at line 652; the endpoint authorization helper requires an active Admin at line 154. Frontend calls use loopback endpoints in [admin-panel.js](../assets/js/admin-panel.js#L4) and [operator-management.js](../assets/js/operator-management.js#L4).\
**Impact:** These controls are useful prototype evidence, but they cannot serve remote users as configured. No production Functions deployment or role-management endpoint was found.\
**Recommended follow-up:** Treat the endpoint implementation and historical prototype tests as prototype-only evidence until production target, runtime identity, deployment, and endpoint authorization are independently verified.

**F-09 — User creation uses an Admin-entered password rather than the approved setup-link flow**\
**Severity:** High · **Status:** Partially Verified\
**Evidence:** [pages/admin-panel.html](../pages/admin-panel.html#L75) asks the Admin for an initial password. The prototype sends it to `createOperator` in [operator-management.js](../assets/js/operator-management.js#L105); the backend creates a disabled account with that password in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L569) before later enabling it. The approved product decision in [15-Admin-Panel-System-Specification.md](./15-Admin-Panel-System-Specification.md#fr05----create-operator) says the Operator sets their own password via a one-time setup link.\
**Impact:** The local workflow does not match the approved credential handoff. It also has no invitation delivery, expiry, single-use, or recovery behavior.\
**Recommended follow-up:** Resolve and technically validate the approved one-time setup-link mechanism before treating provisioning as production-ready; do not equate the local prototype’s initial-password flow with that requirement.

**F-10 — Admin lifecycle and recovery safeguards are designed but not implemented as normal operations**\
**Severity:** High · **Status:** Missing\
**Evidence:** The prototype README describes a one-time manual local bootstrap, not an Admin Panel creation/recovery workflow, in [README.md](../security-prototypes/role-management/README.md). Its Functions list contains no promote, demote, revoke, reactivate, or last-Admin operation in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L706). The ADR requires last-Admin protection and trusted recovery in [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#last-admin-protection).\
**Impact:** The intended safeguard has no implemented transition path to protect. Bootstrap instructions are not an operationally verified recovery mechanism.\
**Recommended follow-up:** Confirm the trusted-owner bootstrap/recovery procedure and validate governance reconciliation and last-Admin protection before any role lifecycle is enabled.

## 4. Firestore Security and Station-Isolation Findings

**F-11 — Test Rules are broad and must not be confused with production policy**\
**Severity:** High · **Status:** Verified\
**Evidence:** [firebase.test.json](../firebase.test.json#L1) selects [firestore.test.rules](../firestore.test.rules#L3). Those rules grant authenticated reads/writes to non-`cases` top-level collections at line 11 and basic authenticated CRUD on `cases` at lines 4–8. The isolated role prototype instead uses deny-all client Rules at [firestore.rules](../security-prototypes/role-management/firestore.rules#L4).\
**Impact:** The test Rules do not implement station isolation or the Admin role model. Accidentally using them as production Rules would grant broad authenticated access. This audit did **not** establish that they are deployed.\
**Recommended follow-up:** Preserve the test-only boundary and verify deployed Rules independently before release.

**F-12 — Station ownership is not consistently keyed by stable IDs in legacy-compatible logic**\
**Severity:** High · **Status:** Risk\
**Evidence:** [fir-case-model.js](../assets/js/fir-case-model.js#L31) falls back to station display-name comparison when stable IDs are absent. The same model overlays FIR Master data using `firMasterId || firId` at line 65. The Admin/Operator case helper requires a station assignment for both `operator` and `admin` at [add-case.js](../components/add-case/add-case.js#L385).\
**Impact:** Legacy ownership can be ambiguous, station-name edits can affect matching, and the current case workflow assumes an Admin has a station assignment—unlike the approved ADR. No production dataset was inspected to establish actual misassociation.\
**Recommended follow-up:** Inventory and reconcile legacy station ownership and FIR links before designing station-based Rules; keep ambiguous records unavailable until their ownership is verified.

## 5. Data Model and Workflow Findings

- **FIR Master and proceeding relationships — Partially Verified.** The model declares `firMasters`, `linkedCases`, and legacy `cases` in [fir-case-model.js](../assets/js/fir-case-model.js#L13). It supports `firMasterId`/`firId` matching, and the workflow writes predecessor/successor links in [add-case.js](../components/add-case/add-case.js#L3238). Full browser and live Firestore behavior was not tested.
- **Duplicate prevention — Risk.** [saveFirMaster](../assets/js/fir-case-model.js#L168) checks for a duplicate on creation at line 180, but the update path at line 196 does not apply that same duplicate rejection. The lookup and write are separate operations, so the code does not establish atomic uniqueness under concurrent requests. This matches the earlier source-level concern recorded in [11-Phase-1-Audit-Findings.md](./11-Phase-1-Audit-Findings.md#r-03----duplicate-fir-master-prevention-is-not-guaranteed).
- **Partial save and transfer consistency — Risk.** Proceedings and related records are written separately in [add-case.js](../components/add-case/add-case.js#L3217), including successor/predecessor updates at line 3240. Per-record failures are captured at lines 3173 and 3284, which can leave successful writes alongside failed related writes. No failure-injection test was run.
- **Hearing-date history — Partially Verified.** Hearing records are stored in `hearingDateRecord`; Register Diary updates that array and derives `nextDate` in [register-diary.js](../assets/js/register-diary.js#L177). This establishes an application history representation, not an immutable actor-attributed audit trail.
- **Legacy case compatibility — Partially Verified.** The main model still loads legacy `cases` and overlays FIR Master data where IDs match in [fir-case-model.js](../assets/js/fir-case-model.js#L53). The previous audit identifies risks around legacy `firId` assumptions and duplicate identity handling in [11-Phase-1-Audit-Findings.md](./11-Phase-1-Audit-Findings.md#r-02----legacy-fir-id-collision-or-misassociation); production values were not inspected here.
- **Reports and exports — Partially Verified / Missing for Admin requirements.** The existing report page presents a Police Station Summary in [report.html](../pages/report.html#L105), and [report.js](../assets/js/report.js#L96) builds it from `loadCaseRecords`, which reads the broad client-side collections. The “Export Report” button appears at [report.html](../pages/report.html#L27); no export handler was found in the inspected report module. No operator-wise report or server-authorized Admin report/export endpoint was found.

## 6. Admin Panel Capability Matrix

| Capability | Status | Evidence | Gap | Risk |
|---|---|---|---|---|
| Admin and Operator roles | **Partially Verified** | Role documents and active-Admin checks exist in the local prototype; [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L652) reads role records. | Not integrated into main login routing; production role enforcement unknown. | Role cannot be treated as securely enforced across the application. |
| SP/Senior Officer read-only access | **Missing** | ADR leaves exact role name and jurisdiction unresolved in [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#9-unresolved-items). | No role, routing, report scope, or authorization path found. | Scope could exceed approved overview-only access. |
| Read-Only User with multiple assigned stations | **Missing** | Existing ADR only specifies one station for Operators; see [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#21-role-permission-boundary). | Role identifier, assignment schema, and multi-station boundaries are undecided. | Cannot safely infer or grant broader access. |
| User creation/invitation | **Partially Verified** | Local `createOperator` endpoint exists; [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L723). | Emulator-only, initial Admin-entered password; no approved setup-link implementation. | Not a remote production provisioning workflow. |
| Activation/deactivation and station reassignment | **Missing** | No such endpoints in the prototype export list at [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L706). | No lifecycle controls or reassignment history in the panel. | Access changes and offboarding cannot be represented. |
| Police Station Master management | **Partially Verified** | Local Admin-authorized list/create endpoint in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L714). | No rename, deactivate, alias, or station-history workflow; not production-deployed. | Station lifecycle and identity continuity remain unaddressed. |
| Admin cross-station read-only case access | **Missing** | Current application lacks a role-specific cross-station read path; [fir-case-model.js](../assets/js/fir-case-model.js#L53) loads broad client collections. | Requested read-only scope conflicts with ADR’s all-station create/read/update/delete Admin scope. | Permission boundary must be decided before implementation. |
| Station-wise/operator-wise reports and exports | **Partially Verified** | Existing client-side report groups records by station; [report.js](../assets/js/report.js#L90). | No verified export handler, operator-wise report, or server-side authorization. | Reports may expose broader data than intended if Rules do not constrain access. |
| Audit logs with actor/time/action/target/before-after | **Partially Verified** | Operator creation writes an initial `assigned` event in [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L441). | No complete lifecycle, reassignment, station-master audit, or audit UI. | Cannot establish comprehensive accountability or immutable history. |
| Last-active-Admin safeguards and recovery | **Missing** | Required by [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#last-admin-protection); no transition endpoint exists. | One-time documented local bootstrap is not a tested lifecycle safeguard. | Admin lockout or unsafe recovery remains possible if lifecycle actions are later added without controls. |
| Server-side authorization for privileged actions | **Partially Verified** | Prototype endpoints re-check active Admin state; [functions/index.cjs](../security-prototypes/role-management/functions/index.cjs#L154). | Only local list/station/create flows; no production deployment, report endpoint, Rules verification, or broader lifecycle. | Prototype controls do not prove production enforcement. |
| Firestore station isolation | **Unverified** | No production Rules file in the checked-in root; test and prototype Rules differ. | Deployed Rules and data ownership were not inspected. | Release blocker for multi-station access. |

## 7. Existing ADR/Documentation Cross-Check

### Aligned decisions

- The overview frames current work as a single-user workflow and multi-station/SP administration as future expansion, not confirmed implementation: [00-Project-Overview(1).md](./00-Project-Overview(1).md#31-current-objective) and [00-Project-Overview(1).md](./00-Project-Overview(1).md#13-future-expansion).
- The ADRs explicitly distinguish approved design from implementation and security validation. They require stable `policeStationId`, Admin-assigned single-station Operators, and server/Rules enforcement rather than UI filters: [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#2-approved-architecture-decisions) and [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#2-approved-architecture-decisions).
- The Phase 1 findings appropriately separate source inspection from untested runtime behavior and identify duplicate, legacy-ID, and partial-write risks: [11-Phase-1-Audit-Findings.md](./11-Phase-1-Audit-Findings.md#4-data-consistency-risks-r-01-to-r-07).

### Conflicts and unresolved decisions

1. **Two approved roles vs. four-role proposal:** The role ADR approves `admin` and `operator`; it records an SP-level viewer as a separate direction with role name and jurisdiction pending. A new Read-Only User role—especially one assigned multiple stations—is not established as approved architecture. See [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#2-approved-architecture-decisions) and [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#3-access-model).
2. **SP access to case details:** The isolation ADR defines SP-level access as read-only overview reports/statistics and leaves jurisdiction open. Read access to detailed case records is not clearly approved. Any expansion from summaries to case details needs a distinct decision. See [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#2-approved-architecture-decisions).
3. **Admin cross-station read-only vs. ADR permissions:** The proposed read-only scope conflicts with the approved ADR, which grants Admin FIR/proceeding create/read/update/delete across stations. The requested scope must not silently replace that decision. See [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#3-access-model) and [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#21-role-permission-boundary).
4. **Single-station Operator vs. multi-station viewer:** The ADR explicitly assigns Operators one station; it does not define a multi-station Read-Only User or its jurisdiction model. See [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#2-approved-architecture-decisions).
5. **Trusted backend and Rules:** The ADR requires Rules for client requests and makes a trusted backend mandatory if Rules cannot reliably enforce role-management invariants. The prototype uses Admin SDK and therefore performs its own authorization, but it is local-only. Role transitions, governance coupling, and station-isolation Rules remain unimplemented or unverified. See [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md#7-release-blockers-and-fallback) and [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md#5-authorization-enforcement-requirements).

The newer [15-Admin-Panel-System-Specification.md](./15-Admin-Panel-System-Specification.md) is explicitly a planning specification. [16-Role-Transition-Specification-Proposal.md](./16-Role-Transition-Specification-Proposal.md#status-and-purpose) is a partially approved proposal, and [17-Role-Transition-Minimal-Implementation-Scope.md](./17-Role-Transition-Minimal-Implementation-Scope.md#1-in-scope-transition-operations) says station reassignment is out of scope. These documents do not by themselves resolve the role-scope conflicts above.

## 8. Risk Register

| ID | Severity | Status | Evidence and impact | Recommended follow-up |
|---|---|---|---|---|
| F-03 | High | Unverified | Deployed Rules unknown; no root production Rules config. Multi-station exposure cannot be ruled in or out. | Read-only verification of deployed Rules and target. |
| F-04 | High | Risk | Broad collection reads plus frontend station checks do not prove isolation. | Test direct reads/queries/writes across stations under actual Rules. |
| F-01/F-02 | High | Partially Verified / Risk | Login is not role-aware; Admin shell is UI-gated, not a complete route boundary. | Validate role resolution and server/Rules guards on every protected path. |
| F-05 | High | Risk | Non-atomic duplicate checks, legacy fallback, and separate related writes may cause misassociation or partial state. | Inventory legacy data; test concurrency and failure recovery safely. |
| F-09 | High | Partially Verified | Prototype password workflow conflicts with approved Operator setup-link decision. | Verify provisioning and setup-link security before production use. |
| F-10 | High | Missing | No implemented role-transition, last-Admin, or recovery endpoint. | Approve and validate bootstrap, recovery, and lifecycle safeguards. |
| F-06 | Medium | Partially Verified | Hearing history exists, but not comprehensive actor-attributed audit; file status is browser-local. | Decide audit and retention requirements for official changes. |
| Admin reporting/export | Medium | Partially Verified | Report UI is client-side; no verified export or protected server report. | Define role/jurisdiction and authorization requirements before reporting scope. |

## 9. Unverified Items

- Deployed Firestore Rules, indexes, Cloud Functions, Firebase project target, and production account/role state.
- Whether production currently enforces authentication, station ownership, or revoked-account denial.
- Real-world `policeStationId` coverage and ambiguous/missing station ownership in existing records.
- End-to-end login, role routing, account provisioning, Admin access, Operator access, and logout/session-expiry behavior.
- Direct-document and query behavior, writes/deletes, concurrency, and partial-failure recovery.
- Full FIR Master/proceeding/legacy migration behavior, hearing history consistency, and reporting behavior.
- Whether the report export button is wired at runtime; no handler was found in the inspected report module.
- Historical emulator test results mentioned in project documentation were **not rerun** for this audit.

## 10. Recommended Next Steps

1. **Confirm the live security boundary read-only:** obtain the authoritative deployed Rules, Functions, Firebase target, and deployment mapping before drawing conclusions about production exposure.
2. **Apply the recorded role and access boundaries:** use [20-Admin-Panel-Architecture-Decisions.md](./20-Admin-Panel-Architecture-Decisions.md) as the current decision record: Admin retains all-station CRUD, SP/Senior Officer access is aggregate-summary-only with no individual-record access, and a separate Read-Only User role is not approved. The exact SP role identifier, jurisdiction representation, secure aggregation, and technical authorization remain pending.
3. **Establish data ownership evidence:** inventory `firMasters`, `linkedCases`, `cases`, and related collections; identify missing/conflicting station IDs and uncertain legacy links. Do not infer or migrate ambiguous ownership.
4. **Verify role lifecycle requirements:** decide provisioning, invitations, activation/deactivation, reassignment, immutable audit fields, last-Admin protection, and trusted recovery before implementation planning.
5. **Validate reports and exports against approved scope:** determine whether reports are server-generated or client-computed and how station/operator filtering is authorized.
6. **Run later behavioral tests only in an explicitly isolated, approved environment:** include direct document/query tests, two-station negative cases, role revocation, concurrency, and multi-document failure cases.

These are audit-based priorities only; no implementation or architecture decision is made here.

## 11. Audit Boundaries

**Performed:** Read-only inspection of the four required documents, Admin Panel and login source, Firebase configuration, case data model/workflows, report code, test and prototype Rules/configuration, prototype Functions, package/build/deployment configuration, and repository status. Used targeted source searches and file reads to identify paths and line references.

**Not performed:** No tests, build, emulator startup, browser login, Firebase Console/API access, data queries, writes, Rules deployment, account operations, or deployment checks. The test harness and build were not run because the request required a read-only audit and those operations can create build artifacts or interact with emulator state. Live Firebase behavior remains unverified.

The worktree had staged, unstaged, and untracked changes before and after this audit. They were preserved; the audit report was saved afterward, following approval.
