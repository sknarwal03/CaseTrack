# Add/Edit Case Change Impact Matrix

**Authority:** Required review checklist for future Add/Edit Case changes. Recheck source and tests at change time; this audit is a baseline, not a substitute for current review.

## Cross-module dependencies

| Module | Shared dependency / observed use | Change impact to assess |
|---|---|---|
| Add/Edit Case | Form serialization, master/proceeding drafts, validation, writes, status refresh | Primary owner of interactions and writes |
| FIR Register / FIR Index | `loadCaseRecords`, `getFirSummaries`, master/proceeding rendering, hearing history | Identity grouping, status display, field ownership, empty-master presentation |
| Cases / Case Details | Normalized records, proceeding status, accused/witness, dates, legacy aliases | Per-proceeding data and edit/detail paths |
| Register Diary | Court proceeding filter; transaction writes `hearingDateRecord`; file marker localStorage | Hearing IDs/date/stage compatibility and local-vs-shared state |
| Dashboard | `loadCaseRecords`, `isCourtProceeding`, case and FIR status aggregation, committed/successor filtering | Distinguish FIR count/status from proceeding count/status |
| Reports | `getFirSummaries`, proceeding filtering, status/category aggregates | Field/status alias and denominator changes |
| Disposed Cases | Reads normalized records, hearings, local diary file markers and historical disposal aliases | Disposal semantics and legacy values |
| PO Cases | Court proceedings and normalized `accused[].poStatus` | Accused array shape and PO values |
| IO / Manage IO | `investigatingOfficers`, IO snapshots; IO dialog can update records | Stable IO IDs/snapshots and updates across proceeding documents |
| Shared layout / notifications | Shared record loader, court filters, writes to proceeding references | Collection path, stable document ID and event compatibility |

## Impact review required before implementation

Record all of the following in the change proposal:

1. Existing canonical rule and source evidence.
2. Requested change and acceptance criteria; unresolved decisions.
3. Affected fields, owning entity, controls, and consuming modules above.
4. Firestore collections, exact read/write paths, transactions/batches, IDs and relationship updates.
5. Backward compatibility: legacy collections, aliases, missing values, duplicate snapshots, migration/rollback.
6. UI/UX impact: section, order, conditional display, validation, accessibility, responsive behavior, save feedback.
7. Required unit, emulator integration, browser and (if authorized) live verification. Separate each evidence level.
8. Documentation and historical-reference updates.

Do not implement ambiguous ownership, breaking schema changes, destructive record changes, or migration behavior without explicit approval. No issue-tracker entry is created or resolved by this audit.

## Narrowly scoped agent instruction proposal

No repository-root `AGENTS.md` was found. Proposed text for owner review before adding to the agent instruction system:

> Before changing Add/Edit Case form fields, validation, record ownership, Firestore mapping, FIR/proceeding status, or related record consumers, read `docs/ADD-CASE-MASTER-RULES.md` and the relevant linked canonical documents. Recheck current source and tests. Include the impact checklist in `docs/ADD-CASE-CHANGE-IMPACT-MATRIX.md` in the implementation plan. Preserve legacy IDs, fields, and relationships; do not introduce a Firestore path or alias without source/schema review. Distinguish tested behavior from browser or deployed behavior, and request owner approval for unresolved or breaking decisions.

This is a proposal only, not active repository guidance.
