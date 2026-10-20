# CaseTrack Admin Panel — Initial Release Roadmap

> **Implementation update (2026-10-20):** Root Firebase Functions and local website integration now exist. Operator setup uses a random one-time token verified and consumed server-side; tests confirm resend revocation and rejection by Firebase Auth's native reset endpoint. Local browser/emulator workflows pass. Live inspection found the Cloud Functions API disabled on the Spark project, no SendGrid secret/sender verification, no recoverable backup, permissive deployed Rules, and GitHub Pages Admin/setup routes returning 404. Release is `NOT READY`; see the [current production-readiness report](./25-Production-Readiness-and-Security-Report.md).

**Status:** Implementation sequencing and acceptance baseline
**Updated:** 2026-10-19\
**Scope:** Initial `admin` and `operator` release only\
**Authority:** This roadmap operationalizes the confirmed boundaries in [20-Admin-Panel-Architecture-Decisions.md](./20-Admin-Panel-Architecture-Decisions.md). The owner has approved release to `casetrack-97a4e`; no production change is made until the documented backup, Rules compatibility, billing/API, email, and website publication gates are safe. No data migration or change to existing user work is authorized here.

## 1. Initial release scope

### Included

- Firebase email/password sign-in with trusted role/status resolution and fail-closed routing.
- `admin` and `operator` as the only initial-release roles.
- Admin access to create, read, update, and delete FIR Masters and court proceedings across all stations.
- Operators assigned to exactly one Admin-selected stable `policeStationId`, with access only to records belonging to that station.
- Admin user/role operations needed for account provisioning, role/status changes, and safe deactivation/revocation.
- Police Station Master list/create and assignment validation; preserve stable station IDs.
- Trusted, append-only audit evidence for privileged user, role, station-assignment, and protected record mutations. Each event must identify the actor, server timestamp, action, target, and appropriate before/after values.
- Last-active-Admin protection and trusted bootstrap/recovery.
- Authorization of direct Firestore requests and backend endpoints, not only page routing or client filters.

### Explicitly deferred

- SP/Senior Officer implementation. The confirmed aggregate-only product boundary remains unchanged, but its role identifier, jurisdiction, and secure aggregation details do not block this release. Do not expose individual records or provision an SP role in the initial release.
- Operator station reassignment, record transfer, and reassignment UI/API.
- A separate Read-Only User role or multi-station Operator assignment.
- Station rename, deactivation, deletion, aliases, and nonessential Police Station Master workflows.
- Advanced reports/exports, monitoring, and UI polish.

Preserve existing FIR/proceeding records, document IDs, relationships, and hearing history. Missing or ambiguous station ownership must fail closed until it is reviewed; do not infer ownership or silently migrate records.

## 2. Repository progress snapshot

This snapshot includes source/document inspection and the isolated Firestore Rules Emulator run recorded below. No production Firebase operation or deployment was performed.

| Area | Current evidence | Initial-release status |
|---|---|---|
| Login | [login.js](../assets/js/login.js) authenticates with Firebase email/password, then sends every successful user to the general dashboard. | Partial; trusted role routing and disabled/revoked handling are missing. |
| Admin shell | [admin-panel.html](../pages/admin-panel.html) and [admin-panel.js](../assets/js/admin-panel.js) provide a panel shell and paginated role-record table. The UI can render for a signed-in non-Admin before its data request is authorized. | Partial; UI state is not a security boundary. |
| Admin endpoint authorization | [index.cjs](../security-prototypes/role-management/functions/index.cjs) verifies ID tokens and checks current active-Admin role for prototype endpoints. | Reusable pattern only; source is deliberately locked to the demo project and loopback emulators. |
| User provisioning | Prototype supports list/create Operator, one station assignment, idempotency/recovery phases, and an initial `assigned` history event. It accepts an Admin-entered initial password. | Partial; not deployable as production. Replace the password flow with the already-approved Operator setup-link direction after its security properties are validated. |
| Police Station Master | Prototype endpoint supports Admin-authorized list/create. | Partial; local-only. Rename/deactivate/delete are deferred. |
| Role lifecycle | No promote, demote, revoke, or reactivate endpoint was found in the prototype. | Missing; last-Admin and transition audit guarantees are not implemented there. |
| Case/proceeding workflows | Existing case code reads and writes `firMasters`, `linkedCases`, and legacy `cases` directly through client Firestore SDK calls. | Functional UI paths exist, but Admin all-station authorization and Operator station isolation are not established. |
| Firestore Rules | The new isolated [firestore.admin-panel.rules](../firestore.admin-panel.rules) tests active role/status from `userRoles/{uid}`, stable station ownership, linked-FIR integrity, and default-deny paths. It is not wired as production Rules. [firestore.test.rules](../firestore.test.rules) remains broad test-only policy; prototype [firestore.rules](../security-prototypes/role-management/firestore.rules) remains default-deny. | Partial; local policy tests pass, but current application query shapes and required audit coupling are not ready for release. |
| Operator experience | No dedicated station-scoped Operator dashboard or role-aware login destination was found. | Missing. The general dashboard loads broad collections and must not be exposed as an Operator-safe interface without scoped access. |
| Deployment | The repository has a GitHub Pages workflow for the static site. The prototype Functions target is local-only; no production Functions/Rules deployment path was found. | Incomplete. GitHub Pages plus a separate Firebase Functions backend is the recorded direction; a separate staging project is still required and is not created here. |
| Git/worktree | The branch is `main` with substantial staged, unstaged, and untracked user work, including Admin Panel code/prototype files. | Preserve as-is. No staging, reset, cleanup, or application-file edits were made for this roadmap. |

