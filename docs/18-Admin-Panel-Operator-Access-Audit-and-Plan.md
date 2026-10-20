# Admin Panel and Operator Access — Phase 1 Audit and Approval Plan

> **Current-state note (2026-10-20):** This audit records the pre-integration state. The approved Firebase target and secure email onboarding have since been implemented locally and verified with isolated emulator/browser tests. Use the [current production-readiness report](./25-Production-Readiness-and-Security-Report.md) for present status; historical findings below describe the earlier audit only.

**Date:** 2026-10-19
**Status:** Repository inspection completed; production implementation not approved or started. A local Admin Panel prototype exists as described below.
**Scope:** Remote Admin Panel, secure Operator provisioning, Operator login/dashboard, and police-station data isolation
**Source requirements:** [15-Admin-Panel-System-Specification.md](./15-Admin-Panel-System-Specification.md)

**Decision reconciliation:** This document preserves the audit observations and implementation evidence from its review. The later confirmed access boundaries are recorded in [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md): Admin retains all-station CRUD; SP/Senior Officer access is aggregate-summary-only without individual record access or writes; and a separate Read-Only User role is not approved. These decisions do not change the unverified implementation/security findings below.

**Initial-release scope update (2026-10-19):** Operator station reassignment is deferred and excluded from the initial release. The earlier reassignment direction recorded below was superseded by the later confirmed scope; this audit remains a historical snapshot, not the current implementation order. Initial release includes safe audited account deactivation/revocation with Auth disablement, but not hard deletion. SP/Senior Officer access is also deferred and does not block the Admin/Operator release. See [`21-Admin-Panel-Initial-Release-Roadmap.md`](./21-Admin-Panel-Initial-Release-Roadmap.md).

## 1. Executive summary

The repository contains a Firebase email/password login, an Admin Panel shell, and an isolated local Emulator prototype with active-Admin-authorized Users listing, Police Station Master list/create, and Operator creation with one station assignment. The prototype has useful validation, idempotency, Auth-disable staging, role/history writes, and endpoint tests.

These capabilities do **not** constitute the requested deployed system. The Admin Panel endpoints are hard-coded to the local `127.0.0.1:5001` Functions Emulator and demo project. The deployment workflow builds and publishes only the static Vite application to GitHub Pages; it does not deploy Functions or production Firestore Rules. There is no Operator-specific dashboard or trusted-role routing. The existing general dashboard loads full FIR/proceeding collections from client Firestore code, while station comparisons in the case workflow are client-side only. The repository has no production Firestore Rules file; deployed Rules and the live production target were not inspected and remain unverified.

**Release conclusion:** Do not expose production Admin operations or Operator records until the authoritative Firebase target, deployed Rules, backend deployment, role routing, and station isolation have been verified and the listed release tests pass. No source, account, role, emulator data, or deployment was changed during this audit.

## 2. Audit scope and evidence boundary

The audit read the complete system specification and inspected the project overview, phase-1 audit, role-management and station-isolation ADRs, feasibility test plan/results, Admin Panel security plan, role-transition proposal/scope, and the local role-management prototype documentation. The repository uses suffixed filenames for three requested related documents: `00-Project-Overview(1).md`, `12-Role-Management-ADR (1).md`, and `13-Police-Station-Isolation-ADR (1).md`; the unsuffixed names referenced by the specification are not present in the current `docs/` inventory. These observed copies were read; no rename or document reconciliation was attempted.

The current working tree already contains staged and unstaged changes. They were preserved. The repository audit did not run tests, sign in, query Firebase, reset an emulator, or deploy. A separately approved public deployment check is recorded below. Historical test results below are identified as documented prototype results, not results rerun for this audit.

### Read-only deployment verification — 2026-10-19

