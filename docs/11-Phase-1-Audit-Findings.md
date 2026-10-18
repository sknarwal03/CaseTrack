# 11 --- Phase 1 Audit Findings

**Project:** CaseTrack\
**Audit phase:** Phase 1 --- FIR Master, Linked Court Proceedings, and
Add/Edit Case Modal\
**Audit target:** Latest uploaded local working copy\
**Audit mode:** Read-only source inspection and limited unit testing\
**Implementation changes:** None\
**Document status:** Audit findings and planning record; not an
implementation approval

------------------------------------------------------------------------

## 1. Audit Scope and Verified Repository Details

### 1.1 Scope

Phase 1 focused on inspecting the source paths associated with:

-   FIR Master creation, lookup, matching, and update.
-   Linked Court Proceedings and FIR-to-proceeding relationships.
-   Add/Edit Case Modal data flow.
-   Legacy `cases` record compatibility and linking.
-   FIR-level status derivation and persistence.
-   Data consistency risks across related Firestore documents.

No source code was changed during the audit. The current working copy's
uncommitted changes were to be preserved.

### 1.2 Repository details

  --------------------------------------------------------------------------------------------
  Item                    Audit record                                 Verification status
  ----------------------- -------------------------------------------- -----------------------
  Audit target            `Case Management Codex(1).zip` --- latest    Confirmed as the agreed
                          local working copy supplied by the user      audit target

  Branch                  `new-addcase-modal`                          Read from the ZIP's Git
                                                                       metadata

  Commit                  `03c5a48f79b4067bc00d04587a20f8498d90c0dd`   Read from the ZIP's Git
                                                                       metadata

  `main` / `origin/main`  Reported at the same commit as the working   Read from the ZIP's Git
                          branch                                       metadata

  Working-tree state      Tracked modifications, staged and unstaged   Read from the ZIP's Git
                          modal changes, new source/test/documentation metadata/status
                          files, and a deleted deployment workflow     
                          were present                                 

  Source changes during   None                                         Confirmed by the audit
  audit                                                                process

  Live production data or Not inspected                                Unverified
  deployed environment                                                 
  --------------------------------------------------------------------------------------------

The ZIP represents a working copy whose files differ from the checked-in
commit. The commit hash alone therefore does not describe all code
included in the audit target.

### 1.3 Relevant inspected files

The Phase 1 findings reference these files and code areas:

-   `assets/js/fir-case-model.js`
    -   Collection references and legacy loading: approximately lines
        38--76.
    -   FIR Master matching: approximately lines 113--178.
    -   Master/proceeding model helpers: approximately lines 79--110.
-   `assets/js/fir-status.mjs`
    -   FIR status derivation: approximately lines 9--37.
-   `components/add-case/add-case.js`
    -   Modal and draft workflows: approximately lines 1660--1720,
        1863--1952, 2053--2063, 2078--2295, and 2840--2956.
-   `add-edit-case-modal-flow.md`
    -   Documented intended modal workflow and data schema.
-   `test/fir-status.test.mjs`
    -   FIR status unit tests.

Line ranges are approximate review pointers from the inspected snapshot;
confirm them against the exact file revision before using them as
immutable references in future implementation tasks.

------------------------------------------------------------------------

## 2. Existing Implementation Findings

### 2.1 FIR Master

**Provisional status:** Partially Implemented

**Observed in source:**

-   A `firMasters` collection is defined.
-   FIR identity matching uses `firNo`, `firYear`, and `policeStation`.
-   Matching includes whitespace trimming and case normalization.
-   The code searches for existing master matches and unlinked legacy
    records before creating a master.
-   A helper exists to update an existing FIR Master.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines 13--22
and 113--178.

**Verification status:** Source-code paths inspected. Full browser
workflow, live Firestore behaviour, concurrency behaviour, and
production data integrity were not verified.

**Known limitation from inspection:** The create path checks for
duplicate matches, but the update path does not appear to block an
update that would give two masters the same identity. The duplicate
check and save are also not one atomic operation, so concurrent creation
is a potential duplicate risk.

### 2.2 Linked Court Proceedings

**Provisional status:** Partially Implemented

**Observed in source:**

