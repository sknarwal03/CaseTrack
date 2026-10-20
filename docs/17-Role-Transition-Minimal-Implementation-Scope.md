# CaseTrack Role-Transition Minimal Implementation Scope

## Status

**Planning baseline for the next local Admin Panel milestone.** This scope is derived from the approved decisions recorded in the [Role-Transition Specification Proposal](./16-Role-Transition-Specification-Proposal.md), [Role Management ADR](./12-Role-Management-ADR%20(1).md), and [Police Station Isolation ADR](./13-Police-Station-Isolation-ADR%20(1).md). It is not implementation evidence, a production authorization approval, or permission to deploy.

The current Admin, SP/Senior Officer, and approved-role boundaries are clarified in [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md). That record does not expand this transition milestone.

The local prototype currently supports Users listing, Police Station Master list/create, and Create Operator. It has no promote, demote, revoke, reactivate, or station-reassignment endpoint. The prototype Firestore Rules are default-deny. Keep the existing Create Operator behavior unchanged.

## 1. In-scope transition operations

All four operations are performed by a trusted backend using the Admin SDK, which bypasses Firestore Rules. Every request must have a valid Firebase ID token for a currently active Admin actor. The actor must not equal the target UID. Re-check actor and target state in the Firestore transaction; do not trust caller-supplied actor, role, status, event, timestamp, or counter values.

The following role and counter effects are required by the approved ADRs:

| Operation | Required target precondition | Result | `activeAdminCount` delta |
|---|---|---|---:|
| Promote Operator to Admin | Different user; active Operator | Active Admin; remove `policeStationId` from the current role record | +1 |
| Demote Admin to Operator | Different user; active Admin; valid existing destination station supplied | Active Operator assigned to that station | -1; reject if result would be zero |
| Revoke user | Different user; active Operator or Admin | Retain role; set status to `revoked`; disable Firebase Auth account | Operator: 0; Admin: -1; reject if result would be zero |
| Reactivate user | Different user; retained role is revoked; Auth account is eligible for reactivation | Retain role; set status to `active`; enable Firebase Auth account | Operator: 0; Admin: +1 |

An active Operator requires one valid, admin-assigned stable station ID. Promotion history retains the former station even though the current Admin role record no longer has that field. Reactivating an Operator requires its assigned station to exist and be valid; otherwise block reactivation until an Admin corrects the assignment through an approved process. Do not combine correction/reassignment with reactivation.

**Station reassignment is out of scope.** Record it as a later task and do not enable it until project owners decide old/new station access, in-progress work, and record-ownership implications.

## 2. Required history, reasons, and idempotency

Every transition creates exactly one append-only event at `userRoles/{targetUid}/history/{eventId}`. Generate the event ID and actor UID on the backend. Use a Firestore server timestamp for `occurredAt`.

Applicable events include the approved fields `previousStatus`, `newStatus`, `previousPoliceStationId`, and `newPoliceStationId`, as well as `action`, `previousRole`, `newRole`, `actorUid`, and `occurredAt`. Use `null` for absent values and stable Police Station Master IDs otherwise.

| Operation | `action` | Role fields | Status fields |
|---|---|---|---|
| Promote | `role_changed` | `operator` → `admin` | `active` → `active` |
| Demote | `role_changed` | `admin` → `operator` | `active` → `active` |
| Revoke | `revoked` | Previous role → `null` | `active` → `revoked` |
| Reactivate | `reactivated` | Retained role → same role | `revoked` → `active` |

For promotion, history records old station ID → `null`; for demotion, `null` → selected valid station. For revocation and reactivation, record the actual station values before and after, without changing assignment as a side effect.

Require a non-empty, trimmed `reason` on promotion, demotion, revocation, and reactivation, and store it in history. Preserve Create Operator’s existing request contract: no reason is added to it.

Each new transition requires an actor-scoped idempotency key and durable operation journal. Bind the key to the actor, operation, target, normalized inputs, and reason. A same-key/same-input retry resumes or returns the original operation without duplicate history. Reuse with different inputs is rejected. Persist enough phase and ownership state to recover interrupted work; do not store passwords or ID tokens.

Reason maximum length/character policy and journal retention are not established here; see backlog.

## 3. Atomic Firestore writes and governance

For each transition, the backend transaction must revalidate the active Admin actor, target preconditions, station references when applicable, governance state, and operation reservation. Commit together:

- Role-document state change and `updatedAt`/`updatedBy`.
- One immutable history event.
- The server-derived `activeAdminCount` delta for promote, demote, Admin revoke, and Admin reactivate.
- Operation-journal phase/result needed to make the Firestore transition idempotent and recoverable.

