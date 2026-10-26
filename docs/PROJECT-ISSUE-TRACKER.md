# CaseTrack — Project Issue Tracker

> **Document status:** Canonical issue tracker  
> **Last updated:** 2026-10-25  
> **Project status:** [PROJECT-STATUS.md](./PROJECT-STATUS.md)

This tracker records confirmed audit findings for future resolution. All four entries are **Open** and **Not Started**. Priorities are provisional. Registering an issue does not authorize implementation or count as completed work.

## Status definitions

- **Open** — Recorded and awaiting prioritization or implementation approval.
- **Planned** — Resolution approach approved and scheduled.
- **In Progress** — Approved work has started.
- **Blocked** — Progress requires an identified external decision or dependency.
- **Ready for Testing** — Implementation is complete and awaiting verification.
- **Resolved** — Acceptance criteria are met and verified.
- **Closed** — The project owner has closed the item, including cases where no implementation is wanted.

Each issue also records implementation progress as **Not Started** until approved work begins.

## Manual issue registration

Register a manual issue only when the project owner explicitly asks to save or register a problem for future work (for example, “Isko issue mein add karo”, “Ye problem save kar lo”, “Isko pending work mein daal do”, “Future mein ye change karna hai”, or “Register manual issue”). Discussing an idea or asking a question alone is not a registration request.

Before adding an entry, read this tracker and check for an existing issue with the same underlying problem. Reuse an existing entry by reporting its ID; never create a duplicate or overwrite an ID. Otherwise assign the next unused permanent `CT-ISSUE-NNN` ID. The next available ID is **CT-ISSUE-005**.

Preserve the owner's description and intended meaning. Record the category as **Bug**, **Missing Feature**, **Enhancement**, **UI/UX Improvement**, **Documentation**, or **Technical Debt**; identify affected modules where known; assign a provisional priority based on impact or **Unassessed** when evidence is insufficient; and set status to **Open**, implementation progress to **Not Started**, and source to **Manual / Owner Reported**. Include expected behavior, current behavior, and future work when known. Mark missing details **To Be Clarified** and unverified technical assumptions **Not Yet Verified**.

Update the issue summary and counts in [PROJECT-STATUS.md](./PROJECT-STATUS.md) whenever an issue is added or its status changes. Registration records future work only: do not modify application code, implement the request, or claim verification unless the owner explicitly approves implementation.

---

<a id="ct-issue-001"></a>
## CT-ISSUE-001 — Missing Decision/Judgement Fields

- **Affected modules:** Add/Edit Case, All Cases, Disposed Cases, FIR Register
- **Priority:** High (provisional)
- **Status:** Open
- **Implementation progress:** Not Started
- **Date discovered:** 2026-10-25
- **Date resolved:**
- **Resolution notes:**

### Problem description

The current Add/Edit Case form and proceeding save payload do not contain `decisionDate`, `judgement`, `disposalType`, or `reasonOfAcquittal` inputs/fields. Some readers still use these properties, so historical or externally populated values may be displayed without being editable through the current form.

### Code/file references

- `components/add-case/add-case.html` — current Add/Edit Case form controls.
- `components/add-case/add-case.js` — edit hydration and Firestore proceeding payload.
- `assets/js/cases.js` — reads decision date and judgement for case views/filters.
- `assets/js/disposed-cases.js` — reads judgement and acquittal-reason aliases.
- `assets/js/fir-register.js` — reads decision date, disposal type/judgement, and acquittal-reason aliases.
- `assets/js/fir-case-model.js` — normalizes FIR, linked proceeding, and legacy case records.

### Audit evidence

Source inspection confirmed reader references in the modules above and no matching current form controls or save-payload properties for the listed decision/disposal fields. This is a repository-code finding; it does not establish that affected production records exist. Deployed records and deployed rules were not inspected.

### Expected behavior

After the required fields and their ownership are approved, authorized users can enter and edit the agreed decision/disposal information; the data persists to the approved Firestore schema and displays consistently in the relevant modules. Existing legacy records remain readable and editable under the approved compatibility approach.

### Current behavior

The current form/save path does not provide those fields. Some modules read selected properties if they are already present on a record.

### Proposed future work

