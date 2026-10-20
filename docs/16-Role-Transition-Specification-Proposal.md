# CaseTrack Role-Transition Specification — Proposal

## Status and purpose

**Status: Partially approved proposal; implementation and remaining open decisions require review.**

This document translates approved role-management decisions into a transition specification for the local CaseTrack Admin Panel prototype. It does not amend either ADR, establish production security, or authorize deployment. Project-owner decisions approved on 2026-10-18 are identified separately from additional implementation proposals. Operator station reassignment is deferred and excluded from the initial release; any later implementation requires a separate approved scope.

For the subsequently reconciled Admin, SP/Senior Officer, and approved-role boundaries, see [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md). This proposal remains historical planning context: it does not approve a separate Read-Only User role or an SP role identifier, and it does not establish implementation or security validation.

## 1. Existing approved requirements

The [Role Management ADR](./12-Role-Management-ADR%20(1).md) establishes these design requirements:

- Roles are `operator` and `admin`; status is `active` or `revoked`.
- Role records are stored at `userRoles/{uid}`. Revocation retains the record and changes its status rather than deleting it.
- History is append-only at `userRoles/{uid}/history/{eventId}`. Assignment, role change, revocation, and authorized reactivation produce history.
- Role, corresponding history, and governance writes are intended to be atomic. The governance record is `systemControl/adminGovernance`, with `activeAdminCount`.
- Users cannot change their own roles. Demoting or revoking the last active Admin must be rejected.
- The first Admin is initialized manually by a trusted project owner; emergency recovery is a separately documented trusted procedure.
- Operators have one admin-assigned stable `policeStationId`; Admins do not require a station assignment.
- Admin SDK writes bypass Firestore Rules. If a trusted backend is used, it must implement authorization, validation, atomic writes, and audit logging itself.
- The ADR’s transition table assigns deltas: create Operator 0; promote Operator +1; demote Admin -1; revoke Operator 0; revoke Admin -1; reactivate Operator 0; reactivate Admin +1.

The [Police Station Isolation ADR](./13-Police-Station-Isolation-ADR%20(1).md) requires stable station IDs, admin-controlled Operator assignment, no self-assignment, and station access restrictions. It explicitly states that station isolation is not implemented or security-validated.

The project owner has additionally approved the history fields/actions, transition reasons and idempotency journal, Auth disablement on revocation, governance fail-closed behavior, and owner-only recovery from zero active Admins specified below. These approvals do not establish implementation or test completion. Remaining questions are listed in §6.

## 2. Current prototype behavior (observed)

In `security-prototypes/role-management/`, the existing Functions endpoints are `listUserRoles`, `policeStations` (list/create), and `createOperator`. There is no role-transition endpoint. Users listing is read-only.

`createOperator` currently:

- Requires a verified active Admin caller and a valid existing station.
- Creates a new Auth account disabled, then atomically creates its active Operator role and initial history event, enables Auth, and completes its operation journal.
- Writes an `assigned` event with `previousRole: null`, `newRole: "operator"`, caller `actorUid`, and server `occurredAt`.
- Does not change `adminGovernance`; an Operator assignment has zero Admin-count delta.
- Uses an idempotency journal and has tests for duplicate email, retries, staged failures, and account-disable recovery.

The prototype Rules deny all client reads and writes. Current endpoint test suites cover Operator creation, Users listing, and station create/list. They do not implement or test promote, demote, revoke, reactivate, station reassignment, last-Admin protection, transition concurrency, or role/history/governance coupling for transitions. The initial bootstrap was a one-time local operation, not a reusable transition endpoint or production recovery mechanism.

## 3. Proposed common transition protocol

The following are proposals, not existing ADR requirements.

### 3.1 Actor, target, and write boundary