For an Operator revoke/reactivate, governance has zero delta; validate it and do not alter the count. Never accept a caller-supplied delta.

### Minimum practical consistency model

Use `systemControl/adminGovernance` as the serialization point for every Admin-count-changing transition. Each transaction reads and writes that same document along with its target role and history. Competing transactions then conflict/retry against the latest count; after retry they must re-check that a demotion or Admin revocation leaves at least one active Admin. This protects the last Admin only while the count starts correct and all Admin role mutations follow this protocol.

Before enabling transitions, a trusted Firebase project owner must reconcile the singleton against a complete, paginated scan of `userRoles`, while ordinary role transitions are disabled. Count only structurally valid active Admin records; malformed or ambiguous role records require owner review rather than an inferred count. The owner records the reconciled count, reconciliation actor/time, and outcome in an auditable recovery record, then re-enables transitions. During later maintenance reconciliation, first block transitions using an owner-controlled maintenance gate checked in the same governance transaction; do not compare a moving scan against a live counter.

Ordinary transitions fail closed if governance is missing, has an invalid schema/type/value, is marked unhealthy/in maintenance, or is known inconsistent. They must not create a default counter or repair one. A detected mismatch disables transition writes until the trusted owner repeats reconciliation.

**Important limitation:** a singleton transaction cannot prove on every request that the counter equals a global scan of all active Admin roles. After a trusted reconciliation, the counter is reliable by induction only if all Admin role changes are exclusive to this transactional backend and trusted owner maintenance/reconciliation process. Firestore Rules deny client writes in this prototype, but Admin SDK writes bypass Rules; the current architecture does not technically prevent a privileged alternate server or Console operator from changing a role without updating governance. Such out-of-band writes can create undetected drift until reconciliation. If exclusive-writer operation cannot be established and maintained, global consistency is not verified and last-Admin protection is not safe to release.

Do not add a full role-collection scan to every request as a substitute: it is costly, subject to Firestore transaction/read limits, and is not atomic with writes unless transitions are frozen. Do not rely on a scheduled comparison while transitions continue; an asynchronous scan may race with valid changes.

Reject any operation that would reduce the active Admin count to zero. If the count is already zero, there is no normal Admin Panel recovery path; only the trusted Firebase project owner may recover through the separately documented procedure.

## 4. Firebase Auth saga and failure recovery

Firestore and Firebase Auth cannot be committed atomically. Keep role/history/governance changes atomic within Firestore and orchestrate Auth through the journal. The implementation must fail closed and resume by the same idempotency key.

### Revoke

1. Reserve the idempotency key and journal operation. Validate actor, target, and governance before any side effect.
2. In one Firestore transaction, revalidate all preconditions, set status to `revoked`, create the event, apply the Admin-count delta if applicable, and record an Auth-disable-pending journal phase.
3. Disable the target Auth account. If already disabled, verify the target UID and treat the stage as complete.
4. Mark the journal complete.
5. If Firestore fails, no transition writes commit and Auth remains unchanged. If Auth disable fails after Firestore commits, keep the role revoked and journal pending/reconciliation-required; retry disabling Auth with the same key. Do not automatically restore active role state or re-enable Auth.
6. A lost Auth response is resolved by reading Auth state and retrying idempotently. Any exceptional compensation requires a separate trusted-owner recovery action and audit record.

All authorization paths must reject the revoked role even during the interval before Auth disable succeeds. Disabling Auth alone must not be assumed to invalidate already-issued ID tokens.

### Already-issued ID tokens and authorization

An already-issued Firebase ID token is not itself changed by a Firestore role update. It may remain cryptographically valid until expiry. The existing Functions helper calls `verifyIdToken(token, true)`, requesting Auth revocation checking, and the shared `authorizeActiveAdmin` guard then reads the current `userRoles/{uid}` record and requires `role: "admin"` plus `status: "active"` on every request. Thus, for the existing Admin-only Functions, a still-valid token does not preserve authorization after the Firestore role is revoked: the live role check must deny it even if the subsequent Auth disable is delayed or fails. Keep both checks; do not treat token claims as the role source.

The current prototype Firestore Rules deny every client read and write. This is fail-closed but does not yet implement the approved station/Admin access model. Before allowing direct client data access, Rules must resolve the authenticated UID's current role document and require an active role on every protected path. Admin-only paths require active Admin; station-scoped paths must additionally enforce the ADR's trusted station ownership for active Operators. Do not authorize based only on a role or station claim embedded in an older token. Missing role documents, revoked/malformed roles, Rules lookup failures, and unrecognized role/status values must deny by default. Client access to role, history, governance, and transition journals must remain denied.

