# Add/Edit Case Data Mapping

**Authority:** Canonical description of audited document paths and serialization. Paths are source-confirmed from the current repository; no live database inspection was done.

## Collections and identities

| Collection | Role | Document identity / links |
|---|---|---|
| `firMasters` | Shared FIR identity, incident/complainant fields, `firStatus`, timestamps and identity claim reference | Stable Firestore document ID; identity also checked by FIR number + year + stable `policeStationId` |
| `linkedCases` | New court proceedings and UCR records | Stable document ID; `firMasterId` and `firId` point to master ID; `recordType` identifies `lower`, `session`, `jjb`, or `ucr` |
| `cases` | Legacy proceeding records retained/read/edited in place | Existing document ID; legacy association may use `firId`, `firMasterId`, file number or FIR identity |
| `firIdentityClaims` | Server-managed FIR identity uniqueness claim | Deterministic claim document ID and `firMasterId`; maintained transactionally by callable |
| `hearingDateRecord` | Not a collection: array property on proceeding document | Individual hearing IDs retained within array; transaction used for Register Diary changes |

## Write/read flow

1. Form data is mapped into an explicit FIR Master object in `components/add-case/add-case.js`.
2. `saveFirMaster` calls the `saveFirMaster` callable. The function checks role/station, duplicate identity and legacy matches, then transactionally writes master and claim and releases an old claim on an approved identity correction.
3. Each proceeding is serialized with `proceedingPayload` and written to its existing collection/document. New proceeding IDs are allocated once and retained in draft state. Each proceeding write plus predecessor update uses one `writeBatch`; separate proceedings are separate batches.
4. Master fields are currently copied into proceeding payloads. Legacy updates additionally retain legacy-shaped values. Reader normalization joins master fields onto linked/legacy records. This means FIR ownership is conceptually master-owned, while duplicated stored snapshots remain for compatibility; removal/normalization of those copies needs an explicit migration decision.
5. `loadCaseRecords` merges the three record sources, suppresses linked legacy counterparts by ID, normalizes legacy aliases, and overlays master fields. `loadRecordsForFir` resolves records by master relationship and legacy identity paths.

## Atomicity, retry and failure behavior

- FIR Master plus identity claim: callable Firestore transaction; duplicate/conflict checks are repeated within transaction.
- One court/UCR record and predecessor status/link change: batched write.
- Multiple proceeding drafts: loop of independent batches, so prior successes remain if a later one fails. The UI reports partial successes and retains modal state for retry.
- FIR status refresh occurs after proceeding writes; refresh can fail after proceeding persistence. Current UI reports that writes are retained and suggests retry.
- Register Diary hearing update: its own transaction on the proceeding reference.
- This audit did not establish a universal rollback or fully idempotent retry guarantee. Verify the create retry path and concurrent edits before claiming them.

## Data preservation guardrails

Do not change collection names, field casing, aliases, IDs, relationship references, hearing IDs/history or legacy document locations without an approved migration plan. Do not assume stored field duplication can be removed safely. No Firestore data or security rules were changed in this task.