-   A `linkedCases` collection is used for linked proceeding records.
-   Proceeding records can contain court registration, court/judge
    information, status, accused/witness information, and hearing
    history.
-   FIR relationships use `firMasterId` and `firId`.
-   Transfer-related relationship fields include `predecessorCaseId` and
    `successorCaseId`.
-   UCR reporting can be represented with `recordType: 'ucr'`.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines
79--110; `components/add-case/add-case.js`, approximately lines
2853--2922.

**Verification status:** Relevant source paths inspected. Multi-document
failure recovery, live Firestore writes, and complete transfer lifecycle
were not tested.

**Known limitation from inspection:** Related documents are written
through separate operations. A failure between operations may leave only
part of the intended state saved.

### 2.3 Add/Edit Case Modal

**Provisional status:** Partially Implemented

**Observed in source:**

1.  Existing FIR Master search and selection.
2.  Creation of a new FIR Master.
3.  A legacy-record verification/linking flow.
4.  Draft handling for multiple court/UCR records under one FIR.
5.  Updates to existing records using their document IDs.
6.  Hearing-record processing and FIR-status processing in the save
    flow.

**Evidence:** `components/add-case/add-case.js`, approximately lines
1863--1952, 2053--2063, 2078--2295, and 2840--2956. Intended behaviour
is also documented in `add-edit-case-modal-flow.md`.

**Verification status:** Source paths inspected. The full modal workflow
was not verified in a browser against live Firestore.

**Important distinction:** Presence of code for a workflow is not proof
that every scenario behaves correctly at runtime.

### 2.4 Legacy compatibility

**Provisional status:** Partially Implemented

**Observed in source:**

-   Legacy `cases` records remain part of the data-loading/editing flow.
-   A legacy linking flow exists.
-   Original document IDs are used for existing-record updates.
-   The model code uses `firMasterId || firId` in at least one lookup
    path.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines 48--70;
modal save/update paths in `components/add-case/add-case.js`.

**Verification status:** Source paths inspected. Existing production
records were not examined, and no migration was executed.

**Known concern:** A legacy `firId` is not guaranteed to be a Firestore
FIR Master document ID. Treating it as one without validation can
produce incorrect associations if an ID collision exists.

### 2.5 FIR status calculation

**Provisional status:** Partially Implemented

**Observed in source:**

-   `deriveFirStatus()` derives a FIR-level status from linked records.
-   The inspected logic returns `Disposed` when all relevant court
    records have status `disposed`.
-   A `Committed` predecessor is treated as active by the inspected
    status logic.
-   UCR status handling uses the report type from the last UCR record in
    the array.

**Evidence:** `assets/js/fir-status.mjs`, approximately lines 9--37;
transfer handling in `components/add-case/add-case.js`, approximately
lines 2907--2917.

**Verification status:** Unit tests were run for the FIR status module.
Full lifecycle behaviour---including transfer, reopening, multiple UCR
reports, and persistence---remains unverified.

**Known concerns:**

-   The inspected transfer flow did not show an automatic step that
    changes the predecessor's status to `Disposed`. If the business rule
    requires that transition, the derived FIR status may remain `UT`.
-   Array order does not necessarily mean chronological order. Selecting
    the last UCR record does not guarantee selecting the most recent or
    authoritative report.

### 2.6 Transfer relationship

**Provisional status:** Partially Implemented

**Observed in source:** The code writes predecessor/successor
relationship fields during the inspected transfer flow.

**Evidence:** `components/add-case/add-case.js`, approximately lines
2907--2917.

**Verification status:** Source paths inspected; partial-failure
scenarios and end-to-end transfer behaviour were not tested.

**Known concern:** Updating the successor and predecessor in separate
operations can leave an inconsistent relationship if one write succeeds
and the other fails.

------------------------------------------------------------------------

## 3. Provisional Feature Inventory Status

