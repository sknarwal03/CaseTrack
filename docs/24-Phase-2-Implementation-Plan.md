# CaseTrack — Phase 2 Implementation Plan

**Prepared:** 2026-10-20
**Status:** High-priority integrity changes implemented and locally verified; extended browser failure/retry coverage and production readiness remain open
**Scope:** Confirmed defects and directly related integrity/test gaps in FIR Master, linked proceedings, save/retry behavior, and Rules verification
**Plan inputs:** Phase 2 audit and scenario matrix, current source, Add/Edit Case requirements, Role Management ADR, and Police Station Isolation ADR

## 1. Executive summary

### Admin Panel backend integration update — 2026-10-20

The previously isolated role-management handlers are now integrated into the root `functions/` deployment source and exported alongside the FIR identity callable. Normal Admin Panel requests use the initialized Firebase project's Functions endpoint; only explicit `role-admin-local` mode uses the demo emulator. Root `firebase.json` selects the candidate Admin Panel Rules and Node.js 22 runtime without selecting a project. The handlers have not yet been verified against the root emulator configuration in this update, and no production project, deployed resources, or indexes are verified. See the Production Readiness and Security Report for the exact verification results and release gate.

### Current implementation update — 2026-10-20

The initial findings and plan below reflect the source state at plan review. Since then:

- Multi-proceeding field isolation, FIR identity claims, and chronological hearing-stage selection have automated regression coverage.
- New linked proceeding drafts preallocate a stable document ID and creation timestamp, so retrying the same draft targets the same record.
- Transfer successor creation and predecessor update now commit in one Firestore batch. Candidate Rules tests verify the valid atomic transfer and that a denied cross-station transfer leaves both records unchanged.
- Operator station-name lookup and assigned-station-only station reads are implemented and tested; Admin navigation is explicitly hidden for Operators.
- Current local evidence: root tests **24/24**, FIR identity integration **15/15 on Node 22**, candidate station/Admin Rules **11/11**, production build passes, and root/Functions production dependency audits report zero vulnerabilities.
- Browser testing covered Admin/Operator access controls and synthetic FIR Master creation, but not full proceeding create/edit/transfer, network fault recovery, or all responsive/error workflows.
- Production Firebase target, deployed Rules/indexes, backup/restore and rollback remain unverified and require owner-approved access. No production resources were accessed.

At plan review, the inspected worktree contained two source-confirmed High-severity data-integrity defects:

1. A single set of active-form Investigating Officer, accused, witness, and highlight values is written to every proceeding in a multi-proceeding save.
2. Editing an FIR Master to an identity already owned by another master is not rejected by the model save helper.

The hearing-stage selector also sorts `d/m/Y` date strings lexicographically, which can choose the wrong stage when a record has multiple dated hearing stages. Separately, duplicate creation and safe recovery after an ambiguous timeout are not guaranteed by the present read-before-write checks and random-ID `addDoc()` path. Related save/transfer/status writes are intentionally not one modal-wide transaction; the approved requirement is partial save, so the implementation should make operation outcomes explicit and retries idempotent without rolling back successfully saved records.

This plan is ordered to protect proceeding data first, then enforce FIR identity, correct date ordering, and improve failure/retry behavior. The station-isolation ADR already approves stable-ID identity and an atomic deterministic uniqueness claim. Existing requirements already approve duplicate edit rejection, preserving existing records and history, and partial-save behavior. No business decision is needed to implement those rules.

Production authorization remains a release blocker: local candidate Rules tests are not evidence of deployed Rules. This plan does not authorize production access, deployment, data migration, or broad refactoring.

## 2. Current verified project state

### Repository state at plan preparation

- Branch and commit reported by the current repository inspection: `main`, `4f226657fc1d912e759d20848080f1444643c4b9`.
- The worktree already has extensive staged, unstaged, and untracked changes, including the FIR model, modal, project documentation, Admin Panel prototype, candidate Rules, and tests. They are pre-existing work and must remain untouched unless a later implementation task explicitly scopes a change.
- The Phase 2 report and matrix exist. This plan file did not exist when checked.
- This task is documentation-only. No tests or build were run as part of this plan review; test counts below are from the Phase 2 audit record and are clearly identified as prior execution.

### Relevant requirements and approved directions

