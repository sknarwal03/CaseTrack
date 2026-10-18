# ADR: Role Management & Authorization

> Reconciled on 2026-10-18 with `13-Police-Station-Isolation-ADR.md`. Planning decision: admin has all-station FIR/proceeding access; implementation and security validation remain pending.

-   **Status:** Approved design direction; implementation and security
    validation pending
-   **Document:** `12-Role-Management-ADR.md`
-   **Project:** CaseTrack
-   **Scope:** Role management for `operator` and `admin`; SP-level viewer role remains pending an explicit role-name/jurisdiction decision

## 1. Objective

Define how CaseTrack manages user roles, role changes, revocation, audit
history, and last-admin protection.

This ADR records approved architecture decisions separately from
technical validation that remains outstanding. Proposed designs must not
be treated as verified security guarantees until the required
implementation review and tests are complete.

## 2. Approved architecture decisions

  --------------------------------------------------------------------------
  Area                                Approved decision
  ----------------------------------- --------------------------------------
  Authentication                      Firebase Authentication verifies user
                                      identity.

  Authorization                       Firestore Security Rules enforce
                                      permissions for client requests.

  Roles                               Initial roles are `operator` and
                                      `admin`.

  Role storage                        `userRoles/{uid}`, where `{uid}` is
                                      the Firebase Authentication UID.

  Role fields                         `role`, `status`, `createdAt`,
                                      `createdBy`, `updatedAt`, `updatedBy`.

  Role values                         `operator` or `admin`.

  Status values                       `active` or `revoked`.

  Revocation                          Retain the role document and set
                                      `status: "revoked"` rather than
                                      deleting it.

  Audit history                       `userRoles/{uid}/history/{eventId}`,
                                      designed as append-only.

  History events                      Assignment, role change, revocation,
                                      and authorized reactivation create new
                                      events.

  Governance                          `systemControl/adminGovernance` stores
                                      `activeAdminCount`.

  Role-change writes                  Role document, corresponding history
                                      event, and governance counter are
                                      intended to update atomically.

  First-admin bootstrap               A trusted Firebase project owner
                                      initializes the first admin manually.

  Emergency recovery                  A trusted project owner performs
                                      recovery using a separately documented
                                      procedure.

  Self-role changes                   Prohibited in the initial design.

  Last-admin protection               An operation that would demote or
                                      revoke the last active admin must be
                                      rejected.

  Admin permissions                   Admin can manage roles and the Police
                                      Station Master, and has FIR/proceeding
                                      access across all police stations.

  Operator permissions                Operator can use normal FIR/proceeding
                                      workflows and authorized
                                      identity-correction workflows.

  Station-scoped authorization        Required. Operators are restricted to
                                      their single admin-assigned station.
                                      Admin has all-station FIR/proceeding
                                      access. SP-level read-only access and
                                      jurisdiction remain pending a separate
                                      role/jurisdiction decision.

  Current implementation state        No production code, Firestore Security
                                      Rules, data, or deployment has been
                                      changed as part of these planning
                                      decisions.
  --------------------------------------------------------------------------

### 2.1 Role permission boundary

- `operator`: one admin-assigned `policeStationId`; FIR/proceeding create,
  read, update, and delete are restricted to that station.
- `admin`: role management and Police Station Master management, plus
  FIR/proceeding access across all stations. This is the user's approved
  design choice; it is not evidence that current code or Rules enforce it.
- SP-level read-only viewer: required as a product direction for authorized
  overview reports, but the exact role identifier and jurisdiction model
  remain unresolved. Do not silently grant this access to `admin` or
  assume an SP viewer can access every station.

Station-scoped authorization is an approved design requirement. Any older
statement that it is deferred is superseded by this decision. Enforcement
and migration are release blockers until validated.

### 2.2 Proposed role document schema

Path: `userRoles/{uid}`

``` json
{
  "role": "operator",
  "status": "active",
  "policeStationId": "<stable Police Station Master ID; required for operator>",
  "createdAt": "<Firestore Timestamp>",
  "createdBy": "<admin Firebase UID>",
  "updatedAt": "<Firestore Timestamp>",
  "updatedBy": "<admin Firebase UID>"
}
```

The values above are illustrative. Timestamps are intended to be
Firestore `Timestamp` values, not strings. The UID is represented by the
document path and need not be duplicated in the document. `policeStationId`
is required for an active `operator` and is assigned/changed only by an
authorized admin. For `admin`, station assignment is not used to limit
FIR/proceeding access; admin access spans all stations. The exact schema
and Rules enforcement remain subject to implementation review and tests.

