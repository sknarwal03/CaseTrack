# CaseTrack --- Admin Panel and Operator Access System Specification

> **Document ID:** 15\
> **Status:** Planning specification --- proposed requirements, not
> implementation approval\
> **Version:** 1.0\
> **Prepared:** 2026-10-19\
> **Related documents:** `00-Project-Overview.md`,
> `11-Phase-1-Audit-Findings.md`, `12-Role-Management-ADR.md`,
> `13-Police-Station-Isolation-ADR.md`, and
> `14-Role-Management-Initial-Feasibility-Results.md`\
> **Scope:** Remote Admin Panel access, operator provisioning,
> police-station assignment, and operator login/dashboard\
> **Important:** This document does not establish that production
> authentication, authorization, Firestore Security Rules, deployment,
> or station isolation are already implemented or verified.

> **Initial-release scope update:** For the shortest safe Admin/Operator
> release sequence and current repository progress, see
> [`21-Admin-Panel-Initial-Release-Roadmap.md`](./21-Admin-Panel-Initial-Release-Roadmap.md).
> That roadmap supersedes this draft's phase ordering where it implies
> that SP/Senior Officer access or Operator station reassignment is an
> initial-release requirement. The confirmed access decisions remain in
> [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).

------------------------------------------------------------------------

## 1. Purpose

Define the target system so the project's coding agent can inspect the
existing repository and implement the required Admin-to-Operator
workflow without bypassing the approved role-management and
police-station-isolation decisions.

The intended outcome is that an authorized Admin can open the Admin
Panel over the internet from a supported browser, create an Operator
account, assign that Operator to one police station, and have the
Operator sign in with their own credentials and reach the Operator
Dashboard.

This is a requirements and planning document. The coding agent must
inspect the current code before deciding which components can be reused,
changed, or need to be built.

## 2. Target user journey

### 2.1 Admin journey

1.  The Admin opens the deployed CaseTrack web application from a
    browser, without starting a local development server.
2.  The Admin signs in using Firebase Authentication email/password
    credentials.
3.  The application verifies the signed-in user's trusted role through
    the approved backend/data model.
4.  The application routes an authorized Admin to the Admin Panel.
    Non-admin users must not gain access by typing the Admin URL
    directly.
5.  The Admin opens **Police Station Master** and selects an existing
    canonical station, or creates a station if that capability is
    approved and available.
6.  The Admin opens **Users / Operators**, enters the required operator
    details, provisions the account, and assigns exactly one police
    station.
7.  The system confirms success only after the trusted backend operation
    and required role/assignment writes have completed successfully.
8.  The Admin can view the Operator's account status, assigned station,
    and relevant audit history, subject to the approved permission
    model.

### 2.2 Operator journey

1.  The Operator opens the deployed CaseTrack URL from a browser.
2.  The Operator signs in with their own email/password credentials.
3.  The system resolves the account's active role and trusted station
    assignment.
4.  An active `operator` with a valid station assignment is routed to
    the Operator Dashboard.
5.  The dashboard and all protected data access are limited to the
    Operator's assigned `policeStationId`.
6.  An inactive, revoked, unassigned, or invalid account is denied
    protected access and shown a safe, understandable message.

### 2.3 Remote-access meaning

-   The source code may be maintained in GitHub, but **GitHub is not the
    authentication or database backend**.
-   The deployed frontend must be reachable over HTTPS from supported
    locations and devices.
-   The app must not depend on a developer's local Vite server, local
    files, or local Firebase emulators for normal remote use.
-   A public frontend URL is not itself a security boundary.
    Authorization must be enforced by trusted backend code and Firebase
    Security Rules.
-   Hosting provider and deployment method are not yet approved.
    Evaluate the existing repository and deployment setup before
    selecting GitHub Pages, Firebase Hosting, or another static hosting
    option. Do not assume GitHub Pages is suitable without checking
    application routing, environment configuration, deployment workflow,
    and backend integration.

## 3. Confirmed design constraints from related project decisions

The following constraints must be preserved unless the project owner
explicitly approves a change.

### 3.1 Roles and authorization

-   The initial approved role identifiers are `admin` and `operator`.
-   Admin retains all-station create/read/update/delete access to FIRs and
    court proceedings and does not require a single-station assignment.