The statuses below are provisional and apply to the supplied
working-copy snapshot.

  ----------------------------------------------------------------------------------
  Feature                 Provisional       Evidence               Verification
                          status                                   status
  ----------------------- ----------------- ---------------------- -----------------
  FIR Master              Partially         `fir-case-model.js`    Source inspected;
                          Implemented       contains               full workflow
                                            create/update/search   unverified
                                            logic                  

  Linked Court            Partially         `linkedCases`, FIR     Source inspected;
  Proceedings             Implemented       relationship fields,   Firestore
                                            proceeding save flow   integration
                                                                   unverified

  Add/Edit Case Modal     Partially         Master selection,      Source inspected;
                          Implemented       draft handling, legacy complete browser
                                            linking, save/update   workflow
                                            paths                  unverified

  Legacy record linking   Partially         Legacy                 Source inspected;
                          Implemented       matching/linking paths real-data
                                            and original-document  migration not
                                            update logic           performed

  FIR status calculation  Partially         `fir-status.mjs` and   Unit tests
                          Implemented       unit tests             passed; complete
                                                                   lifecycle
                                                                   unverified

  Predecessor/successor   Partially         Transfer relationship  Source inspected;
  transfer                Implemented       writes in modal save   failure paths
                                            flow                   untested
  ----------------------------------------------------------------------------------

### Status interpretation

-   **Implemented:** Required behaviour has sufficient code evidence and
    relevant verification.
-   **Partially Implemented:** Some functionality exists, but
    requirements or verification remain incomplete.
-   **Planned:** Requirements/design exist, but implementation evidence
    has not been found.
-   **Not Started:** No implementation evidence was found for the
    defined scope.
-   **Needs Verification:** Evidence is insufficient to reach a reliable
    conclusion.

A file or function existing by itself is not sufficient to declare a
feature complete. Where only some behaviour has been inspected, the
status must remain provisional.

------------------------------------------------------------------------

## 4. Data Consistency Risks R-01 to R-07

These are source-review risk findings, not confirmed production
incidents. Unless stated otherwise, verification status is **potential
risk identified by code inspection; runtime occurrence unverified**.

### R-01 --- Partial save across related documents

**Risk:** High

**Finding:** FIR Master, proceeding records, transfer relationships, and
status persistence can be written in separate operations. A failure
between operations may leave a master saved without all intended
proceedings, or leave only one side of a transfer relationship updated.

**Evidence:** `components/add-case/add-case.js`, approximately lines
2840--2946; FIR Master save helper in `assets/js/fir-case-model.js`.

**Verification status:** Separate write paths were inspected. No
forced-failure or live Firestore integration test was performed.

**Impact if realised:** Incomplete or inconsistent FIR/proceeding state,
requiring reconciliation or recovery.

### R-02 --- Legacy FIR ID collision or misassociation

**Risk:** High

**Finding:** `loadCaseRecords()` uses `firMasterId || firId` in a master
lookup path. A legacy `firId` is not guaranteed to be a Firestore master
document ID. If a legacy value happens to match an unrelated master ID,
master fields could be overlaid on the wrong record, and the unrelated
master could be treated as represented.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines 48--70.
The architecture documentation also notes that a legacy `firId` may not
be a master document ID.

**Verification status:** Lookup logic inspected. No production dataset
was examined to establish whether an actual collision exists.

**Impact if realised:** Wrong FIR-to-proceeding association or incorrect
display of FIR information.

### R-03 --- Duplicate FIR Master prevention is not guaranteed

**Risk:** High

**Finding:** Creation checks for duplicate matches, but update does not
appear to block a duplicate identity. Search and save are not atomic, so
concurrent creation can potentially create duplicates.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines
149--178.

**Verification status:** Source inspected. No concurrent-write test was
performed.

**Impact if realised:** Multiple masters representing the same FIR
identity, causing inconsistent counts and relationships.

### R-04 --- Predecessor/successor relationship inconsistency

**Risk:** Medium--High

**Finding:** Transfer-related predecessor and successor fields are
updated through separate operations. A failure can leave one side
updated and the other unchanged.

**Evidence:** `components/add-case/add-case.js`, approximately lines
2907--2917.

**Verification status:** Source inspected. No forced-failure or live
transfer test was performed.

**Impact if realised:** Transfer history may be incomplete or
contradictory.

### R-05 --- FIR status lifecycle edge cases

**Risk:** Medium--High

**Finding A:** A `Committed` predecessor is treated as active by
`deriveFirStatus()`. The inspected transfer flow did not show an
automatic transition of the predecessor to `Disposed`. If the approved
business rule requires the predecessor to be terminal after transfer,
FIR status may remain `UT`.