### 2.3 Proposed role-history schema

Path: `userRoles/{uid}/history/{eventId}`

Minimum proposed fields:

-   `action`: `assigned`, `role_changed`, or `revoked` (reactivation
    also needs an explicitly defined event/action).
-   `previousRole`: previous role, or `null` for initial assignment.
-   `newRole`: new role, or `null` for revocation.
-   `actorUid`: UID of the admin who made the change.
-   `occurredAt`: server timestamp.
-   `reason`: optional explanation.

This schema is a proposed design, not an implemented or validated
structure. Existing history events must not be edited or deleted by
ordinary clients.

### 2.4 Proposed governance document schema

Path: `systemControl/adminGovernance`

``` json
{
  "schemaVersion": 1,
  "activeAdminCount": 1,
  "createdAt": "<Firestore Timestamp>",
  "createdBy": "<bootstrap admin UID>",
  "updatedAt": "<Firestore Timestamp>",
  "updatedBy": "<admin UID>"
}
```

This is an illustrative schema. The bootstrap value
`activeAdminCount: 1` is valid only when the initial state has exactly
one active admin. A trusted bootstrap/recovery procedure must reconcile
the governance count with the role documents it is intended to
represent.

## 3. Proposed role transitions and counter deltas

The intended counter delta is derived from the old and new role states;
the client-provided delta must not be trusted.

  Transition                           Expected `activeAdminCount` delta
  ---------------------------------- -----------------------------------
  Create active operator                                               0
  Create active admin                                                 +1
  Promote active operator to admin                                    +1
  Demote active admin to operator                                     -1
  Revoke active operator                                               0
  Revoke active admin                                                 -1
  Reactivate revoked operator                                          0
  Reactivate revoked admin                                            +1

An operation that would reduce the active-admin count to zero must be
rejected. The table describes intended behavior; it does not prove that
the current or proposed Security Rules can enforce every transition
securely.

## 4. Pending technical validation

The following are unresolved technical questions, not verified security
guarantees:

-   Can Security Rules enforce the exact counter delta for every
    permitted role transition?
-   Can `getAfter()` reliably link the resulting role document, history
    event, and governance document states?
-   Are all self-promotion, self-change, and last-admin-lockout bypass
    attempts rejected?
-   Are direct document writes, malformed history events, standalone
    history writes, and alternate write paths blocked?
-   Does the design remain consistent under concurrent role changes?
-   Can all required checks fit within Firestore Security Rules
    document-access-call limits?
-   Does the governance counter match active admin role documents after
    bootstrap and recovery?
-   Can append-only history and the role-transition protocol be enforced
    without gaps?
-   Is the trusted role-provisioning and recovery procedure sufficiently
    documented and tested?

**Important limitation:** Firestore Security Rules cannot enumerate the
entire `userRoles` collection to independently calculate the global
number of active admins. Rules may validate specific documents and
atomic resulting states, but a correct counter value depends on a
correct bootstrap/recovery state and on every permitted transition
preserving the invariant.

Emulator tests can validate defined Rules scenarios; passing tests alone
does not prove that the global counter is correct for every possible
production state.

## 5. Security Rules architecture direction

The proposed Rules should be organized into explicit sections:

1.  `userRoles/{uid}` --- validate allowed role/status values, requester
    authorization, and permitted state transitions.
2.  `userRoles/{uid}/history/{eventId}` --- allow creation only as part
    of a valid role transition; deny ordinary client edits/deletes.
3.  `systemControl/adminGovernance` --- deny arbitrary counter writes
    and validate the expected counter change against the role
    transition.
4.  Bootstrap and recovery --- keep these outside the public client
    workflow and handle them through a trusted, documented procedure.
5.  Default deny --- explicitly restrict role, history, and governance
    paths; do not rely on authentication alone.

`getAfter()` is a candidate mechanism for validating resulting states in
an atomic operation. Feasibility, access-call limits, and bypass
resistance must be tested before production use.

## 6. Emulator test matrix