- `https://sknarwal03.github.io/CaseTrack/` and `/CaseTrack/pages/login.html` both returned HTTP 200. The login HTML loads a hashed Vite login module, which imports its hashed Firebase configuration module.
- The deployed login module redirects successful email/password authentication to `dashboard.html`; no sign-in was attempted.
- The deployed Firebase configuration module returned HTTP 200 and contains `projectId: casetrack-97a4e`. It does not contain the local role-prototype project ID or a `127.0.0.1:` emulator endpoint. The repository's `main` ref is `4f226657fc1d912e759d20848080f1444643c4b9`, matching the latest listed successful Pages workflow run (#18). The owner subsequently confirmed `casetrack-97a4e` is the intended authoritative production project.
- No public repository deployment configuration for Firebase Functions or Firestore Rules was found. The Firebase Console Rules URL redirected to Google sign-in, so deployed Firestore Rules could not be confirmed; no credentials were entered and no authenticated Firebase console/API access was used. Their live state remains **Unverified** and requires an authorized read-only Rules release/config view. Do not infer live Rules from the test or prototype Rules files.
- The owner reports no separate staging Firebase project exists and it needs creation. Creating or configuring one was not authorized by the read-only gate and requires separate approval.
- The owner selected GitHub Pages for the static frontend and a separately configured Firebase Functions backend for the planned remote Admin workflow. This is a planning decision only; no Functions deployment config, project, or service was created or changed.
- Owner decisions recorded after the public checks: station reassignment should be included before release, with immediate cutover (revoke old-station access, grant new-station access), no automatic record movement, and any in-progress case transfer handled as a separate explicit audited Admin action. Audited Operator suspension/revocation with Auth disable is in scope; hard deletion is not. These are requirements for future implementation, not implemented behavior. The approved role-transition documents currently defer reassignment and need an explicitly approved reconciliation before code changes.
- The Operator email address is the login identifier per the specification. The display-name requirement remains pending; confirm it against the existing profile schema before implementation.
- **Approved product decision — Operator credential setup (2026-10-19):** after account creation, the Operator sets their own password using a one-time setup link. The Admin must not need to view or set the Operator's password.
- **Pending technical verification (not implementation assumptions):** verify how the setup link will be securely generated and delivered; how single-use and time-limited validity will be enforced; what recovery flow applies to expired or already-used links; and how Admin authorization and audit logging will be enforced. No mechanism is selected or verified by this product decision.
- This gate made no login attempts, Firebase document requests, account/role changes, emulator operations, or deployments.

## 3. Requirement-by-requirement status

Status meanings: **Implemented** means evidence and relevant verification cover the specified target behavior; **Partially Implemented** means some local/source behavior exists but material requirements or verification are incomplete; **Missing** means the repository contains no implementation for that behavior; **Unverified** means the live/deployed state cannot be established from available repository evidence.

