# Role Management — Firestore Security Rules Feasibility Test Plan

- **Status:** Draft test plan; not executed
- **Source of truth:** `docs/12-Role-Management-ADR.md`
- **Scope:** Isolated local Firestore Emulator prototype only
- **Production status:** No production code, data, Security Rules, credentials, or deployment are in scope

## 1. Purpose

Determine through emulator tests and security review which approved role-management invariants can be enforced reliably by Firestore Security Rules and which require a trusted backend. This plan does not assert that Rules-only role management is feasible. Keep the current `firestore.rules` deny-all until Phase B is explicitly authorized.

## 2. Approved model and document paths

### Role document: `userRoles/{uid}`

Expected fields: `role` (`operator` or `admin`), `status` (`active` or `revoked`), `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`. Timestamps should be Firestore Timestamps. The UID is represented by the document path.

### History document: `userRoles/{uid}/history/{eventId}`

Minimum proposed fields: `action`, `previousRole`, `newRole`, `actorUid`, `occurredAt`, and optional `reason`. Actions include `assigned`, `role_changed`, `revoked`, and an explicitly defined reactivation action. Ordinary clients must not edit or delete existing history.

### Governance document: `systemControl/adminGovernance`

Expected fields include `schemaVersion`, `activeAdminCount`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`. Derive counter deltas from old/new role states; never trust a client-supplied delta.

## 3. Transition matrix

| Transition | Expected counter delta |
|---|---:|
| Create active operator | 0 |
| Create active admin | +1 |
| Promote active operator to admin | +1 |
| Demote active admin to operator | -1 |
| Revoke active operator | 0 |
| Revoke active admin | -1 |
| Reactivate revoked operator | 0 |
| Reactivate revoked admin | +1 |

Reject any transition that would reduce the active-admin count to zero. Self-role changes are prohibited.

## 4. Test environment and safety

1. Run only against the local Firestore Emulator configured for `demo-casetrack-role-prototype`.
2. Never use a production project ID, credentials, or live data.
3. Never run `firebase deploy` from this prototype.
4. Use `@firebase/rules-unit-testing` for authenticated and unauthenticated contexts.
5. Seed fixtures using the testing environment's privileged setup mechanism, not public client permissions.
6. Clear emulator data between independent tests.
7. Inspect both request results and final role, history, and governance documents.
8. Record Rules debug output and access-call-limit failures.
9. Current deny-all Rules should deny all client reads/writes; role scenarios are not expected to pass until Phase B implementation is explicitly authorized.

## 5. Required test matrix

For each test, record initial fixture, actor, operation/batch, expected allow/deny, expected final documents, actual result, and evidence.

| ID | Area | Positive scenario | Negative/adversarial scenario | Evidence |
|---|---|---|---|---|
| AUTH-01 | Authentication | Authenticated active admin performs an authorized role operation | Unauthenticated role-management request | Result and unchanged state on denial |
| AUTHZ-01 | Authorization | Active admin changes another user's role | Operator attempts role management | Role, history, governance |
| AUTHZ-02 | Revoked actor | No positive case unless ADR is amended | Revoked user attempts role management | Denied; no state change |
| ROLE-01 | Assignment | Admin assigns operator | Operator creates/promotes an admin | All related documents |
| ROLE-02 | Schema | Valid role/status/timestamps | Invalid enum, malformed fields, prohibited extra fields | Denial; no partial writes |
| TRANS-01 | Promotion | Promotion with delta +1 | Missing governance update or incorrect delta | Role, history, governance |
| TRANS-02 | Demotion | Demotion with delta -1 while another admin remains | Missing governance update or incorrect delta | Role, history, governance |
| TRANS-03 | Operator revocation | Revoke operator with delta 0 | Arbitrary non-zero delta | Role, history, governance |
| TRANS-04 | Admin revocation | Revoke admin with delta -1 while another admin remains | Missing history/counter update | Role, history, governance |
| TRANS-05 | Reactivation | Authorized reactivation with event and correct delta | Unauthorized reactivation or missing event | Role, history, governance |
| SELF-01 | Self-change | Admin changes another user's role | Self-promotion or other self-role change | Denial; no state change |
| LAST-01 | Last admin | Demote/revoke one of multiple admins | Demote/revoke sole active admin | Result and final count/roles |
| HIST-01 | Audit coupling | Valid transition creates matching event | Missing/mismatched event or actor | Role and history |
| HIST-02 | Append-only | Valid event created during valid transition | Edit/delete existing event or standalone invalid event | Existing event unchanged |
| GOV-01 | Governance | Correct derived counter delta | Direct counter write or arbitrary count | Governance and related docs |
| ATOM-01 | Atomicity | Role, history, governance commit together | Omit each related write in turn | No partial state after rejection |
| BYPASS-01 | Alternate paths | Intended operations work through approved paths | Direct write, alternate path, malformed path, overly broad grant | All affected documents |
| CONC-01 | Concurrency | Competing valid operations leave consistent state | Competing transitions attempt stale/inconsistent counter | Final roles, history, counter |
| BOOT-01 | Bootstrap | Trusted initialization creates reconciled first-admin state | Public client attempts bootstrap/recovery | Denial and trusted procedure |
| REC-01 | Recovery | Trusted recovery reconciles role documents, counter, and recovery evidence | Recovery leaves stale count or omits evidence | Checklist and final state |
| LIMIT-01 | Rules limits | Valid atomic operation fits access-call limits | Complex batch/transaction exceeds limits | Emulator result and logs |

## 6. Assertions for successful transitions

- Only intended role documents change.
- Role fields and values are valid.
- History actor, action, old/new roles, and timestamp match the transition.
- Governance counter changes by the derived delta and metadata is consistent.
- No unrelated documents change.
- A rejected operation leaves no partial role/history/governance writes.

For rejected operations, inspect final state rather than relying only on a permission error.

## 7. Concurrency protocol

1. Seed at least two active admins and a reconciled counter.
2. Start competing role changes from separate test contexts against the same initial state.
3. Include operations that appear valid independently but could jointly violate last-admin or counter invariants.
4. Await all results and inspect final role documents, related history events, and governance.
5. Assert that final invariants hold and no successful operation lacks its required history/counter update.
6. Repeat races and record iteration count and emulator/runtime versions.

Passing a finite test is evidence for tested cases, not proof over every possible execution.

## 8. Bootstrap and recovery limitations

Rules cannot enumerate all `userRoles` documents to independently calculate the global active-admin total. Correctness depends on a trusted, reconciled bootstrap/recovery state and every permitted transition preserving the invariant.

The operational checklist must define who may bootstrap/recover, how active-admin roles are enumerated, how the counter is reconciled and independently checked, how recovery is recorded, which tests are rerun, and how drift is detected/corrected. Rules tests cannot prove arbitrary trusted Console changes will always preserve the counter.

## 9. Pass/fail and release gates

A scenario passes only if the observed request result and final documents match expectations. Review separately:

- Authorization of every transition.
- Derived counter-delta enforcement.
- `getAfter()` coupling of role, history, and governance.
- Rejection of self-change, last-admin, direct-write, standalone-history, and alternate-path bypasses.
- Concurrency invariants.
- Rules document-access-call limits.
- Bootstrap/recovery procedure and reconciliation.

Do not declare Rules-only feasible solely because listed emulator tests pass. Record untested assumptions and limitations.

If Rules cannot reliably enforce counter consistency, audit integrity, or last-admin protection, the ADR requires a trusted backend before production release. A backend using Firebase Admin SDK must implement authorization, validation, atomic writes, and audit logging itself because Admin SDK writes bypass Rules.

## 10. Current status

- [x] Approved ADR copied into prototype docs and SHA-256 verified identical to source copy.
- [x] Local Firestore Emulator startup verified with demo project ID.
- [x] Current `firestore.rules` verified as deny-all placeholder.
- [ ] This test plan reviewed and approved.
- [ ] Phase B Rules implementation explicitly approved.
- [ ] Fixtures and Rules Unit Testing cases implemented.
- [ ] Emulator test suite executed and results recorded.
- [ ] Security review and Rules-only/backend decision completed.

This is a planning artifact, not evidence that tests have been implemented or passed.