**Finding B:** UCR handling uses the last record in an array; that
record is not guaranteed to be the most recent or authoritative report.

**Evidence:** `assets/js/fir-status.mjs`, approximately lines 9--37;
transfer flow in `components/add-case/add-case.js`, approximately lines
2907--2917; UCR model logic in `assets/js/fir-case-model.js`,
approximately lines 79--110.

**Verification status:** Status logic inspected and unit tests run. Full
transfer/reopen/UCR lifecycle was not tested. Whether the observed
behaviour violates the intended business rule remains a pending
decision.

**Impact if realised:** Incorrect FIR-level status or incorrect
precedence among multiple UCR records.

### R-06 --- FIR status may remain stale after proceeding deletion

**Risk:** Medium

**Finding:** The inspected `removeCaseRecord()` path deletes a saved
proceeding and dispatches a `caseAdded` event. That path did not show
FIR Master status being re-derived and persisted. Stored status could
therefore become stale after deletion, even if some screens calculate
status dynamically.

**Evidence:** `components/add-case/add-case.js`, approximately lines
1660--1720.

**Verification status:** Delete path inspected. Runtime event handling
and post-delete status were not tested.

**Impact if realised:** Different pages may show inconsistent FIR status
until a later recalculation or write.

### R-07 --- Full collection scans

**Risk:** Medium

**Finding:** FIR Master matching and legacy-record search load
collections and filter client-side. Read volume, latency, and memory use
can grow as the dataset grows.

**Evidence:** `assets/js/fir-case-model.js`, approximately lines 38--43,
74--76, and 113--120.

**Verification status:** Query/loading paths inspected. No dataset-scale
performance test or Firestore read-cost measurement was performed.

**Impact if realised:** Slower lookup and higher read volume as records
grow.

------------------------------------------------------------------------

## 5. Pending Business and Technical Decisions

These questions remain open. The code audit does not make the business
decisions on the user's behalf.

### 5.1 FIR identity

**Question:** Is the canonical FIR identity always
`firNo + firYear + policeStation`?

**Related considerations:**

-   What happens if a police-station name is corrected or renamed?
-   Should police station be a stable station ID rather than a display
    name?
-   Should identity fields be immutable after creation, or should
    changes require a controlled correction workflow?

**Evidence/status:** The current matching code uses FIR number, year,
and police-station text. The canonical business identity rule is not yet
approved.

### 5.2 Committed predecessor status

**Question:** After a case is transferred/committed to Sessions Court,
what should happen to the Lower Court proceeding's status?

Possible options to evaluate:

-   Mark the predecessor `Disposed`.
-   Keep a distinct terminal `Committed` status and define how it
    contributes to FIR-level status.
-   Use another explicitly defined transfer/closure state.

**Evidence/status:** The current status derivation treats `Committed` as
active. The intended legal/business rule must be confirmed before
changing code.

### 5.3 UCR/cancellation and reopening

**Question:** If an FIR is reopened after UCR or cancellation, how
should previous reports and current status be represented?

Also decide:

-   Can multiple UCR reports exist for one FIR?
-   Which report determines the current FIR status?
-   Should report chronology be based on an explicit date/sequence
    rather than array position?
-   How should cancellation and reopening history be preserved?

**Evidence/status:** UCR record support and status derivation exist. The
authoritative-report and reopening rules are unresolved.

### 5.4 Legacy relationship authority

**Question:** Should only `firMasterId` be treated as the authoritative
relationship to an FIR Master?

**Evidence/status:** The inspected lookup uses `firMasterId || firId`.
Legacy records and actual production values have not been reviewed, so a
safe compatibility/migration rule is still needed.

### 5.5 Partial-save recovery

**Question:** If the master saves but one proceeding fails, what should
the user experience and recovery mechanism be?

Consider whether the design should use:

-   A Firestore transaction or batched write where its constraints fit.
-   A staged workflow with explicit retry/reconciliation.
-   An idempotent save operation that can be safely repeated without
    duplicate records.

**Evidence/status:** Multi-operation save paths exist. No recovery
protocol has been verified or approved.