- Every ordinary transition requires a verified, currently active Admin actor. Re-read the actor's role in the same Firestore transaction as the target and governance documents; do not rely only on an earlier authorization read.
- Reject any operation where `actorUid === targetUid`. This applies to role, status, and station changes, and makes the ADR’s self-role restriction explicit for all management operations.
- The caller cannot choose target role, resulting status, actor UID, event ID, counter delta, or timestamps. The backend derives these from the operation and stored state.
- A trusted backend must perform every privileged write. Do not weaken the prototype's default-deny Rules.
- Every new role transition requires an actor-scoped idempotency key and durable operation journal. Bind the key to the actor, operation, target, reason, station inputs, and other normalized request fields. A retry with identical inputs resumes or returns the same operation; reusing the key with any different input is rejected.
- Each Firestore transaction reads the current actor role, target role, governance document, any required station documents, and the reserved operation/event references before writing. Reject a missing, malformed, or detected-inconsistent governance record or invalid counter. Ordinary Admin Panel transitions must not initialize, repair, or guess a governance count; stop and require trusted-owner reconciliation.
- The ADR requires role/history/governance atomicity where applicable. For zero-delta transitions, validate governance and preserve its count. The exact mechanism to prove global count consistency and serialize zero-delta operations is not established by these requirements; see §6.
- Revalidate all state inside the transaction. Firestore transaction conflict retries must cause the operation to re-evaluate actor/target status and counter constraints against the latest documents.
- For a counter-changing transition, apply only the server-derived delta for that transition. Reject a result below one. The transaction's read/write of the singleton governance document serializes concurrent Admin-count changes, but it cannot prove the count was globally correct beforehand. Bootstrap/recovery reconciliation and exclusive trusted write paths remain necessary.
- If the active Admin count is zero, no ordinary Admin Panel actor can perform recovery. Recovery is restricted to the trusted Firebase project owner under a separate documented procedure; there is no normal Admin Panel recovery operation.

### 3.2 Required reasons and transition journal

- Require a string `reason` for promotion, demotion, revocation, reactivation, and station reassignment. Trim it; reject non-string, empty, or whitespace-only values. Store the trimmed reason in the corresponding history event.
- Do not add a reason to the existing Create Operator request contract.
- For new transitions, reserve the actor-scoped idempotency key in an operation journal before side effects. Persist operation type, target UID, normalized inputs (including reason), generated event ID, phase, lease/ownership metadata, and timestamps; never accept actor identity, event ID, or authority-bearing values from the caller.
- Reject the same key with changed operation, target, reason, station, or any other bound input. Retain enough journal state to resume safely and identify incomplete work without logging credentials or tokens.
- The maximum reason length, permitted character set, and journal-retention period remain unresolved.

### 3.3 Required history schema

For applicable lifecycle events, include `previousStatus`, `newStatus`, `previousPoliceStationId`, and `newPoliceStationId` in addition to the ADR fields `action`, `previousRole`, `newRole`, `actorUid`, and server `occurredAt`. Include the required trimmed `reason` for role change, revocation, reactivation, and reassignment. Use `null` when the prior/resulting state has no station assignment; otherwise use the stable Police Station Master document ID. The target UID is implicit in the parent role-document path.

Approved action names:

- `assigned` for initial assignment; preserve the existing Operator operation/API behavior and add applicable status/station audit fields.
- `role_changed` for promotion and demotion.
- `revoked` for revocation.
- `reactivated` for reactivation.
- `station_reassigned` for station-only changes, but do not implement this transition until §4.6's access/ownership questions are decided.

Do not edit or delete prior history. These schema approvals do not make the existing Operator creation event implementation compliant with the additive fields until that code is updated; preserve its existing request, response, provisioning, and governance behavior.

## 4. Operation specifications

### 4.1 Create Operator — existing behavior to preserve

**Existing behavior:** Preserve the current `createOperator` contract and staged Auth provisioning. This section records it as a baseline, not a proposed replacement.

- **Actor:** Verified active Admin. **Target:** New Auth account; duplicate email is rejected; target UID is backend-generated; selected stable station must exist.
- **Result:** `role: "operator"`, `status: "active"`, selected `policeStationId`; `createdAt/updatedAt` are server timestamps; `createdBy/updatedBy` are the actor UID.
- **History:** One `assigned` event with `previousRole: null`, `newRole: "operator"`, `previousStatus: null`, `newStatus: "active"`, `previousPoliceStationId: null`, `newPoliceStationId: <selected ID>`, `actorUid`, and server `occurredAt`. Preserve the existing request/response and provisioning contract; do not require a reason. The approved additive event fields are a future schema change to the current event implementation.
- **Governance:** Delta `0`; current endpoint leaves governance untouched.
- **Self / last Admin:** A newly created target UID cannot be the caller's UID; Admin count is unaffected.
- **Atomicity and recovery:** Preserve the existing saga: reserve idempotent request; create Auth disabled; atomically write role + event + journal phase; enable Auth; complete journal. On incomplete provisioning, keep or restore Auth disabled and retry with the same key and inputs. Existing tests cover injected Auth, role/history, enablement, journal, and disable-recovery failures.
- **Validation and negative tests:** Preserve tests for active-Admin authorization, invalid/extra fields, invalid station, duplicate email, idempotent replay, changed-input conflict, and each staged failure. Add an explicit concurrent same-key lease test if not already covered, plus a regression that confirms exact existing role/history output and governance remains unchanged when a governance document exists.

