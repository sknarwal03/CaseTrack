# ADR: Police Station Data Isolation and FIR Identity

> Reconciled on 2026-10-18 with `12-Role-Management-ADR.md`. Planning decision: admin has all-station FIR/proceeding access; implementation and security validation remain pending.

> **Decision clarification:** [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md) confirms that Admin retains all-station CRUD; SP/Senior Officer access is restricted to aggregate overview/statistics without individual FIR/proceeding access or writes; and a separate Read-Only User role is not approved. The exact SP role identifier, jurisdiction representation, and secure aggregation mechanism remain pending. This clarification does not establish implementation or validation.

- **Document:** `13-Police-Station-Isolation-ADR.md`
- **Project:** CaseTrack
- **Date:** 2026-10-18
- **Status:** Approved design direction; implementation and security validation pending
- **Related document:** `12-Role-Management-ADR.md`

## 1. Objective

Define a simple, maintainable approach for isolating CaseTrack data by police station while allowing authorized SP-level users to receive overview reports without access to individual FIR or proceeding documents. This document records design decisions; it does not claim that the current application or deployed Firestore Security Rules enforce them.

## 2. Approved architecture decisions

| Area | Decision |
|---|---|
| Firebase architecture | Use one shared Firebase project. Police-station separation is logical, enforced by authorization and data ownership—not by separate Firebase projects. |
| Firebase project observed in the supplied audit | `casetrack-97a4e`. Deployment configuration must still be verified before relying on this as the production project. |
| Station identity | Use a stable `policeStationId` for relationships and authorization. Do not use editable station-name text as the authorization key. |
| Police Station Master | Keep a minimal master with a stable ID and canonical display name. If names are renamed or aliases are needed, retain the mapping/history rather than changing the station's identity. Exact alias/history fields remain an implementation detail to validate. |
| Police-station user assignment | An administrator assigns each station operator to one police station. The operator cannot change their own station assignment. |
| Station operator permissions | Can create, view, edit, and delete FIR/proceeding records belonging to their assigned police station, subject to the approved workflow rules. |
| Data isolation | A station operator must not read or modify another station's FIR/proceeding data by changing UI filters, document IDs, or client requests. |
| SP-level access | SP/Senior Officer access is limited to aggregated overview, statistics, and summary reports within an explicitly authorized jurisdiction. No individual FIR or court-proceeding details and no create/update/delete access are permitted through this access. The exact role identifier, jurisdiction representation, authorization model, and secure aggregation mechanism remain to be specified and validated. |
| Administration | The existing `admin` role manages roles and Police Station Master, and has FIR/proceeding access across all police stations. Admin-controlled station assignment is required for operators. |
| FIR identity | A FIR is identified by the combination of normalized FIR number, FIR year, and stable `policeStationId`. The same FIR number and year at different stations represent different FIRs. |
| FIR Master ID | `firMasterId` remains a stable document identity; it is not derived from editable display text. |
| Duplicate prevention | A UI pre-check is useful for feedback but is not sufficient by itself. The design should use a deterministic unique-key registry and an atomic Firestore transaction for create/update identity claims, so concurrent requests cannot claim the same FIR identity. The permanent `firMasterId` remains separate from this uniqueness key. |
| Legacy records | Do not automatically link uncertain legacy records based only on a possible ID collision or incomplete match. Preserve legacy document IDs and history; require an explicit, reviewable link when identity is ambiguous. |

## 3. Access model

| User category | Station assignment | FIR/proceeding data | Overview reports |
|---|---|---|---|
| Station operator | Exactly one station, assigned by admin | Create/read/update/delete only within assigned station | Only if separately authorized |
| SP / Senior Officer | Authorized jurisdiction must be configured | No individual FIR/proceeding document access; no create, update, or delete | Aggregated overview/statistics/summary reports only |
| Admin | No station assignment is required to scope its access | FIR/proceeding create/read/update/delete across all stations, plus role and Police Station Master administration | Administrative/report access as authorized by Rules |