These are required test scenarios; **they have not yet been executed**.

  --------------------------------------------------------------------------
  Test group                Positive case           Negative case
  ------------------------- ----------------------- ------------------------
  Authentication            Active admin performs   Unauthenticated request
                            an authorized role      attempts role
                            operation.              management.

  Authorization             Active admin changes    Operator or revoked user
                            another user's role.    attempts role
                                                    management.

  Role assignment           Admin creates an        Operator
                            operator role.          creates/promotes a user
                                                    to admin.

  Promotion/demotion        Valid transition uses   Missing or incorrect
                            the expected counter    governance update.
                            delta.                  

  Revocation/reactivation   Authorized              Unauthorized
                            revoke/reactivate       reactivation or missing
                            includes an audit event audit event.
                            and correct delta.      

  Self-change               Admin changes another   User attempts
                            user's role.            self-promotion or other
                                                    prohibited self-role
                                                    change.

  Last admin                One of multiple active  The only active admin is
                            admins is               demoted/revoked.
                            demoted/revoked.        

  Audit integrity           Valid transition        Existing history is
                            creates a matching      edited/deleted or a
                            history event.          standalone invalid event
                                                    is created.

  Governance integrity      Counter changes by the  Direct counter write or
                            expected delta.         arbitrary count is
                                                    attempted.

  Atomicity                 All required writes     Role, history, or
                            commit together.        governance write is
                                                    omitted.

  Concurrency               Final state remains     Competing transitions
                            consistent after        create inconsistent
                            competing requests.     roles/history/counter.

  Bootstrap/recovery        Trusted initialization  Public client attempts
                            leaves reconciled       bootstrap or recovery.
                            state.                  

  Access bypass             Existing intended       Alternate matching
                            permissions work.       rule/path grants
                                                    unintended access.
  --------------------------------------------------------------------------

For concurrency tests, verify the final role documents, audit events,
and governance count---not only whether each request succeeded or
failed. Trusted Console bootstrap/recovery also needs a separate
operational checklist and reconciliation procedure.

## 7. Release blockers and fallback

Production release is blocked until the applicable Security Rules tests
and security review pass.

Required acceptance criteria:

-   Valid assignment, promotion, demotion, revocation, and reactivation
    behave as specified.
-   Invalid counter deltas and missing related writes are rejected.
-   Unauthenticated and unauthorized role changes are rejected.
-   Self-promotion and last-admin removal are rejected.
-   History editing/deletion and invalid standalone history events are
    rejected.
-   Direct governance writes and public bootstrap/recovery attempts are
    rejected.
-   Concurrent transitions leave a consistent final state.
-   Bootstrap/recovery reconciliation is documented and tested.
-   Active operators have exactly one admin-assigned `policeStationId`;
    self-assignment and cross-station access are rejected.
-   Admin all-station access is authorized and tested without weakening
    operator station isolation.
-   Rules access-call limits and alternate write paths are reviewed.

If Security Rules cannot reliably enforce counter consistency, audit
integrity, or last-admin protection, a **trusted backend for
role-management is a mandatory release requirement**, not an optional
future enhancement.

If a backend is used, it must implement authorization, validation,
atomic writes, and audit logging explicitly. Firebase Admin SDK
operations bypass Firestore Security Rules, so the backend must not rely
on Rules to protect its writes.

## 8. Bootstrap and recovery operational boundary

-   The first admin is initialized by a trusted Firebase project owner,
    not through a public client operation.
-   Emergency recovery is performed by a trusted project owner under a
    separately documented procedure.
-   Recovery must reconcile active admin role documents with
    `activeAdminCount`, record the recovery action, and run the
    applicable validation tests.
-   Security Rules cannot independently detect every incorrect state
    introduced through trusted Console operations.

## 9. Decision status summary

### Approved design direction

-   `operator` and `admin` are the existing approved roles; the SP-level
    read-only viewer role name and jurisdiction remain pending.
-   Protected `userRoles/{uid}` documents.
-   Revocation by setting `status: "revoked"`.
-   Append-only role-change history.
-   Singleton governance document with `activeAdminCount`.
-   Atomic role/history/governance updates as the intended protocol.
-   Manual trusted bootstrap and recovery.
-   No self-role changes and no removal/demotion of the last active
    admin.

### Pending validation

-   Exact Rules implementation and `getAfter()` checks.
-   Counter-delta enforcement and history coupling.
-   Bypass resistance, concurrency behavior, and access-call limits.
-   Correctness of bootstrap/recovery reconciliation.
-   Emulator test results and security review.

### Release gate

No production deployment until required tests and security review pass.
If any critical invariant cannot be reliably enforced with Rules,
trusted backend role-management must be implemented and tested before
release.

------------------------------------------------------------------------

**Document status:** Architecture decision record for planning. It is
not evidence that code, Security Rules, Emulator tests, or deployment
have been completed.
