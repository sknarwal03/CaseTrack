# CaseTrack Admin Panel Security Implementation Plan

## Document status

- **Status:** A non-privileged Admin Panel shell prototype exists; its navigation and client-side access check are not production authorization.
- **Scope:** Isolated role-management and station-authorization security prototype.
- **Prototype location:** `security-prototypes/role-management/`
- **Production status:** No production Rules, application code, Firebase data, or deployment is in scope.
- **Related decisions and evidence:** `docs/12-Role-Management-ADR (1).md`, `docs/13-Police-Station-Isolation-ADR (1).md`, `docs/13-Role-Management-Feasibility-Test-Plan.md`, and `docs/14-Role-Management-Initial-Feasibility-Results.md`.

This plan separates repository observations, approved architecture decisions, proposals, assumptions, and unresolved questions. Repository findings below are scoped to the snapshot inspected for this plan and do not establish that files or configurations are absent elsewhere. The shell’s baseline build and local default-deny emulator tests have passed. The emulator baseline does not verify role transitions or station isolation.

## 1. Purpose and scope

The purpose of the future prototype is to determine which approved CaseTrack role-management and station-isolation invariants can be enforced reliably by Firestore Security Rules, and which require a trusted backend or privileged operational procedure.

The prototype is confined to a local Firebase Emulator and a separate directory. It will not change the main application, production Firestore Rules, Firebase records, deployed configuration, or production services.

The prototype covers:

- `admin` and `operator` role authorization.
- Role assignment, promotion, demotion, revocation, and reactivation.
- Append-only role history and governance-counter updates.
- Self-role-change prevention and last-admin protection.
- Operator station isolation and admin all-station access.
- Trusted bootstrap and recovery boundaries.
- Adversarial Rules tests, including direct document reads, queries, concurrent transitions, and bypass paths.

SP-level viewer permissions are outside this prototype. Their role identifier and jurisdiction remain unresolved in the station-isolation ADR.

## 2. Confirmed existing state

The following are repository observations from read-only inspection of the repository snapshot available on 2026-10-18. They do not establish the deployed Firebase or production Rules state, nor prove that an item absent from this snapshot does not exist elsewhere.

- The login flow uses Firebase email/password sign-in.
- The shared page layout redirects unauthenticated users to the login page.
- The shared profile label is hard-coded as “Administrator”; it is not derived from `userRoles/{uid}`.
- The case editor reads `userRoles/{uid}` and checks role, status, and `policeStationId` in some case workflows.
- Case/FIR code contains both `policeStation` display names and `policeStationId` values.
- The repository inventory contains `firestore.test.rules`, which grants broad access to authenticated users. It is configured as test Rules and is not evidence of production Rules.
- No production `firestore.rules` file was found in the repository file inventory inspected for this plan. This is limited to that snapshot and does not establish whether such a file exists elsewhere or what Rules are deployed.
- A static Admin Panel shell and admin-only navigation entry now exist in the main application. The shell checks for a signed-in user with `role: "admin"` and `status: "active"` in `userRoles/{uid}`; it does not require `policeStationId` and exposes no privileged operations.
- The `userRoles` collection query is not enabled. The repository has no verified production Rules file. `firebase.test.json` selects `firestore.test.rules`, whose catch-all allows any authenticated client to read/write non-`cases` collections, including `userRoles`; this is explicitly test configuration and would be unsafe as an authorization basis. The separate role-management prototype Rules deny all client access. Neither file establishes deployed production permissions or authorizes a broad client query.
- The Admin Panel contains a read-only Users table structure for UID (document ID), role, status, and `policeStationId`, with loading, empty, read-error, and blocked UI states. It does not query user roles or enumerate Firebase Authentication profiles while production read authorization is unverified.
- Existing application use of `userRoles/{uid}` reads individual role documents for the current user’s workflow; it does not demonstrate authorization for listing the collection or reading other users’ role records.
- The isolated role-management prototype's baseline tests cover default-deny access only. They do not test role transitions, history/governance coupling, last-admin behavior, or station isolation.

