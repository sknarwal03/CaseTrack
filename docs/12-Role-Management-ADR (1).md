# ADR: Role Management & Authorization

> Reconciled on 2026-10-18 with `13-Police-Station-Isolation-ADR.md`. Admin has all-station FIR/proceeding access. Local implementation and emulator validation are recorded in §10; production verification remains pending. For Admin, SP/Senior Officer, and approved-role boundaries, see [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).

-   **Status:** Approved design; local implementation and isolated
    security validation complete in part; production verification pending
-   **Document:** `12-Role-Management-ADR.md`
-   **Project:** CaseTrack
-   **Scope:** Role management for the approved `operator` and `admin` roles. SP/Senior Officer overview-only access is a separate confirmed access direction; its role identifier and jurisdiction representation remain pending. A separate Read-Only User role is not approved at this stage.

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
                                      workflows and correct FIR identity only
                                      for FIR Masters owned by their assigned
                                      police station.

  Station-scoped authorization        Required. Operators are restricted to
                                      their single admin-assigned station.
                                      Admin has all-station FIR/proceeding
                                      access. SP/Senior Officer access is
                                      limited to aggregate overview/statistics
                                      within an authorized jurisdiction; its
                                      role identifier, jurisdiction
                                      representation, authorization model,
                                      and secure aggregation mechanism remain
                                      pending.

  Current implementation state        Root Functions source includes Admin-
                                      authorized station/user management
                                      and role-transition endpoints. Deployed
                                      state remains unverified; see §10 and
                                      the production-readiness report.
  --------------------------------------------------------------------------

### 2.1 Role permission boundary

- `operator`: one admin-assigned `policeStationId`; FIR/proceeding create,
  read, update, and delete are restricted to that station.
- `admin`: role management and Police Station Master management, plus
  FIR/proceeding access across all stations. This is the user's approved
  design choice; it is not evidence that current code or Rules enforce it.
- **Approved FIR identity-correction policy (2026-10-20):** Admin may
  correct FIR number/year identity for any FIR Master across all police
  stations, subject to the existing active-role and station validity
  checks. An Operator may correct identity only for an FIR Master whose
  existing `policeStationId` equals that Operator's active, admin-assigned
  `policeStationId`. The corrected identity must retain that same stable
  station ID; identity correction does not transfer station ownership.
- **Security constraints:** The trusted callable must authorize from the
  current `userRoles/{uid}` record and existing FIR Master inside the
  Firestore transaction, derive the identity claim key server-side, reject
  duplicate claims, and atomically update the Master and old/new claims.
  Operators cannot create, update, or delete claim documents directly.
  Frontend checks are usability only and are not an authorization boundary.
- SP-level read-only viewer: required as a product direction for authorized
  aggregated overview reports/statistics only within an explicitly
  authorized jurisdiction. It must not provide individual FIR or
  proceeding details or writes. The exact role identifier, jurisdiction
  representation, authorization model, and secure aggregation mechanism
  remain unresolved. Do not silently grant this access to `admin` or
  assume an SP/Senior Officer can access every station.
- A separate multi-station `Read-Only User` role is not approved; the
  currently approved role identifiers remain `operator` and `admin`.

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

-   `operator` and `admin` are the only currently approved role
    identifiers. SP/Senior Officer access is limited to aggregate
    overview reports/statistics within an authorized jurisdiction; its
    role identifier, jurisdiction representation, and secure aggregation
    mechanism remain pending. A separate Read-Only User role is not
    approved. See
    [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).
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

**Document status:** Architecture decision record. The approved policy
remains authoritative; current source implementation and test status are
recorded in §10 and the Production Readiness and Security Report. No
deployed production state is asserted.

## 10. Implementation status update (2026-10-20)

Root `functions/` now contains trusted Admin Panel endpoints for access resolution, user-role listing, station listing/creation, Operator provisioning, invitation resend, recovery, and role transitions. The website uses Functions endpoints for the owner-approved `casetrack-97a4e` in normal mode; emulator routing remains explicit.

**Approved Operator credential decision:** Admins do not select, view, store, or receive Operator passwords. The trusted Function provisions an Operator without a password, creates a cryptographically random 256-bit setup token, stores only its SHA-256 hash, and delivers a 24-hour, one-time link through SendGrid. The token is carried in the URL fragment so browsers do not send it in the page request or Referer header. The setup page submits it to a trusted Function; that Function verifies the current active/enabled Operator role, atomically claims the token, and sets the password with Firebase Admin SDK. Resend replaces the hash and revokes the prior link. Recovery uses the same non-enumerating, rate-limited flow. Firebase Auth's native password-reset endpoint cannot consume the custom token, preventing it from bypassing resend revocation. The plaintext token is not stored or logged; only the intended email recipient and setup page receive it. The implementation and emulator/browser evidence are recorded in [the Production Readiness and Security Report](./25-Production-Readiness-and-Security-Report.md).

The owner-approved Firebase project is `casetrack-97a4e`, and the Functions region is `us-central1`. Live read-only verification found GitHub Pages in Firebase Auth's authorized domains, but the currently published Admin Panel and setup pages return 404. The live Firestore Rules are broader than the candidate policy. Production Functions/Secret Manager APIs, SendGrid credentials/sender, recoverable backups and Rules compatibility must be resolved before release. The project owner authorized the production release; the current deployment gate and evidence are in the Production Readiness and Security Report.
