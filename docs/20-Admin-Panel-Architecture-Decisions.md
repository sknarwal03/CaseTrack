# CaseTrack — Admin Panel Architecture Decisions

**Document status:** Confirmed decisions with implementation update recorded 2026-10-20\
**Scope:** Role scope, Admin cross-station permissions, SP/Senior Officer overview access, and Admin Panel backend boundary\
**Authority:** This record remains authoritative for the confirmed role decisions. The implementation update below records local source integration only; it does not establish deployment readiness.

## 1. Purpose and scope

This record formalizes confirmed architectural decisions and reconciles them with the existing role-management and police-station-isolation ADRs, Admin Panel specification, transition proposals, and audit documents.

The confirmed decisions below remain the policy authority. Current source implementation status is recorded in §9 and must not be confused with deployment verification.

The role and access decisions here apply to future Admin Panel planning. The project’s existing single-user operational scope remains as described in [00-Project-Overview(1).md](./00-Project-Overview(1).md).

## 2. Confirmed Decision 1 — Admin permissions

**Confirmed decision:** The existing `admin` role retains all-station create, read, update, and delete (CRUD) permissions for FIR and court-proceeding data.

- Admin can create, read, update, and delete FIRs and proceedings across all police stations.
- Admin does not require assignment to one police station.
- Admin continues to manage user roles and Police Station Master data according to the approved architecture.
- This retains the position already documented in [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md) and [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md).
- Admin’s all-station permission is not cross-station read-only access. Do not replace the approved CRUD scope with read-only permissions.

**Implementation requirement not yet verified:** Every Admin operation must be authorized by trusted role state and enforced at the relevant Firestore Rules or trusted-backend boundary. The existing ADRs’ release tests and security validation remain required.

## 3. Confirmed Decision 2 — SP / Senior Officer access

**Confirmed decision:** SP / Senior Officer access is limited to aggregated overview, statistics, and summary reports within an explicitly authorized jurisdiction.

- No individual FIR details.
- No individual court-proceeding details.
- No create, update, or delete permissions.
- This access is separate from Admin and does not imply all-station jurisdiction.
- The exact role identifier, jurisdiction representation, authorization model, and secure aggregation mechanism remain to be specified and validated.
- This decision preserves ADR 13’s overview-only scope and makes explicit that overview access must not expose individual case or proceeding records.

**Important security requirement:** Hiding details in the UI is not authorization. The future design must prevent unauthorized access to individual records and must not expose underlying case documents through client queries. Any aggregation path must enforce the authorized jurisdiction outside presentation-only UI logic.

**Implementation requirement not yet verified:** No SP/Senior Officer role, jurisdiction enforcement, aggregate-report backend, or Rules path is established as implemented or tested by this decision.

## 4. Confirmed Decision 3 — Read-Only User role deferred

**Confirmed decision:** A separate Read-Only User role is not approved and must not be introduced at this stage.

- Retain only `admin` and `operator` in the currently approved role model.
- Do not introduce multi-station assignments for a new Read-Only User.
- Preserve the existing single-station assignment model for Operators.
- Any older Read-Only User role proposal remains historical, unapproved, and deferred; it must not be represented as an approved role or silently erased from proposal history.
- This does not approve an additional SP/Senior Officer role identifier. The SP/Senior Officer access scope is confirmed separately in §3; its role identifier remains pending.

## 5. Existing ADR alignment

### Previously approved decisions retained

- **ADR 12:** Firebase Authentication establishes identity; Firestore Security Rules are the intended client authorization boundary; the approved role identifiers remain `admin` and `operator`; Admin has all-station FIR/proceeding access; Operators have one Admin-assigned station; role governance, audit history, bootstrap, recovery, and last-Admin safeguards remain subject to their existing release gates.
- **ADR 13:** Stable `policeStationId` is the authorization key; Operators remain station-scoped; Admin access spans stations; UI filters are not an authorization boundary; ambiguous legacy ownership requires review before exposure.

### Clarifications recorded here

- SP/Senior Officer access is summary/aggregate-only within an authorized jurisdiction and does not include individual FIR/proceeding details or writes.
- The SP/Senior Officer role identifier and jurisdiction representation are still undecided.
- A separate multi-station Read-Only User role is not approved.
- The Admin all-station permission remains CRUD, not read-only.

This record makes those boundaries explicit without claiming that an ADR’s technical implementation or validation gates have been completed.

## 6. Conflicts identified and resolution

