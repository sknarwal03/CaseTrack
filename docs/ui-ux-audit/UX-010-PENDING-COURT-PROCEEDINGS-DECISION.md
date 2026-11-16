# UX-010 — Pending Court Proceedings Decision Package

**Phase:** A — business-rule decision preparation only  
**Product direction approved:** Replace the Reports FIR-level Pending metric with a linked court-proceeding-level **Pending Court Proceedings** metric.  
**Not approved:** Status inclusion, terminal-state treatment, duplicate identity, date rules, and data-quality handling. No application code or report behavior is changed by this package. UX-010 remains Open.

## 1. Existing behavior

`assets/js/report.js` loads records through `loadCaseRecords(db)`, obtains unique FIR summaries with `getFirSummaries(allCases)`, and sets the `#reportPending` value to the number of summaries whose derived `firStatus` exactly matches `UI`, `UT`, `UCR`, `Untrace`, `Cancelled`, or `Cancellation` (whitespace is trimmed; comparison is case-sensitive). `getFirSummaries()` returns one summary per FIR grouping, and `deriveFirStatus()` supplies its status. Therefore, the current KPI is FIR-grain, not proceeding-grain.

For ordinary derived summaries, the effective current Pending values are `UI`, `UT`, `UCR`, and `Cancelled`; `deriveFirStatus()` normally emits canonical `UCR` and `Cancelled`, not the aliases `Untrace` or `Cancellation` that also appear in the KPI filter. `Disposed` is excluded. The KPI subtitle in `pages/report.html` says **“At risk”**, though the calculation contains no risk or overdue test.

The report export builds a summary row from the displayed `#reportPending` text, currently labeled **“Pending”**. CSV, XLSX, and PDF use this same export data. The Reports status chart uses `getFirSummaries()` and is FIR-grain; the stage chart uses `allCases.filter(isCourtProceeding)` and is record-grain. The existing Next Hearings KPI counts proceeding records with any truthy `nextDate`; it does not require that date to be today or later.

## 2. Data model and record relationships

`loadCaseRecords()` reads from `firMasters`, `linkedCases`, and legacy `cases`, using either the existing ordinary loader or the existing station-scoped loader, depending on the Firebase project policy. Do not add a query or broaden this authorization boundary for the new metric.

Normalized records carry a Firestore `id` and `_collectionName`; status is normalized from `status ?? caseStatus`, `caseStatus` from `caseStatus ?? status ?? firStatus`, and `caseStage` from `caseStage ?? trialStage`. Relevant relationship/identity fields include `firMasterId`, `firId`, `legacyCaseId`, `firNo`, `firYear`, and police-station identity. Linked record fields include `courtType`, `courtName`, `courtNumber`, registration prefix/number/year (`regPrefix`, `regNo`, `regYear`), `caseStage`/`trialStage`, `status`, `nextDate`, and `successorCaseId`/`predecessorCaseId` where present. The inspected sources do not establish a universal immutable court identifier or a complete unique court-proceeding key beyond a document reference.

The current `isCourtProceeding(record)` excludes FIR Master records, records explicitly typed `ucr`, UCR/untrace/cancellation status aliases, and records with `ucrNumber`. It treats other normalized case records as court proceedings; it does not require a court name, court type, or registration number. Record type conventions include `lower`, `session`, and `jjb`, but the predicate is broader than those values.

`getFirSummaries()` groups linked records by master/FIR reference where available, otherwise by FIR number/year/station, and falls back to a record-specific key when that identity is incomplete. `loadCaseRecords()` deduplicates repeated Firestore document paths and suppresses legacy records whose IDs are referenced by `legacyCaseId` on linked records. These are existing loader/report behaviors, not a complete duplicate-proceeding policy.

## 3. Status and condition matrix

The **recommended** candidate rule is to count distinct, eligible linked court-proceeding records with a known nonterminal proceeding status. This is only a proposal. The existing code does not define every status as a business rule, and owner approval is required before implementation.

