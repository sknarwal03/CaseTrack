# CaseTrack --- Add/Edit Case Modal Requirements

**Document ID:** `14-Add-Edit-Case-Modal-Requirements.md`\
**Status:** Requirements captured from user discussion; not an
implementation specification for FIR Register UI.\
**Scope:** FIR Master, court proceedings, UCR report, validation,
save/edit/delete behavior, and status calculation inside the Add/Edit
Case modal.

------------------------------------------------------------------------

## 1. Purpose

The Add/Edit Case modal must support one FIR Master with zero or more
linked court proceedings and at most one linked UCR report. An FIR
Master must be allowed to exist without a court proceeding.

This document records requirements explicitly confirmed during
discussion. It does **not** authorize implementation by itself; use it
as the requirements baseline and inspect the current code before
changing implementation.

## 2. Modal Structure

-   Use one modal with separate sections for:
    1.  FIR Master
    2.  Court Proceedings
    3.  UCR Report
-   FIR Master can be created and saved without any court proceeding.
-   A single Save button at the end of the modal saves the FIR Master
    and any proceeding/UCR changes included in the current modal
    session.
-   Keep the current Add/Edit Case form's existing court-proceeding
    fields and existing UCR fields. Do not remove or rename existing
    fields unless separately approved.
-   The current UCR fields identified in the existing form include:
    -   UCR Number
    -   Report Type
    -   Date of Disposed
-   The existing form/source code remains the reference for all other
    exact field names and options.

## 3. FIR Master Fields and Behavior

### 3.1 Fields

The FIR Master must include:

-   File No.
-   FIR Number
-   FIR Year
-   Police Station
-   FIR Date
-   Under Sections
-   Complainant Details
-   Incident Details
-   Beat Details (a text box within Incident Details)
-   FIR Status

Complainant Details and Incident Details should retain the
fields/structure already present in the current form, with Beat Details
added inside Incident Details.

### 3.2 File Number

-   File No. is system-generated and read-only.
-   Format: `<FIR Number>/<last two digits of FIR Year>`.
-   Example: FIR Number `234`, FIR Year `2025` → File No. `234/25`.
-   All proceedings linked to the same FIR share the same File No.
-   File No. is one of the FIR Master values that propagates to all
    linked proceedings.

### 3.3 Police Station assignment

-   Police Station is determined automatically from the logged-in user's
    assigned police station.
-   The user cannot manually change it in the modal.
-   If the logged-in user has no police-station assignment, block FIR
    Master creation/save and show a clear message instructing the user
    to contact the administrator.

### 3.4 Duplicate FIR identity

Canonical identity is based on:

-   Normalized FIR Number
-   Normalized FIR Year
-   Stable Police Station ID (not merely the station display name)

Behavior:

-   If the identity already exists, block duplicate FIR Master creation
    and offer an option to open the existing FIR Master.
-   If FIR Number or FIR Year is edited and the resulting identity
    matches another existing FIR Master, block the entire update.
-   In that duplicate-update case, do not save any changes to the FIR
    Master or its linked proceedings.
-   Do not silently merge records.

### 3.5 FIR Master editing and propagation

When these FIR Master fields are edited, update the corresponding values
on all linked proceedings:

-   FIR Number
-   FIR Year
-   FIR Date
-   Under Sections
-   Complainant Details
-   Incident Details
-   File No. (system-generated)

Police Station remains controlled by the logged-in user's assignment and
is not manually editable.

### 3.6 FIR Master deletion

-   FIR Master may be deleted only after confirmation and only if it has
    no linked court proceeding and no UCR report.
-   If any proceeding or UCR report is linked, deletion is blocked; the
    FIR Master may only be edited.
-   The confirmation dialog must show FIR Number, FIR Year, and Police
    Station so the user can identify the correct FIR before confirming.

## 4. Court Proceedings

### 4.1 Multiple proceedings

-   One FIR Master can have multiple court proceedings.
-   The user can add multiple proceedings in the same modal using an
    "Add Another Proceeding" action.
-   Existing proceedings must be shown when editing an FIR Master.
-   Users must be able to manage existing proceedings and add new ones
    in the same modal.
-   A separate way to manage/edit a proceeding later is also required.
-   Preserve the current form's full set of court-proceeding fields and
    options. The current form/code is the source of truth for the
    exhaustive list.

### 4.2 Proceeding deletion

-   Ask for confirmation before deleting a proceeding.
-   Delete only the selected proceeding.
-   Do not delete its FIR Master or any other linked proceeding as a
    side effect.

### 4.3 Hearing records and Trial Stage

-   Case Status is system-derived; it must not be manually set
    independently of the relevant saved hearing/Trial Stage data.