| Requirement | Status | Repository evidence and gap |
|---|---|---|
| FR-01 — Remote HTTPS entry, deployed routes and correct environment | **Partially Implemented** | Public GitHub Pages root and `/CaseTrack/pages/login.html` both returned HTTP 200; latest successful Pages run #18 matches current `main`; the owner confirmed the deployed client target `casetrack-97a4e` is authoritative. Other route refresh behavior remains unverified. The Admin workflow still points at a local emulator. |
| FR-02 — Email/password authentication and safe session handling | **Partially Implemented** | `assets/js/login.js` calls Firebase email/password sign-in and redirects every successful user to `dashboard.html`. It gives a generic invalid-credential message, but does not resolve roles or distinguish service-unavailable/disabled/revoked outcomes comprehensively. Operator self-service password setup is an approved product decision, but is not implemented and its security mechanism remains pending technical verification. The shared logout path catches errors and redirects regardless. |
| FR-03 — Trusted role resolution and role-specific routing | **Partially Implemented** | `shared-layout.js` hides/shows the Admin navigation using `isActiveAdmin`, which calls a local Functions endpoint. `admin-panel.js` redirects signed-out users, but displays its content for any signed-in user before the local endpoint result authorizes its data. No sign-in routing to Admin versus Operator exists. A typed Admin URL can display the shell; local endpoints reject non-Admins. |
| FR-04 — Canonical Police Station Master | **Partially Implemented** | Local prototype `policeStations` endpoint supports active-Admin list/create and stable Firestore document IDs. Rename/deactivate/alias lifecycle is absent and intentionally unresolved. No production deployment is configured. |
| FR-05 — Secure Admin-created Operator account | **Partially Implemented** | Local prototype accepts email, initial password and an existing station ID; it verifies an active Admin, validates the station, stages Auth disabled, commits active Operator role plus assignment-history, enables Auth and journals retries. It is fixed to the demo project; no production Function deployment exists. Operator-set password via a one-time setup link is approved, but not implemented; secure generation/delivery, single-use/expiry, recovery, and Admin authorization/audit enforcement remain pending technical verification. Display-name/profile requirements remain unresolved. |
| FR-06 — Initial station assignment | **Partially Implemented** | Initial assignment to one existing station at Operator creation is implemented in the local prototype. Reassignment is deferred and excluded from the initial release. No production assignment path or Rules enforcement exists. |
| FR-07 — Admin user management and lifecycle | **Partially Implemented** | Prototype provides read-only paginated role-record listing. Audited suspension/revocation with Auth disable is an owner-approved scope requirement but is not implemented. Promote/demote/reactivate, history view, and last-Admin transition protection are absent. Hard deletion is out of scope. |
| FR-08 — Dedicated Operator Dashboard and station-scoped records | **Missing** | There is no Operator-specific page/route. The existing `pages/dashboard.html` and `assets/js/dashboard.js` are general CaseTrack dashboard files. `loadCaseRecords()` fetches all `firMasters`, `linkedCases`, and legacy `cases`; it does not take a trusted station scope. |
| FR-09 — Append-only role/assignment audit | **Partially Implemented** | Local Operator creation writes one `assigned` history event transactionally with its role. The prototype Rules deny client writes, but there are no role-transition/history rules or endpoints; role lifecycle and station reassignment histories are absent. Production audit integrity is unverified. |
| FR-10 — Safe operational feedback/retry | **Partially Implemented** | Prototype endpoints return validation, authorization, duplicate and retryable provisioning errors; the creation journal supports idempotent retry. Main login and app routes do not provide the full role/service-unavailable states. These behaviors have not been validated on deployed services. |
| Trusted authorization for privileged operations | **Partially Implemented** | Prototype Functions verify ID tokens and re-read active Admin role records on each endpoint call. Admin SDK bypasses Rules, so those endpoint checks are the security boundary. This code runs only against its fixed emulator project; production backend and IAM are absent/unverified. |
| Firestore Rules for roles, audit and station isolation | **Missing in main application; deployed state Unverified** | No root production `firestore.rules` or Firebase deployment config is present. `firestore.test.rules` grants authenticated users broad access to non-`cases` collections and basic authenticated CRUD for `cases`; `firebase.test.json` selects it for tests only. The prototype `firestore.rules` is default-deny and therefore does not implement production role/station access. The actual deployed Rules were not queried. |
| Operator-only access to assigned station | **Missing in the repository; deployed state Unverified** | `getAssignedPoliceStation()` and case write/delete checks are client-side only. Reads in `loadCaseRecords()` are broad collection reads. Current fallback comparisons can use station display names when a stable ID is missing. None of those checks prevents direct Firestore reads/writes without appropriate deployed Rules/backend enforcement. |
| Environment separation and production deployment safety | **Partially Implemented** | The published client bundle is verified to target project ID `casetrack-97a4e`, which the owner confirmed is authoritative. Vite aliases the local config only for `role-admin-local` development mode and rejects that mode for builds. The separate prototype is fixed to `demo-casetrack-role-prototype`. No staging project/config or Functions/Rules deployment workflow exists; the owner says a separate staging project needs creation. The deployed Rules remain unverified. |

### Specification acceptance-checklist status