- [Add/Edit Case Modal requirements](./14-Add-Edit-Case-Modal-Requirements.md#34-duplicate-fir-identity) require normalized FIR number/year/stable station ID identity, reject duplicate edits before saving the master or proceedings, do not silently merge, preserve each proceeding, and allow partial saves with safe retries.
- The same requirements define the existing FIR-status aggregation and preserve successful records when another save fails. The implementation must not change those business rules.
- [Police Station Isolation ADR](./13-Police-Station-Isolation-ADR%20(1).md#4-fir-identity-and-duplicate-key-design) approves a deterministic identity key, atomic claim/update, conflict rejection, release/claim on identity correction, and keeping the key separate from the stable `firMasterId`.
- [Role Management ADR](./12-Role-Management-ADR%20(1).md#21-role-permission-boundary) and the Police Station Isolation ADR require Firestore Rules enforcement for station isolation, operator scope, Admin all-station access, and default-deny behavior. These are intended controls, not proof of deployed enforcement.
- [Project overview](<./00-Project-Overview(1).md#62-fir-identification>) confirms FIR identity includes FIR number, FIR year, and police station; it does not authorize merging or rewriting existing records.

## 3. Rechecked findings and evidence

| Finding | Current evidence | Assessment |
|---|---|---|
| Multi-proceeding shared-field overwrite | In [add-case.js](../components/add-case/add-case.js), `courtFields` is assembled from the currently active `FormData` around lines 3022–3075. The save loop around lines 3190–3196 spreads that same object into each proceeding. The draft capture path stores case fields/hearings separately; this shared payload is not selected from each draft. | **Confirmed source defect — High.** Distinct proceeding-specific values can be overwritten. No runtime reproduction was performed. |
| FIR Master duplicate identity on update | In [fir-case-model.js](../assets/js/fir-case-model.js), `saveFirMaster()` finds a matching master around lines 375–376, but rejects a duplicate only under `if (!firMasterId && duplicate)` around lines 377–381. Existing-master updates continue to `updateDoc()` around lines 392–394. | **Confirmed source defect — High.** Contradicts the explicit modal requirement. No Firestore write test was run. |
| Hearing date ordering | [add-case.js](../components/add-case/add-case.js) configures Flatpickr with `dateFormat: 'd/m/Y'` around line 1224. The save path sorts date strings with `localeCompare()` around lines 3200–3206 before selecting a stage. | **Confirmed source defect — Medium.** String order does not equal calendar order for this format. No date-boundary regression test is present. The existing final-stage/no-next ambiguity remains separate and unresolved. |
| Sequential/concurrent duplicate checks | `findFirMasterMatches()` loads and compares masters; `saveFirMaster()` then separately writes with `setDoc()` or `updateDoc()`. The modal also checks UCR drafts/existing records before per-document writes. | Sequential duplicate create has a source pre-check; **concurrent uniqueness is not guaranteed**. A race is a potential risk, not a reproduced production defect. The approved ADR calls for an atomic identity claim. |
| Retry after ambiguous timeout | New linked proceeding creation uses `addDoc()` around line 3243 and sets `record.id` only after the promise resolves around lines 3248–3250. | **Potential risk.** If the server commits but the acknowledgement is lost, the draft may not know the generated ID. No timeout/fault test was run. |
| Partial save and transfer | The master and proceedings are separate writes; each proceeding has a catch around the save loop; transfer predecessor update follows the successor write around lines 3252–3261; master status update follows the loop around lines 3280–3286. | **Confirmed non-atomic write boundaries.** This is consistent with the approved partial-save policy for the whole modal, but transfer linkage and operation feedback need targeted recovery design. No failure injection was run. |
| Authorization | [firebase.test.json](../firebase.test.json) selects [firestore.test.rules](../firestore.test.rules), which grants broad authenticated access. [firebase.admin-panel.test.json](../firebase.admin-panel.test.json) selects candidate [firestore.admin-panel.rules](../firestore.admin-panel.rules). The root repository has no verified production Rules/deployment mapping in this audit. | Candidate Rules tests are local evidence only. **Production authorization is unverified and remains a release blocker.** |

### Test evidence already executed during Phase 2

The counts below describe the earlier plan-review baseline, not the current verification. See “Current implementation update” above for the latest results.

- `npm test`: 19 passed, 0 failed.
- From `security-prototypes/role-management`, `npm run test:rules:admin-panel`: 10 passed, 0 failed against the isolated candidate Rules emulator on port 8185.
- `npm run build`: passed, with Vite warnings about `__dirname` with the native config loader and a generated chunk above 500 kB.
- The shared browser page was the local Login page. No credentials were used and no case workflow was exercised.
- No main-app Firestore integration, injected failure, concurrent-submit, browser case-flow, or production test was run.

These are prior audit results, not tests run while preparing this plan.

## 4. Ordered implementation phases

### Phase 1 — Prevent cross-proceeding field corruption

**Priority:** P0 / High
**Finding:** Multi-proceeding shared-field overwrite
**Decision required:** No. Each proceeding already has its own IO, accused, witness, and highlight values as case-specific data; one record must not replace another’s values.

**Root cause and impact**

`courtFields` is read once from the active form, then used for every record in `caseRecordDrafts`. When multiple proceeding drafts are saved, fields that should belong to one proceeding may be copied over siblings. This risks court-record corruption and exposure of one proceeding’s party data in another.

**Proposed implementation**

1. Treat officer, accused, witness, and highlight data as part of each proceeding draft, not modal-global save state.
2. Capture these values when switching drafts and restore them when activating a draft, following the existing pattern for proceeding fields and hearing history.
3. Build a fresh proceeding payload from the current draft inside the per-record save loop.
4. Keep FIR-level shared data propagation (identity, File No, complaint/incident fields) separate from proceeding-specific data. Preserve the established legacy document ID and collection behavior.
5. Do not alter status, UCR, transfer, or deletion business rules in this phase.

**Likely files/modules**

- `components/add-case/add-case.js` — draft creation/capture/activation and per-record payload construction.
- `test/` — focused tests for draft serialization/payload construction; add only the smallest suitable test seam/helper.
- `docs/Add-Edit-Case-Field-Reference.md` — update only if the persisted per-proceeding mapping changes.

**Compatibility/data safety**

- Existing `linkedCases` and legacy `cases` document IDs and hearing arrays must remain unchanged.
- Do not backfill, migrate, or merge records.
- Existing values on each proceeding must remain attached to that same document.

**Required tests and objective acceptance**

- Create at least two proceeding drafts with different IO IDs/names, accused arrays, witness arrays, and highlight states. Serialize/save both; assert each document retains only its own values.
- Edit one of two existing proceedings; assert the sibling’s IO, accused, witnesses, highlight, status, hearing history, and relationship IDs are unchanged.
- Exercise switching active drafts and saving, including a legacy `cases` proceeding.
- Run current FIR status unit tests, case workflow integration tests in a fresh isolated emulator, browser create/edit flow, and production build.
- **Accept when:** no value from draft A can appear in draft B unless that value was explicitly edited on B; FIR-shared propagation and legacy IDs/hearings remain intact.

### Phase 2 — Enforce FIR identity on update and close duplicate races

**Priority:** P0 / High
**Finding:** Duplicate identity update; concurrent create/update risk
**Decision required:** No business-rule decision. The modal requirements and station-isolation ADR establish the identity and uniqueness behavior. Registry encoding/path is an implementation detail to validate against Rules and existing data before coding.

**Root cause and impact**

The model’s duplicate check rejects create conflicts but deliberately gates rejection on `!firMasterId`; editing a master can therefore collide with another master. Both create and edit checks are read-before-write, so two clients can pass simultaneously.

**Proposed implementation**

1. Add an immediate model-level guard that rejects any match with an ID different from the master being edited. It must execute before the master write and before any proceeding writes. Preserve the existing duplicate error pattern/UI feedback.
2. Implement the ADR-approved deterministic identity claim in a Firestore transaction for master create and identity correction. Keep the registry/claim document separate from `firMasterId`.
3. For identity correction, atomically claim the new key, verify it is unowned or owned by this same master, update the master, and release the former key only as part of the same transaction.
4. Keep the current pre-check for friendly UI feedback; do not treat it as the integrity boundary.
5. Define how the unique-key document is authorized in the candidate Rules test suite before using it. Default-deny policy must not be weakened for convenience. The deployed Rules remain unknown; do not deploy.
6. Inventory existing master identities only in a disposable local fixture during implementation. If conflicting existing records are encountered, preserve them and stop for reviewed reconciliation; no automatic merge or reassignment.

**Likely files/modules**

- `assets/js/fir-case-model.js` — normalized identity and transactional create/update path.
- `components/add-case/add-case.js` — surface duplicate feedback and ensure no proceeding write begins after rejection.
- `firestore.admin-panel.rules` and candidate Rules tests — only if needed to authorize/validate the approved claim path; local and reviewed changes only.
- `test/fir-status.test.mjs` or a focused model test file — helper/model regression tests.
- `security-prototypes/role-management/tests/case-data.rules.test.js` — isolated authorization/claim tests.

**Compatibility/data safety**

- Keep FIR Master document IDs stable.
- Preserve existing proceeding IDs and all `firMasterId`, `firId`, `predecessorCaseId`, and `successorCaseId` relationships.
- Do not auto-merge duplicates or rewrite legacy `firId`.
- Existing masters with missing station IDs or duplicate identities require explicit inventory/review before any registry backfill. Backfill/migration is not included in this plan.

**Required tests and objective acceptance**

- Update one master to collide with another using normalized FIR number/year/station ID; assert rejection and prove neither master nor any proceeding changed.
- Update a master without changing its identity; assert its own existing claim is accepted.
- Verify same FIR number/year at different stable station IDs remains valid; verify normalized equivalent identity at one station conflicts.
- Submit simultaneous creates and simultaneous conflicting identity updates in two emulator clients; assert exactly one unique claim/master identity wins and no orphan claim remains.
- Retry the same request after a simulated lost acknowledgement; assert it resolves to the same master ID without creating a second master.
- Run candidate Rules positive/negative tests for Admin, assigned Operator, cross-station access, direct claim access, and denied unauthorized claim mutation. Run the test in an isolated emulator; do not clear the already-running unknown emulator.
- **Accept when:** create and edit conflicts are rejected before proceeding writes, concurrent operations cannot reserve the same identity, stable master IDs and existing relationships remain intact, and no unreviewed existing data is rewritten.

### Phase 3 — Correct chronological hearing-stage selection

**Priority:** P1 / Medium
**Finding:** Lexicographic ordering of `d/m/Y` values
**Decision required:** No for calendar ordering. The separate documented rule conflict about final stages when no `next` record exists must remain unchanged until resolved.

**Root cause and impact**

Raw `d/m/Y` date strings are sorted lexically, so day/month/year components do not compare in chronological order. The selected stage can be wrong, leading to an incorrect proceeding status and derived FIR status.

**Proposed implementation**

1. Add a small, strict parser/comparator for the date format used in hearing records.
2. Select the chronologically latest valid hearing stage while preserving the current stage mapping and fallback behavior.
3. Do not infer or change the meaning of “no next hearing,” `Committed`, or `Disposed`; isolate that unresolved product rule from this correction.
4. Decide explicitly how malformed/missing dates are handled using existing validation conventions. Do not silently convert invalid values to a success-shaped date.

**Likely files/modules**

- `components/add-case/add-case.js` or an existing date utility — date parsing and latest-stage selection.
- `test/` — unit tests for the comparator/selector.
- `docs/14-Add-Edit-Case-Modal-Requirements.md` only after owner resolution of the final-stage/no-next ambiguity; no update is required to implement chronological comparison itself.

**Compatibility/data safety**

- Do not rewrite stored hearing dates or history.
- Keep the same displayed date format and current status mappings.
- No FIR status lifecycle changes are included.

**Required tests and objective acceptance**

- Test order across day, month, year boundaries (including `15/12/2024` vs `02/01/2025`), same date, missing stage, missing date, and invalid date.
- Verify `Committed`/`Disposed` mappings and existing FIR aggregation tests remain unchanged.
- In an isolated emulator/browser flow, save and reload a proceeding with multiple hearing entries and confirm the persisted status derives from the chronologically latest eligible entry.
- **Accept when:** valid `d/m/Y` dates are ordered chronologically and all existing status lifecycle tests pass, with no behavior change to unresolved fallback rules.

### Phase 4 — Make partial writes explicit and retries safe

**Priority:** P1 / Medium
**Findings:** Separate writes, transfer partial state, ambiguous proceeding-create acknowledgement
**Decision required:** The modal-wide partial-save behavior is approved. The precise operation-level boundary for transfer and the diagnostic/reconciliation UX should be confirmed during implementation design only if existing UI patterns do not make it clear; do not block Phases 1–3.

**Root cause and impact**

Master, proceeding, transfer counterpart, and derived-status updates are separate writes. A later failure does not roll back earlier commits. For `addDoc()`, the draft receives its ID only after the acknowledgement; a commit with lost acknowledgement may be retried as a second create. Transfer can persist one side of a relationship without the other.

**Proposed implementation**

1. Preserve documented partial-save semantics across the whole modal: successful records stay saved; failures are shown per record/action; no whole-form rollback.
2. Preallocate and retain a stable document reference/ID for each new proceeding draft before issuing its first network write, then use the same reference for retries. Preserve that reference in the draft until success is known. Do not use a new ID for a retry of the same draft.
3. Make the predecessor/successor pair a single atomic operation where the Firestore transaction/batch constraints and current Rules allow it. Allocate the successor reference before the operation. Do not mark the predecessor Committed unless the relationship operation commits.
4. Track which sub-operations succeeded/failed in the current save attempt and present truthful feedback if proceeding writes succeeded but master status refresh failed.
5. Keep FIR status derivation as-is; retry/reconciliation should recompute from the persisted linked records rather than rolling back valid records.
6. Do not make all modal writes one transaction. The approved partial-save policy explicitly retains successful records.
7. Do not change permanent deletion into soft deletion in this phase; deletion/voiding is a separate business decision.

**Likely files/modules**

- `components/add-case/add-case.js` — stable draft reference, transfer operation, per-action result reporting.
- `assets/js/fir-case-model.js` — shared write helpers only if needed; avoid broad abstraction.
- Isolated Firestore integration tests and, if necessary, test-only fault injection.
- Candidate Rules/tests, if atomic transfer operations need added Rules coverage.

**Compatibility/data safety**

- Existing IDs are always updated in place; existing hearing history remains intact.
- Stable references apply to new drafts only; no existing document ID changes.
- Preserve `firMasterId`/`firId` and transfer relationship semantics.
- Do not delete successful writes on retry or automatically repair ambiguous legacy relationships without review.

**Required tests and objective acceptance**

- Fail the master write after a proceeding save; fail a proceeding after master save; fail a master status update after proceeding success; verify retained documents and exact UI feedback.
- Simulate server commit followed by client acknowledgement loss; retry the same draft and assert exactly one document exists at the preallocated ID.
- Fail each transfer operation boundary; assert the committed state is either both relationship sides updated or neither, with a recoverable error.
- Retry after one of several drafts fails; assert successful documents retain their IDs and are updated, not duplicated.
- Test network unavailable before commit and response timeout after commit with an isolated emulator/fault proxy. Do not use production.
- **Accept when:** the whole-modal save remains intentionally partial, every action’s commit outcome is represented accurately, same-draft retry does not duplicate, and transfer relationships cannot be left half-written by the supported operation.

### Phase 5 — Verify authorization integration and release gate

**Priority:** P0 release blocker; implementation of authorization is outside this task
**Finding:** Production Rules are not verified
**Decision required:** Project owner/security operator must identify the authorized production Firebase project and source of deployed Rules. No production access is required to plan or test Phases 1–4 locally.

**Proposed implementation/verification**

1. Keep test-only `firestore.test.rules` separate from any production target.
2. Verify the approved policy against Admin all-station access, Operator station-only CRUD, unauthenticated/revoked denial, direct document paths, collection queries, master/proceeding relationship constraints, and the uniqueness-claim operation.
3. Exercise the main application query shapes against the isolated candidate policy. Source inspection indicates the non-local-role-admin load path performs broad collection reads; candidate Rules may reject those reads. Adjust query scoping only as a separately reviewed application change consistent with station policy.
4. Do not infer that candidate Rules are deployed. Do not run `firebase deploy`, query production data, or change production Rules as part of this plan.

**Likely files/modules**

- `firestore.admin-panel.rules` and its isolated Rules tests as a local candidate only.
- `assets/js/fir-case-model.js` if query shapes must be aligned with approved station scope.
- Authorized production deployment inventory is a project-owner prerequisite; no production configuration file is to be invented here.

**Required tests and objective acceptance**

- Run Rules tests on a fresh, dedicated emulator/project/port; inspect the process/config owner first and never clear a shared/unknown emulator.
- Verify positive/negative Admin and Operator access, direct reads, queries, legacy record behavior, linked master references, and unique identity claim rules.
- Run main-app read/write scenarios under the candidate Rules and assert queries neither leak records nor fail unexpectedly.
- **Accept for local implementation:** intended operations pass and unauthorized operations fail under the candidate policy.
- **Accept for production release:** the actual deployed Rules and project mapping are independently identified/reviewed and tested. This remains outside the current plan’s verification.

## 5. Cross-phase verification strategy

### Automated tests

1. Add focused pure unit tests for per-draft proceeding payloads and date ordering.
2. Add model integration tests for `saveFirMaster()` create/update duplicate behavior using only a fresh isolated emulator.
3. Add concurrency and ambiguous-timeout tests for identity claims and stable draft IDs where the emulator/fault harness can establish the server commit boundary.
4. Preserve and rerun all current FIR-status, identity, and legacy-normalization tests.
5. Run candidate Rules tests with operator/admin roles and the same collection/query shapes the application uses.
6. Run the production build after the changes.

### Browser tests

With an isolated test project and disposable test identity:

- Create an FIR Master without a proceeding.
- Reuse an existing master and reject a duplicate edit.
- Save two proceedings with distinct IO/accused/witness/hearing values; reload and verify both.
- Transfer Lower Court to Sessions Court and verify both relationship directions.
- Exercise a partial save and retry without duplicate records.
- Verify the modal remains open and describes each failed action.
- Do not use production credentials or data. If isolated auth/test fixtures are unavailable, report browser scenarios as blocked rather than passed.

### Safe emulator procedure

- Confirm the emulator command, project ID, config, and ports before starting tests.
- Use a dedicated demo project ID and free ports. Never repurpose or clear the already-running `demo-casetrack-role-prototype` emulator.
- Seed only synthetic records created for the test run; use unique collection/document IDs.
- Use Rules-unit-testing cleanup only inside the freshly started, dedicated emulator.
- Do not call production Firebase, deploy Rules, migrate, or modify live data.

## 6. Decisions and unresolved questions

### No decision needed for the confirmed defects

- Keep each proceeding’s data independent; this follows the existing proceeding model and requirements.
- Reject a duplicate identity update; the Add/Edit requirements explicitly require it.
- Use chronological ordering for valid `d/m/Y` values; this corrects the current selection mechanism without changing status mappings.
- Use the station-isolation ADR’s atomic deterministic identity claim; do not replace the stable `firMasterId`.
- Preserve partial-save behavior; do not convert the entire modal to an all-or-nothing transaction.

### Decisions that remain necessary, but do not block this plan

1. **Final-stage/no-next hearing rule:** The Modal Requirements already record conflicting guidance. Phase 3 must preserve existing fallback behavior until the owner resolves whether and how a saved final-stage hearing without `kind: next` determines case status.
2. **UCR reopening/multiple reports:** Decide whether multiple reports are permanently prohibited or how historical reports/current status are represented. Do not change current UCR rules in these phases.
3. **Proceeding deletion versus voiding:** Decide whether legal/history retention requires soft-delete/audit behavior. Phase 4 keeps the existing delete behavior and does not introduce a migration.
4. **Legacy identity without stable station ID:** Define the reviewed process for records whose station identity is ambiguous before any unique-key backfill or automatic linking. Preserve such records and their IDs in the meantime.
5. **Production authorization source:** Owner/security operator must identify the production project and deployed Rules source. Until then, production access remains unverified.

## 7. Risks, dependencies, and release blockers

- **Data corruption risk:** Phase 1 must precede broad use of multi-proceeding editing.
- **Duplicate identity risk:** The immediate update guard and transactional uniqueness enforcement are both required; UI pre-check alone is insufficient.
- **Rules dependency:** The identity registry and transfer transaction must be testable under approved Rules. The candidate policy is not deployed, and the app’s non-local read queries may not be compatible with station-scoped rules.
- **Existing data risk:** Existing duplicate identities, missing station IDs, and legacy `firId` values must be inventoried/reviewed before any backfill. No data rewrite is included.
- **Partial-write risk:** A transaction for transfer and identity claim does not make unrelated master/proceeding writes atomic. User-facing partial outcomes and idempotent retries remain essential.
- **Business-rule risk:** Do not bundle final-stage, UCR reopening, or deletion semantics changes with these technical fixes.
- **Release blocker:** Production Rules, production project mapping, and actual access boundaries remain unverified. A successful local build or candidate Rules test cannot clear this blocker.

## 8. Explicit exclusions and deferred work

- No application code, Firestore Rules, Firebase configuration, tests, or project overview changes in this plan task.
- No production access, deployment, Rules publication, migration, registry backfill, merging, reassignment, data deletion, or cleanup.
- No broad rewrite of case persistence or conversion of the whole modal save into one transaction.
- No Admin Panel feature work.
- No change to FIR status lifecycle, UCR cardinality, reopening semantics, transfer legal meaning, or delete/void policy.
- No claim that any proposed test passed until it is run in its authorized isolated environment.

## 9. Recommended execution order

1. **Complete:** Implement Phase 1 proceeding-specific draft capture/serialization and its regression test.
2. **Complete:** Implement Phase 2 duplicate-update guard, ADR-aligned transactional unique-identity claim, and isolated Rules coverage.
3. Implement Phase 3 strict chronological date selection; leave final-stage/no-next behavior unchanged pending the owner decision.
4. Implement Phase 4 stable retry IDs, transfer atomicity, and operation-level partial-failure reporting.
5. Complete Phase 5 local candidate Rules/app-query verification; obtain a reviewed production Rules source before any release claim.
6. After each phase, run focused tests, existing unit tests, the relevant isolated Rules tests, and build; run browser scenarios once the isolated auth fixture is ready.

## 10. Implementation report — High-priority Phases 1–2

**Implementation date:** 2026-10-20\
**Result:** Both requested defects are fixed in the application save path and covered by local regressions. No production Firebase resources were accessed.

### 10.1 Root causes and fixes

| Defect | Root cause | Fix |
|---|---|---|
| Proceeding-specific data overwrite | One `courtFields` payload was built from the active form and copied into every saved proceeding. Drafts retained court/hearing values, but not IO, accused, witness, and highlight values. | Added proceeding-field normalization, capture, restore, and serialization. Each draft owns its own IO, accused, witness, and highlight values; the save loop builds its payload from that draft. Reloading linked records also preserves unsaved proceeding-specific draft fields. FIR Master values remain propagated through the existing shared-field path. |
| Duplicate FIR Master identity on edit / concurrency | `saveFirMaster()` rejected a matching identity only on create. Its pre-read was separate from the master write, leaving concurrent saves able to claim the same identity. | Reject any match owned by a different master before the save proceeds. In a Firestore transaction, read the deterministic SHA-256 identity claim, reject another owner, set the claim, and create/update the stable-ID master together. On identity correction, release the old claim in the same transaction. The master ID remains independent and unchanged. |

The candidate station-scoped Rules now authorize an identity claim only when it is associated with the matching master in the transaction’s post-write state; they scope claim reads and writes by station and require claim/master consistency for new masters and identity edits. Test-only Rules also include a deliberate master-write denial to verify transaction rollback. These are candidate/local Rules, not deployed production policy.

### 10.2 Files changed for this implementation

- `assets/js/fir-case-model.js` — duplicate edit rejection and atomic identity claim.
- `assets/js/proceeding-fields.mjs` — per-proceeding form normalization/capture/payload helpers.
- `components/add-case/add-case.js` — per-draft capture, restore, save, and reload merge.
- `test/proceeding-fields.test.mjs` — regression with two proceedings carrying distinct officer, accused, witness, and highlight values.
- `test/fir-master-integrity.integration.test.mjs` — isolated emulator create, duplicate, edit, concurrency, station distinction, and rollback cases.
- `firebase.phase2.test.json` — dedicated test-only Auth/Firestore emulator ports.
- `firestore.test.rules` — test-only failure injection; not deployment Rules.
- `firestore.admin-panel.rules` — candidate Rules for atomic claim/master pairing and station-scoped claim access.
- `security-prototypes/role-management/tests/case-data.rules.test.js` — claim pairing, station isolation, and identity-edit transaction coverage.
- `security-prototypes/role-management/package.json` — isolated `test:fir-integrity` command.
- `package.json` — include the proceeding regression in `npm test`.
- This implementation report in `docs/24-Phase-2-Implementation-Plan.md`.

### 10.3 Verification performed and results

All emulator commands below were run from `security-prototypes/role-management`. The dedicated identity test used project `demo-casetrack-phase2-integrity` with Auth port `9199` and Firestore port `8190`; those ports were confirmed free before use. The already-running emulator on port `8080` was not cleared or modified.

| Check | Command | Result |
|---|---|---|
| Unit, FIR status, legacy-history, and proceeding regression tests | `npm test` | **20 passed, 0 failed.** Includes existing status/identity/legacy tests and two-proceeding serialization regression. |
| FIR Master isolated Firestore integration | `npm run test:fir-integrity` | **9 passed, 0 failed.** Unique create; distinct stations; duplicate create; conflicting edit preserves master/proceeding/history; unchanged identity; valid identity correction/release; concurrent claim race; failed create; failed update rollback. |
| Candidate baseline/station Rules and Admin Panel case-data Rules | `npm run test:rules` | **12 passed, 0 failed** (2 baseline/station tests and 10 candidate case-data Rules tests). The candidate tests cover claim transactions and station-scoped access. |
| Production bundle | `npm run build` | **Passed.** Existing Vite warnings remain: native config loader does not support `__dirname`; generated Firebase JS chunk exceeds 500 kB. |
| JavaScript syntax | `node --check` on the changed model, modal, helper, and test files | **Passed.** |
| Whitespace/conflict-marker check | `git diff --check` | **Passed** (line-ending notices concern unrelated existing worktree files). |

No browser case workflow, production Firebase test, deployment, migration, or backfill was run.

### 10.4 Compatibility, preservation, and remaining limitations

- FIR Master IDs, proceeding document IDs, master relationships, transfer relationship fields, and hearing history are not rewritten by these fixes. Legacy proceedings continue to update in their existing collection/document.
- The new identity claim is separate from `firMasterId`. Existing claims are not backfilled; a successful save of an existing stable-station FIR Master establishes or refreshes its claim. No bulk migration, merge, deletion, or reassignment was performed.
- The pre-save duplicate lookup remains for existing masters and legacy compatibility; the transaction-backed claim is the concurrency boundary for `saveFirMaster()`. An existing identity with a missing/ambiguous stable station ID still needs reviewed reconciliation; no station-ID backfill was attempted.
- The main application’s non-local master-list query has not been verified against the candidate station-scoped Rules. The candidate Rules suite validates its direct query shapes, not an authenticated browser workflow through the whole modal. Production Rules/project mapping remain unverified and are still a release blocker.
- The original implementation used client-side SHA-256 and candidate Rules that did not recompute the key. That direct-write gap was subsequently closed locally; see Section 10.5 and the current [production readiness report](./25-Production-Readiness-and-Security-Report.md). Production Rules and deployment remain unverified.
- No unresolved business decision blocks these two fixes. Deferred decisions in Section 6 remain unchanged.

**Updated plan status:** High-priority Phases 1–2 complete under local tests. Phases 3–5 and browser/production verification remain outside this implementation.

### 10.5 Trusted FIR identity claim follow-up (2026-10-20)

- FIR Master creation/update and identity claims now go through a callable trusted Function. The Function derives the SHA-256 claim ID itself, verifies the active role and station assignment, and atomically updates the master and old/new claims.
- Candidate Firestore Rules now allow client reads within the existing station boundary but deny all direct client create/update/delete operations on `firMasters` and `firIdentityClaims`. The role-management local emulator exposes the same handler for local app compatibility.
- Isolated verification ran **11/11** FIR integrity integration tests, including alternate forged claim writes, concurrent duplicate attempts, station scope, Admin identity correction, denied Operator correction, conflict rollback, and same-ID retry. Candidate Rules tests passed **10/10**.
- The root Functions source still has no approved Firebase deployment mapping. The local candidate policy and Functions emulator do not establish production protection; see the release report.

### 10.6 Approved FIR identity-correction policy alignment (2026-10-20)

- **Approved decision:** Admins may correct FIR identity across stations, subject to the existing active-role and valid-station checks. Operators may correct identity only for an FIR Master whose existing stable `policeStationId` matches their active, Admin-assigned station. An identity correction cannot transfer station ownership; the station ID must remain unchanged for both roles.
- **Rationale and security constraints:** the station ID is part of the uniqueness key and the data-ownership boundary. Allowing its change in an identity edit would turn correction into reassignment. The callable now checks current role and existing Master ownership inside the same transaction that updates the Master and claims. It continues to derive claim IDs server-side, reject duplicates, claim the new identity and release the old claim atomically. Firestore Rules continue to deny all client writes to both protected collections.
- **Regression coverage:** Operator correction at its assigned station; Operator correction of another station's FIR and attempted station transfer; Admin correction at a different station; concurrent corrections to one identity; oversized document commit failure with old Master/claim preservation and successful retry; direct claim create/update/delete denial; and existing duplicate, concurrency, rollback, retry, and legacy tests.
- **Verification on 2026-10-20:** root `npm test` **20/20 passed**; FIR Auth/Firestore/Functions emulator integration **15/15 passed** on demo project `demo-casetrack-phase2-integrity`; candidate Firestore Rules **10/10 passed** on demo project `demo-casetrack-admin-panel-rules`; `npm run build` passed with existing Vite `__dirname` and chunk-size warnings; syntax/JSON checks passed; `git diff --check` exited 0 with line-ending notices on unrelated pre-existing files.
- Emulator Functions ran with installed Node **24.22.0** because Node 22 was unavailable on the host; the package and emulator configuration declare Node 22. Production deployment mapping, deployed Rules, indexes, backup/restore, and full browser workflows remain unverified and remain release blockers.

**Policy status:** The earlier Admin-only restriction and denied-Operator test described in Section 10.5 are superseded by this approved policy and its implementation. This approval resolves the identity-correction policy blocker; it does not approve deployment or station reassignment.

### 10.7 Root Admin Panel backend integration (2026-10-20)

- This subsection records the initial root integration before the owner approved the target and email onboarding. Its statements about no project alias and incomplete password setup are superseded by §10.8.
- Root Functions and browser integration were emulator-tested; detailed counts/commands are in [the production-readiness report](./25-Production-Readiness-and-Security-Report.md).
- Live Hosting/Auth/SendGrid settings, IAM, deployed Rules/indexes, backup/rollback and deployment approval remain external gates. No production access, deployment, data change, or migration occurred.

### 10.8 Approved project and Operator email onboarding (2026-10-20)

- The project owner approved Firebase project `casetrack-97a4e`; `.firebaserc` now sets it as the default, and normal frontend Functions resolution rejects any different project ID. `firebase.json` selects Node.js 22 and includes predeploy checks against the approved project.
- Admin Operator creation accepts only email, station ID and request ID. Root Functions provisions the Auth identity without a password and records its role/history. SendGrid delivers a random 256-bit custom setup token; only the SHA-256 hash is stored in Firestore. The token expires after 24 hours, is carried in the URL fragment, and is atomically claimed before a trusted Function sets the password using Firebase Admin SDK. Firebase Auth's native reset endpoint cannot consume it.
- Admin resend replaces the token hash and invalidates the prior link. Public recovery remains non-enumerating and rate-limited. Both validate an active, enabled Operator server-side. Failed delivery leaves a newly provisioned account disabled and supports retry/resend recovery.
- Isolated Functions/browser E2E covers provisioning, station assignment, duplicate rejection, resend and old-link revocation, failed email delivery and recovery, public recovery behavior, one-time password change/reuse rejection, invalid links, Admin role transitions, and Operator denial. See exact commands/results in the current production readiness report.
- Live read-only checks confirmed the approved project, `us-central1` design region, GitHub Pages Auth domain, and deployment IAM grants. The Cloud Functions API is disabled, Secret Manager is blocked by the Spark plan, production Rules allow every authenticated user to read/write every document, no composite indexes or backup schedules/buckets are present, and the published Admin Panel/setup routes return 404. See §10.9 and the Production Readiness report. The owner has authorized production release, but deployment is stopped until billing, backup, Rules compatibility, SendGrid, and frontend publication gates are resolved.

### 10.9 Production release inspection (2026-10-20)

- Live project `casetrack-97a4e` uses the default Firestore database in `asia-south2`, Standard edition, free tier. PITR and delete protection are disabled; version retention is 3,600 seconds. No backup schedule or Cloud Storage bucket was found.
- The live Firestore release is `cloud.firestore`; its deployed Rules grant read/write to any authenticated user on all collections. The candidate role/station Rules were not deployed because their legacy-record and existing-role compatibility cannot be validated without a recoverable backup and safe production data inventory.
- Deployed composite indexes are empty. The candidate release has no `firestore.indexes.json`; no composite index is currently identified by the inspected query paths. Functions inventory could not be read because the Cloud Functions API is disabled, so no Functions deploy was attempted.
- The current CLI account has the relevant IAM grants for Functions, Firestore, Rules, and Secret Manager operations. The project is nevertheless on Spark; Firebase reports that enabling Secret Manager requires the Blaze plan. No billing change, secret change, backup, Rules update, Functions deployment, or production data operation was performed.
- Firebase Auth email/password is enabled, and `sknarwal03.github.io` is an authorized domain. The public login page returns HTTP 200, but the Admin Panel and password setup routes return HTTP 404. No GitHub Pages publication occurred.
- Latest test results and the current `NOT READY` decision are in the Production Readiness and Security Report. Emulator tests run on host Node 24.22.0 because Node 22 is not installed; Node 22 remains the declared Functions runtime.