Every future or existing Function that returns or mutates protected data must perform an equivalent current-role/status check on every request, with station authorization where relevant. A token verification or Auth-disabled check alone is insufficient. A role/status read failure must not fall through to success. The revoke saga commits `status: "revoked"` in Firestore before attempting Auth disable, so all Rules and Functions must use that Firestore state as the immediate denial signal. Auth disable and `verifyIdToken(..., true)` provide additional protection, not the only barrier.

No mechanism can retroactively cancel a protected operation already authorized and in flight before the revocation commit. Keep that residual race explicit; do not report instantaneous cancellation of already-started work.

### Reactivate

1. Reserve the idempotency key. Confirm actor/target preconditions and that an Operator’s assigned station exists and is valid. Confirm the target Auth account is in a state eligible for reactivation; the exact handling of missing or unexpectedly enabled accounts remains a blocker.
2. In one Firestore transaction, revalidate state, set status to `active`, create history, apply the Admin-count delta if applicable, and record the Auth-enable-pending journal phase.
3. Enable the target Auth account, then mark the journal complete. If Auth enable fails, keep the account disabled and retry using the same key; do not remove the committed history or silently undo governance.
4. If Auth is already enabled, do not assume the operation is safe to continue until the approved eligibility/recovery rule is implemented. If Firestore fails before commit, retain the revoked Firestore state and resolve the Auth state according to the approved recovery path.

The sequencing above does not itself solve authorization for already-issued tokens or other access paths. That is a release gate in §7.

## 5. Minimal test and acceptance scope

Run isolated local Emulator tests only. Do not use production configuration or deployment commands.

### Positive tests

- Each transition succeeds for an active Admin acting on a different eligible user.
- Assert exact role/status/station result, actor UID, timestamps, reason, action and previous/new history fields.
- Assert exact governance delta and that Operator-only transitions leave the count unchanged.
- Assert Admin promotion removes current station assignment while preserving its old ID in history.
- Assert Operator reactivation requires a valid existing assigned station.
- Assert same-key/same-input retries return the original result and exactly one history event.

### Negative tests

- Unauthenticated, invalid-token, non-Admin, revoked-Admin, and self-target requests fail without writes.
- Invalid target role/status, malformed fields, client-supplied authority/audit/counter values, unknown station, and empty/whitespace reason fail.
- Reject demotion/revocation of the last active Admin and any resulting count below one.
- Missing, malformed, or detected-inconsistent governance blocks all ordinary transitions without creating role/history/journal success state or auto-repairing the count.
- Same idempotency key with changed operation, actor scope, target, reason, or other bound inputs is rejected.
- Repeated revoke/reactivate requests against ineligible current state do not append additional events.
- Missing governance, wrong field type/schema, invalid count, maintenance/unhealthy state, and a mismatch detected by owner reconciliation all fail closed without automatic repair.
- Present an unexpired ID token issued while the target was active after Firestore status becomes revoked but before Auth disable; every applicable Function and Rules path must deny protected access.
- A revoked user cannot read or write protected documents by supplying a previously valid role/station claim, direct document ID, query, or alternate endpoint.
- Missing/malformed role, role-read/Rules lookup failure, and unknown status fail closed. Function role-read failures must not return protected data.

### Concurrency tests

- Run competing Admin demotion/revocation operations whose combined deltas would remove the last Admin. Inspect all role documents, history events, journals, and governance; the committed final count must remain at least one.
- With a reconciled count of two, concurrently attempt two count-decrementing transitions against different Admins. At most one may commit; verify the remaining role, event, journal, and counter all agree. Repeat with demotion and Admin revocation combinations.
- Enter owner maintenance mode concurrently with a transition. Verify the maintenance gate and transaction conflict/retry ensure reconciliation does not scan a concurrently changing set of Admin roles and no transition commits once maintenance is established.
- Run concurrent updates to the same target. A stale transition must fail its preconditions or return the same idempotent result; it must not overwrite newer state or duplicate history.
- Include governance reads/writes in the transaction and verify retry behavior. Response codes alone are insufficient evidence.

### Failure-recovery tests