Existing prototype test files cover Users listing, Police Station Master, Operator creation, and default-deny Rules. Their presence and historical results in project documents are not evidence that tests passed in this update or that production controls exist.

### Phase 1 Rules/Emulator implementation update — 2026-10-19

Added only an isolated policy and test harness for `firMasters`, `linkedCases`, legacy `cases`, trusted role reads, and client write denial for roles/stations:

- New [firestore.admin-panel.rules](../firestore.admin-panel.rules).
- New [firebase.admin-panel.test.json](../firebase.admin-panel.test.json), using the demo project `demo-casetrack-admin-panel-rules` and Firestore Emulator port `8185`; existing emulator/prototype configurations were not repointed.
- New [case-data.rules.test.js](../security-prototypes/role-management/tests/case-data.rules.test.js).

The suite ran with:

```text
npm exec --prefix security-prototypes/role-management -- firebase emulators:exec --only firestore --config firebase.admin-panel.test.json --project demo-casetrack-admin-panel-rules "node --test security-prototypes/role-management/tests/case-data.rules.test.js"
```

**Verified result:** 7 tests passed, 0 failed. Coverage includes Admin direct CRUD across stations in all three case collections; Admin FIR queries scoped to station and linked/legacy queries scoped to station plus `firMasterId`; Operator own-station CRUD and scoped queries; cross-station/forged station denial; unauthenticated, revoked, unknown-role, unassigned, malformed-role and ambiguous-owner denial; linked-master station integrity; and client role/station writes denied. The expected permission-denied emulator log entries correspond to asserted negative cases.

**Important query limitation found:** the current policy intentionally denies unfiltered collection queries. `fir-case-model.js` currently loads whole `firMasters`, `linkedCases`, and `cases` collections. The Rules tests show that linked/legacy list queries must constrain both `policeStationId` and `firMasterId` to prove linked-master integrity; FIR Master queries must be station-scoped. Existing query paths have not been updated or verified against this policy. Admins must obtain the set of station IDs through a trusted/authorized path and query per station; Operators must use only their assigned station. Broad collection reads remain a release blocker.

**Not established by these tests:** production Rules configuration/deployment, real-data ownership compatibility, actor-attributed audit coupling for record mutations, the trusted provisioning/lifecycle backend, UI compatibility, or staging readiness. The Rules currently allow otherwise-authorized direct case writes without requiring an atomic audit event; that is not sufficient for the roadmap's release audit requirement. No migration or production operation was run.

## 3. Shortest safe implementation sequence

Each phase must pass its exit checks before protected behavior is enabled. Keep development on isolated local emulators first; do not point tests at production.

### Phase 1 — Establish and prove the data authorization boundary

1. Inventory actual fields and write paths for `firMasters`, `linkedCases`, legacy `cases`, user roles, stations, and audit events. Determine whether every proceeding has a trusted station owner and preserve existing IDs/history.
2. Add a root Rules policy for the collections used by the application. It must resolve active role and station from trusted `userRoles/{uid}` data, never from client fields or cached UI state.
3. Grant Admin all-station FIR/proceeding CRUD. Grant an active Operator only the CRUD operations approved for its one assigned station. Deny unauthenticated, unknown-role, revoked, malformed, and unassigned accounts.
4. Deny client writes to roles, station assignments, governance, and audit history. Route privileged changes through a trusted backend. Ensure every allowed protected record mutation has its required audit event; a direct-write path must not bypass or forge that audit.
5. Add isolated Emulator tests for each role across direct gets, queries/lists, creates, updates, and deletes, including crafted station IDs, legacy paths, missing ownership, and revocation. Include query shapes actually used by the UI.