| Specification section | Status | Evidence |
|---|---|---|
| §7.1 Remote access | **Partially Implemented** | Static GitHub Pages workflow exists; root and login route respond HTTP 200 and current `main` matches latest successful Pages run. The owner confirmed the deployed Firebase project. Refresh behavior for other routes and staging setup remain outstanding. |
| §7.2 Authentication and routing | **Partially Implemented** | Email/password sign-in and signed-out redirect exist. Admin-vs-Operator routing, protected-route denial, revoked/unassigned handling, session expiry, and deployed behavior are not established. |
| §7.3 Operator provisioning | **Partially Implemented** | Local prototype supports active-Admin creation, stable station ID, role/history and retryable Auth staging. Approved credential handoff, deployed provisioning, Operator sign-in and audit/governance release gates remain incomplete or unverified. |
| §7.4 Station isolation | **Missing in repository; deployed state Unverified** | No production Rules/backend enforcement or Operator-scoped dashboard reads. Existing client reads are broad. Legacy ownership mapping is not verified. |
| §7.5 Role-management integrity | **Partially Implemented** | Prototype bootstrap and initial Operator assignment event are documented. No normal transitions, last-Admin protection, complete audit coupling, production Rules, or transition tests exist. |

**Overall objective:** **Partially Implemented** at local-prototype level; **not release-ready** and not demonstrated as a deployed Admin-to-Operator workflow.

## 4. Existing implementation and reusable prototype

### Main application

- `pages/login.html` and `assets/js/login.js`: email/password sign-in; success always routes to the ordinary dashboard.
- `pages/admin-panel.html`, `assets/js/admin-panel.js`, and `assets/js/admin-access.js`: Admin shell, local Users endpoint listing, and a local Admin access check. Admin Panel content is a prototype UI; it is not a production route guard.
- `assets/js/operator-management.js`, `assets/js/police-station-master.js`, and the Admin Panel forms: frontend for local prototype account/station flows; Function roots are fixed to `127.0.0.1:5001`.
- `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/js/shared-layout.js`: existing general dashboard and shared navigation. No role-specific Operator route is present; the profile role label is hard-coded as “Administrator”.
- `assets/js/fir-case-model.js` and `components/add-case/add-case.js`: use both station IDs and station-name fallbacks. The case form gets the current user's role/station and compares records in the browser; that is not an authorization boundary. The helper currently requires a station assignment for both `operator` and `admin`, which conflicts with the approved ADR that Admin has all-station access and need not have a station assignment.
- `firebase/firebase-config.js`: frontend config currently names `casetrack-97a4e`. This value is source evidence, not confirmation that this is the authoritative or currently deployed production project.
- `.github/workflows/deploy.yml`: static GitHub Pages build/deployment workflow on `main`; no Functions or Firestore Rules deployment is present.

### Isolated role-management prototype

`security-prototypes/role-management/functions/index.cjs` contains `listUserRoles`, `policeStations`, and `createOperator`. It verifies a token and active Admin role server-side, validates station existence, uses a disabled-Auth provisioning saga, writes the role plus initial history, and stores an HMAC fingerprint (not the plaintext password) in an actor-scoped retry journal. Its project ID, Auth/Firestore emulator checks, endpoints and package scripts are deliberately local/demo-only. It has no deploy script.

The prototype's `firestore.rules` is default-deny. `tests/role-management.rules.test.js` and `tests/station-isolation.rules.test.js` test baseline denials only; they do not implement or demonstrate positive Admin/operator Rules. Function test files cover endpoint behavior for Users listing, station list/create and Operator provisioning. `README.md` documents historical local test results: Operator Creation 12/12, Users 14/14 and Police Station Master 7/7; it also states that role-transition and station-isolation Rules suites were not run. These historical tests were not rerun in this audit.

## 5. Security risks and release blockers