| Affected document and section | Previously documented position | Confirmed decision | Documentation resolution |
|---|---|---|---|
| [12-Role-Management-ADR (1).md](./12-Role-Management-ADR%20(1).md), §§2, 2.1, 9 | Admin has all-station FIR/proceeding access. SP viewer role name and jurisdiction are pending. | Admin all-station CRUD is retained. SP/Senior Officer access is aggregate/overview-only; no separate Read-Only User role is approved. | Retain ADR 12’s approved Admin CRUD and two-role model. Clarify SP scope while leaving its role identifier and jurisdiction representation pending. |
| [13-Police-Station-Isolation-ADR (1).md](./13-Police-Station-Isolation-ADR%20(1).md), §§1–3, 5, 9–10 | Admin has all-station CRUD. SP gets overview reports/statistics, but the “read-only data access needed to produce authorized reports” wording could be read to permit access to individual source documents. | SP/Senior Officer access must not include individual FIR/proceeding details or writes; report computation must protect underlying documents. | Preserve Admin and Operator permissions. Clarify SP’s no-record-access boundary and require a secure aggregation design; do not select an unvalidated implementation. |
| [15-Admin-Panel-System-Specification.md](./15-Admin-Panel-System-Specification.md), §§3.1, 6.2, 10 | `admin` and `operator` are identified; SP role/jurisdiction are open and out of initial implementation scope. The specification did not explicitly state SP’s no-individual-record boundary or Admin CRUD verbs in each requirement. | The two approved role identifiers remain; Admin retains all-station CRUD; SP/Senior Officer summaries only; no separate Read-Only User role. | Keep implementation scope and release gates, but state the approved access boundaries and security requirements explicitly. Keep technical role/jurisdiction/aggregation choices pending. |
| [16-Role-Transition-Specification-Proposal.md](./16-Role-Transition-Specification-Proposal.md), §§1, 6, 4.6 | Existing approved role set is `admin`/`operator`; some SP role matters and reassignment are deferred or unresolved. | Only those two role identifiers are currently approved; the separate Read-Only User proposal remains deferred. SP access is limited to aggregate summaries, with implementation details pending. | Preserve its transition proposal history. Add a notice pointing to this record for the confirmed role and SP-access boundaries; do not treat unapproved roles as transition targets. |
| [17-Role-Transition-Minimal-Implementation-Scope.md](./17-Role-Transition-Minimal-Implementation-Scope.md), §§Status, 8 | SP-level viewer role and jurisdiction are deferred. | Summary-only SP/Senior Officer access is confirmed as a product boundary; role identifier, jurisdiction representation, and secure aggregation remain pending. No Read-Only User role is approved. | Keep the role-transition milestone limited to its stated operations; refine the deferred item to distinguish confirmed access scope from unresolved technical and role details. |
| [18-Admin-Panel-Operator-Access-Audit-and-Plan.md](./18-Admin-Panel-Operator-Access-Audit-and-Plan.md), §§3, 5, 7 | The audit recorded design conflicts and recommended reconciling them before implementation. | The three access decisions in this record resolve the role-scope questions without changing the audit’s source findings or security evidence. | Preserve this report as an audit snapshot; identify this decision record as the subsequent resolution for access scope. Keep production authorization and release blockers open. |
| [19-Admin-Panel-Pre-Implementation-Audit.md](./19-Admin-Panel-Pre-Implementation-Audit.md), §§1, 6–10 | The audit identified Admin read-only versus CRUD, SP case detail, and Read-Only User questions as conflicts or open decisions. | Admin CRUD is retained; SP/Senior Officer access is summary-only; Read-Only User is not approved. | Preserve the audit as evidence of the state reviewed then; append a reconciliation pointer and replace only the now-resolved decision follow-up with this record. Implementation status findings remain unchanged. |
| [00-Project-Overview(1).md](./00-Project-Overview(1).md), §§13, 15 | Future roles and permission boundaries were generally listed as pending. | The three product-level boundaries in this record are now confirmed; implementation and detailed technical authorization design remain pending. | Keep the overview’s single-user scope and future-expansion statements; qualify the pending items and refer to this record for the settled boundaries. |
| [11-Phase-1-Audit-Findings.md](./11-Phase-1-Audit-Findings.md), §§1–7 | Phase 1 records FIR/proceeding workflow findings and technical/business questions, not an Admin role decision. | No confirmed decision changes the Phase 1 FIR identity, status, migration, or partial-write findings. | No amendment is needed. Preserve this audit and its stated verification limits. |

## 7. Security and architecture implications