**Exit gate:** Positive Admin/Operator cases and negative cross-station/direct-access cases pass against the same Rules file intended for staging. Ambiguous station-owned records remain inaccessible until reviewed.

### Phase 2 — Complete trusted backend lifecycle operations

Build a separately configured backend; do not deploy or repurpose the demo-locked prototype as production code. Reuse reviewed validation, authorization, and idempotent-recovery patterns from `security-prototypes/role-management/functions/index.cjs` only where appropriate.

Required server behavior:

- Verify the caller's Firebase ID token and re-read current active Admin role for every privileged request.
- Support user/role listing, station list/create, Operator provisioning with exactly one validated station, approved role/status transitions, and audited deactivation/revocation with Firebase Auth disablement.
- Use the approved Operator setup-link flow; never accept or expose an Admin-selected Operator password. Validate secure link generation/delivery, single-use/time limits, expiry/recovery, and audit behavior before release.
- Derive actor, target, role/status changes, station assignment, event ID, and timestamps server-side. Reject unknown fields and caller-supplied authority/audit values.
- Write role/status, append-only history, governance, and operation-journal state atomically where required; make retries and partial Auth/Firestore failures explicit and recoverable.
- Prevent demotion/revocation of the last active Admin. Initialize and reconcile the global Admin count only through the documented trusted-owner process; normal endpoints fail closed for missing, malformed, unhealthy, or detected-inconsistent governance.
- Never hard-delete accounts/role/history in this initial workflow. Keep the role record revoked and disable Auth.

**Exit gate:** Emulator endpoint tests cover current-role authorization, invalid/revoked callers, malformed payloads, duplicate requests, retries/fault injection, audit coupling, and concurrent last-Admin attempts. Confirm final persisted Auth/role/history/governance/journal state, not only response codes.

### Phase 3 — Wire login, Admin UI, and Operator experience

- Resolve active role/status after login and route Admin and Operator to their respective views. Missing/unknown/revoked role, invalid station, and service failure deny protected access.
- Guard direct Admin routes and all privileged requests. Client checks improve UX but are not authorization.
- Reuse the current Admin Panel, Users list, Police Station Master, and Operator form after replacing their emulator-only endpoint configuration with the reviewed backend.
- Add only the initial-release lifecycle controls and safe status feedback. Do not expose station reassignment or deferred role types.
- Provide an Operator dashboard whose record queries are constrained by trusted station ownership. Do not reuse the existing broad dashboard query unchanged.
- Reuse existing FIR/proceeding UI workflows only where their direct reads/writes pass Phase 1 Rules and their mutations produce the required audit evidence.

**Exit gate:** Browser tests cover Admin/Operator routing, typed direct URLs, logout/session expiry, failed role lookup, and complete initial workflows without trusting client-supplied role or station values.

### Phase 4 — Isolated end-to-end validation and staging

- Run Rules, backend, and browser workflows only against a named isolated Emulator/staging project and non-production configuration.
- Create/configure staging only after separate approval. Deploy the reviewed frontend, Functions, Rules, and required indexes to staging through a reviewable process.
- Validate HTTPS, route refresh, backend origins, environment identity, safe logs, and rollback.
- Perform a read-only ownership inventory before any data migration. Do not alter production data or deploy production Rules as part of these phases.

**Exit gate:** Staging acceptance matrix passes; production remains blocked pending a separate explicit release approval.

## 4. Initial-release acceptance criteria

- Active Admin login routes to Admin functionality; active assigned Operator login routes to station-scoped functionality. Unknown/revoked/unassigned accounts fail closed.
- Admin can create/list stations, provision an Operator with exactly one stable station ID, perform approved role/status changes, and deactivate/revoke an account safely.
- User/role/station mutations produce append-only server-attributed audit events with actor UID, server timestamp, action, target, and applicable before/after state. Protected FIR/proceeding mutations cannot evade their required audit.
- Admin reads/writes FIR and proceeding records across stations. Operator reads/writes only its assigned station. Tests must cover all CRUD verbs, direct paths, application-compatible scoped queries, alternate/legacy collections, forged payloads, revocation, and malformed/missing station ownership. Current broad application queries do not satisfy this criterion.
- Operator cannot change role or station assignment. No reassignment route/API is present in this release.
- Client writes to role, station assignment, governance, and audit history are denied. Every trusted endpoint re-authorizes current role.
- Last-active-Admin protection and owner-only bootstrap/recovery are implemented and tested under concurrency and failure conditions.
- Existing FIRs, proceedings, document IDs, relationships, and hearing history are preserved. No ownership migration occurs without a separately reviewed mapping and approval.
- No SP/Senior Officer or Read-Only User role/access is provisioned in the initial release.
- No production Firebase resource, account, data, Rules, or deployment is changed without separate explicit approval.