1. **Production Rules are unknown and absent from the root deployment configuration.** Never substitute `firestore.test.rules` in production: its broad authenticated-user grants are test-only. Do not expose sensitive data until deployed Rules are obtained/reviewed and direct-document/query negative tests pass.
2. **The local Functions endpoint cannot serve remote Admin users.** URLs and project ID are hard-coded to loopback/demo values, and the prototype deliberately has no production target. A deployed frontend cannot rely on an emulator on each user's device.
3. **UI role checks are not sufficient.** Hiding the navigation entry and checking roles in JavaScript do not protect a route or Firestore access. The existing Admin shell can render for any authenticated user before endpoint authorization completes.
4. **Current case station checks are client-controlled.** Browser comparisons and form filters can be altered. Reads load whole collections, and no main-app Rules/backend enforcement proves an Operator cannot read another station's records.
5. **No Operator-specific destination or role router exists.** Every login goes to the shared dashboard, which currently displays a personal greeting but is not station-scoped.
6. **Credential setup is not implemented and its technical security is unverified.** The approved product decision requires the Operator to set their own password through a one-time setup link; the Admin must not view or set it. Secure link generation/delivery, single-use/time limits, expired/used-link recovery, and Admin authorization/audit enforcement require technical verification. The prototype currently accepts an Admin-entered initial password and is not the approved production flow. The display-name requirement is still pending. Keep passwords out of logs, persistent role/history data, browser storage, and deployments.
7. **Role lifecycle invariants are missing.** No promote/demote/revoke/reactivate, last-Admin protection, or reusable trusted recovery flow exists. The feasibility report found experimental Rules permitted a promotion without history and a standalone governance increment; these were prototype findings, not production findings, and demonstrate why those experimental Rules must not be deployed.
8. **Legacy ownership is not safe to infer.** Records can lack `policeStationId` or use a display-name fallback. The ADR requires review/mapping of ambiguous ownership before the records are exposed under station isolation.
9. **Deployment safety is incomplete.** The live GitHub Pages routes and revision were verified, and the owner confirmed `casetrack-97a4e` as authoritative. Production Functions, deployed Rules, indexes and web-origin policy remain unverified; a separate staging project does not yet exist.
10. **Station reassignment is deferred from the initial release.** An earlier direction recorded in this audit snapshot is superseded for initial-release scope. Do not build or expose reassignment; if separately approved later, define and test access cutover, in-progress work, record ownership, and audit behavior first.

## 6. Required file-level work (proposed; not implemented)

| Area | Existing files to review/change after approval | New files or deployment assets likely required |
|---|---|---|
| Environment selection | `firebase/firebase-config.js`, `vite.config.js`, `.github/workflows/deploy.yml` | Explicit, reviewed staging configuration and deployment environment/secret bindings; do not derive a production project from the current source value alone. |
| Login and role routing | `assets/js/login.js`, `assets/js/shared-layout.js`, `assets/js/admin-access.js` | Shared trusted role-resolution/routing helper and tests for admin/operator/denied/error states. |
| Admin Panel | `pages/admin-panel.html`, `assets/js/admin-panel.js`, `assets/js/operator-management.js`, `assets/js/police-station-master.js` | Production-safe endpoint configuration and, if approved, secure credential setup UI; preserve existing local prototype behavior separately. |
| Operator UI | `pages/dashboard.html`, `assets/js/dashboard.js`, shared page layout | A dedicated `pages/operator-dashboard.html` and `assets/js/operator-dashboard.js`, or a reviewed role-aware adaptation of the existing dashboard. Do not expose broad dashboard queries to Operators. |
| Backend | Prototype source may be reused only after review: `security-prototypes/role-management/functions/index.cjs` | A separately configured production/staging Functions/backend source and root deployment config (for example, approved `functions/` source plus `firebase.json`). Keep Admin SDK secrets server-side; do not deploy the prototype's fixed-demo backend. |
| Firestore Rules/data | `firestore.test.rules` remains test-only; prototype `security-prototypes/role-management/firestore.rules` remains deny-all | A reviewed root production/staging `firestore.rules`, Rules unit tests for actual CaseTrack collections, and any required indexes. Inventory/map legacy ownership before enabling station-scoped records. |
| Tests | Existing app tests and `security-prototypes/role-management/functions/tests/*.js` | Role-routing/browser tests; backend auth/provisioning/retry tests; Rules tests for direct reads, queries and writes across two stations; staging smoke tests. Do not reset the existing emulator as a shortcut. |
| Documentation/operations | `docs/15-Admin-Panel-System-Specification.md`, ADRs and prototype README | Credential-handoff decision, project/host map, deployment/rollback runbook, audited migration/recovery procedure and current acceptance report. Do not edit approved ADRs without a separate decision. |