1. Review which judgement and disposal fields are needed and which record level owns each field.
2. Design and approve the Add/Edit Case form section and validation rules.
3. Align create, edit, Firestore save, normalization, and module read mappings.
4. Define backward-compatible behavior for legacy records and aliases.
5. Verify affected modules and persistence after implementation approval.

### Dependencies

- Project-owner approval of the field set, labels, required/optional rules, and FIR-master versus proceeding ownership.
- Approved Firestore property names and legacy compatibility behavior.
- Explicit implementation approval for this issue.

### Acceptance criteria

- The approved fields hydrate correctly when editing supported record types.
- Create/update writes persist the agreed values to the approved Firestore documents.
- All Cases, Disposed Cases, and FIR Register display the same canonical values and handle missing legacy values safely.
- Existing unrelated fields and legacy records are preserved.
- The approved tests pass and the relevant browser flows are verified.

### Testing requirements

- Unit or focused tests for form serialization, hydration, and field normalization.
- Firestore emulator create/update checks for FIR Master, linked proceeding, and legacy-record paths as applicable.
- Browser verification in Add/Edit Case, All Cases, Disposed Cases, and FIR Register.
- No production-data test unless separately authorized and safely scoped.

---

<a id="ct-issue-002"></a>
## CT-ISSUE-002 — Outdated Field Mapping Documentation

- **Affected modules:** Documentation
- **Priority:** Medium (provisional)
- **Status:** Open
- **Implementation progress:** Not Started
- **Date discovered:** 2026-10-25
- **Date resolved:**
- **Resolution notes:**

### Problem description

`docs/Add-Edit-Case-Field-Reference.md` describes decision date and judgement as current form fields, while the current Add/Edit form does not contain those controls. The mapping document can therefore mislead future audits and implementation planning.

### Code/file references

- `docs/Add-Edit-Case-Field-Reference.md` — proceeding field table and persistence notes.
- `components/add-case/add-case.html` — current form schema.
- `components/add-case/add-case.js` — current edit hydration and save payload.

### Audit evidence

The reference document lists `is_decided`, `dod_date`, and `judgement` mappings. Those controls/keys were not found in the current form and save implementation. This is a source/documentation comparison; deployed behavior was not inspected.

### Expected behavior

The field reference accurately distinguishes current fields, derived values, legacy-only values, and fields awaiting an approved schema decision.

### Current behavior

The document presents decision date and judgement as active form/save mappings that are absent from the current implementation.

### Proposed future work

1. Reconcile every field in the reference against the approved current form and save/read paths.
2. Mark derived, legacy-only, and not-saved properties accurately.
3. Update decision/disposal mappings after CT-ISSUE-001's schema is approved.
4. Add a maintenance note identifying the source files used to verify future revisions.

### Dependencies

- Revalidation against the current code when work begins.
- CT-ISSUE-001's approved field/schema decisions before documenting those fields as active.
- Explicit implementation approval for this issue.

### Acceptance criteria

- Every documented active field matches current form hydration, save, Firestore, and read behavior.
- Derived and legacy-compatible fields are clearly identified.
- No unapproved proposal is described as implemented behavior.
- Relevant source references point to the current implementation.

### Testing requirements

- Documentation-to-source review of every field row.
- Link/path check for referenced source files.
- Cross-check against the approved schema from CT-ISSUE-001 where applicable.

---

<a id="ct-issue-003"></a>
## CT-ISSUE-003 — Register Diary LocalStorage Synchronization

- **Affected modules:** Register Diary
- **Priority:** Medium (provisional)
- **Status:** Open
- **Implementation progress:** Not Started
- **Date discovered:** 2026-10-25
- **Date resolved:**
- **Resolution notes:**

### Problem description

Register Diary file markers, including dot, X, and returned-to-cupboard state, are persisted in browser `localStorage`. Hearing-date history is also maintained through a Firestore path, but these file markers do not synchronize between devices or users.

### Code/file references

- `assets/js/register-diary.js` — `FILE_STATUS_STORAGE_KEY`, marker state loading, updates, and local persistence.
- `assets/js/register-diary.js` — hearing-date record persistence through `caseRecordRef()` and Firestore transaction.
- `pages/register-diary.html` — Register Diary controls and date-picker workflows.
- `firestore.admin-panel.rules` — repository-configured Firestore access policy to review if shared persistence is approved.