| Status / condition | Actual stored value or fields | Record type / grain | Current meaning evidenced in code | Proposed Pending inclusion | Owner decision? |
|---|---|---|---|---|---|
| Under Investigation | Usually `UI` / `Under Investigation`; can also be FIR-level `firStatus` | Normally FIR-level classification; a non-UCR linked case record also passes `isCourtProceeding()` | FIR derivation returns `UI` when there are no court proceedings and no recognized UCR classification. If a linked court record itself has UI status, FIR derivation treats that record as nonterminal and returns FIR `UT`. | Exclude when it is only FIR metadata. Include only if owner confirms a UI-status record that passes proceeding eligibility is genuinely a court proceeding. | **Yes** — decide if record eligibility or UI status controls. |
| Under Trial | `UT` / `Under Trial` | Linked court record status or derived FIR status | Nonterminal court status produces FIR `UT`; stage changes other than Committed/Disposed map to `UT` in the Add Case workflow. | Include an eligible court proceeding with `UT`. | **Yes** |
| In Progress | No canonical literal was found in the supported trial-stage list. The list is `App`, `Charge`, `Reply`, `PW`, `313 Crpc`, `DW`, `Consid.`, `Argu.`, `Final Order`, `Committed`, `Disposed`. | Potential legacy/unexpected status value on a linked record | `isCourtProceeding()` does not exclude it; FIR derivation treats a nonterminal value as `UT`. It is not a defined canonical value in the inspected stage list. | Include only if owner defines `In Progress` as a recognized active court status/alias; otherwise classify as unknown. | **Yes** |
| Committed | `Committed`; often associated with a `Committed` trial stage and predecessor/successor relationship | Linked court proceeding | `isCourtProceeding()` includes it. FIR derivation returns `UT` if all proceedings are committed; a committed predecessor may have `successorCaseId`. | Exclude the committed proceeding itself as terminal/transferred. Count an eligible active successor separately. | **Yes** — decide whether committed without a successor is excluded or remains pending. |
| Disposed | `Disposed` | Linked court proceeding; may also appear as a derived FIR status | `isCourtProceeding()` includes the record; FIR derivation returns FIR `Disposed` when the group has no active/unknown status and is not all committed. | Exclude the disposed proceeding. A different active proceeding for the same FIR remains independently countable. | **Yes** |
| Unknown nonblank status | Any unrecognized status string | Usually a linked/legacy record; it passes current `isCourtProceeding()` unless another exclusion applies | FIR derivation treats statuses other than `committed`/`disposed` as active and returns `UT`. This is an implementation fallback, not a confirmed business definition. | Exclude from the counted total and surface a data-quality warning/list; alternative is conservative inclusion. | **Yes** |
| Blank/missing status | Empty `status` and `caseStatus`, or missing values | Usually a linked/legacy record; it passes current `isCourtProceeding()` unless another exclusion applies | A blank status is nonterminal to `deriveFirStatus()` and can cause the FIR to derive `UT`. | Exclude from the count and surface a data-quality warning/list; do not silently treat missing as active. | **Yes** |
| UCR / Untrace | `recordType: ucr`, `ucrNumber`, status `UCR`/`Untrace`/`Untraced`, or UCR type fields `report_type`/`ucrType` | FIR-level/UCR process record, not a court proceeding under the current predicate | `isCourtProceeding()` excludes these records. FIR derivation may classify the FIR as `UCR` from UCR metadata. | Exclude: not a linked court proceeding. | **Yes**, if product intends UCR proceedings to be in scope despite current record classification. |
| Cancellation / Cancelled | Status aliases or `report_type`/`ucrType` cancellation value | FIR-level/UCR process record under the current predicate | Excluded by `isCourtProceeding()`; may produce derived FIR status `Cancelled`. | Exclude: not a linked court proceeding. | **Yes**, if product intends cancellation records to be in scope. |
| PO / Proclaimed Offender | PO details/flags can be associated with an accused within a case; PO page uses accused-level fields and PO filters | Accused-level flag/details or a presentation classification, not a proceeding status | No PO-specific test exists in `isCourtProceeding()` or the Reports Pending calculation. PO does not itself establish that the linked proceeding is open or closed. | Do not let PO change proceeding eligibility; count based on the underlying eligible proceeding status. Do not count a PO flag as a separate proceeding. | **Yes** |