-   For a normal Trial Stage, a next hearing date must be later than the
    current date.
-   `Committed` and `Disposed` can be recorded on the hearing record
    whose date has arrived; a new next hearing date is not required for
    those stages.
-   If the scheduled hearing is, for example, 23 October and today
    becomes 23 October, and the case is Committed or Disposed on that
    date, update the Trial Stage on that existing 23 October hearing
    record. Do not create a new next-date record merely to record the
    outcome.
-   Once a proceeding is at `Committed` or `Disposed`, it must not have
    a next hearing date while it remains in that stage.
-   If the Trial Stage is changed from `Committed` or `Disposed` to a
    normal stage, the user may add a next hearing date again.
-   `Committed` cannot be changed to `Disposed`; once a proceeding is
    Committed, it remains Committed.
-   `Disposed` can be changed to another Trial Stage. If changed to a
    normal stage, a next hearing date may be added.
-   A change to a proceeding's Trial Stage must trigger automatic
    recalculation of the FIR-level Status.

### 4.4 Proceeding Case Status rules

Confirmed mappings:

-   If the relevant active/next hearing record has a normal Trial Stage
    (not `Committed` or `Disposed`), the proceeding Case Status is
    `Under Trial`.
-   If the case is marked `Committed`, the proceeding Case Status is
    `Committed`.
-   If the case is marked `Disposed`, the proceeding Case Status is
    `Disposed`.
-   The current form's existing Trial Stage options must be preserved;
    do not invent or replace the list.

**Implementation caution:** A final stage (`Committed`/`Disposed`) may
be recorded on a hearing date that is no longer classified as `next`.
Therefore, implementation must not infer `Under Trial` solely from the
absence of a `next` record without checking the saved final-stage
record. This point must be reconciled with the explicit fallback rule
below before coding (see Section 8).

## 5. FIR-level Status Rules

FIR Status is system-generated/read-only. UCR status is used only when
there are no court proceedings.

### 5.1 No proceeding and no UCR

-   FIR Status = `Under Investigation`.

### 5.2 UCR exists, no court proceeding

-   FIR Status is based on UCR Report Type:
    -   `Untraced` → FIR Status `Untraced`
    -   `Cancelled` → FIR Status `Cancelled`
-   Only one UCR report is allowed per FIR.

### 5.3 At least one court proceeding exists

-   Court-proceeding status rules take priority.
-   Ignore UCR status when calculating FIR Status, but retain the UCR
    record unless the user deletes it.
-   If a UCR report was saved first, adding a court proceeding later is
    allowed.
-   If a court proceeding already exists, the Add UCR Report option must
    be disabled; a new UCR report cannot be added after a proceeding
    exists.
-   A UCR report that already existed before a proceeding was added
    remains saved and can still be edited or deleted.

### 5.4 FIR-level aggregation across proceedings

The following outcomes were explicitly confirmed:

  Court proceeding statuses                  FIR Status
  ------------------------------------------ ---------------
  One proceeding, `Committed`                `Under Trial`
  Multiple proceedings, all `Committed`      `Under Trial`
  `Committed` + `Under Trial`                `Under Trial`
  `Committed` + `Disposed`                   `Disposed`
  `Committed` + `Disposed` + `Under Trial`   `Under Trial`
  All proceedings `Disposed`                 `Disposed`

The confirmed precedence is:

1.  If at least one proceeding is `Under Trial`, FIR Status is
    `Under Trial`.
2.  If there is no `Under Trial` proceeding, and there is a combination
    of `Committed` and `Disposed`, FIR Status is `Disposed`.
3.  If all proceedings are `Committed`, FIR Status is `Under Trial`.
4.  If all proceedings are `Disposed`, FIR Status is `Disposed`.

This precedence is intentionally unusual (all-Committed maps to
FIR-level `Under Trial`) because it reflects the user's explicit
decision. Do not "correct" it without approval.

### 5.5 Recalculation

Recalculate FIR Status when any event changes the inputs, including:

-   Adding, editing, or deleting a court proceeding
-   Changing a proceeding's Trial Stage
-   Adding, editing, or deleting the UCR report when there are no court
    proceedings

When a court proceeding exists, UCR changes do not affect FIR Status.

## 6. UCR Report Rules

-   A FIR can have at most one UCR report.
-   UCR report type can be changed between `Untraced` and `Cancelled`.
-   UCR report can be edited.
-   UCR report can be deleted, including after a court proceeding is
    added later.
-   If UCR is deleted and no court proceeding exists, FIR Status becomes
    `Under Investigation`.
-   If a court proceeding exists, deleting UCR does not change FIR
    Status.