**Role boundary:** `operator` and `admin` are the only currently approved role identifiers. Admin retains all-station FIR/proceeding CRUD. SP/Senior Officer overview-only access is a separate confirmed access direction and is not implied by `admin`; its exact role identifier and jurisdiction representation remain unapproved. A separate multi-station Read-Only User role is not approved. See [`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md).

## 4. FIR identity and duplicate-key design

Canonical identity is:

`normalized(firNo) + normalized(firYear) + policeStationId`

Recommended enforcement:

1. Normalize FIR number and year consistently in one shared helper.
2. Derive a deterministic key from the normalized identity tuple; avoid using user-editable station-name text as part of the key.
3. Claim or update the key atomically with the FIR Master write using a Firestore transaction.
4. Reject a create/update if another FIR Master already owns that identity key.
5. On identity correction, atomically release the previous key and claim the new key, rejecting conflicts.
6. Keep the uniqueness key separate from `firMasterId`; do not change the FIR Master document ID merely because identity fields are corrected.

The exact registry path, key encoding/hash, transaction boundaries, and handling of legacy duplicates must be verified against the current schema before implementation.

## 5. Authorization enforcement requirements

The intended security boundary is Firestore Security Rules for client requests, consistent with `12-Role-Management-ADR.md`. UI filtering alone is not authorization.

Before release, Rules and tests must establish that:

- unauthenticated users cannot access protected records;
- revoked or unassigned users cannot access station data;
- a station operator can access only records whose trusted station ownership matches their assigned `policeStationId`;
- clients cannot change their own station assignment or write an arbitrary `policeStationId` to bypass isolation;
- an operator cannot create, edit, or delete records owned by another station;
- SP/Senior Officer access must return only authorized aggregate overview/statistics/summary data within its jurisdiction; it must not grant individual FIR/proceeding reads or writes, including through direct document paths or client queries;
- role/assignment documents cannot be self-edited or modified through alternate client write paths;
- active operators have exactly one admin-assigned `policeStationId`;
- admins can access all stations as approved, while this broader permission does not apply to operators;
- queries and document-level reads are both covered by the authorization model.

The aggregation mechanism is unresolved. If client-side Firestore access cannot produce the approved summaries without exposing underlying documents or weakening station isolation, evaluate a trusted backend for that reporting operation.

## 6. Compatibility and migration guardrails

- Preserve existing FIR Master and proceeding document IDs unless a separately reviewed migration requires otherwise.
- Preserve hearing history and predecessor/successor transfer links.
- Do not merge records merely because FIR number and year match; the station identity is part of the key.
- Do not infer a station assignment for legacy data when the source is ambiguous.
- Before enabling station isolation, inventory existing records and map each record to a verified `policeStationId`.
- Records with missing or conflicting station ownership must be reviewed and reconciled before they are exposed under the new access model.
- Keep the current role-management, audit-history, bootstrap, and last-admin safeguards defined in `12-Role-Management-ADR.md`.
- Apply the approved admin all-station access consistently with operator station isolation; validate both allowed admin access and denied cross-station operator access.

## 7. Risks and constraints

| Risk | Mitigation / required validation |
|---|---|
| Rules enforce only UI-level filtering or miss an alternate read/write path | Emulator tests for direct document access, queries, writes, and bypass attempts; independent Rules review |
| Missing or incorrect `policeStationId` on legacy records | Data inventory and reviewed mapping before enforcement |
| Duplicate identity during concurrent create/update | Transactional unique-key registry and concurrency tests |
| Station renamed and identity changes accidentally | Stable ID; names remain display metadata |
| SP report access becomes broader than intended | Explicit authorized jurisdiction and read-only tests |
| SP/Senior Officer summary queries expose underlying records or exceed practical query limits | Validate the complete Rules/backend/query boundary; select a secure aggregation mechanism before implementation |

## 8. Acceptance criteria before production rollout

- Every active station operator has exactly one admin-assigned `policeStationId`.
- Operators cannot change their own assignment.
- Admin can access FIR/proceeding records across all stations; this is verified by Rules tests without granting the same access to operators.
- Cross-station reads and writes are rejected by Firestore Security Rules, including direct requests that bypass the UI.
- SP/Senior Officer access returns only aggregate overview/statistics/summary data for an explicitly configured jurisdiction; direct individual-record access and writes are denied.
- Duplicate FIR identities are rejected on both create and identity correction, including concurrent attempts.
- Legacy records have verified station ownership or remain unavailable until reviewed.
- Emulator tests cover allowed and denied operations, query paths, direct-document paths, duplicate concurrency, and role revocation.
- Production Rules, deployment mapping, and migration results are reviewed before release.

## 9. Unresolved items

These are intentionally not decided by this ADR:

1. Exact role name and role document representation for SP/Senior Officer overview-only access.
2. Exact role-document/assignment representation for `policeStationId` and whether station assignment history needs a dedicated event schema.
3. How SP-level jurisdiction is represented (for example, one district or a configured list of stations).
4. Exact Police Station Master alias/history schema.
5. Exact deterministic key encoding and registry path.
6. Detailed migration procedure for existing records with missing or inconsistent station identity.
7. The secure aggregation mechanism for SP/Senior Officer reports; do not expose underlying case documents through client queries.

## 10. Relationship to role-management ADR

This ADR must be read together with `12-Role-Management-ADR.md`.
For permission scope, the reconciled decisions are:

- `operator`: one admin-assigned station; no cross-station FIR/proceeding access.
- `admin`: FIR/proceeding access across all stations, plus role and Police
  Station Master administration.
- SP/Senior Officer: aggregate overview/statistics/summary reports only
  within an explicitly authorized jurisdiction; no individual
  FIR/proceeding details or writes. Exact role identifier, jurisdiction
  representation, and secure aggregation mechanism remain undecided.
- A separate multi-station Read-Only User role is not approved.

If any older text in either ADR says station-scoped authorization is deferred
or leaves admin FIR/proceeding scope unspecified, this reconciled decision
supersedes that older wording. The later clarification in
[`20-Admin-Panel-Architecture-Decisions.md`](./20-Admin-Panel-Architecture-Decisions.md)
further specifies SP/Senior Officer summary-only access and the currently
approved role identifiers. This does not authorize weakening Security
Rules or bypassing validation gates.

## 11. Implementation status

**Planning only.** No application code, Firestore Security Rules, Firebase data, or deployment was changed while preparing this ADR. Existing production isolation is unverified; this document must not be interpreted as evidence that the requirements are already enforced.