`status` and `caseStage` are different fields. In the current Add Case workflow, trial stages other than `Committed` and `Disposed` generally synchronize the court record status to `UT`; the stage itself should not be treated as a separate status without owner approval.

## 4. Recommended counting unit and duplicate policy

**Candidate counting unit:** one distinct linked court-proceeding document in the already-authorized loaded dataset, not one FIR and not one hearing date. A FIR may contribute zero, one, or several pending proceedings.

**Candidate identity rule:** use the canonical Firestore document path as the primary identity. Preserve the loader's existing same-path deduplication and `legacyCaseId` suppression. Do not merge distinct document IDs solely because their FIR number, court name, or registration text looks similar: separate court registrations can be legitimate. Where two documents with different IDs represent the same real proceeding and lack a shared legacy reference, flag for data review; an automatic fuzzy merge rule is not evidenced by the source.

Required owner choice: confirm whether the existing loader's `legacyCaseId` behavior is sufficient, or whether a specific stable proceeding key must be required/introduced in a separately approved data-design task. This analysis does not authorize a schema change.

## 5. Synthetic scenarios under the recommended candidate rules

Assumptions for this table: records are in the authorized dataset; each listed “active” record is a valid linked court proceeding with an approved known active status; Committed and Disposed are excluded; UCR/cancellation are not court proceedings; unknown/blank statuses are excluded and flagged; same-document duplicates are deduplicated by the loader. These are recommended assumptions, not approved rules.

| Scenario | FIRs | Linked proceedings presented | Proposed Pending count | Reason / approval |
|---|---:|---:|---:|---|
| A — one FIR, one active proceeding | 1 | 1 active | 1 | One eligible pending proceeding. Approve active-status list. |
| B — one FIR, two active proceedings in different courts | 1 | 2 active | 2 | Count each distinct proceeding, not the FIR once. Approve multiple-court counting. |
| C — JJB, Magistrate, and Sessions proceedings | 1 | 3 active (assumed distinct registrations) | 3 | Each distinct active linked proceeding counts. Confirm court-transfer lifecycle and distinct registration policy. |
| D — one disposed and one active proceeding | 1 | 2 (1 disposed, 1 active) | 1 | Disposed record excluded; active record still counts. Approve per-proceeding treatment. |
| E — committed predecessor and active Sessions successor | 1 | 2 | 1 | Exclude committed predecessor; count active successor. Confirm successor link and status policy. |
| F — only committed proceedings | 1 | 1+ committed | 0 | Candidate treats Committed as terminal even without a successor. This is a key owner decision. |
| G — UCR or cancellation records only | 1 | 0 court proceedings; one or more UCR records | 0 | UCR/cancellation are excluded by current proceeding classifier. Confirm scope. |
| H — PO flag plus one active proceeding | 1 | 1 active + PO attribute | 1 | PO flag does not create or remove a proceeding. Confirm PO is status-independent. |
| I — duplicate data | 1 | Repeated same document path, or separate document IDs for the same real proceeding | 1 for repeated path; unresolved for separate IDs | Loader deduplicates repeated paths and linked/legacy references only when `legacyCaseId` connects them. Separate-ID duplicates may inflate count; approve manual review or a stable identity rule. |
| J — missing/unknown status | 1 | 1 otherwise eligible court record | 0 plus data-quality warning (recommended) | Unknown is not silently treated as pending. Approve whether unknown/blank instead counts conservatively. |

### Date examples

Under the candidate status-only rule, a pending proceeding counts as one whether it has no `nextDate`, a past date, today, or a future date. Hearing dates do not change proceeding status. Multiple hearing records do not increase the proceeding count. A committed or disposed proceeding remains excluded regardless of historical hearings. This keeps Pending Court Proceedings separate from Upcoming Hearings and Overdue Hearings.