### 4.2 Promote active Operator to Admin

- **Actor:** Active Admin. **Target:** Different UID with an existing active Operator role and a valid current station assignment.
- **Result:** `role: "admin"`, `status: "active"`. Proposed: remove `policeStationId` from the current role document because Admin access is not station-scoped; record the former stable station ID in history. Do not alter the Auth account.
- **History:** `action: "role_changed"`, `previousRole: "operator"`, `newRole: "admin"`, `previousStatus: "active"`, `newStatus: "active"`, `previousPoliceStationId: <old ID>`, `newPoliceStationId: null`, actor UID, server timestamp.
- **Governance:** `+1`.
- **Self / last Admin:** Reject self-promotion. Last-Admin guard does not reduce the count, but actor/target checks still apply.
- **Atomicity and recovery:** Role update, history create, governance increment, and idempotency result in one transaction. On transaction failure, none commit; retry returns the committed result or retries against the latest state. A target that changed role/status concurrently must fail state preconditions.
- **Validation and negative tests:** Reject unauthenticated, non-Admin, revoked Admin, self-target, missing target, non-Operator, revoked Operator, missing/invalid station assignment, malformed or client-selected authority/audit fields, absent/malformed governance, and transaction failures. Assert exact `+1`, one immutable event, removal of current station assignment, and no partial writes.

### 4.3 Demote active Admin to Operator

- **Actor:** Active Admin. **Target:** Different UID with an existing active Admin role. The request must include a stable station ID that currently exists.
- **Result:** `role: "operator"`, `status: "active"`, and the selected `policeStationId`. Admin role documents should not need a station assignment; the destination is supplied explicitly rather than inferred.
- **History:** `action: "role_changed"`, `previousRole: "admin"`, `newRole: "operator"`, both statuses `"active"`, `previousPoliceStationId: null`, `newPoliceStationId: <selected ID>`, actor UID, server timestamp.
- **Governance:** `-1`; reject if the transaction would make the count less than one.
- **Self / last Admin:** Reject self-demotion. Also reject any demotion of the sole active Admin.
- **Atomicity and recovery:** Role, event, governance decrement, and operation journal are one transaction. Concurrent demotions/revocations serialize on governance and re-check the count; an operation that becomes last-Admin removal after a transaction retry must fail.
- **Validation and negative tests:** Reject non-active Admin target, self-target, missing station, nonexistent station, malformed input, incorrect client-supplied fields/delta, missing or inconsistent governance, and counter result zero. Test two concurrent requests that together would remove two of two active Admins; at most one may commit, and the final count must remain one with matching role/history state.

### 4.4 Revoke a user