The list is a change map, not authorization to create a production backend, alter existing data, or choose a major architecture. The exact backend/hosting/environment design must be approved after the project and deployment target are verified.

## 7. Recommended implementation order

1. **Implement the confirmed initial-release scope:** use [20-Admin-Panel-Architecture-Decisions.md](./20-Admin-Panel-Architecture-Decisions.md) for access boundaries and [21-Admin-Panel-Initial-Release-Roadmap.md](./21-Admin-Panel-Initial-Release-Roadmap.md) for sequencing. Reassignment and SP/Senior Officer access are deferred; audited deactivation/revocation with Auth disablement is in scope. Do not treat any of these planning decisions as technically implemented.
2. **Define a protected staging environment:** request separate approval before creating/configuring a staging project; isolate its config/secrets from the local demo and production. Keep GitHub Pages as the static frontend and configure Functions only for the separately approved staging project. Verify route fallback/deep links, HTTPS, CORS and rollback before deploying any feature. Never point staging tests at production.
3. **Implement trusted role resolution and route guards:** handle loading, invalid/missing/revoked role, invalid Operator station, and role-service outage with fail-closed protected routes. Route active Admin to Admin Panel and active assigned Operator to the Operator Dashboard. Enforce authorization again in every backend/Rules path.
4. **Complete backend provisioning for staging:** adapt the reviewed local `createOperator` pattern to the approved server environment; keep caller verification, current active-Admin checks, station validation, idempotent partial-failure recovery, and minimal response fields. Implement the approved Operator-set-password setup-link flow only after its security properties have been technically verified.
5. **Establish station ownership and Rules:** inventory all collections and legacy records; define stable station ownership for `firMasters`, `linkedCases`, `cases`, and other protected data. Implement least-privilege Rules or a deliberately approved server-mediated data path. Fail closed for missing/ambiguous station IDs; test Admin all-station access without widening Operator access. Preserve existing IDs/history; do not perform a migration until its mapping and rollback are explicitly approved.
6. **Add the Operator Dashboard and scoped data access:** reuse existing case/proceeding workflows only after their query/write paths meet the approved Rules model. The trusted station assignment must come from role data, never a client-selected station ID.
7. **Run local/staging security and acceptance tests:** use isolated test data and preserve existing emulator data. Test failures, retries, role revocation, stale sessions, cross-station access, and direct endpoint/document requests.
8. **Stage, review, then separately seek release approval:** deploy to staging, verify the remote end-to-end workflow and rollback. Production deployment, production data changes, user/role provisioning and destructive migration require explicit separate approval.

## 8. Tests and acceptance criteria

### Required automated tests

- Authentication/routing: active Admin, active assigned Operator, non-Admin direct Admin URL, missing/unknown role, revoked user, unassigned Operator, invalid station, expired/disabled identity, and role-service outage. Protected routes fail closed; logout clears the Firebase session.
- Backend: unauthenticated/invalid token/non-Admin/revoked Admin denied; valid Admin provisions exactly one Operator and valid station; client-supplied role/actor/history/station authority fields rejected; duplicate email and duplicate submit safely handled; retries and injected Auth/Firestore/journal failures leave no ambiguous active account.
- Credential handling: no plaintext password/token in Firestore, role/history, operation journals, logs, URL, browser persistent storage, source assets, or repository history. Verify the approved setup/reset or initial-password process and failure recovery.
- Role/audit lifecycle: every authorized role, assignment, suspension, or revocation transition emits the required immutable audit event; direct client writes and event edits/deletes fail. Verify last-Admin protection and governance reconciliation if transitions are brought into scope.
- Rules/station isolation: with two stations, test direct document get, list/query, create, update, and delete for each role. Operator A must not access Station B by changing URL, query, document ID, client state, submitted `policeStationId`, or using a legacy collection. Test revoked/unassigned/malformed records and current assignment revalidation. Admin access across stations must pass without a station assignment.
- Deployment: build uses only the selected staging/non-emulator Firebase configuration; deep-link refresh works for login/Admin/Operator routes; HTTPS, backend origins and environment identity match; no private key/password is embedded in client assets.