The current `#reportHearings` KPI does not implement that distinction fully: it counts proceedings with any `nextDate`, including dates in the past. Changing that behavior is outside UX-010 Phase A and requires separate approval.

## 6. Proposed decision rules

| Rule | Current behavior | Recommended behavior | Count impact | Owner approval? |
|---|---|---|---|---|
| 1 — Eligible record | `isCourtProceeding()` broadly excludes master/UCR records and includes other case records; it does not require court identifiers. | Use linked/legacy case records passing the existing predicate, plus confirm an eligibility guard for actual court-proceeding identity (record type and/or court registration fields). Do not count FIR Master or UCR records. | FIR metadata-only records no longer count; malformed non-UCR records may need exclusion/data-quality reporting. | **Yes** |
| 2 — Included status | No proceeding-level Pending predicate exists. | Include approved active court statuses, provisionally `UT` and explicitly approved in-progress/legacy equivalents. Decide separately whether `UI` on a court record qualifies. | Usually lower or different than current FIR Pending; count rises with multiple active proceedings per FIR. | **Yes** |
| 3 — Excluded status | FIR status aggregate marks disposed excluded, but all-committed groups currently derive as FIR `UT`. | Exclude `Committed` and `Disposed` proceeding records. | All-committed FIRs contribute zero; disposed plus active contributes the active count. | **Yes** |
| 4 — Multiple courts | Current metric counts one FIR summary. | Count each distinct pending court proceeding across JJB/Magistrate/Sessions. | May increase a FIR's contribution above one. | **Yes** |
| 5 — PO | No PO-specific rule in Reports. | PO flag/accused state does not alter the underlying proceeding status or add a count. | No direct effect. | **Yes** |
| 6 — Unknown/blank | Existing FIR derivation can treat unknown/blank as active (`UT`) through fallback. | Exclude from KPI and surface a separate data-quality count/list; alternate: include conservatively. | Recommended option can lower KPI while exposing unresolved records separately. | **Yes** |
| 7 — Duplicate proceedings | Loader deduplicates same Firestore path and records linked via `legacyCaseId`; no general fuzzy case dedupe. | Count unique document paths; honor existing legacy reference dedupe. Do not fuzzy merge distinct records. Flag unresolved possible duplicates. | Separate-ID duplicates may remain over-counted until reviewed. | **Yes** |
| 8 — Hearing date | KPI is not date-based; separate Next Hearings KPI counts any truthy date. | Pending count is independent of `nextDate`; keep upcoming/overdue hearing definitions separate. | No-date proceedings remain countable if status qualifies. | **Yes** |
| 9 — Legacy identity | Legacy `cases` records are normalized and can be linked by `firMasterId`/`firId` or `legacyCaseId`. | Count an eligible unique legacy document when it represents a real proceeding; flag incomplete proceeding identity; do not invent a fuzzy merge. | Some legacy records may need review and could affect totals. | **Yes** |
| 10 — Authorization | Report uses the existing `loadCaseRecords(db)` path, with station-scoped loading where project policy requires it; exports consume displayed report data. | Compute only from the same authorized in-memory record set. Do not add a broader query or bypass existing role/station controls. | Same authorized boundary; no additional records. | **No** for preserving current boundary; any change requires separate authorization. |

## 7. Reports and export impact

If approved for implementation, the directly affected elements are:

1. Reports KPI label in `pages/report.html`: **Pending** → **Pending Court Proceedings**.
2. KPI subtitle currently **At risk**: replace with a neutral explanation of the approved inclusion rule; do not imply urgency without a date/risk rule.
3. `assets/js/report.js` summary computation: currently filters FIR summaries; candidate would count eligible linked proceeding records from the already loaded authorized dataset.
4. `getReportExportData()`: change the summary row from “Pending” to “Pending Court Proceedings” and update export context/count text so the record grain is explicit. CSV, XLSX, and PDF all use this shared row list; no format-specific calculation is present.
5. Error/empty/loading: report starts with HTML zero values; after load it displays count or an em dash on load error. Keep this state behavior unless separately approved. With no eligible proceedings the count should be zero; how unknown statuses appear is an owner decision.
6. Tests: existing `test/data-export.test.mjs` tests generic export encoding/download data, not report Pending membership. No dedicated report pending-calculation test was found. Add pure synthetic tests for status inclusion, linked-record count, grouping/dedup behavior, date independence, and export label only when implementation is separately authorized.