1. **Admin authorization:** All-station CRUD is a privileged boundary. It must be enforced by Firestore Security Rules for direct client access or by a trusted backend for server-mediated operations. UI hiding or a client-provided role/station value is insufficient.
2. **Operator isolation:** Operators remain assigned to exactly one stable `policeStationId`; they cannot self-assign or access other stations. Admin’s broader grant must not broaden Operator access.
3. **SP/Senior Officer aggregation:** The design must authorize a defined jurisdiction and return only approved aggregates. It must not authorize individual document reads merely because a client intends to aggregate results after reading them.
4. **Reports and exports:** Every report/export path needs authorization matching its role and jurisdiction. Client-side filtering or omitted detail fields do not prove underlying document confidentiality.
5. **Trusted backend:** Any privileged endpoint using Firebase Admin SDK bypasses Firestore Security Rules and must perform its own authentication, current-role authorization, validation, jurisdiction checks, and safe data shaping.
6. **Default denial and independent verification:** Unknown role or jurisdiction, missing/malformed assignment, lookup failure, or unvalidated query/report path must not become a success-shaped grant. Security tests must include direct document paths and queries, not only UI behavior.

These are requirements and design implications, not claims that a secure implementation currently exists.

## 8. Pending technical decisions

- Exact role identifier and role-document representation for SP/Senior Officer access.
- How the authorized jurisdiction is represented, changed, and audited.
- Which summary metrics/reports are approved for that jurisdiction and what aggregation thresholds or disclosure controls may be required.
- Whether aggregation is performed by a trusted backend, a separately secured aggregate data model, or another reviewed mechanism. No option is selected here.
- How to ensure the SP/Senior Officer path cannot read underlying FIR/proceeding documents through direct reads, collection queries, exports, or alternate endpoints.
- Exact Firestore Rules and trusted-backend responsibilities for Admin all-station CRUD and Operator station isolation.

## 9. Implementation update (2026-10-20)

The root `functions/` deployment source exports Admin-authorized station, user-role, Operator, role-transition and `getMyAccess` endpoints. It uses current Firestore role records, revocation-aware Auth token verification, server-side station validation, idempotent provisioning, and transactional role history/governance. Operator onboarding creates no password. SendGrid delivers a 256-bit custom token stored only as a SHA-256 hash; the token is fragment-only, expires after 24 hours, is claimed once server-side, and is consumed by a Firebase Admin SDK password update. Resend replaces the token hash; Firebase Auth's native reset endpoint cannot consume this token. Recovery is non-enumerating and rate-limited. The owner approved `casetrack-97a4e`; `.firebaserc` uses that project and normal frontend endpoints fail closed on other project IDs. Root `firebase.json` selects the candidate Admin Panel Rules and Node.js 22 Functions source.

The website's Admin Panel modules now select `us-central1` Functions endpoints from the initialized Firebase app in normal mode. The explicit `role-admin-local` mode continues to target only the fixed demo project and loopback emulators. No Firebase client project ID was changed. Station rename/deletion remain outside the approved initial scope.

The source and isolated emulator workflows are locally verified; exact results and live read-only findings are in the production-readiness report. Firebase Auth email/password and the GitHub Pages domain are live-configured. The custom token flow does not require Firebase Auth's reset-action handler. However, the published Admin Panel/setup routes are missing, Cloud Functions and Secret Manager APIs are unavailable on the current project plan, SendGrid delivery is unconfigured, production Rules are permissive, and no recoverable backup exists. The owner authorized production release, but deployment is stopped at these safety gates.
- Test data/environment, adversarial access scenarios, and release evidence required before deployment.

## 9. Risks and release blockers

| Risk | Why it matters | Release condition |
|---|---|---|
| Admin all-station CRUD is broader than Operator access | A policy or query mistake could expose or modify records across stations. | Validate direct reads, queries, creates, updates, and deletes for Admin and Operators against the effective Rules/backend. |
| SP summary access leaks record-level data | Client aggregation can expose underlying documents even if the UI displays only totals. | Choose and validate a secure aggregation mechanism that does not grant individual-record access. |
| SP jurisdiction is unspecified | “Authorized jurisdiction” cannot be enforced until its representation and trusted source are defined. | Define the jurisdiction model and test allowed and denied jurisdictions. |
| Role scope is incorrectly expanded | An unapproved Read-Only User or multi-station assignment would change the approved model. | Keep only `admin` and `operator` as approved roles unless a later explicit decision changes this record. |
| Rules/backend implementation is not verified | Planning decisions alone do not secure Firebase or privileged endpoints. | Obtain implementation review and passing security tests before production exposure. |

No security test, Rules deployment, Firebase operation, or production verification is claimed by this decision record.

## 10. Change history

| Entry | Change |
|---|---|
| Initial record | Records the three confirmed Admin Panel access decisions, distinguishes retained ADR decisions from unapproved proposals and pending technical details, and identifies documentation reconciliations. No approval date or decision-maker is asserted here. |