- Inject Firestore transaction failure before commit: no role/history/governance partial writes and no unintended Auth state change.
- Inject Auth disable failure after revoke commit: target remains revoked, journal remains recoverable, authorization is denied, and retry disables Auth without duplicate event or counter delta.
- During that injected Auth-disable failure, exercise the still-unexpired ID token against every Admin Function and applicable Rules-protected resource; access must remain denied from the revoked Firestore role.
- Inject Auth enable failure during reactivation: journal remains recoverable, and retry completes once without duplicate event or counter delta.
- Simulate lost Auth responses and journal-update failures. Read back Auth, role, history, governance, and journal before retry; verify safe idempotent completion.
- Verify every exception/ambiguous phase has an explicit fail-closed state and actionable trusted recovery; no silent success-shaped fallback.
- Fail the governance read/transaction and the current-role lookup independently; prove no role change or protected response is granted.
- Run trusted-owner reconciliation against a deliberately missing, malformed, and genuinely drifted counter with transition maintenance enabled. Verify exact role scan, reviewed malformed records, audit evidence, corrected count, and safe re-enable; verify the ordinary Admin endpoint cannot reconcile.
- Verify the documented exclusive-writer assumption operationally: direct client writes remain denied, and all Admin role mutations in the application go through the transactional backend. Any privileged out-of-band mutation requires maintenance and reconciliation before transitions resume.

Acceptance requires the tests to assert the final persisted state across Auth, role, history, governance, and journal—not merely endpoint outcomes.

## 6. Explicitly unchanged behavior

Keep the existing Create Operator endpoint, request/response shape, disabled-Auth provisioning saga, history behavior, governance delta of zero, retry contract, and current UI behavior unchanged in this milestone. Do not add `reason` to Create Operator. Changes needed solely to transition operations must not regress this flow; run its existing Operator Creation suite as a regression gate.

## 7. Security blockers and recommendations

The following minimum approaches are recommended, not marked as implemented or verified. Production/release use remains blocked until their stated conditions are implemented and tested.

### Global Admin-count consistency

**Recommendation:** Treat `adminGovernance` as the serialized counter. Every count-changing transition must read and write that same governance document in the transaction as its role/history changes. Firestore transaction conflicts then serialize concurrent transitions; after a retry, re-check that the resulting count remains at least one. This prevents concurrent last-Admin removal only if the starting count is correct and every Admin role mutation uses this transaction.

Establish the initial count by trusted Firebase project owner reconciliation before enabling transitions: freeze role transitions, scan all `userRoles` documents with pagination, count structurally valid `role: "admin", status: "active"` records, and have the owner review malformed/ambiguous role records instead of guessing. Record the actor, timestamp, count, and outcome in an audit record; write the count and then explicitly lift the maintenance gate. Repeat the same freeze/scan/review/audit/write/re-enable sequence for detected drift. Missing, malformed, unhealthy, or maintenance governance must block ordinary operations; no Admin Panel auto-repair or public reconciliation endpoint.

The maintenance gate must be checked in the same governance transaction as a transition. Setting the gate transactionally prevents a stale transition from slipping through after maintenance begins: any conflicting transaction retries and observes maintenance. Do not reconcile against a changing role set.

**Alternatives rejected:** A read-only counter check does not serialize concurrent transitions; a singleton transaction does not compare against every role document; full scans on every request are costly and still race unless writes are frozen; asynchronous reconciliation while writes continue has no stable comparison boundary; automatic repair is contrary to the trusted-owner-only decision.

**Required changes/tests:** Add transactional maintenance/health state and an owner-only reconciliation procedure. Test two competing Admin decrements from count two (at most one succeeds), count updates after transaction retry, maintenance versus in-flight transition, missing/malformed/invalid governance, drifted count detected during a frozen owner scan, audited exact reconciliation, and rejection of ordinary caller repair. Confirm all Admin role mutations route through the same backend.

**Unavoidable limitation/release blocker:** This cannot provide a per-request proof of global consistency. After owner reconciliation it is an inductive invariant only if out-of-band Admin SDK/Console writes are prohibited operationally and all privileged app writes use the transactional path. Admin SDK bypasses Rules, and current architecture cannot technically prevent a privileged alternate writer. Such a write can create undetected drift until a frozen reconciliation. If the exclusive-writer boundary and owner procedure cannot be assured, mark global consistency unresolved and do not claim reliable last-Admin protection.

### Already-issued Firebase ID tokens

**Observed behavior:** A Firestore role update does not change an already-issued ID token; it may remain cryptographically valid until expiry. The existing Functions helper uses `verifyIdToken(token, true)` and the shared Admin guard then reads `userRoles/{uid}` on each request, requiring an active Admin. Therefore current Admin Functions can deny a still-valid token after role revocation, including while Auth disable is pending, provided they continue using that live role guard. Current prototype Firestore Rules deny every client read/write; this is safe, but it is not the approved Rules access model.

