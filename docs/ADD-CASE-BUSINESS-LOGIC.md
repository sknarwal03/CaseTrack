# Add/Edit Case Business Logic

**Authority:** Source-backed rules and explicit unresolved items for Add/Edit Case. FIR-level status is centralized in `assets/js/fir-status.mjs`; this document does not turn proposed requirements into current behavior.

## Current FIR status algorithm

The engine filters court proceedings by record type/status/UCR number. With any court proceeding, it returns `UT` when at least one status is neither `Committed` nor `Disposed`; it also returns `UT` when every proceeding is `Committed`. Otherwise all court proceedings are terminal and it returns `Disposed`. With no court proceedings, it reads the last linked UCR record's `report_type` (or `ucrType`, with master fallback): cancellation aliases return `Cancelled`, untraced aliases return `UCR`, otherwise `UI`.

Current implications: no records -> `UI`; UCR with cancellation/untraced -> corresponding FIR status; any active court proceeding -> `UT` even with UCR; all disposed -> `Disposed`; committed predecessor alone -> `UT`; committed predecessor plus disposed successor -> `Disposed`; another active proceeding keeps FIR `UT`. The algorithm does not use predecessor/successor fields to calculate status. Its logic relies on proceeding statuses.

## Current proceeding status and record constraints

- Court proceeding status is derived from the latest applicable hearing trial stage or saved stage; transfer successor causes the predecessor to be written `Committed` with `successorCaseId`.
- UCR status is `UCR`; current form requires UCR number/year/report type/disposal date and prevents more than one UCR draft, adding UCR after court activity, or adding another when an existing UCR is found.
- FIR identity uses FIR number, year and stable police station ID for save; UI/model legacy matching also compares identity data. Duplicate checks are server-backed for master writes.
- A FIR Master cannot be deleted when linked records exist; record removal deletes only selected record and also updates reciprocal transfer link where applicable.

## Existing automated evidence

`test/fir-status.test.mjs` covers no proceedings, aliases, mixed proceedings, disposed/active combinations, committed predecessor and successor, UCR/court interactions, identity uniqueness helpers, legacy IDs/hearing history and FIR grouping. `test/fir-master-integrity.integration.test.mjs` exercises callable master identity and claim operations with emulators. This does not establish browser behavior or live Firestore/deployed-rule behavior. Do not claim Add/Edit full workflow, failed proceeding retry, transfer lifecycle, or legacy UI compatibility is covered solely by these suites.

## Unresolved business decisions

Carry forward the unresolved items in `14-Add-Edit-Case-Modal-Requirements.md`: (1) case status when no `next` hearing exists but a terminal stage is in history; (2) FIR Register presentation for master with no proceedings; (3) allowed UI transition from Committed; (4) retry/idempotency and concurrent edits; (5) scope of legacy matching/linking. Also confirm whether a disposed court record can be reopened and whether UCR fallback to master fields is intended. Resolve before implementation that depends on these rules.