The feasibility report records **prior prototype findings**: in the experimental Rules it tested, promotion was allowed without a history event, and the governance counter could be incremented without a role transition. These are not findings about the current application or production Rules. The referenced experimental files are not evidence of current production behavior, and the results have not been rerun for this plan.

There is an unresolved documentation/snapshot discrepancy: `docs/13-Role-Management-Feasibility-Test-Plan.md` §10 and `docs/14-Role-Management-Initial-Feasibility-Results.md` Safety boundary say a deny-all `firestore.rules` placeholder was verified or should be kept in place, while the later repository inventory inspected for this plan did not contain that file. The documents do not establish whether they refer to the same snapshot or location. Neither statement establishes the deployed production Rules; verify repository provenance separately before relying on either as a current local baseline.

## 3. Approved decisions

The following items are approved architecture direction in the related ADRs; they are not claims of current implementation:

- Roles are `admin` and `operator`.
- Role documents use `userRoles/{uid}`.
- Role status is `active` or `revoked`; revocation retains the document.
- Role changes should create append-only history at `userRoles/{uid}/history/{eventId}`.
- Role, corresponding history, and governance-counter updates are intended to commit atomically.
- Governance uses `systemControl/adminGovernance` with an `activeAdminCount`.
- Users cannot change their own roles.
- The last active admin cannot be demoted or revoked.
- First-admin bootstrap and emergency recovery remain controlled by a trusted project owner.
- An operator has exactly one admin-assigned stable `policeStationId`.
- Operators are limited to their assigned station.
- Admin has FIR/proceeding access across all stations and manages roles and the Police Station Master.
- Stable station IDs, rather than editable station names, are the authorization key.
- Ambiguous legacy station ownership must not be guessed.

The ADRs also state that implementation and security validation remain pending.

## 4. Proposed architecture

### 4.1 Isolated prototype structure

Proposed future directory:

```text
security-prototypes/role-management/
  README.md
  firebase.json
  firestore.rules
  package.json
  tests/
    role-management.rules.test.js
    station-isolation.rules.test.js
    fixtures.js
```

All prototype-only code, Rules, tests, and dependencies must remain inside this directory. The prototype must not import the main application Firebase configuration or deploy configuration.

### 4.2 Test environment

Use a fixed demo project ID such as `demo-casetrack-role-prototype`, with local Auth and Firestore Emulator endpoints only.

Prerequisites:

- Confirm compatible Firebase CLI, Node, Emulator, and Rules Unit Testing versions.
- Use Rules Unit Testing utilities for authenticated and unauthenticated request contexts.
- Seed and clear fixtures with privileged test setup, never through public client permissions.
- Make test startup fail closed if the project ID or emulator endpoints are not the expected local values.
- Do not configure a production project, production credentials, or production data.
- Do not provide a production deployment target or run `firebase deploy`.
- Record Emulator/runtime versions, Rules debug output, and access-call-limit failures.
- Clear emulator state between independent tests.

### 4.3 Proposed data model

Role path: `userRoles/{uid}`

Expected fields include:

- `role`: `operator` or `admin`
- `status`: `active` or `revoked`
- `policeStationId`: required for an active operator; not used to scope admin access
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy`

History path: `userRoles/{uid}/history/{eventId}`

Expected fields include:

- `action`
- `previousRole`
- `newRole`
- `actorUid`
- `occurredAt`
- Optional `reason`

Governance path: `systemControl/adminGovernance`

Expected fields include:

- `schemaVersion`
- `activeAdminCount`
- Creation and update metadata

The exact schemas, allowed extra fields, reactivation action, and event-ID convention must be decided and tested before implementation is considered complete.

### 4.4 Proposed Rules shape

Start with default deny. Add explicit Rules matches for:

- Role documents.
- Role history.
- Governance.
- Police Station Master documents.
- Minimal FIR/proceeding fixture collections.

Rules should validate the actor, target, allowed schema and state transition, station ownership, and all required resulting documents. History edits/deletes and public bootstrap/recovery writes must be denied.

Use `get()` and `getAfter()` only for known paths and record their access-call cost. Do not assume that an atomic batch is valid merely because all writes commit together; Rules must reject incomplete or inconsistent batches.

## 5. Security analysis and limitations

### 5.1 Invariants that Rules may enforce, subject to tests

Rules can inspect the authenticated UID, validate a known role document, reject self-role changes, validate role schemas and transition states, deny history edits/deletes, and compare a known record's stable station ID with a known operator assignment.

Rules can inspect known document state before and after an atomic write. A Rules-only transition design may be viable if Rules can reliably couple all required role, history, and governance changes and if adversarial and concurrency tests pass.

### 5.2 Invariants requiring trusted state or procedure

Rules cannot enumerate every `userRoles` document and independently recalculate the global count of active admins. The governance counter therefore depends on:

- Correct trusted bootstrap/recovery state.
- Every permitted role transition preserving the counter.
- No unreviewed privileged writes that introduce drift.
- Detection and reconciliation of counter drift.

Console operations and Admin SDK writes bypass Firestore Rules. Bootstrap and recovery require a trusted, separately documented procedure. A backend using Admin SDK must enforce authorization, validation, atomic updates, and audit logging itself.

### 5.3 Unresolved Rules-only risks

- `getAfter()` inspects a specified resulting document path; it cannot enumerate arbitrary newly created history events.
- A deterministic history event path may allow Rules to inspect a known event, but repeat transitions, collisions, event reuse, and concurrent requests must be tested.
- An atomic Firestore batch does not by itself require that every intended write be present.
- The governance counter is not independently authoritative if privileged writes or alternate client paths can bypass its protocol.
- Competing last-admin transitions may appear valid against stale state. Test transaction retries, concurrent batches, final role states, event records, and counter values.
- Rules document-access-call limits may constrain the complete transition and station checks. Measure the actual operation rather than assuming calls are free or cached.
- Queries must be shaped so Rules can prove that every returned record is authorized. Rules do not filter unauthorized query results.
- Missing or inconsistent station IDs cannot safely be inferred from display names. Such records should remain inaccessible until reviewed and mapped.

### 5.4 Trusted-backend decision condition

A trusted backend is required before production release if Rules cannot reliably enforce counter consistency, history coupling, or last-admin protection. It is also required if access-call limits, concurrency behavior, or bypass paths prevent complete enforcement.

The backend must not rely on Rules to protect Admin SDK writes. It must authenticate and authorize the actor, validate old/new role state and station assignments, atomically write role/history/governance state, and record audit evidence.

## 6. Implementation phases

### Phase 0: Isolation and threat model (may proceed)

- Fix the demo project ID and local Emulator endpoints.
- Fail closed on unexpected configuration.
- Document trusted and untrusted actors, write paths, and privileged operations.
- Confirm the prototype has no production deploy path.
- Keep the main application and its configuration untouched.

### Phase 1: Default-deny harness (may proceed)

- Create prototype-only Rules and Rules Unit Testing harness.
- Add explicit document matches and minimal fixtures.
- Verify baseline denials for unauthenticated, missing-role, revoked-role, and unknown paths.

Phases 0 and 1 are limited to isolated Emulator scaffolding and baseline denial checks. They do not authorize changes to the main application, production Rules, Firebase data, or deployment configuration.

### Phase 2: Station authorization

- Seed two stations, operators assigned to separate stations, and an admin without a station assignment.
- Add role-aware Rules for minimal FIR/proceeding records.
- Test direct document access, queries, creates, updates, deletes, forged station IDs, and ownership changes.
- Treat missing or inconsistent station IDs as denied.

### Phase 3: Role transitions (blocked pending technical validation)

- Add each transition individually: assign, promote, demote, revoke, reactivate.
- Require role, history, and governance effects to be atomic and mutually consistent.
- Derive counter delta from old/new role states; never trust a client-provided delta.
- Test omitted writes, incorrect values, invalid fields, and unauthorized actors.

Role-transition Rules remain experimental and blocked from acceptance until the history-event path, governance coupling, and access-call feasibility have been validated. Any candidate Rules created solely to test these questions must remain prototype-only and must not be treated as an approved or production-ready implementation.

### Phase 4: History-path feasibility

- Select candidate deterministic event-ID conventions.
- Test repeat events, duplicate IDs, collisions, event reuse, mismatches, and concurrent transitions.
- If Rules cannot require the matching history event, mark Rules-only audit coupling as failed and evaluate a trusted backend.

This phase is a design/feasibility gate for Phase 3, not authorization to implement role-management Rules in the main application.

### Phase 5: Last-admin and concurrency (blocked pending technical validation)

- Seed reconciled one-admin and two-admin states.
- Test demotion/revocation of the only admin and of one among multiple admins.
- Seed exactly two active admins with a reconciled `activeAdminCount` of 2. Create two independent authenticated request contexts, each acting as a different admin, and concurrently attempt to demote or revoke the other admin so both operations would remove one admin.
- Repeat the same race a fixed 100 times, resetting fixtures to the identical initial state before each iteration. Record emulator/runtime versions and both request outcomes for every iteration.
- After each race, inspect all affected role documents, all corresponding history events, and `systemControl/adminGovernance`. Assert that no successful transition lacks exactly one matching history event and the correct counter update; rejected transitions leave no partial writes; the final state has at least one active admin; and the counter equals the expected count for the fixture.
- Add a separate race with competing transitions against the same target to check duplicate/reused history IDs and counter consistency. Record outcomes and inspect final role/history/governance state after each iteration.
- If correctness depends on a counter that cannot be preserved through every tested path, require a trusted backend.

This phase is a prototype feasibility gate. Last-admin Rules must not be accepted for production or main-application use unless the repeated race and all associated transition tests pass review. Passing 100 emulator iterations is evidence for those test scenarios, not proof of correctness for every possible execution.

### Phase 6: Adversarial and access-call review

- Test direct writes, alternate paths, malformed paths, standalone history, arbitrary governance updates, broad queries, and bypass attempts.
- Record Rules debug output and document-access-call-limit behavior.
- Request independent Rules/security review.

### Phase 7: Record feasibility decision

- Record passed, failed, and untested invariants.
- State reliance on bootstrap/recovery correctness and trusted privileged operations.
- Do not infer production readiness, deployment authorization, or data-migration authorization from prototype results.

## 7. Positive and negative test matrix

For each case, record fixture, actor, request shape, expected result, actual result, final state, Emulator/runtime version, and relevant Rules debug/access-call evidence.

| Area | Positive test | Negative/adversarial test |
|---|---|---|
| Authentication | Active admin makes authorized request | Unauthenticated request; missing or revoked role |
| Role assignment | Admin assigns another user as operator | Operator assigns or promotes a user; self-assignment |
| Schema | Valid role, status, timestamps, and fields | Invalid enum, malformed timestamp, prohibited or extra fields |
| Promotion | Operator becomes admin with correct event and +1 count | Missing history, missing governance, wrong delta, self-promotion |
| Demotion | Admin becomes operator while another admin remains | Sole admin demotion; missing event or counter update |
| Revocation | Operator/admin revocation with correct state and delta | Unauthorized revocation; sole-admin revocation |
| Reactivation | Revoked user reactivated with explicit event and correct delta | Unauthorized reactivation; missing or mismatched event |
| History | Matching event created with valid transition | Standalone create, duplicate/reused ID, edit, delete |
| Governance | Correct derived delta | Arbitrary count change; direct counter update without role change |
| Atomicity | Complete valid transition commits | Omit each required write and assert no partial state |
| Self-change | Admin changes a different user | Self-promotion, demotion, revocation, or reactivation |
| Last admin | One of multiple admins removed | Sole admin removed; stale counter; concurrent removals |
| Operator read | Assigned-station document/query is allowed | Cross-station direct read; unconstrained query; revoked/unassigned actor |
| Operator write | Assigned-station create/update/delete is allowed | Forged create ID, ownership change, cross-station update/delete |
| Admin access | Admin accesses records from both stations without assignment | Ensure the same grant is not available to operators |
| Legacy ownership | Record with verified stable station ID is authorized | Missing, null, conflicting, or name-only station ownership |
| Bootstrap/recovery | Trusted fixture creates reconciled state | Public or ordinary-client bootstrap/recovery |
| Alternate path | Approved operation succeeds | Direct write, malformed path, alternate collection, overly broad grant |
| Concurrency | Final roles/history/counter remain consistent | Competing stale or last-admin transitions |
| Rules limits | Full operation stays within Rules access limits | Complete transaction/batch exceeds limits |

## 8. Acceptance criteria

Do not call the Rules-only design secure until all relevant tests pass and have been independently reviewed.

Minimum prototype acceptance:

- All required positive and negative tests pass in the isolated Emulator.
- Rejected operations leave role, history, governance, and affected records unchanged.
- Accepted transitions create the required matching history and counter effects.
- Self-role and self-assignment changes are denied through direct and batch paths.
- Last-admin demotion/revocation is denied, including concurrency tests.
- History is append-only and cannot be created as an unrelated standalone event.
- Governance cannot be updated independently and uses the derived delta.
- Operators cannot access or change cross-station data through direct reads, queries, or writes.
- Admin all-station access works without requiring station assignment and without widening operator access.
- Records with missing or inconsistent station IDs do not grant access.
- Full operations remain within Rules access-call limits.
- Bootstrap/recovery limitations and counter reconciliation are documented.
- An independent security review has no unresolved critical findings.

Passing finite emulator tests demonstrates only the tested cases; it does not prove every production state, privileged write, or race is safe.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Experimental Rules accidentally deployed | Keep prototype separate, omit deploy target, fail closed on project ID, prohibit production configuration |
| Role transition omits history or governance | Test missing-write batches and require Rules coupling or move transition to trusted backend |
| Arbitrary history ID cannot be checked | Evaluate deterministic path convention; require backend if reliable coupling is not enforceable |
| Governance counter drifts | Trusted bootstrap/recovery reconciliation, audit procedure, and backend fallback |
| Concurrent changes remove last admin | Race tests and serialized trusted operation if Rules-only behavior is not demonstrated |
| Query or direct-read bypass | Test both query and document paths against stable station ownership |
| Forged station IDs | Derive authorization from role assignment and require record ownership checks on create/update |
| Legacy data has ambiguous station | Keep unavailable until a reviewed mapping exists |
| Privileged operations bypass Rules | Restrict trusted operators, document recovery, record evidence, and revalidate state |
| Test project misconfiguration | Startup checks for fixed demo ID and local Emulator endpoints |

## 10. Pending decisions

Resolve before implementation:

1. What deterministic history event ID/path convention can Rules validate for every transition?
2. How will repeated events, collisions, and event reuse be prevented?
3. Is a governance counter acceptable as the basis for Rules last-admin checks, given it cannot be globally recalculated by Rules?
4. What trusted party owns bootstrap/recovery and counter reconciliation?
5. Can the proposed transition use a client transaction safely, or must all role changes use a trusted backend?
6. What exact Police Station Master collection and minimum schema will the prototype use?
7. How should legacy records with missing or conflicting station IDs be represented and denied?
8. Which query shapes and data collections are in the station-isolation test scope?
9. What Rules access-call budget is available for the complete transition?
10. Should the prototype remain limited to `admin` and `operator`? This plan assumes yes; SP viewer remains out of scope.

## 11. Release blockers

Do not promote the prototype design into production if any of these remain:

- History can be omitted, mismatched, edited, deleted, or duplicated outside the approved transition protocol.
- Governance can be changed independently or by an incorrect delta.
- Self-role changes or last-admin removal can bypass Rules.
- Concurrent changes leave inconsistent role, history, or governance state.
- Rules access-call limits prevent all required checks.
- Operators can read or write another station’s records through any path.
- Missing/inconsistent legacy station ownership is exposed without reviewed mapping.
- Bootstrap/recovery authority and reconciliation are undocumented.
- Production Rules and Firebase project mapping have not been independently verified.
- Required security review has not passed.

If Rules cannot reliably enforce history coupling, counter consistency, or last-admin protection, implement and test a trusted backend before production role management. Admin SDK writes bypass Rules, so the backend must enforce the entire protocol itself.

## 12. Implementation and verification status

- **Plan status:** The local Admin Panel prototype includes Users listing, Police Station Master create/list, and Operator account creation with station assignment. These remain local prototype flows, not production authorization.
- **Local bootstrap:** The missing role for `admin@example.test` was initialized in `demo-casetrack-role-prototype` using a separate, verified, explicitly approved bootstrap actor. Role, initial `assigned` history event, and governance count were written atomically. Readback confirmed the governance count of 2 matched the validated active Admin role records. Bootstrap details and recovery boundaries are recorded in `security-prototypes/role-management/OPERATOR-CREATION-IMPLEMENTATION.md`.
- **Admin access check:** Admin Panel navigation and Users access use the server-authorized local endpoint. The prototype Firestore Rules remain default-deny; the client does not gain direct role-list access.
- **Browser verification:** Authenticated browser checks verified Police Station Master create/list, Operator creation and Police Station assignment, and visibility of the new Operator in the existing Users table with active status and the expected station assignment. These results apply only to those flows; no other browser scenarios are claimed as passed.
- **Users section:** The local prototype lists existing role records through the Admin-authorized endpoint. It does not enumerate Auth profiles. This does not establish production authorization or enable a broad production client query.
- **Shell scope:** Admin-role transitions, revocation, rename, reassignment, password reset, invitation email, and cross-station data access are not implemented by this prototype.
- **Main application build:** Passed with `npm run build`.
- **Local emulator endpoint tests:** Operator Creation 12/12, Users listing 14/14, and Police Station Master 7/7 passed. These endpoint results do not validate role transitions, last-admin protection, or station isolation.
- **Rules and station-isolation tests:** Not run in the verification pass recording the endpoint results above. The default-deny baseline tests, when run, do not establish role-transition or station-isolation invariants.
- **Repository-root test script:** `npm test` failed because its `--test-isolation=none` discovery runs emulator-only prototype hooks across the regular test files without the required `GCLOUD_PROJECT`; the isolated prototype command above passes inside its Emulator harness.
- **Role transitions and station isolation:** Remain unverified; the baseline tests do not establish these invariants.
- **Production Rules/data/deployment:** Not accessed or changed.
- **Production authorization:** Blocked pending verified Firestore Rules or backend enforcement. Client-side role checks are not a security boundary.
- **Feasibility:** Unresolved pending adversarial role-transition and station-isolation tests and security review.
- **Operational recovery:** Admin bootstrap is a one-time local procedure requiring a separately verified and explicitly trusted actor. Reverify trust after emulator reset/reseed. Operator provisioning recovery depends on the ignored local HMAC key; losing it can prevent comparison/recovery of outstanding operations. Keep emulator credentials, tokens, journal data, and key out of documentation and production.