**Recommendation:** Use tokens only to establish identity, not current role/status. For each protected Function request, keep revocation-checking token verification and read current role/status from Firestore; add the required active Operator station-ownership check to station-scoped business endpoints. For future direct Firestore access, Rules must independently look up the current role document and deny missing, revoked, malformed, or unknown roles; Admin and Operator permissions must be explicit, and Operator reads/writes must enforce trusted station ownership. Keep client writes to roles, history, governance, and journals denied. Leave all unimplemented Rules paths default-deny.

In the revoke saga, commit `status: "revoked"` before attempting Auth disable. That live Firestore state is the immediate deny signal; Auth disable and `verifyIdToken(..., true)` are defense in depth, not the sole barrier. Firestore/Functions lookup or validation errors must deny access, never fall through. Already-authorized requests already in flight before the revoke commit cannot be recalled and remain a documented residual risk.

**Alternatives rejected:** Trusting custom token role/station claims risks stale authorization; waiting for token expiry or relying only on Auth disable is not immediate; Functions' `verifyIdToken(..., true)` does not make Firestore Rules perform the same revocation check; replacing blanket-deny Rules with broad client access before path-by-path station Rules are tested weakens the existing boundary.

**Required changes/tests:** Audit every protected Function route for the common live-role guard and station condition as applicable. Before enabling direct client access, implement and Rules-Emulator-test all protected collection/document/query paths. With an unexpired token from before revocation, test denied Function and Rules access after Firestore status changes but before Auth disable, including injected Auth-disable failure; test direct IDs, queries, cross-station requests, stale role/station claims, missing/malformed role docs, lookup errors, and revoked reads/writes. Confirm role/history/governance/journal client writes stay denied.

**Release blocker:** Existing guarded Admin Functions and blanket-deny Firestore Rules are the only currently evidenced fail-closed behavior. ADR-required station authorization is not implemented/validated here. Do not enable client protected-data access or claim production-ready revocation until every Rules and Function path passes these tests and receives security review.

### Additional open requirements

1. **Governance consistency detection:** Define how the backend determines that `activeAdminCount` is inconsistent with actual active Admin roles, given that Security Rules cannot enumerate the collection and a transaction on the singleton alone does not prove a global count. Ordinary transitions must remain blocked on known drift; only the trusted owner may reconcile.
2. **Issued-token/access-path behavior:** Define and test how all protected data paths reject revoked users during the Auth-disable interval and how already-issued ID tokens behave. Auth account disablement must not be assumed to invalidate existing tokens. Verify Rules/backend authorization before using this saga beyond the local default-deny prototype.
3. **Reactivation Auth eligibility:** Project owner must approve behavior for missing Auth accounts and accounts found unexpectedly enabled while the role is revoked. Do not guess or auto-enable/disable in ambiguous states.
4. **Invalid Operator assignment correction:** Reactivation is blocked until assignment is valid, but station reassignment is out of scope. An approved correction path must exist before invalidly assigned Operators can be reactivated; do not smuggle reassignment into this milestone.
5. **Zero active Admin recovery:** Document the trusted Firebase project owner’s separate recovery and reconciliation procedure. There is no Admin Panel bypass.

These blockers do not prevent planning or implementing isolated code behind local tests, but they block declaring the transition system security-complete or using it for production authorization.

## 8. Deferred backlog

- **Later task: Operator station reassignment.** Keep disabled/out of scope until owners decide old-station/new-station access, in-progress work, and record-ownership transfer implications; then specify history and add access tests.
- Reason maximum length, character policy, and user-facing reason guidance.
- Operation-journal retention/archival and cleanup policy.
- Advanced journal corruption, long-term outage, and manual compensation procedures beyond the failure/retry cases required above.
- Broader trusted-owner reconciliation tooling, audit/reporting, and operational runbooks beyond the zero-Admin procedure required as a blocker.
- Station rename/delete/alias lifecycle and operator-assignment migration for ambiguous legacy records.
- Production Firestore Rules, production project mapping, deployment readiness, and independent security review.
- SP/Senior Officer summary-only access is a confirmed boundary, but its
  role identifier, jurisdiction representation, authorization model, and
  secure aggregation mechanism remain pending; no individual-record
  access is approved.
- A separate multi-station Read-Only User role is not approved.

## References

- [Role-Transition Specification Proposal](./16-Role-Transition-Specification-Proposal.md)
- [Role Management ADR](./12-Role-Management-ADR%20(1).md)
- [Police Station Isolation ADR](./13-Police-Station-Isolation-ADR%20(1).md)
- [Admin Panel Security Implementation Plan](./15-Admin-Panel-Security-Implementation-Plan.md)