-   SP/Senior Officer access is limited to aggregated overview,
    statistics, and summary reports within an explicitly authorized
    jurisdiction. It does not include individual FIR/proceeding details
    or writes. The role identifier, jurisdiction representation,
    authorization model, and secure aggregation mechanism remain
    pending.
-   A separate multi-station Read-Only User role is not approved at this
    stage; Operators remain assigned to exactly one station.
-   The role value and status must come from trusted role data, not from
    a client-controlled form field or local storage.
-   Role-management records and history must follow
    `12-Role-Management-ADR.md`.
-   Role changes are intended to update the role record, corresponding
    append-only history event, and governance counter/state atomically.
-   Users must not be able to grant, promote, revoke, or modify their
    own role through client requests.
-   Last-active-Admin protection and trusted bootstrap/recovery
    requirements must be retained.
-   The first Admin must be provisioned through a trusted, documented
    bootstrap/recovery procedure. Do not make a public "create first
    Admin" route or silently grant Admin to the first person who signs
    up.
-   An `operator` is assigned exactly one police station by an Admin.
    The Operator cannot self-assign or change that station.
-   Admin access across stations must follow the approved Admin
    permission model; do not automatically equate Admin with a future
    SP-viewer role.
-   Do not treat the SP/Senior Officer access direction as an
    implementation-ready role: the role identifier, jurisdiction
    representation, and secure aggregation mechanism remain pending.
    Do not expose individual case records as a means of producing
    summaries. A separate Read-Only User role remains unapproved.

