# CaseTrack Add/Edit Case Master Rules

**Authority:** Canonical governance entry point for Add/Edit Case changes. Supporting authority: [field registry](./ADD-CASE-FIELD-REGISTRY.md), [data mapping](./ADD-CASE-DATA-MAPPING.md), [UI/UX standards](./ADD-CASE-UI-UX-STANDARDS.md), [business logic](./ADD-CASE-BUSINESS-LOGIC.md), and [change-impact matrix](./ADD-CASE-CHANGE-IMPACT-MATRIX.md).

**Audit basis:** Repository source inspected 2026-10-26. This is an implementation audit and governance baseline, not an implementation approval. No production Firestore data, deployed rules, or live browser behavior was inspected in this pass.

## Current architecture

- The modal is [add-case.html](../components/add-case/add-case.html), [add-case.css](../components/add-case/add-case.css), and [add-case.js](../components/add-case/add-case.js). It presents FIR Master information plus a case-record list/editor for independent court and UCR records.
- [fir-case-model.js](../assets/js/fir-case-model.js) reads and normalizes `firMasters`, `linkedCases`, and legacy `cases`, preserves document IDs, joins master-owned data to proceeding views, and groups records by FIR identity.
- New FIR Master writes go through `saveFirMaster` callable function and a Firestore transaction; identity claims support uniqueness. New linked proceedings are stored in `linkedCases`; legacy records continue to use their original `cases` documents.
- [fir-status.mjs](../assets/js/fir-status.mjs) is the shared FIR status calculation used by the modal and several consumer modules. Proceeding status remains on each proceeding.
- Hearing history is stored as `hearingDateRecord` on the proceeding document. Register Diary also updates that array transactionally. File marker state is browser `localStorage`, a separate concern.

## Canonical ownership rules

1. **FIR Master owns shared FIR-level identity and incident/complainant information.** The audited save keys are listed in the mapping document. Readers may expose these fields alongside proceedings for display, but new linked-record writes must not become a second source of truth.
2. **Each linked record owns its proceeding-specific information.** Court type/registration, court and judge snapshot, IO snapshot, accused, witnesses, hearings, stage, status, and transfer references belong to the proceeding. Lower Court, Sessions Court, and JJB are independent proceedings.
3. **UCR is a linked police-report record**, with its own number, report type, disposal date and current IO fields. Existing UCR behavior and fields are retained pending any separately approved change.
4. **Legacy compatibility is explicit.** `cases` records retain their IDs and history. Do not silently migrate, merge, rename, or delete fields/records. The reader currently overlays FIR Master fields on linked and legacy records for consumers.
5. **FIR status and proceeding status are distinct.** Derive FIR status with the shared engine and linked record set; do not infer a proceeding's status from the FIR badge.
6. **Writes are not globally atomic.** Master writes use a callable transaction, while each proceeding and its transfer predecessor update use a batch. Multiple proceeding writes can partially succeed; report and retry behavior must preserve successful IDs.
7. **No source or unit test proves deployed behavior.** State exactly whether evidence is source inspection, unit test, emulator integration, browser verification, or live Firestore verification.

## Status and data integrity rules

The code baseline for status is [fir-status.mjs](../assets/js/fir-status.mjs); details and edge cases are in [business logic](./ADD-CASE-BUSINESS-LOGIC.md). Do not create competing status calculators in pages. Stable document and hearing IDs, `firMasterId`/`firId`, and predecessor/successor relationships are preserved. Current code includes FIR identity duplicate checks, single-UCR and UCR-after-court guards, selected-record removal, and FIR Master deletion restrictions; scope and gaps are recorded in the audit matrix.

## Known inconsistencies and decisions still open

- The older [field reference](./Add-Edit-Case-Field-Reference.md) describes some fields as active that current form/save code does not provide, including decision date and judgement. Treat it as historical pending reconciliation.
- [Modal requirements](./14-Add-Edit-Case-Modal-Requirements.md) contains unclosed decisions: no-next-hearing versus final stage status, FIR Register display for a master without proceedings, committed-stage editing interaction, atomicity/retry details, and legacy linking boundaries.
- Current status engine treats all `Committed` proceedings as FIR `UT`; committed plus disposed becomes FIR `Disposed` under current tests unless another active proceeding exists. Confirm that this remains the approved commitment/transfer interpretation before changing it.
- The form propagates master fields into proceeding payloads and legacy writes for compatibility; the target normalization/migration policy for those historical duplicates is not resolved by this audit.
- No root `AGENTS.md` or equivalent repository-wide agent instruction was found by the tracked-file search. A narrowly scoped proposal is in the [change-impact matrix](./ADD-CASE-CHANGE-IMPACT-MATRIX.md); it is proposed text, not an active instruction.

## Change gate

Before implementation, complete the impact checklist in the [change-impact matrix](./ADD-CASE-CHANGE-IMPACT-MATRIX.md), inspect current code/tests again, resolve any ownership/schema ambiguity, and obtain explicit implementation approval. The user request for this audit authorized documentation and audit only; it does not authorize application changes.

## Historical documents

`Add-Edit-Case-Field-Reference.md` and `14-Add-Edit-Case-Modal-Requirements.md` are useful source/history records but are not authoritative where they conflict with this audit or the current source. Do not delete them; reconcile them in a later approved documentation update.
