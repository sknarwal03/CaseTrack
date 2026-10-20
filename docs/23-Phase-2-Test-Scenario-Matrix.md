# CaseTrack — Phase 2 Test-Scenario Matrix

**Audit date:** 2026-10-20\
**Purpose:** Expected-versus-observed matrix for the FIR Master, Linked Court Proceedings, legacy records, FIR status, save failures, and authorization.\
**Safety:** All proposed runtime/integration scenarios use synthetic records in a newly started, isolated emulator project. Never point these scenarios at production. No production records were accessed in Phase 2.

## Outcome and evidence legend

- **Pass (unit):** The named unit assertion ran and passed; it does not establish Firestore/browser behavior.
- **Pass (Rules):** The candidate Rules test ran against the isolated Rules emulator; it does not establish deployed permissions.
- **Source only:** Behavior is visible in the current source but the scenario was not exercised at runtime.
- **Not run:** No isolated integration/browser test was available or executed.
- **Potential risk:** The source permits the condition, but no occurrence was reproduced.
- **Unverified:** Evidence is insufficient to determine the result.

For unrun integration scenarios, use a unique synthetic namespace such as project `demo-casetrack-phase2`, station IDs `phase2-station-a` / `phase2-station-b`, FIR identities `99001/2026` and `99002/2026`, and freshly generated Firestore document IDs. Do not reuse an emulator that may contain data. The main app’s current emulator ports were already occupied by a separate role-prototype process and were not used.

## A. FIR Master lifecycle

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| FM-01 Create master without proceeding | Authenticated test role; empty isolated emulator; new FIR `99001/2026`, station A | One `firMasters` document is saved; no fake proceeding is created; status is UI | `saveFirMaster()` writes a master before proceeding writes; `deriveFirStatus({}, [])` returns UI and unit tests cover the status result | Source only; status assertion **Pass (unit)**; Firestore create **Not run** | Verify modal success state and station assignment in browser/emulator |
| FM-02 Find/reuse matching master | Seed one master for `99001/2026`, station A; enter matching identity | Existing master is offered; no second master is created; user can open/reuse it | Modal queries matches and prompts to open or add proceedings; no runtime test | Source only | Verify prompt choices, selection state, and no duplicate document |
| FM-03 Sequential duplicate create | Seed one master; submit same normalized number/year/station ID again | Reject duplicate and preserve existing record | Create helper rejects a matching master; identity helper unit tests pass | Source only; identity **Pass (unit)**; write path **Not run** | Add `saveFirMaster()` emulator test |
| FM-04 Edit identity to another master’s identity | Seed two distinct masters; edit one to match the other | Reject the entire edit before any linked proceeding write | Update path skips duplicate rejection and calls `updateDoc()` | **Source-confirmed defect**, not runtime reproduced | F-02; add regression test proving master and proceedings remain unchanged |
| FM-05 Concurrent duplicate create | Two authenticated clients submit same identity concurrently | At most one master owns the identity | Search and random-ID `setDoc()` are separate; no transaction or deterministic identity claim | **Potential risk; Not run** | F-06; use isolated concurrent emulator test after choosing the uniqueness design |
| FM-06 Edit shared FIR fields | Seed one master and two linked records with distinct per-record data; edit FIR identity/shared fields | Master and linked records receive the approved shared-field update; each proceeding-specific field remains unchanged | Master saves first; proceeding writes follow. Shared court fields are also copied from the active draft to all proceedings | Source only; **Not run** | F-01 and F-07; verify propagation and per-record preservation |
| FM-07 Stable station identity | Same number/year at two station IDs; compare matching results | Stations remain distinct even when names match | When both IDs exist, `sameFirIdentity()` compares IDs; corresponding unit tests pass | **Pass (unit)** | Add Firestore matching test; decide how missing station IDs are reconciled |