These access boundaries are recorded in
[`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).

### 3.2 Police-station identity and data isolation

-   Use stable `policeStationId` values for authorization and
    relationships. Station display names must not be the authorization
    key.
-   One shared Firebase project with logical station isolation is the
    approved design direction.
-   FIR identity includes normalized FIR number, FIR year, and
    `policeStationId`.
-   UI filters alone do not provide station isolation. Firestore
    Security Rules and any trusted backend endpoints must enforce
    authorization for direct document access, queries, creates, updates,
    and deletes.
-   Do not automatically assign ambiguous legacy records to a station or
    merge uncertain legacy records.
-   Preserve existing document IDs and history unless a separately
    reviewed migration requires a change.

### 3.3 Existing implementation status

The supplied project context describes a local role-management prototype
with Admin Panel capabilities such as user listing, Police Station
Master, Admin bootstrap, `createOperator`, and station assignment. These
are prototype facts reported in project context; they do **not** prove
production readiness or that the current deployed application contains
or enforces these features.

The local prototype uses the demo project ID
`demo-casetrack-role-prototype` and emulator endpoints. It must not be
treated as the production environment. The production Firebase project,
deployment target, deployed functions, current production rules, and
migration status must be verified from repository/configuration evidence
before release.

## 4. Functional requirements

### FR-01 --- Remote web entry

-   Provide a stable HTTPS URL for the deployed CaseTrack application.
-   The URL must work without running `npm run dev` or a local emulator
    on the user's computer.
-   The deployment must use an explicitly selected production/staging
    Firebase configuration, never the local role-admin demo
    configuration.
-   A direct visit to a protected route must trigger authentication and
    authorization checks; hiding a menu item is insufficient.
-   Configure supported routes and refresh/deep-link behavior for the
    selected hosting provider.

### FR-02 --- Authentication

-   Use the project's established Firebase Authentication email/password
    flow unless repository inspection reveals a documented, approved
    alternative.
-   Provide clear loading, invalid-credential, disabled/revoked-account,
    and service-unavailable states without leaking sensitive account
    details.
-   Do not store plaintext passwords in Firestore, role records, logs,
    audit history, URL parameters, source control, or local storage.
-   Do not place service-account credentials, Admin SDK private keys, or
    other server secrets in frontend code or GitHub repository files.
-   Do not create an open self-registration path that can obtain
    privileged roles.
-   On logout, clear the active client session and return to the login
    route.

### FR-03 --- Trusted role resolution and routing

After sign-in, resolve the user's trusted role/status and station
assignment.

  -----------------------------------------------------------------------
  Trusted account state               Expected result
  ----------------------------------- -----------------------------------
  Active `admin`                      Route to Admin Panel

  SP / Senior Officer                 If separately provisioned after the
                                      role and jurisdiction design is
                                      approved, allow only aggregate
                                      overview/statistics/summary reports;
                                      no individual FIR/proceeding details
                                      or writes

  Active `operator` with valid        Route to Operator Dashboard
  `policeStationId`

  Revoked/inactive account            Deny protected access

  Operator with missing/invalid       Deny station data access; show a
  station assignment                  safe remediation message

  No valid role record                Deny protected access; do not infer
                                      a role from the email or UI state

  Role lookup/backend unavailable     Fail closed for protected routes;
                                      show retry/service-unavailable
                                      state
  -----------------------------------------------------------------------

The same authorization rules must apply when a user manually enters a
route or calls a backend endpoint directly.

### FR-04 --- Police Station Master

-   Admins can view the canonical Police Station Master.
-   Station records must have stable IDs and canonical display names.
-   Operator assignment must store the stable `policeStationId`, not
    just the station name.
-   The UI must distinguish active/selectable stations from any station
    that should no longer be assigned, if station lifecycle support is
    present or approved.
-   Renaming a station must not silently change its identity or break
    existing relationships.
-   Before adding station creation, editing, deactivation, or
    alias-history workflows, inspect the current schema and related
    decisions. Do not invent fields or migrate existing station records
    without review.

### FR-05 --- Create Operator

The Admin Panel must provide an operator-creation workflow with
validation and an unambiguous result.

Minimum business inputs to evaluate against the existing schema: -
Operator display name, if required by the current user profile model. -
Email address used as the login identifier. - Required initial
credential/provisioning method, to be decided and implemented safely. -
Exactly one station selected from the canonical Police Station Master.

Required behavior: 1. Validate input before submitting. 2. Call a
trusted backend operation that verifies the caller is an active Admin.
3. Create the Firebase Authentication account using a server-side Admin
SDK or another approved trusted provisioning flow. 4. Create the trusted
role record with role `operator`, active status, and the chosen
`policeStationId`. 5. Record the required append-only audit/history
event and maintain governance invariants as defined by the
role-management ADR. 6. Handle partial failures and retries safely. A
failed operation must not silently leave an account with ambiguous
privileges or a misleading "success" message. 7. Avoid duplicate account
creation and provide a safe recovery path if Auth creation succeeds but
a subsequent data write fails. 8. Return only the minimum information
needed by the Admin Panel. Never return service secrets. 9. Do not log
or persist plaintext passwords.

**Approved product decision (2026-10-19):** after account creation, the
Operator sets their own password using a one-time setup link. The Admin
must not need to view or set the Operator's password.

Implementation update (2026-10-20): The trusted Functions backend
creates an Operator without a password and sends a custom 256-bit,
one-time setup token through SendGrid using the server-only
`SENDGRID_API_KEY` secret. The token is stored only as a SHA-256 hash,
expires after 24 hours, and is carried in the URL fragment rather than
the HTTP request. The setup page sends it to a trusted Function, which
checks current Operator authorization, claims it transactionally, and
sets the password with Firebase Admin SDK. Resending replaces the hash
and revokes the previous link. The Firebase Auth native password-reset
endpoint cannot accept this token. Recovery returns the same response
for unknown addresses, is rate-limited, and targets active Operators.

The custom link does not use Firebase Auth's password-reset action
handler or continue-URL setting. Production still requires a verified
SendGrid sender, `SENDGRID_API_KEY` in Secret Manager, the approved site
origin in the Functions CORS allowlist, and the current setup-page URL
in `OPERATOR_SETUP_URL`. No token is logged or stored in plaintext.

### FR-06 --- Assign or change an Operator's station

-   The Admin can assign one valid station when creating an Operator.
-   Operators remain assigned to exactly one station.
-   The Operator must not be able to change the assignment by editing
    client state, Firestore documents, request payloads, or URL
    parameters.
-   Operator station reassignment is deferred and excluded from the
    initial release. Do not add a reassignment control or endpoint.
    Any future reassignment requires a separate approved design,
    including immediate access changes, session revalidation, audit
    history, and record-transfer handling.

### FR-07 --- Admin user management

Inspect the existing prototype before finalizing the available actions.
The expected Admin view should, where supported by approved decisions,
show: - Display name / login email. - Trusted role and account status. -
Assigned police station for Operators. - Created/updated metadata
available under the current schema. - Relevant role and assignment
history.

Any promote, demote, revoke, reactivate, or delete action must follow
the role-management ADR and its safeguards. Do not add destructive
actions merely because they are easy to implement. Account deletion,
role revocation, and data retention are distinct operations and must not
be conflated.

### FR-08 --- Operator Dashboard

-   Provide a dedicated Operator Dashboard route after successful role
    resolution.
-   Show the signed-in user's identity and assigned station clearly.
-   All FIR/proceeding queries and writes must be scoped to the trusted
    `policeStationId`.
-   UI filters are for usability only; authorization must also be
    enforced by Firestore Security Rules and trusted backend endpoints.
-   Prevent cross-station reads and writes even if the Operator alters
    document IDs, query parameters, browser state, or API requests.
-   Reuse the existing CaseTrack FIR Master and linked court-proceeding
    workflows where compatible. Do not redesign those workflows as part
    of Admin Panel work without a separate request.
-   If no station is assigned or the assignment cannot be verified, do
    not show protected records.

### FR-09 --- Auditability

-   Role and station-assignment changes must create append-only history
    events according to `12-Role-Management-ADR.md`.
-   History events must identify the actor, target, action, timestamp,
    and relevant before/after values where approved by the schema.
-   Never include passwords, tokens, or other credentials in audit
    history.
-   The client must not be able to edit or delete historical events.
-   A UI history panel is optional unless the existing prototype already
    provides it; backend integrity and security are required regardless.

### FR-10 --- Error handling and operational feedback

-   Show success only after the trusted operation has completed and
    required invariants are satisfied.
-   Display actionable, non-sensitive messages for validation failures,
    duplicate email, invalid station, permission denial, unavailable
    backend, and retryable errors.
-   Avoid raw stack traces, secrets, tokens, or internal sensitive
    details in the browser.
-   Provide safe retry behavior and prevent accidental duplicate
    submissions.

## 5. Target architecture

The following is the target architecture direction. The coding agent
must verify the repository and propose any necessary changes before
implementation.

1.  **Frontend:** CaseTrack web application and Admin/Operator routes,
    deployed to a stable HTTPS host.
2.  **Authentication:** Firebase Authentication email/password.
3.  **Trusted authorization data:** Existing role model such as
    `userRoles/{uid}`, according to the approved role-management ADR.
4.  **Trusted provisioning and privileged operations:** Cloud Functions
    or another approved server-side component using Firebase Admin SDK.
    The server must verify the caller's ID token and current Admin
    authorization before performing privileged actions.
5.  **Data store:** Existing Firestore project and schema, with station
    ownership enforced by Security Rules and trusted backend validation.
6.  **Hosting and deployment:** CI/CD may use GitHub as the source
    repository, but secrets must be stored in an appropriate deployment
    secret store and production deployment must be explicit and
    reviewable.
7.  **Environments:** Local emulator, staging, and production
    configurations must be clearly separated. A local demo project ID or
    emulator endpoint must never be accidentally deployed as production
    configuration.

### 5.1 Hosting decision remains open

Do not assume that simply pushing code to GitHub makes the Admin Panel
available remotely. The selected deployment approach must answer: -
Where the frontend is hosted. - How HTTPS and route refreshes work. -
How environment-specific Firebase configuration is selected. - How
backend functions are deployed and versioned. - How access is restricted
by application authorization even if the frontend URL is public. - How
rollback works. - How production configuration is protected from
accidental changes.

The coding agent should recommend a hosting approach based on the
current repository and existing deployment setup, but should not deploy
to production without explicit approval.

## 6. Security requirements and release gates

These are mandatory release gates, not optional UI enhancements.

### 6.1 Trusted backend authorization

-   Every privileged function must authenticate the caller and verify
    that the caller is currently an active Admin.
-   Do not trust a role, station ID, email, or Admin flag supplied by
    the browser.
-   Re-check current authorization on each privileged request; do not
    rely solely on a role cached at login.
-   Validate all request fields and reject unexpected role values or
    station IDs.
-   Apply least privilege to backend service accounts and deployment
    credentials.

### 6.2 Firestore Security Rules

For the initial Admin/Operator release, tests must demonstrate:
unauthenticated clients cannot read or write protected records;
Operators can access only records belonging to their assigned station,
including through direct document paths, queries, and crafted writes;
Operators cannot change their own role or station assignment; clients
cannot write arbitrary role/history/governance data; revoked or
unassigned users lose protected access; and Admin has all-station
FIR/proceeding CRUD without widening Operator access.

SP/Senior Officer access is explicitly deferred and must not block this
release. Do not provision that access path or grant it to either
approved role. Before a later SP release, its role identifier,
jurisdiction representation, and secure aggregation mechanism must be
specified, and direct-document/query denial plus aggregate-only behavior
must be independently tested.

### 6.3 Admin lifecycle safeguards

-   First-Admin bootstrap and recovery must be trusted, documented, and
    not publicly callable.
-   Protect the last active Admin from accidental demotion/revocation.
-   Enforce atomic role/history/governance updates according to the ADR.
-   Test retries and partial failures for operator creation and station
    assignment.
-   Ensure account provisioning does not leave an orphaned account with
    unintended access.
-   Keep append-only history protected against client edit/delete
    attempts.

### 6.4 Deployment safety

-   Never expose emulator ports to the public internet.
-   Never deploy the local `demo-casetrack-role-prototype` configuration
    as production.
-   Never commit service-account private keys or passwords.
-   Confirm production Firebase project ID, enabled Authentication
    providers, deployed Functions, Firestore Rules, indexes, and allowed
    web origins before rollout.
-   Use HTTPS only for remote production access.
-   Test the deployed build in a staging environment before production
    release.
-   Have a rollback plan and preserve current working changes; do not
    overwrite unrelated or uncommitted work.

## 7. Acceptance criteria

The system is not considered complete until all applicable criteria
below are verified.

### 7.1 Remote access

-   [ ] A stable HTTPS URL opens the deployed CaseTrack login page from
    a browser without a local server.
-   [ ] A direct refresh on login, Admin Panel, and Operator Dashboard
    routes works.
-   [ ] The deployed build uses the intended non-emulator Firebase
    configuration.
-   [ ] Production secrets are not present in frontend assets or
    repository history.
-   [ ] Local, staging, and production environments are distinguishable
    and correctly configured.

### 7.2 Authentication and routing

-   [ ] An active Admin can sign in and reach the Admin Panel.
-   [ ] An active assigned Operator can sign in and reach the Operator
    Dashboard.
-   [ ] An Operator cannot access Admin functions by manually entering
    Admin URLs or calling Admin endpoints.
-   [ ] A revoked, unassigned, or invalid-role account is denied
    protected access.
-   [ ] Logout and session expiry behave correctly.

### 7.3 Operator provisioning

-   [ ] An Admin can create an Operator using the approved secure
    credential-provisioning flow.
-   [ ] The account is assigned exactly one valid stable
    `policeStationId`.
-   [ ] The role record, audit history, and governance state remain
    consistent.
-   [ ] Duplicate submissions and partial failures are handled safely.
-   [ ] Passwords and tokens are absent from Firestore records, logs,
    history, and frontend code.
-   [ ] The Operator can use their own credentials to sign in
    successfully.

### 7.4 Station isolation

-   [ ] The Operator can access permitted records for their assigned
    station.
-   [ ] Cross-station reads and writes are rejected by Security
    Rules/backend checks, including direct-document and crafted-request
    tests.
-   [ ] Changing client-side station filters or payloads does not bypass
    authorization.
-   [ ] The Operator has exactly one trusted station assignment and
    cannot change it. Reassignment is not part of this release.
-   [ ] Existing ambiguous legacy records remain protected until
    reviewed and mapped.

### 7.5 Role-management integrity

-   [ ] Users cannot modify their own role or station assignment.
-   [ ] Unauthorized callers cannot invoke privileged functions.
-   [ ] Role/history/governance transitions are atomic or have a
    documented, tested recovery protocol consistent with the ADR.
-   [ ] Last-active-Admin protection works.
-   [ ] Trusted bootstrap/recovery is documented and tested.
-   [ ] Audit history is append-only and excludes credentials.

## 8. Implementation phases

Use the current, repository-grounded sequence in
[`21-Admin-Panel-Initial-Release-Roadmap.md`](./21-Admin-Panel-Initial-Release-Roadmap.md).
In summary: first establish and test the trusted Firestore authorization
boundary; then complete privileged backend lifecycle operations and
audit/last-Admin safeguards; wire fail-closed login/routing and the
Admin/Operator screens; validate existing case workflows against Rules;
and only then seek approval for isolated staging. Production deployment
and data changes remain separate approval gates. SP/Senior Officer work,
Operator reassignment, and nonessential reporting/polish are deferred.

## 9. Required coding-agent working rules

The coding agent must:

1.  Read this specification and the related role-management and
    station-isolation ADRs before changing code.
2.  Inspect the actual repository before claiming a feature exists or is
    missing.
3.  Preserve current uncommitted and unrelated changes.
4.  Separate confirmed facts, assumptions, proposals, implementation
    results, and verified test results.
5.  Work in one manageable phase at a time and report findings before
    major architecture, data, Rules, or deployment changes.
6.  Avoid production deployment, production data changes, account/role
    changes, emulator resets, or destructive migration without explicit
    approval.
7.  Never weaken authorization to make the UI appear to work.
8.  Update the project documentation after significant decisions and
    implementation changes.
9.  Report exact files changed, commands/tests run, results, and
    remaining blockers.
10. Never claim a test passed unless it was actually run and its result
    observed.

## 10. Open decisions

These remain open unless resolved in an existing approved project
document or by the project owner:

1.  **Hosting/backend direction:** GitHub Pages for the static frontend
    and a separately configured Firebase Functions backend are the
    recorded direction. No production Functions/Rules deployment is
    established by that decision.
2.  **Staging environment:** A separate staging Firebase project is
    required but does not currently exist; create/configure it only
    after the appropriate separate approval. Do not use production for
    development or tests.
3.  **Credential handoff:** Approved 2026-10-19: Operator sets their own
    password using a one-time setup link; Admin does not view or set it.
    Secure generation/delivery, single-use/time-limited validity,
    expired/used-link recovery, and Admin authorization/audit enforcement
    remain pending technical verification.
4.  **Operator profile fields:** Confirm required name/profile fields
    from the existing schema.
5.  **Deferred station lifecycle:** Renaming, deactivation, deletion,
    and aliases are not part of the initial Police Station Master
    workflow. Preserve stable IDs; decide lifecycle/history rules before
    adding those controls.
6.  **Deferred Operator station reassignment:** Excluded from initial
    release. Do not add reassignment or record-transfer behavior.
7.  **Account offboarding:** Initial release supports audited
    deactivation/revocation with Auth disablement, not hard deletion.
    Preserve role and assignment history.
8.  **Deferred SP/Senior Officer access:** Aggregate overview/statistics/summary
    access within an explicitly authorized jurisdiction is confirmed;
    exact role identifier, jurisdiction representation, authorization
    model, and secure aggregation mechanism remain undecided. Individual
    FIR/proceeding access and writes are not approved. A separate
    multi-station Read-Only User role is not approved. See
    [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).
9.  **Production migration:** How existing FIR/proceeding records with
    missing or ambiguous station ownership will be reviewed and mapped.

## 11. Current status snapshot

  ---------------------------------------------------------------------------
  Area                                Status based on available project
                                      context
  ----------------------------------- ---------------------------------------
  Role-management design              Approved design direction documented in
                                      `12-Role-Management-ADR.md`; production
                                      enforcement not proven

  Police-station isolation design     Approved design direction documented in
                                      `13-Police-Station-Isolation-ADR.md`;
                                      production enforcement not proven

  Local Admin Panel prototype         Source contains paginated role listing,
                                      Police Station Master list/create,
                                      and Operator creation/assignment tied
                                      to local demo emulators; not a
                                      production backend

  Local one-click launcher            Launcher files were reported as
                                      implemented; smoke test was blocked by
                                      a separate `role-admin-local` Vite
                                      process detected on `::1:5175` (PID
                                      13804 at the time of that test).
                                      Current process state must be rechecked

  Local emulator state                Previous read-only checks found an
                                      empty Auth/role state and missing
                                      loaded Functions in the demo
                                      environment; later probes reported
                                      Auth/Firestore HTTP health and
                                      Functions CORS preflight success. A
                                      complete current-state verification is
                                      still required

  Admin login                         Not verified in the reported smoke test

  Operator creation/login end-to-end  Not verified

  Production hosting/deployment       Not verified; hosting provider and
                                      authoritative production target require
                                      confirmation

  Production Rules and station        Not verified; mandatory release
  isolation                           blockers

  Production release                  Not approved by this document
  ---------------------------------------------------------------------------

## 12. Definition of done

The target workflow is done only when an authorized Admin can open the
deployed HTTPS application from a remote browser, securely provision an
Operator with a valid station assignment, and the Operator can sign in
using their own credentials to reach a station-isolated dashboard ---
with backend authorization, Firestore Rules, audit history, recovery
behavior, and tests demonstrating that unauthorized access is denied.

A working login page or successful UI flow alone is not sufficient
evidence of completion.