Preserve `Unique FIRs`, FIR-level `Disposed`, the FIR-grain status chart, `Next Hearings`, and all unrelated report calculations. The screen would mix FIR-grain and proceeding-grain metrics; use explicit labels (“Unique FIRs”, “Disposed FIRs”, “Pending Court Proceedings”, “Upcoming Hearings” only if date logic actually guarantees upcoming) and a concise explanation of the different counting unit.

## 8. Implementation acceptance proposal

Once the remaining questions are approved, acceptance should require:

- Pending Court Proceedings counts distinct authorized linked court-proceeding records under the approved eligibility and status matrix.
- Multiple active proceedings under one FIR count separately; same document path is never counted twice.
- Committed, Disposed, UCR, Cancellation, unknown, and blank statuses follow explicit approved rules.
- Hearing dates do not affect the count if the status-only rule is approved; Upcoming/Overdue Hearings remain separate.
- The export summary uses the same value and clearly names the proceeding-level grain in CSV/XLSX/PDF.
- Total FIRs, FIR-level Disposed/status chart, Next Hearings, and existing authorization/data-loading behavior remain unchanged.
- Synthetic tests cover scenarios A–J, aliases/casing/whitespace, all supported stages/statuses, duplicates, missing identities, error/empty state, and export row label/value. No production data is used.

## 9. Risks and limits

- Broad `isCourtProceeding()` classification can include unexpected non-UCR case records because court identity fields are not required.
- Current status fallback considers unknown/blank values active for FIR derivation; reusing that fallback would conceal poor data quality.
- `Committed` has an ambiguous lifecycle: predecessor transfer may be complete while the successor is absent or delayed.
- Multiple court proceedings can be distinct but share similar registration/court text; fuzzy deduplication risks undercounting.
- Legacy documents may lack a stable proceeding identity or complete FIR linkage.
- The new proceeding count may rise relative to FIR-level Pending, especially where one FIR has several active courts.
- A cross-grain dashboard/report summary may be misread unless every metric label is precise.
- Authorization must remain the existing loaded dataset; this decision package does not audit or change Rules, queries, or permissions.

## 10. Owner approval questions

1. What exact records qualify as linked court proceedings: current `isCourtProceeding()` output as-is, or require a known court type/registration identity in addition?
2. Which exact proceeding statuses are included? Approve `UT` and specify whether `UI`, literal `In Progress`, and legacy equivalents qualify.
3. Should `Committed` always be excluded, including when there is no linked successor, or remain counted until a successor exists?
4. Should `Disposed` always be excluded per proceeding, while another active proceeding under the same FIR remains counted?
5. Should each distinct JJB/Magistrate/Sessions proceeding count separately, including predecessor and successor when both are nonterminal?
6. Should PO flags remain independent of status, with only the underlying proceeding counted?
7. Should unknown/blank statuses be excluded and surfaced as data-quality warnings, or included conservatively?
8. Is same-path plus existing `legacyCaseId` deduplication sufficient, with separate document IDs reviewed rather than fuzzy-merged? If not, what stable proceeding key is approved?
9. Confirm that `nextDate` does not affect Pending Court Proceedings and that Upcoming/Overdue Hearings remain separate metrics.
10. Confirm that UCR/Untrace/Cancellation records are excluded because they are not court proceedings under the existing classifier.

## Phase B implementation record (15 November 2026)

The owner approved all ten Phase B rules. Implemented them without changing `fir-case-model.js`, `fir-status.mjs`, the global proceeding classifier, Firestore queries, schema, Rules, or authorization.

### Calculation and normalization