### Audit evidence

Source inspection confirmed browser `localStorage` persistence for marker state and a separate Firestore persistence path for hearing-date records. This establishes the storage split in repository code, not the presence or loss of any particular production marker data. Deployed records and deployed rules were not inspected.

### Expected behavior

After storage scope, ownership, and permissions are approved, the selected file markers persist and synchronize consistently for authorized users/devices, with safe handling of existing browser-local state.

### Current behavior

Marker state is browser-local; hearing-date history is handled separately and can be written to Firestore.

### Proposed future work

1. Define marker data requirements, identity key, ownership, date scope, and concurrent-edit behavior.
2. Decide authorization and Firestore Rules requirements.
3. Design migration/reconciliation for existing `localStorage` state without silent loss or duplication.
4. Implement approved persistence and sync behavior.
5. Verify multi-device, multi-user, offline/reconnect, and permission behavior.

### Dependencies

- Project-owner decision on whether markers are private to a user or shared for a physical file.
- Approved Firestore data shape, station/record ownership, access rules, and conflict policy.
- Migration/recovery plan for browser-local data.
- Explicit implementation approval for this issue.

### Acceptance criteria

- The approved marker state is scoped to the correct file and date/user as decided.
- Authorized devices show consistent saved state after synchronization.
- Existing local marker state is handled by an approved migration or reconciliation flow.
- Unauthorized users cannot read or modify marker data.
- Hearing history and marker state remain distinct according to the approved design.

### Testing requirements

- Unit tests for marker serialization, scoping, and reconciliation.
- Firestore emulator tests for role/station permissions and concurrent updates.
- Multi-session or multi-device browser verification, including reconnect behavior.
- Migration tests using synthetic local state; no production migration without separate authorization.

---

<a id="ct-issue-004"></a>
## CT-ISSUE-004 — Incomplete PO Cases Table Details

- **Affected modules:** PO Cases
- **Priority:** Medium (provisional)
- **Status:** Open
- **Implementation progress:** Not Started
- **Date discovered:** 2026-10-25
- **Date resolved:**
- **Resolution notes:**

### Problem description

The saved accused record can include `poStatus`, `poDate`, arrest, custody, and bail details. The PO Cases table selects records using the PO flag but displays only a subset of those PO/accused details.

### Code/file references

- `assets/js/proceeding-fields.mjs` — accused field serialization and normalization.
- `assets/js/po-cases.js` — PO filtering and table columns.
- `components/add-case/add-case.html` — accused, arrest, custody, bail, and PO form controls.
- `assets/js/fir-register.js` — accused details presentation in the FIR record.

### Audit evidence

Source inspection confirmed that PO and related accused fields are included in the normalized accused object. The PO Cases renderer filters on `accused.poStatus === true` and renders selected case/accused columns; it does not render every saved PO/arrest/custody/bail property. No production record inspection was performed.

### Expected behavior

After the project owner approves the useful PO information set, PO Cases provides a clear way to see the selected saved details for the correct accused and remains usable on supported screen sizes.

### Current behavior

The table identifies PO accused but presents only a subset of the saved PO-related and accused details.

### Proposed future work

1. Review which fields are operationally needed in the PO list versus a detail view.
2. Design table columns and/or an accessible detail view with responsive behavior.
3. Verify the presentation against normalized accused records and legacy data.
4. Implement only the approved display scope.

### Dependencies

- Project-owner approval of which PO/arrest/custody/bail details should appear and at what level of detail.
- Decision on table versus detail-view presentation and responsive priorities.
- Explicit implementation approval for this issue.

### Acceptance criteria

- The approved PO details are visible or accessible from each matching PO accused entry.
- Details remain associated with the correct accused when a case has multiple accused.
- Missing legacy values render safely and consistently.
- The table/detail view remains usable at supported desktop and mobile widths.
- Relevant UI and data-reader tests pass.

### Testing requirements

- Unit tests for mapping normalized accused records to PO view models.
- Browser verification with multiple accused, multiple PO accused, and missing optional fields.
- Responsive layout review at desktop and narrow mobile widths.
- Confirm existing PO filtering still uses the boolean normalized `poStatus` field.