- **Actor:** Active Admin. **Target:** Different UID with an active Operator or Admin role.
- **Result:** Retain role document and role value; set `status: "revoked"`. Proposed: retain the Operator's station assignment for audit/recovery; do not add or remove a station field for an Admin.
- **History:** `action: "revoked"`, `previousRole: <operator|admin>`, `newRole: null` (ADR revocation convention), `previousStatus: "active"`, `newStatus: "revoked"`, previous/new station IDs as above, actor UID, server timestamp.
- **Reason:** Required non-empty trimmed caller reason, stored as `reason`.
- **Governance:** Operator `0`; Admin `-1`, rejecting a result below one.
- **Self / last Admin:** Reject self-revocation. Reject revoking the only active Admin.
- **Auth account:** Approved decision: set the Auth account disabled as part of revocation.
- **Atomicity and recovery:** Firestore and Auth cannot be updated atomically. Use a fail-closed saga with journal phases:
  1. Reserve the actor-scoped idempotency key and validate inputs, actor/target, station state as applicable, and governance. Do not modify Auth yet.
  2. In one Firestore transaction, revalidate actor, target, and governance; set role status to `revoked`; create the history event; apply the Admin delta if needed; and set the operation journal to `firestore_committed_auth_pending`.
  3. Disable the Auth user. If already disabled on retry, treat that stage as complete after verifying the target UID. Then mark the journal completed.
  4. If the Firestore transaction fails, it commits none of its Firestore writes and Auth remains unchanged; retry with the same key and inputs or stop for investigation.
  5. If Auth disablement fails after the Firestore commit, retain the revoked role/history/governance state, leave the journal pending/reconciliation-required, and retry disabling Auth with the same key. Do not roll back the role or governance and do not automatically re-enable Auth; reopening authorization is not safe compensation. If the response to disablement is lost, inspect Auth state and resume idempotently.
  6. Any explicit compensation that re-enables Auth or restores an active role requires a separate trusted-owner recovery decision and a new audited operation; it is not automatic rollback.
  During the gap after Firestore commit and before Auth disablement, all request authorization paths must deny the now-revoked role even if the Auth account remains enabled. Existing Firebase ID tokens and any paths not checking role status are a security risk; verify all relevant Rules/backend paths before release.
- **Validation and negative tests:** Reject already-revoked/missing targets, self-target, unauthorized actor, and last-Admin revoke. Verify reason handling, retained role, revoked status, exact event, correct delta, and idempotency. Inject Auth-disable failure and lost-response cases; prove access is denied from the Firestore revocation state while Auth disable is pending, retry disables Auth without a duplicate event, and no automated compensation reactivates access.

### 4.5 Reactivate a revoked user

- **Actor:** Active Admin. **Target:** Different UID with a retained role record and `status: "revoked"`.
- **Result:** Preserve the existing role and restore `status: "active"`. For an Operator, require its retained `policeStationId` to identify an existing station; do not silently choose or change the station during reactivation. For an Admin, do not require a station assignment.
- **History:** `action: "reactivated"`, `previousRole` and `newRole` both the retained role, `previousStatus: "revoked"`, `newStatus: "active"`, previous/new station IDs, actor UID, server timestamp, and required trimmed `reason`.
- **Governance:** Operator `0`; Admin `+1`.
- **Self / last Admin:** Reject self-reactivation. If active Admin count is zero, ordinary Admin Panel reactivation is unavailable; only the trusted Firebase project owner may recover under the separate procedure.
- **Atomicity and recovery:** Require an existing Auth account associated with the target. In one Firestore transaction, reactivate role, append history, update governance when applicable, and set journal phase `firestore_committed_auth_pending`. Then enable Auth and mark the journal complete. On Auth enable failure, retain the Firestore state and journal, retry with the same key; do not delete history or silently reverse governance. Resolve the policy for an Auth account that is missing or unexpectedly enabled before implementation.
- **Validation and negative tests:** Reject already-active/missing target, invalid role/status, self-target, revoked/non-Admin actor, missing/malformed governance, empty reason, and (for Operator) missing, deleted, or invalid assigned station. For an invalid Operator assignment, block reactivation until an Admin corrects the assignment through a separately approved process; do not reassign as a side effect of reactivation. Verify exact Admin delta, zero Operator delta, event fields, Auth enable/retry behavior, and idempotency.

### 4.6 Reassign an Operator to another Police Station — deferred

**This operation is excluded from the initial release and must not be implemented in that scope.** The proposal below is retained as historical design context only; it does not approve reassignment or resolve every access and record-ownership consequence.

Provisional proposal only:

- **Actor:** Active Admin. **Target:** Different UID with an active Operator role and a current station assignment. New station must exist and differ from the current stable ID.
- **Result:** Keep `role: "operator"` and `status: "active"`; replace only `policeStationId`.
- **History:** `action: "station_reassigned"`, `previousRole: "operator"`, `newRole: "operator"`, both statuses `"active"`, `previousPoliceStationId: <old ID>`, `newPoliceStationId: <new ID>`, actor UID, server timestamp, and required trimmed `reason`.
- **Governance:** Delta `0`.
- **Self / last Admin:** Reject self-target. Not an Admin-count transition.
- **Authorization and records:** A reassignment changes the Operator's current station-based authorization. It must not silently rewrite FIR/proceeding ownership or migrate records. Whether access to the old station's records ends immediately, whether the user retains any historical/read access, how work in progress is handled, and whether a separate record-transfer workflow is required are owner decisions. Do not infer these answers from the UI assignment dropdown.
- **Atomicity and recovery:** If approved, role update, append-only event, and idempotency journal should commit in one transaction; governance is read/validated but unchanged. Concurrent reassignment requests must serialize on the target role and fail stale `previousPoliceStationId` preconditions. Retrying a committed request must not create duplicate assignment history.
- **Validation and negative tests:** Reject self-target, non-active/non-Operator target, missing current assignment, nonexistent new station, same old/new station, unauthorized actor, and client attempts to supply actor/history/counter fields. Verify one event and exact before/after IDs with no record ownership writes. Add access tests proving the approved old/new station behavior before enabling this operation.