## B. Linked Court Proceedings and transfer

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| CP-01 Create one linked proceeding | Seed or create master; add one lower-court draft | New `linkedCases` document references master by `firMasterId` and `firId`; its court/judge/status/hearing data is retained | Save path writes both IDs and per-draft court/judge/hearing fields | Source only; Firestore workflow **Not run** | Verify persisted record and refreshed UI |
| CP-02 Add multiple proceedings to one master | One master; two or more drafts with distinct court/judge, IO, accused, witnesses, status, and histories | Separate proceeding documents retain their own values and hearing arrays | Court/judge/status/hearing fields are populated per draft; shared `courtFields` fields are copied from the active form to each record | **Source-confirmed defect; Not run** | F-01; two-proceeding regression is P1 |
| CP-03 Update one proceeding | Seed two proceedings with different values; edit one only | Only selected proceeding changes; sibling remains byte-for-byte unchanged for unrelated fields | Per-record draft fields exist, but shared fields in the save loop are not per-record | Source only; **Not run** | F-01; assert sibling record unchanged |
| CP-04 Lower Court → Sessions transfer | Seed Lower Court record; create Sessions successor with predecessor reference | Successor points to predecessor; predecessor points to successor and becomes Committed; both remain under same master | Successor write occurs before separate predecessor update; fields are `predecessorCaseId` / `successorCaseId` | Source only; **Not run** | F-07; failure between writes can leave one-sided link |
| CP-05 Transfer with active/disposed successor | Use committed predecessor and active successor, then disposed successor | FIR status follows approved aggregate rules: active successor → UT; committed + disposed with no active proceeding → Disposed | Status unit tests cover committed + disposed and active proceedings; transfer persistence was not exercised | **Pass (unit)** for aggregate; transfer **Not run** | Browser/emulator end-to-end test |
| CP-06 Delete one untransferred proceeding | Seed a master and two proceedings; remove one in modal | Delete only selected proceeding; retain sibling/master and recalculate master status | `deleteDoc()` targets selected collection/document; remaining records are reloaded and master status update attempted | Source only; **Not run** | Inject delete/status failures; verify UI refresh |
| CP-07 Delete one transfer participant | Seed predecessor/successor links; delete one participant | Remove or void selected item without leaving a false relationship; preserve other proceeding | Counterpart link is cleared first, then selected record is deleted | **Potential partial-state risk; Not run** | F-10; atomic or recoverable relationship update required |
| CP-08 Delete vs void | Seed a proceeding with hearing history | Follow approved retention/audit policy | Current modal confirms and permanently deletes with `deleteDoc()`; no void/audit workflow evident | Source only; business rule undecided | Decide legal-history retention before changing behavior |

## C. Legacy compatibility

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| LG-01 Load legacy document | Seed `cases/legacy-doc` with a hearing array and no master link | Preserve `legacy-doc` as the document ID and preserve hearing history | Normalization keeps supplied ID and hearing array; unit test asserts both | **Pass (unit)** for normalization; Firestore load **Not run** | Exercise actual load and edit path in emulator |
| LG-02 Explicit legacy linking | Seed matching legacy group and no master; explicitly confirm link | Keep original case IDs/history; add master reference and shared FIR fields | Link flow updates existing docs in batches, writes `firMasterId`, `firId`, and `legacyFirId`; batches are separate commits | Source only; **Not run** | Test batch failure, retry, and legacy group boundaries |
| LG-03 Legacy ID collision | Seed legacy `firId` equal to a different master’s document ID | Do not associate or overlay the unrelated master | Loader resolves `firMasterId || firId`; collision could select wrong master | **Potential risk; Not run** | F-05; clarify authoritative relationship and add collision fixture |
| LG-04 Duplicate legacy group | Seed multiple unlinked groups matching identity | Stop and require explicit reconciliation; do not auto-merge | Modal blocks when multiple groups match; no write test | Source only | Verify group matching with stable station IDs and ambiguous legacy values |

## D. FIR status lifecycle

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| ST-01 No court/UCR | Empty proceeding list | UI | Unit test passes | **Pass (unit)** | None for pure helper result |
| ST-02 One or more active court proceedings | Include active plus disposed/committed proceedings | UT if any proceeding is active | Unit tests cover active/multiple proceedings | **Pass (unit)** | Modal persistence not tested |
| ST-03 Committed-only / committed + disposed / all disposed | Test each approved combination | All committed → UT; committed + disposed or all disposed → Disposed | Unit tests cover these combinations | **Pass (unit)** | Business decision on transferred predecessor remains documented |
| ST-04 UCR and cancellation | No court; one Untraced or Cancelled UCR | UCR/Untraced or Cancelled result | Unit tests cover one of each | **Pass (unit)** | Firestore create/edit/delete not tested |
| ST-05 UCR plus court proceeding | Seed one UCR and one active court proceeding | Court proceeding controls FIR status | Unit test passes | **Pass (unit)** | Test UCR-first then court addition in modal |
| ST-06 Reopen disposed FIR | Previously disposed master; new active proceeding | Derive UT | Unit test passes for helper input | **Pass (unit)** | Reopening after UCR/cancellation is undecided and untested |
| ST-07 Multiple saved UCR records | Seed two records with opposite report types in varied query order | Follow approved date/sequence policy, independent of result ordering | Helper selects last array item; query order is not an explicit authority | **Potential risk; Not run** | F-09; owner decision required |
| ST-08 Hearing stage across date boundary | Two stages on distinct `d/m/Y` dates, including month/year boundary | Use chronologically latest stage | Save sorts raw date strings lexicographically | **Source-confirmed issue; Not run** | F-04; add chronological date tests |
| ST-09 Delete proceeding and status refresh | Master with multiple proceedings; delete one | Recalculate from remaining proceedings and persist master status | Current code reloads remaining records and updates master; on failure it reports warning. Phase 1 R-06 is superseded for this worktree | Source only; **Not run** | Inject status-update failure and verify reported partial result |
| ST-10 Final-stage/no-next fallback | Save Committed/Disposed on existing hearing with no `next` entry | Apply explicit owner-approved rule | Requirements identify a conflict; current persistence uses latest date-sorted trial stage or draft fallback | **Unverified / decision required** | Resolve before final-stage behavior is accepted |