### 5.6 Delete semantics and legal history

**Question:** Should a saved proceeding be permanently deleted, or
should it be voided/soft-deleted with an audit trail?

**Evidence/status:** A deletion path exists. Retention, auditability,
and authorization requirements have not been confirmed.

------------------------------------------------------------------------

## 6. Unverified Behaviour and Testing Limitations

### 6.1 Unit tests

The following command was reported as executed:

``` bash
node --test test/fir-status.test.mjs
```

**Result:** 17 passed, 0 failed.

This result applies to the FIR status unit-test file only. It does not
establish that the complete application, modal, Firestore integration,
or production deployment works correctly.

### 6.2 Standard test command

The configured `npm test` command was reported to fail because its
`--test-isolation=none` option is unsupported by the Node runtime used
for the audit.

**Verification status:** The standard test command did not pass. The
cause reported by the audit is a runtime/option compatibility issue;
this is not proof that all application code is defective.

### 6.3 Production build

A production build could not be verified because the uploaded
environment's `node_modules` lacked a required Vite/Rolldown native
dependency.

**Verification status:** Build unverified. This does not by itself prove
the source code cannot build in a correctly installed environment.

### 6.4 Not performed

The following were not verified during Phase 1:

-   End-to-end browser testing of the Add/Edit Case Modal.
-   Live Firestore create/update/delete behaviour.
-   Forced network failure between related writes.
-   Concurrent duplicate-FIR creation/update tests.
-   Existing production data inspection or migration.
-   Full Lower Court → Sessions Court transfer lifecycle.
-   Reopening after UCR/cancellation.
-   Multi-UCR ordering and authoritative-report selection.
-   Post-delete status recalculation across all pages.
-   Firestore production security rules and authorization.
-   Performance at realistic or large data volumes.
-   Production deployment behaviour.

### 6.5 Evidence classification

Use these labels in later planning:

-   **Source-confirmed:** The inspected source contains the referenced
    logic.
-   **Unit-test verified:** The specific automated test was executed and
    passed.
-   **Runtime verified:** The behaviour was exercised in a browser or
    controlled runtime.
-   **Production verified:** The behaviour was confirmed against the
    relevant deployed environment.
-   **Unverified:** Evidence is insufficient or the test was not
    performed.
-   **Potential risk:** A plausible failure path was identified, but a
    production failure was not demonstrated.

Phase 1 primarily provides source-confirmed findings, plus the limited
unit-test result above. It does not provide production verification.

------------------------------------------------------------------------

## 7. Recommended Next Audit Phase

### Phase 2 --- Controlled Data-Flow and Failure-Path Verification

**Objective:** Validate the highest-risk assumptions without changing
application code or production data.

Recommended scope:

1.  Define test scenarios and expected outcomes for:
    -   Create FIR Master.
    -   Add one proceeding and multiple proceedings to one FIR.
    -   Select and link a legacy record.
    -   Edit FIR identity fields.
    -   Transfer a Lower Court proceeding to Sessions Court.
    -   UCR/cancellation, reopening, and multiple UCR reports.
    -   Delete/void a proceeding and recalculate FIR status.
2.  Trace each scenario through modal input, model helpers, Firestore
    writes, and the resulting UI state.
3.  Inspect the exact Firestore security rules and test configuration
    separately from production rules.
4.  Test failure between multi-document writes in an isolated
    test/emulator environment, not against production data.
5.  Record expected versus observed results and assign each issue a
    severity and evidence label.
6.  Update Feature Inventory only after the scenario has sufficient
    evidence.

**Guardrails:**

-   Do not modify application code during this audit phase.
-   Do not run destructive tests against production Firestore.
-   Preserve the current branch's staged, unstaged, and untracked
    changes.
-   Keep business decisions separate from technical observations.
-   Do not mark a potential risk as a confirmed bug without reproducing
    it or otherwise obtaining decisive evidence.

### Next action

**Create a Phase 2 test-scenario matrix** for the FIR Master, Linked
Court Proceedings, and Add/Edit Case Modal. For each scenario, record
preconditions, test data, expected result, evidence to capture, and
whether it can be safely tested in isolation. Do this before
implementing any fix.