-   The existing UCR form fields and validation are to be preserved; use
    the current source form as the exact reference.

## 7. Save, Partial Failure, and Feedback

### 7.1 Save button

-   One Save button at the end of the modal.
-   It handles the FIR Master and the current modal's proceeding/UCR
    changes.
-   A FIR Master may be saved even when no proceeding is present.

### 7.2 Partial-save behavior

The user explicitly selected partial-save behavior:

-   If the FIR Master saves but a proceeding fails, retain the saved FIR
    Master.
-   If multiple proceedings are being saved and some succeed while
    another fails, retain successfully saved records; do not delete them
    as rollback.
-   Show a clear error for each failed record/action.
-   Do not report the whole operation as fully successful if any record
    failed.

### 7.3 Modal after a failure

-   Keep the modal open if any proceeding fails to save.
-   Show the error so the user can correct the issue and retry.
-   Previously saved records must remain saved and must not be deleted
    by the retry.
-   The retry must avoid creating duplicates of records that were
    already successfully saved.

### 7.4 After successful save

When all requested changes succeed:

-   Close the modal.
-   Show a success message.
-   Refresh the relevant list/dashboard.

If some records succeeded and others failed, keep the modal open and
communicate the partial result clearly.

## 8. Requirements Still Needing Resolution

These are left explicit rather than silently guessed:

1.  **No `next` hearing record fallback:** Earlier, the user confirmed
    that if no `next` hearing record exists, Case Status should display
    `Under Trial`. Later, the user also confirmed that `Committed` and
    `Disposed` are recorded on an existing hearing date and should
    result in `Committed`/`Disposed` Case Status without creating a next
    date. Because a past/current hearing record may no longer be
    `kind: next`, these rules can conflict. Before implementation,
    define exactly how the saved final-stage record is detected and how
    Case Status is derived when there is no `next` record.
2.  **FIR Register presentation:** The user selected that each court
    proceeding should have a separate row in the FIR Register. The
    display for an FIR Master with zero proceedings has not yet been
    decided. This is intentionally outside the current modal
    requirements.
3.  **Committed/Disposed locking details:** The business rules are
    captured above. The UI interaction for changing a Committed stage is
    still subject to the exact intended controls; do not allow Committed
    → Disposed.
4.  **Atomicity and retries:** Partial-save behavior is approved.
    Implementation must use safe per-record operations and idempotent
    retries so previously saved records are not duplicated. Do not claim
    the entire modal save is atomic.
5.  **Legacy records:** Do not automatically merge uncertain legacy
    records. Use existing stable IDs/history and explicit linking
    behavior already established by project architecture.

## 9. Acceptance Criteria

The modal requirements are met when:

-   [ ] FIR Master can be created without any court proceeding.
-   [ ] File No. is generated in `FIR Number/YY` format and is
    read-only.
-   [ ] Police Station is assigned from the logged-in user; missing
    assignment blocks save with a clear message.
-   [ ] Duplicate FIR identity is blocked using normalized FIR Number,
    normalized FIR Year, and stable Police Station ID.
-   [ ] Editing identity fields to collide with another FIR blocks the
    entire update.
-   [ ] Approved FIR Master fields propagate to every linked proceeding.
-   [ ] One FIR can have multiple proceedings and at most one UCR
    report.
-   [ ] Existing proceeding and UCR fields are preserved.
-   [ ] One Save button handles the current modal's changes.
-   [ ] Partial save is handled without deleting successful records;
    failed records show errors and can be retried safely.
-   [ ] FIR Master deletion is blocked when proceedings or UCR exist and
    requires an identifying confirmation dialog otherwise.
-   [ ] Proceeding deletion affects only the selected proceeding.
-   [ ] UCR type can be changed; UCR can be edited/deleted; deleting UCR
    without proceedings restores `Under Investigation`.
-   [ ] FIR-level status aggregation follows Section 5.4 exactly.
-   [ ] Stage changes trigger FIR Status recalculation.
-   [ ] The no-`next`-record versus final-stage Case Status ambiguity in
    Section 8.1 is resolved before implementation.
-   [ ] No FIR Register row-display decisions are inferred from this
    document.

## 10. Implementation Guardrails

-   Inspect the current code and tests before modifying anything.
-   Keep proposed requirements separate from existing implementation
    facts.
-   Preserve IDs, hearing history, and linked-record relationships.
-   Do not silently merge records.
-   Do not assume Firestore can atomically save an arbitrary number of
    records.
-   Test duplicate identity, missing police-station assignment, partial
    failures, retries, multiple proceedings, UCR interactions, and all
    status combinations.
-   Report which tests were actually run; do not claim unperformed
    verification.