## E. Save failures, retries, and consistency

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| FP-01 Master commits; proceeding create fails | Fresh master; deny/fail the proceeding write in isolated emulator | Master remains; modal reports exactly which proceeding failed; no false full-success message | Source writes master first, collects per-record failure, and reports partial result if reload/status update succeeds | Source only; **Not run** | Test the failure boundary and resulting UI |
| FP-02 Proceeding update succeeds; master status update fails | Seed master/proceeding; permit proceeding write then fail master status write | Preserve proceeding; report partial outcome and provide safe reconciliation | Source does not roll back; outer catch alerts and leaves modal open | Source only; **Not run** | F-07; message should identify committed proceeding and failed master update |
| FP-03 Multi-proceeding partial save | Several drafts; fail one write | Keep successful records, report each failure, avoid deleting successful records | Per-record catch accumulates errors; modal shows count/details if later status work completes | Source only; **Not run** | Test later status-write failure too |
| FP-04 Retry after acknowledged create | First `addDoc()` returns ID; a later write fails; retry same modal | Update known saved document rather than create duplicate | Draft ID is stored after `addDoc()` resolves; retry should target existing ID | Source only; **Not run** | Verify UX and record identity after retry |
| FP-05 Retry after ambiguous timeout | Firestore commit succeeds but client receives timeout before ID acknowledgement | Reconcile existing operation; no duplicate record | No idempotency token or lookup/reconciliation by request ID is evident | **Potential risk; Not run** | F-08; test with injected transport/fault proxy |
| FP-06 Transfer failure between writes | Permit successor write; fail predecessor update | Atomic transfer or explicit recoverable partial result | Writes are separate; successor may remain without predecessor’s `successorCaseId` | **Potential partial-state risk; Not run** | F-07; decide transaction/batch boundary |
| FP-07 Concurrent duplicate attempts | Two clients submit same FIR identity/UCR concurrently | One unique identity/report | UI queries before writes; no atomic registry/check | **Potential risk; Not run** | F-06; concurrency test after design decision |
| FP-08 Network outage | Disconnect emulator during save | Show truthful outcome; retain modal; provide safe retry/reconciliation | Errors are surfaced; no automatic retry/reconciliation protocol evident | Source only; **Not run** | Inject offline/timeout at each write boundary |
| FP-09 Legacy multi-batch link failure | More than 450 legacy records; fail a later batch | Report partial linking and resume without duplicate/misassociation | Each batch, master, and status write is separate; no encompassing rollback | **Potential risk; Not run** | Test and define resumable linking |

## F. Authorization and data isolation

| ID | Preconditions and isolated data | Expected result | Actual result / evidence | Outcome | Outstanding issue |
|---|---|---|---|---|---|
| AU-01 Main test Rules | Use `firebase.test.json` and synthetic signed-in users | Test-only results must not be represented as production authorization | Rules grant authenticated access broadly; cases have basic authenticated access, other top-level collections have catch-all access | Source-confirmed config; not a production test | Keep this policy out of deployment |
| AU-02 Candidate Admin access | Fresh emulator on port 8185; active Admin and records at two stations | Admin can access authorized case records across stations | Candidate Rules suite includes Admin cross-station CRUD/query scenarios | **Pass (Rules)** within candidate suite | Not deployed/production verified |
| AU-03 Candidate Operator isolation | Active operator assigned station A; seed station A and B records | Operator can CRUD station A only; station B direct reads/writes and broad queries denied | Candidate Rules suite includes station isolation for masters, linked cases, and legacy cases | **Pass (Rules)** within candidate suite | Verify actual app query shape against policy |
| AU-04 Unauthenticated/revoked users | Candidate Rules emulator; no auth / revoked role | Deny case access | Candidate suite tests missing/revoked/unknown/malformed roles and unauthenticated behavior | **Pass (Rules)** within candidate suite | Does not establish deployed behavior |
| AU-05 Linked master validation | Candidate Rules emulator; valid and invalid master references | Linked proceeding requires existing master in same station | Candidate Rules suite tests this condition | **Pass (Rules)** within candidate suite | No end-to-end save under candidate Rules was performed |
| AU-06 Production Rules | Authorized production policy/configuration required | Verify actual user permissions without modifying data | No production configuration or deployed policy was inspected | **Unverified / Not run** | F-03; owner must identify authorized source |

## G. Test execution record

| Command / method | Result |
|---|---|
| `npm test` | 19 passed, 0 failed |
| `npm run build` | Passed; Vite emitted `__dirname` native-loader and >500 kB chunk warnings |
| `Push-Location security-prototypes/role-management; npm run test:rules:admin-panel` | 10 passed, 0 failed; fresh emulator on configured port 8185 |
| Read shared local browser page | Login page rendered; no credentials entered; case workflow not tested |
| Production Firebase access | Not performed |
| Main-app Firestore workflow/failure integration | Not run; no root integration harness found; existing 8080/9099 emulator was preserved |

**Automated total:** 29 passed, 0 failed across the executed unit and candidate Rules suites. This total excludes browser scenarios, build checks, and all not-run matrix items.