### End-to-end acceptance

- From a remote browser, open stable HTTPS URL without local Vite or emulators.
- Active Admin signs in, receives Admin route, creates an Operator with one canonical stable station ID, and sees accurate status/assignment only after backend success.
- Operator signs in with their own approved credentials and reaches a dedicated Operator Dashboard.
- Operator sees only permitted records from the assigned station. Direct document/query/write attempts against another station are denied by Rules/backend, not merely hidden by UI.
- Inactive/revoked, missing-role, or unassigned accounts cannot access protected data; service errors fail closed with safe messages. Suspending/revoking an Operator disables Auth without deleting role/assignment history.
- Duplicate submits, backend outage and partial Auth/Firestore writes are safely retryable/reconcilable; audit records contain no credentials.
- Staging route, config, Functions, Rules, indexes, origin restrictions and rollback are verified before requesting any production approval.

No acceptance test in this section was run as part of this read-only audit.

## 9. Safeguards and approvals

- Preserve all current staged, unstaged and untracked changes; do not overwrite or “clean up” existing work.
- Keep `demo-casetrack-role-prototype`, its Functions source, HMAC key and emulator data local. Never deploy the prototype or point it at production.
- Do not use `firestore.test.rules` outside its isolated test emulator. Do not weaken the prototype's default-deny Rules to make the UI work.
- Do not inspect or change production records/accounts/roles, reset/reseed the emulator, create credentials, run migrations, or deploy without explicit approval.
- Use a separate staging project and disposable test identities/data only after its ownership and cleanup scope are approved. Tests must assert final state and must not clear existing emulator collections.
- Keep Admin SDK credentials in an approved server-side secret store with least privilege; do not include them in Vite assets, GitHub Pages artifacts, or source control.
- Validate actual deployed Rules and configuration rather than inferring them from a local config or historical test report.
- No implementation has started. The file-level plan above requires approval before code changes. Major architecture, data migration, production deployment and account/role operations require their own explicit approval.

## 10. Source inventory and documentation notes

Key inspected implementation files: `assets/js/login.js`, `assets/js/shared-layout.js`, `assets/js/admin-access.js`, `assets/js/admin-panel.js`, `assets/js/operator-management.js`, `assets/js/police-station-master.js`, `pages/admin-panel.html`, `pages/dashboard.html`, `assets/js/dashboard.js`, `assets/js/fir-case-model.js`, `components/add-case/add-case.js`, `firebase/firebase-config.js`, `firebase/local-role-admin/firebase-config.js`, `vite.config.js`, `.github/workflows/deploy.yml`, `firebase.test.json`, `firestore.test.rules`, `security-prototypes/role-management/firebase.json`, `security-prototypes/role-management/firestore.rules`, and `security-prototypes/role-management/functions/index.cjs`.

Related planning/evidence documents inspected: `docs/00-Project-Overview(1).md`, `docs/11-Phase-1-Audit-Findings.md`, `docs/12-Role-Management-ADR (1).md`, `docs/13-Police-Station-Isolation-ADR (1).md`, `docs/13-Role-Management-Feasibility-Test-Plan.md`, `docs/14-Role-Management-Initial-Feasibility-Results.md`, `docs/15-Admin-Panel-Security-Implementation-Plan.md`, `docs/16-Role-Transition-Specification-Proposal.md`, `docs/17-Role-Transition-Minimal-Implementation-Scope.md`, and the prototype `README.md` / `OPERATOR-CREATION-IMPLEMENTATION.md`.