## 5. Remaining release blockers and deferred items

### Security blockers

1. **No app production Rules:** the isolated candidate policy is not connected to a production app configuration or deployment. Production Rules remain unknown.
2. **Unproven station ownership:** inventory actual legacy data; fail closed on missing/ambiguous `policeStationId`; do not infer or mass-edit.
3. **No production-capable backend:** prototype endpoints require demo project and loopback emulators; provide isolated staging Functions configuration and deployment path.
4. **No trusted role router/operator dashboard:** login currently routes all users to the general dashboard, which loads broad case collections.
5. **Role lifecycle/last Admin incomplete:** implement server-owned transitions, append-only audit coupling, count reconciliation, and concurrency/failure tests.
6. **Credential handoff incomplete:** secure implementation and recovery of the approved one-time setup link are not verified; the current prototype's password form is not the approved flow.
7. **Production state unknown:** deployed Rules/Functions and live account/role state have not been verified. Do not infer them from local prototypes or test Rules.
8. **Staging absent:** the separate staging project and reviewable deployment configuration remain to be approved/configured before remote validation.
9. **Application queries incompatible with current policy:** existing broad collection loads are denied. FIR Master queries need a station constraint; linked/legacy queries also need `firMasterId` constraints to prove parent ownership. Query shapes in `fir-case-model.js` and dashboard consumers must be adapted and Emulator-tested.
10. **No audit coupling for protected case writes:** the candidate Rules allow authorized direct case writes without requiring a matching immutable audit event. Do not use this as a release policy until a trusted, atomic audit/write path is implemented and verified.

### Deferred after the initial release

- SP/Senior Officer role identifier, jurisdiction model, secure aggregate mechanism, metrics, and corresponding Rules/backend tests.
- Operator station reassignment and any in-progress case transfer.
- Read-Only User and multi-station assignment.
- Nonessential reports/exports, advanced monitoring, station lifecycle management, and UI polish.

## 6. Recommended immediate implementation task

**Next: make case-data access compatible with the tested Rules while closing the audit gap.** Replace broad collection reads with role/station-scoped query paths and ensure every linked/legacy query contains the constraints needed to prove station and FIR ownership. Route protected writes through a trusted path that revalidates role/station and atomically records immutable actor-attributed audit evidence; do not enable direct writes without that coupling. Keep all work on isolated emulators until verified.

Likely files/resources for that implementation task:

- [fir-case-model.js](../assets/js/fir-case-model.js) and [dashboard.js](../assets/js/dashboard.js) for scoped reads and query consumers.
- [add-case.js](../components/add-case/add-case.js) for protected record mutations.
- A separately configured trusted Functions/backend implementation and its Rules/test configuration; [index.cjs](../security-prototypes/role-management/functions/index.cjs) is demo-locked prototype code, not production-ready.
- Extend [case-data.rules.test.js](../security-prototypes/role-management/tests/case-data.rules.test.js) to cover the final application query and audited write shapes.

Do not change production configuration or data. Do not enable the broad authenticated-user grants in [firestore.test.rules](../firestore.test.rules) for this purpose. The Rules and test harness added in this phase are a local security baseline, not a production release gate.

## 7. Progress and verification

- Repository and planning-document inspection: complete for this roadmap.
- Application code changes: none in this task.
- Files added for this task: [firestore.admin-panel.rules](../firestore.admin-panel.rules), [firebase.admin-panel.test.json](../firebase.admin-panel.test.json), and [case-data.rules.test.js](../security-prototypes/role-management/tests/case-data.rules.test.js).
- Documentation updated for this task: this roadmap.
- Emulator validation: isolated Firestore Emulator only; 7 tests passed, 0 failed (command and coverage recorded above).
- Build: not run. Remote Firebase reads/writes, migration, deployment, and staging validation: not performed.
- Git staging, commits, resets, or cleanup: not performed; pre-existing worktree changes preserved.