## 5. Cross-operation acceptance tests

Before enabling any new transition:

1. Verify unauthenticated, invalid-token, non-Admin, revoked-Admin, and malformed requests are rejected.
2. Verify every actor is re-authorized against current role state within the atomic operation and self-target changes are denied.
3. Verify target role/status preconditions, allowed fields, stable station references, timestamps, and actor UID are enforced server-side.
4. Verify each successful transition creates exactly one append-only event and that role, event, governance delta, and journal are atomic.
5. Inject failures before and during writes; assert no partial Firestore transition. Retry committed and uncommitted requests, including same-key/different-input reuse.
6. Exercise same-target concurrent updates and cross-target Admin-count races. Inspect final role records, all resulting history, governance count, and journal; do not infer correctness from response codes alone.
7. For Admin-count changes, verify the last-active-Admin invariant after each race and reject missing, malformed, or known-inconsistent governance. Test that out-of-band drift blocks transitions and requires trusted-owner reconciliation rather than an automatic guessed correction.
8. Do not add station-reassignment operations to the initial release. If reassignment is separately approved later, test old/new station access through actual Rules/backend paths, including Admin access, revoked users, and records with missing/conflicting ownership.
9. For revocation/reactivation sagas, inject failures and lost responses at every Firestore/Auth/journal boundary. Confirm denied access after the Firestore state changes, idempotent completion on retry, and no automatic compensation that re-enables a revoked account.

## 6. Unresolved decisions for project-owner approval

Approved decisions (no longer open): the four additional history fields and five action names; remove station assignment from an Admin role after promotion; revocation disables Auth using a fail-closed saga; reactivation of an Operator is blocked until its station assignment is valid; non-empty trimmed reasons are required for role changes/revocation/reactivation/reassignment; new transitions use actor-scoped idempotency journals; missing/malformed/inconsistent governance blocks normal transitions without auto-repair; and zero-Admin recovery is restricted to the trusted Firebase project owner under a separate procedure.

Remaining questions for project-owner approval:

1. **Station reassignment is deferred from the initial release.** Before a later implementation, decide old-station access, treatment of in-progress work, record ownership/transfer, and the related audit requirements; test those approved behaviors before enabling reassignment.
2. Define the maximum reason length, permitted characters, and journal-retention period.
3. Approve the exact trusted-owner reconciliation procedure and evidence required to establish an inconsistent governance count, including how role/Auth records are validated before any repair.
4. Decide the reactivation saga policy for missing or unexpectedly enabled Auth accounts, including required recovery/compensation.
5. Confirm whether zero-delta Operator transitions must transactionally write a governance lock/version to serialize against Admin-count transitions, and how a globally inconsistent count can be detected without introducing a race. A Firestore transaction on the singleton governance document alone does not prove that it equals all active Admin role records.
6. Define transition-specific Admin creation policy beyond promotion, if any. No public Admin creation endpoint is proposed.

Until these decisions are approved and the relevant tests pass, keep the current read-only Users controls and existing Create Operator behavior unchanged; do not implement station reassignment.

## References

- [Role Management ADR](./12-Role-Management-ADR%20(1).md)
- [Police Station Isolation ADR](./13-Police-Station-Isolation-ADR%20(1).md)
- [Admin Panel Security Implementation Plan](./15-Admin-Panel-Security-Implementation-Plan.md)
- [Local Operator Creation Prototype Notes](../security-prototypes/role-management/OPERATOR-CREATION-IMPLEMENTATION.md)
- [Role Management Prototype README](../security-prototypes/role-management/README.md)