Added `assets/js/report-pending-proceedings.mjs`, a Reports-scoped calculation over the already loaded `loadCaseRecords(db)` records. It first applies same `(collection, document ID)` deduplication and suppresses legacy `cases` documents whose IDs are referenced by a linked record's `legacyCaseId`, matching the existing loader behavior. It does not group by FIR or perform fuzzy matching. Different document IDs remain distinct, including distinct court proceedings under one FIR.

Eligibility starts with existing `isCourtProceeding(record)`, so FIR Masters and records classified as UCR/Untrace/Cancellation are excluded. Status is read only from normalized `record.status`, never from `caseStatus`/`firStatus` fallback fields that may reflect parent FIR status. `normalizeFirStatus()` provides the existing trim/case-insensitive aliases: `UI`/`Under Investigation` and `UT`/`Under Trial`. Exact `In Progress` is explicitly accepted, with case-insensitive and surrounding-whitespace normalization, as Phase B's approved active status. `Committed` and normalized `Disposed` are excluded. Blank, missing, null, `Unknown`, and unsupported values are excluded and increment `unknownStatusCount`. `nextDate`, PO flags, case stage, and parent FIR status do not alter the count.

### Reports and export

Changed the KPI label to **Pending Court Proceedings**, subtitle to **Active court proceedings**, and its initial value to an em dash until data loading succeeds. On a successful empty dataset the value becomes `0`; load errors continue to show an em dash. Added an accessible, live-region warning adjacent to the KPI that reports only the number of distinct eligible-classifier proceedings excluded for missing/unrecognized status; it reveals no case details and is hidden when the count is zero or loading fails. Warning details remain on-screen and are not added to the export schema.

The KPI and summary export use the same calculated result. The shared export summary row is now **Pending Court Proceedings** for CSV, XLSX and PDF; the existing export formats, scope behavior, columns and other report metrics are preserved. `Unique FIRs`, the FIR-level status chart, FIR-level Disposed, and Next Hearings calculations were not changed.

### Files changed

- `assets/js/report-pending-proceedings.mjs` — new scoped aggregation, deduplication, status mapping, and shared export row helper.
- `assets/js/report.js` — calculation/rendering, warning, shared export value/label.
- `pages/report.html` — KPI label/subtitle/loading placeholder and accessible warning container.
- `assets/css/report.css` — scoped responsive warning surface using existing theme variables.
- `test/report-pending-proceedings.test.mjs` — synthetic rule tests.
- `package.json` — include focused tests in `npm test`; no dependencies added.
- This decision package, `MASTER-UI-UX-ISSUE-REGISTER.md`, and `UI-UX-IMPLEMENTATION-CHECKLIST.md`.

### Verification and remaining gaps

Focused synthetic tests: **10 passed**. Root suite: `npm test` — **60 passed, 0 failed, 0 skipped**. `node --check assets/js/report.js` and the Reports helper passed. `npm run build -- --emptyOutDir` passed; Vite printed its existing advisory for chunks over 500 KB. Scoped `git diff --check` passed. A Playwright fixture using the actual Reports KPI markup and Dashboard/shared/Reports styles passed at 320, 375, 430, 768, 1024, 1366 and 1920px in both theme classes. The long KPI label and synthetic warning fit without page overflow. This fixture did not load Firebase or authenticated report data and no screenshots were captured.

Authenticated Reports testing, real role-scoped dataset/export validation, warning behavior against loaded data, and rendered export downloads remain required before closing UX-010. The viewport/theme check was a synthetic markup/style fixture, not authenticated E2E. No screenshots were added. UX-010 remains Medium · Open pending those checks.

### Rollback

Revert only the UX-010 Phase B edits in `assets/js/report.js`, `pages/report.html`, `assets/css/report.css`, and `package.json`; remove `assets/js/report-pending-proceedings.mjs` and `test/report-pending-proceedings.test.mjs`; revert this implementation record and the UX-010 entries in the master register/checklist. Preserve all pre-existing staged and unrelated working-tree changes. No data, schema, authorization, or deployment rollback is required.
