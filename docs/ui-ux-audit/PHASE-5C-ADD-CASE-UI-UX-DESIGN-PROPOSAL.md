# CaseTrack — Phase 5C: Add Case UI/UX Design Proposal

**Status:** Proposal for owner review only — no implementation authorized or performed.  
**Assessment date:** 2026-11-16  
**Recommended direction:** Option B — Modern Section-Based Form, delivered in small approved increments.

## 1. Executive summary

The Add Case dialog already has a recognizable CaseTrack visual language: centered modal, dark and light surfaces, blue primary actions, grouped sections, two-column fields on larger screens, and a desktop action footer. Its source also protects important data relationships: FIR master information is separate from linked proceeding records; a proceeding may be a court record or a UCR record; Accused and Witness arrays are stored on the proceeding; hearing history is stored with the linked proceeding and synchronized with Register Diary browser storage.

The main opportunity is to help users understand and move through that existing workflow. The dialog is a long, internally scrolling form. It begins with FIR details and complaint information, then asks users to add a case record before its court/UCR fields appear. There is no section jump navigation. On narrow screens, the Witness table keeps a 650 px minimum width inside a horizontal scrolling region, so several columns and the Action control are off-screen until the user pans. The prior 320 px screenshot confirms the narrow view only shows the first part of the table. Mobile action placement and reset/cancel behavior need explicit acceptance checks because their current source behavior differs from the desktop presentation.

I recommend a one-page, section-based layout with a compact section index, clearer distinction between FIR master and linked-record data, and semantically grouped Accused/Witness cards. This keeps the existing save flow, fields, relationships, required rules, and Phase 5B focus/error behavior. It is not a wizard, does not autosave, and does not change the record model. Option A remains a lower-risk fallback if the owner prefers minimal layout change.

## 2. Confirmed owner decisions

The following decisions from the Phase 5C brief are treated as final:

1. The original Accused template entry remains non-removable.
2. The original Witness template entry remains non-removable.
3. Existing Add/Remove behavior is preserved for additional entries.
4. Field mappings and business rules remain unchanged.
5. FIR and linked court-case relationships remain unchanged.
6. Phase 5B accessibility improvements must be preserved.
7. No new required fields without approval.
8. No data migration or backend changes.

**Minimum-entry decision:** the original template entries are the baseline UI entries and stay non-removable. This report does not introduce an additional minimum count, validation rule, or Remove control for either template. The Phase 5A blocked checks for template removal are resolved as an owner decision for this design phase; this is not a behavior change proposal.

## 3. Evidence reviewed and limits

### Documentation and source reviewed

- Master UI/UX issue register and implementation checklist.
- Phase 4 consolidated audit and remaining-work checklist.
- Phase 5A dynamic accessibility verification and Phase 5B targeted fix report.
- CaseTrack design-system specification, gap analysis, component consistency matrix, and screenshot index.
- `components/add-case/add-case.html`, `add-case.css`, and `add-case.js`.
- `assets/css/shared.css`, `assets/js/proceeding-fields.mjs`, `assets/js/fir-case-model.js`.
- `pages/cases.html`, `dashboard.html`, `fir-register.html`, `disposed-cases.html`, and `register-diary.html` (the routes using the component/style).

### Existing visual evidence

- `docs/ui-ux-audit/screenshots/dashboard-add-case-1366-light.png` shows the light-theme modal at desktop size. It confirms the compact header, File No/FIR Status strip, FIR Details and Complaint Details sections, internally scrolling content, and action footer. It captures only the upper part of the long form.
- `docs/ui-ux-audit/evidence/phase-5a/accused-fields-320-dark.png` shows the stacked mobile Accused card and Add button.
- `docs/ui-ux-audit/evidence/phase-5a/witness-fields-320-dark.png` shows the 320 px Witness table viewport. Only Sr. and a partial Witness Name column are visible; remaining columns are in the horizontal scroll region.
- Phase 5B records source-fixture measurements at 320, 375, 430, 768, 1024, 1366, and 1920 px in both themes. Those measurements were not a full authenticated route review. No full-dialog mobile screenshot or screen-reader test is available.

This is a source-and-existing-evidence assessment. No new browser audit, authentication, screen-reader use, source modification, or save workflow test was performed for Phase 5C. Findings distinguish current source/evidence from proposed refinements.

## 4. Current Add Case form inventory

**Legend:** “Required” reflects current markup or custom save validation; it does not authorize new requirements. Unless stated otherwise, user-entered fields are optional. The form uses `novalidate`; JavaScript controls validation/save behavior.

| Order / section | Fields and types | Required, source, and visibility | Dynamic behavior, validation, relationships, and save behavior |
|---|---|---|---|
| Dialog header / FIR metadata (`#modalTitle`, `.case-section-fir-meta`) | File No (read-only text); FIR Status (read-only text); title/state; Close. | File No auto-generated/read-only. FIR Status display-only and derived from FIR/proceeding state. | Opens from Add/Edit actions on several routes. Open resets or loads the selected record and focuses FIR Number by default. Close, Cancel, backdrop, and Escape close the dialog; inspected close logic has no unsaved-change confirmation. |
| FIR Details (`.case-section-fir`) | FIR Number (number); Date of FIR (read-only text/date picker); FIR Year (read-only number); Under Section (text combobox); Crime Head (searchable text/master selector); Police Station (read-only text plus hidden station ID). | FIR Number, Date, Year, Under Section required. Year is derived from FIR Date. Police Station is assigned/selected station context. Crime Head uses `crimeHeads` plus seeded choices and can persist a master value. | Creates/updates the FIR Master. Duplicate and legacy matching use FIR number, year, and station identity. Some fields lock when editing a linked record/master. Preserve these rules. |
| Complaint Details (`.case-section-complainant`) | Incident Date (read-only date picker); Incident Place (text); Beat Details (text); Complainant Name (text); Complainant Father's Name (text); Mobile Number (tel); Complainant Address (textarea). | All optional. | Maps to FIR Master complaint/incident fields and is propagated to linked proceeding payloads by existing mapping. |
| Case Records (`.case-record-options`) | No data fields. “+ Police Report” menu; UCR Report and Chargesheet choices; record list; live status message. | Not a field-validation section. | Adds one or more linked/local record drafts. Types include UCR, Chargesheet, Lower, Session, and JJB. Existing rules permit at most one UCR and prevent adding UCR after a court proceeding exists. Eligible lower-court records can create a Sessions successor. Editing a selected FIR Master requires a proceeding before save; a new FIR Master may be saved without one. |
| Selected Case Record Details (`#caseRecordDetails`, initially hidden) | Dynamic record title/help; Remove Record; optionally Commit to Sessions Court; applicable record fields below. | Appears when a record draft is selected/created or an existing linked record is edited. UCR and court records reveal different fields. | Draft list and `caseRecordDrafts` hold active values. Removing a draft confirms; persisted records follow existing relationship/delete behavior. |
| Court Status (`#sectionCourtStatus`) | Court Type (select: Lower Court, Session Court, JJB); Case Status (select: Under Trial, Disposed, Committed); Highlighted Case (checkbox). | Court Type and Case Status conditionally required for non-UCR records. Disabled/hidden until an appropriate record is active. Highlighted optional. | Case Status can synchronize from hearing/trial-stage data; court type can determine record subtype. Values belong to the linked proceeding. |
| Court Registration (`#sectionCourtReg`) | Registration prefix (text); number/year (number); Registration Date (read-only date picker); Court No. & Name (judge/court selector); hidden judgeId, judgeDisplayName, courtNumber, judgeCourtType, judgeName, courtName (`courtnan`); Date of Challan (date); Date of Charge (read-only date picker); Investigating Officer selector; hidden ioId, rank, name, belt number, and mobile; Add/Manage/Edit IO actions. | Optional in current HTML. | Judge/IO options come from existing master data. Registration and court/IO metadata belong to the linked proceeding. Date of Charge is related to hearing history. |
| Hearings Records (`#sectionNextDate`) | Hearing Date (read-only date picker); Trial Stage (existing populated select); Mark As (read-only text); hidden normalized next-date/trial-stage values; Saved Hearings list with Add/Update, Cancel edit, Delete Hearing. | No static required attribute; hearing actions validate their own inputs. | Multiple hearings can be added/edited/deleted. `hearingDateRecord` is saved with the linked proceeding and synchronized with Register Diary browser localStorage. Latest charge/hearing stage can affect displayed charge date and case status. Preserve current rules. |
| UCR Report Details (`#ucrRecordFields`, initially hidden) | UCR serial (number); UCR year (text/numeric pattern); hidden normalized `ucrNumber`; Report Type (select: Untraced/Cancelled); Date of Disposed (read-only date picker); Investigating Officer selector and hidden IO metadata/actions. | Disabled unless UCR is active. Custom save validation requires serial, four-digit year, report type, and disposal date. | Separate linked record type; court, hearings, Accused, and Witness sections are hidden. Preserve one-UCR and UCR/court conflict rules. |
| Accused Details (`#sectionAccused`) | Repeated: Accused Name (text); Father's Name (text); Mobile (tel); Arrest Status (checkbox); Arrest Date (read-only date picker); Custody Status (select: Bailed by Police/Court, Judicial Custody, Police Custody); Bail Date (read-only date picker); Proclaimed Offender (checkbox); PO V.O.D (read-only date picker); Address (textarea). | All optional. Original template has no Remove; additional cards can be added/removed. Arrest Date/Custody appear when arrested; Bail Date for either bail state; PO V.O.D when PO is checked. | Serializes through `proceedingFieldsFromForm()` into existing `accused[]`. Phase 5B keeps stable unique field IDs, visible sequential numbers, focus after add/remove, and contextual remove names. Do not change fields or mapping. |
| Witness Details (`#sectionWitness`) | Repeated: Witness Name (text); Status (select: Pending, Chief, Cross, Given Up); Examined (checkbox); Examined Date (read-only date picker). Display serial plus Total Witness, Witness Examined, Witness Left (read-only calculated numbers). | Entry fields optional. Original template row has no Remove; additional rows can be added/removed. Examined Date disabled until checked. | Serial/counts derive from named rows and examined flags; Left = Total − Examined. Values serialize into existing `witnesses[]`. Phase 5B maintains IDs/labels/names/focus. |
| Footer / edit-only action | Reset; Cancel; Save Case; Delete FIR Master (hidden unless editing the master). | Custom validation applies. Base required fields first; conditional UCR/court rules by record type. | Save maps FIR and proceeding values through current persistence code. Reset's native form event is distinct from modal-open full-state reset; test its effect on in-memory drafts/hearings before redesign. Successful save closes and shows an alert. No save/reset/confirmation semantics are changed here. |

### Sections present and absent

Present: FIR metadata, FIR Details, Complaint Details, Case Records, selected Case Record Details, Court Status, Court Registration, Hearings Records, conditional UCR Report Details, Accused Details, and Witness Details. There is no “Other” form section in the template; legacy selectors do not make one present. Footer actions are separate from data sections.

### Save and relationship boundary

Form values are collected through `FormData`. FIR Master fields are mapped and saved through `saveFirMaster`; proceeding values are held in `caseRecordDrafts` and serialized through `proceedingFieldsFromForm()`/`proceedingPayload()`. Accused/Witness arrays and `hearingDateRecord` stay on their linked proceeding. FIR status is refreshed from existing linked-record logic. Successor proceedings may reference predecessors. This proposal changes none of those names, structures, collections, identity rules, or relationships.

## 5. Existing design-system findings

- Shared tokens define dark/light page, surface, raised surface, text, muted text, border, brand, focus, radius, shadow, and spacing in `assets/css/shared.css`. Useful current aliases include `--surface`, `--surface-raised`, `--page-bg`, `--text-primary`, `--text-secondary`, `--border-strong`, `--brand-primary`, `--focus-ring`, `--radius-sm/md/lg`, and `--space-1` through `--space-6`.
- Add Case uses shared aliases for many surfaces, borders, actions, and radii, with scoped light-theme overrides. Some local colors remain literal. The proposal reuses current tokens; no palette replacement is proposed.
- The dialog uses the shared 900 px maximum width, 92 vh height limit, scrollable body, and separate footer. Cards use rounded borders; section headers use a letter/number icon, 15 px title, and 12 px description. Input labels are generally about 11–12 px. This fits the compact operational CaseTrack identity; hierarchy can improve without a new theme.
- Two-column grids collapse to one column at 800 px. Court Status is three columns above that breakpoint. The modal adapts below 780 px to clear the mobile top bar; action-footer buttons have a 44 px minimum height. The Witness table has a 650 px minimum width in a horizontal scroll wrapper.
- Add Case has a 2 px `:focus-visible` outline with 2 px offset. Phase 5B dynamic focus and error behavior must be preserved.
- Add Case-specific composited contrast ratios have not been measured. Future acceptance should check normal text at 4.5:1, large text at 3:1, and applicable control/focus boundaries at 3:1. These are targets, not a claim that the current component fails.

## 6. Visual audit

| Area | Current evidence | Assessment |
|---|---|---|
| Title/context | “Add New Case,” generic “Enter complete case information,” and New Case/Edit Case state. | Page identity is clear; helper copy does not explain that FIR Master data and linked record data are separate. |
| Hierarchy/order | Metadata strip; lettered FIR/Complaint subsections; Case Records chooser; record-specific fields; numbered Court Registration, Hearings, Accused, Witness sections. | Groups exist, but section markers mix letters/numbers and the chooser-to-details transition is not described as a sequence. Keep order; standardize headings and help text. |
| Density | Two-column FIR/Complaint fields; two-column Accused cards; full-width address; compound registration/hearing controls. | Efficient on desktop. Compound controls need an intentional tablet/mobile layout; do not compress long text fields to retain three columns. |
| Repeated entries | Accused cards; Witness table plus separate summary fields. | Different patterns make related tasks feel unrelated. Witness mobile panning hides Status, Examined, Date, and Action from the initial viewport. |
| Typography/labels | System font, section descriptions, floating/overlaid labels on many fields and permanent labels on selectors/toggles, visually hidden Witness labels. | Readable in supplied screenshots. Different label treatments are not by themselves defects. Keep persistent visible labels; identify Required before submit and do not rely on placeholders. |
| Inputs/states | Rounded inputs/selects, date pickers, custom search, toggles, master selectors. | Cohesive CaseTrack treatment. Apply the Phase 5B inline error style to existing conditional messages without changing when fields are required. |
| Actions/feedback | Desktop Reset/Cancel/Save remain outside scrolling body; Save is primary. Case Record/hearing status are live regions. Success closes and displays alert. | Desktop hierarchy is clear. At <=780 px the form itself scrolls and footer is static at its end; confirm full-dialog action reachability on mobile. Reset/Cancel/Close can discard unsaved input without a warning; this requires a product decision, not a visual-only change. |
| Themes | Dark/light variables and scoped overrides exist. Evidence includes desktop light and component-level mobile dark. | Brand identity is coherent. Full-dialog mobile theme states, error/disabled/focus contrast need comparison; do not infer ratios from tokens alone. |

## 7. Workflow usability assessment

### Existing flow

1. Open Add Case from the relevant route or edit an existing FIR/proceeding. The modal resets or loads the selected record and focuses FIR Number by default.
2. Enter/confirm FIR identity and Complaint Details. File No, FIR Year, Police Station, and FIR Status are read-only or derived according to current state.
3. In Case Records, select UCR Report or Chargesheet. The active record draft appears and reveals its matching fields.
4. For court records, complete Court Type/Case Status, registration and linked judge/IO data, hearing history, and any Accused/Witness entries. For UCR, complete UCR-specific fields and IO.
5. Save Case runs existing validation and relationship checks, then persists FIR Master and linked proceeding data through the current flow.

### Evidence-backed concerns (not confirmed application failures)

- The workflow is one long scrolling dialog with no section index. Desktop screenshot shows only its upper part; source confirms more conditional sections below.
- Users must understand the distinction between shared FIR details and linked Case Records. The Case Records helper says records link to the FIR, but does not explain why record type reveals different fields.
- At 320 px the Witness table's 650 px minimum means users must pan horizontally to reach Status, Examined, Date, and Action. The page stays in bounds, but the screenshot does not show a visible scroll cue.
- Mobile footer actions sit at the end of the scrollable form instead of a separate desktop-style footer. Verify access to Save with the virtual keyboard open and whether a persistent mobile bar helps without covering content.
- Reset, Cancel, Close, backdrop, and Escape provide exits; the inspected close handler has no unsaved-change prompt. Native Reset may not clear in-memory draft/list/hearing state in the same way as modal-open reset. Verify before deciding what Reset should promise.
- Do not add a progress meter: active record type/status changes which sections exist, multiple records can be edited, and validation is not a simple linear checklist. Do not collapse sections in the first increment; hidden validation errors and conditional fields would be harder to discover.

## 8. Accused and Witness UX assessment

### Current state

Accused uses numbered cards, two columns at desktop, one column below 800 px, and conditional Arrest/Custody/Bail/PO fields. Witness uses a semantic table, a horizontal scroll wrapper, and separate read-only summary fields. The original Accused/Witness entries have no Remove control; additional entries do. Phase 5B fixed visible numbering, keyboard-after-add, focus-after-remove, accessible remove names, and required-error associations in a component source fixture. It did not add an explicit named group for each Accused card. No screen-reader verification has been claimed.

### Repeated-entry alternatives

| Approach | Desktop | Mobile | Benefits | Tradeoffs |
|---|---|---|---|---|
| A. Existing stacked fields/table | Keep Accused cards and Witness table; add stronger scroll cue and row labels. | Keep horizontal Witness pan. | Lowest markup/style risk; preserves table semantics and compact desktop height. | Key Witness actions stay off-screen; different visual patterns; horizontal movement adds work and is less discoverable. |
| B. Visually separated cards — recommended | One labeled card per Accused and Witness; consistent heading, field grid, and entry actions. | Stack fields; no horizontal pan. Remove appears only on additional entries. | Consistent repeated-entry language; data/actions visible; strong semantic grouping; easy to scan and touch. | More vertical space with many witnesses; needs responsive and serialization regression. |
| C. Compact expandable groups | Summary header shows entry number/name/status; expand to edit details. | Saves initial height for many entries. | Compact for unusually large records. | Adds expanded state, hidden errors, extra clicks, and keyboard/screen-reader states; higher risk of concealing unsaved fields. |

### Recommendation for repeated groups

Use Option B. Keep the Accused card layout but make it a named semantic group, for example a fieldset with legend “Accused 1.” Present Witnesses as labeled cards instead of forcing a six-column table into a phone viewport. Each Witness group gets a visible/programmatic heading such as “Witness 2”; the original remains non-removable. Put Add near its section heading. Keep Remove in each additional group and preserve Phase 5B focus, names, ordinals, unique IDs, values, and field names.

Use two columns inside cards where space allows and one column on phones. Do not compress text fields beside icon-only actions. Display summary status only when derived from the same current values; do not add status/default rules.

## 9. Responsive design proposal

These are proposed rules for the seven established review widths, not claims of a defect at every width.

| Width | Proposed layout |
|---|---|
| 320 px | Fit below mobile top bar/safe area. One column. Witness cards replace horizontal pan. Aim for 44×44 px actions. Save stays reachable without covering the last field or keyboard. Wrap section links or use a labeled, visibly scrollable strip. |
| 375 / 430 px | Same single column; full-width fields; stack registration parts; preserve readable section descriptions/errors; keep Add visible. |
| 768 px | Two columns for compatible fields if each remains readable; compound registration/hearing controls may span the row. Use compact horizontal section links rather than a side rail. |
| 1024 px | Two-column FIR/complaint/proceeding fields; Court Status may use three columns if modal content width supports it. Accused/Witness cards use a 2×2 grid. |
| 1366 px | Centered dialog retains shared max width; internal body scroll and visible desktop footer; two-column fields; address, hearing editor, and errors span full width. |
| 1920 px | Keep dialog at readable max width rather than stretching fields; same hierarchy/spacing as 1366 px. |

At every width and both themes, acceptance checks page overflow, clipped labels/errors, reachable controls/actions, visible focus, scroll discoverability, and modal scrolling. Witness cards remove the need to pan a wide table; compound controls must wrap rather than create page overflow. Check mobile actions with the virtual keyboard and safe-area insets.

## 10. Accessibility requirements for future implementation

1. Preserve every current `name`, type, value, required/disabled condition, input ID uniqueness, label target, and form mapping.
2. Give each Accused and Witness entry a semantic named group using fieldset/legend or equivalent; include the visible ordinal.
3. Keep visible labels understandable. Placeholder may be an example but not the sole name. Mark only currently required controls; no new requirements without approval.
4. Keep errors next to inputs, related through `aria-describedby`, synchronized with `aria-invalid`, and clear stale feedback on correction/reset. Preserve existing help/status relationships.
5. Preserve Phase 5B: no positive tabindex; Add focuses the first appropriate field; Remove focuses a surviving entry/action or Add; names follow visible numbers; IDs remain unique.
6. Keep DOM and Tab order aligned with visual order. Section links must be keyboard operable, announce their destination, and not become a focus trap.
7. Preserve visible focus (currently 2 px with offset) and verify it in both themes. Required/error/status meaning cannot rely on color alone.
8. Aim for 44×44 px touch targets where feasible. Do not render a disabled Remove control on non-removable original entries.
9. Announce validation/status changes at an appropriate level; avoid noisy announcements on each keystroke.
10. Test at least one screen-reader/browser combination later. This source/evidence review is not a screen-reader test.

## 11. Three design approaches

| Dimension | Option A — Conservative Polish | Option B — Modern Section-Based Form (recommended) | Option C — Advanced Guided Entry |
|---|---|---|---|
| Description | Preserve structure; tune spacing, labels, focus/error styling, table cue, and responsive details. | Keep one form/save action; clarify FIR Master vs linked-record sections, add section jumps, and use consistent semantic repeated-entry cards. | Guided stages with progress, step-level validation, review, and explicit navigation. |
| Layout | Existing modal and order, no new navigation panel. | One-page scroll with compact anchors: FIR/Complaint, Case Records, then active record sections. Active record type controls available anchors. | Stages such as FIR, linked record, people/hearings, review; same underlying fields unless separately approved. |
| Mobile / desktop | Existing grid/footer; Witness remains a scrollable table. | Single column and no wide Witness table on phones; compact link strip; two-column fields and cards on desktop; existing max-width dialog. | One stage per view with Back/Continue; virtual-keyboard and review states. |
| Accessibility | Keep labels and Phase 5B behavior; local presentation only. | Named groups, native order, section links, error relationships, visible focus, touch actions, screen-reader tests. | Requires progress semantics, announcements, focus management, hidden-error handling, and review associations. |
| Benefits | Smallest regression surface and fastest path. | Better orientation and phone usability without a new data flow or wizard. | Most guidance for complex/rare workflows; creates a formal review stage. |
| Complexity / relative effort | Low. | Medium. | High. |
| Risks/dependencies | Witness table discoverability remains. | Markup/styles can affect modal scroll and dynamic rows; anchors must respect conditional visibility; serialization must remain identical. | High regression risk to create/edit hydration, multiple drafts, UCR restrictions, conditional validation, focus, and partial saves. Requires approval of stage boundaries and failure recovery. |

**Recommendation:** Option B. It addresses observed navigation and mobile repeated-entry concerns while respecting the existing workflow logic. Option A is a safe fallback. Do not select Option C without a separate workflow/data-flow review and dedicated create/edit regression plan.

## 12. Proposed UI specification for Option B

### Dialog and hierarchy

- Retain the Add/Edit dialog, shared 900 px maximum width, modal title/close action, and desktop action footer.
- In a future approved implementation, replace generic helper copy with a concise explanation: FIR details are shared by linked records; choose a Case Record to enter court or UCR details. Owner reviews exact copy.
- Keep File No and derived FIR Status in a compact metadata strip. Distinguish read-only/assigned/derived values visually from editable inputs.
- Retain order: FIR Details → Complaint Details → Case Records → active record fields (Court Status → Court Registration → Hearings → Accused → Witness, or UCR fields). Do not show anchors for hidden record types/statuses.
- Add compact native section links on desktop and a wrapping or clearly scrollable labeled strip on mobile. Links jump; they do not lock the user into a step or gate Save.
- Keep sections expanded by default. No progress percentage or collapsible panels in this increment.

### Grid, spacing, type, and surfaces

- Reuse `--space-2` through `--space-6` (8–24 px) for field gaps and section padding; separate major workflow groups clearly.
- One field per row on phones. Use two columns where fields remain readable at tablet/desktop; let dates, textareas, hearing editors, and compound registration controls span available width.
- Keep a readable centered content width and the existing shared maximum width unless future visual evidence supports a change.
- Use full-width address textareas and errors. Avoid narrow error columns.
- Reuse `--font-sans`, `--text-primary/secondary`, `--surface`, `--surface-raised`, `--border-color`, `--brand-primary`, and `--radius-*`. Keep CaseTrack blue actions and dark/light identity; no new palette.
- Maintain dialog/section/entry/field/helper hierarchy. Support text should remain readable; validate rendered sizes and contrast rather than assuming token contrast.
- Make existing required fields visibly Required; no new required controls. Required state needs text in addition to color.

### Buttons, feedback, and repeated entries

- Keep Save Case primary, Cancel secondary, Reset lower emphasis. Preserve actions unless separate approval changes reset/unsaved confirmation behavior.
- Put Add near its section title. Keep current accessible label and focus-to-new-entry behavior. Keep Remove within each additional entry card.
- Preserve Phase 5B inline errors and existing live statuses. Style existing conditional messages consistently without changing the required rules.
- Evaluate a mobile persistent action bar with safe-area/keyboard handling; it must not cover content or errors and must retain Reset/Cancel/Save labels.
- Accused: named fieldset/card with legend “Accused N”; two-column fields when space permits, one column on phone. Arrest/custody/bail/PO dependencies remain unchanged. Original card has no Remove.
- Witness: named card per row with legend “Witness N”; Name, Status, Examined, Examined Date in a readable grid, one column on phone. Keep serial/counts derived and read-only. Original row has no Remove.
- Preserve exact `name` attributes and array mappings. Do not change empty-entry inclusion, status defaults, counts, or save behavior.

### Focus, errors, and themes

Keep Phase 5B focus after Add/Remove, contextual names, and stable IDs independent of ordinals. Anchor navigation should scroll the internal modal body and target a section heading without changing DOM order. Preserve visible focus and test against dark/light surfaces. Test required, conditional, disabled, focused, invalid, and dynamic-entry states in both themes. No Add Case-specific contrast ratio is claimed here.

## 13. Before/after comparison

### A. Confirmed accessibility gap from existing evidence

| Current evidence | Proposed improvement | Benefit | Component | Risk / verification |
|---|---|---|---|---|
| Phase 5A browser accessibility snapshot did not expose each Accused card as a named group; Phase 5B leaves this for triage. | Add named semantic grouping for each Accused card and Witness card. | Screen-reader users identify which repeated entry contains a field/action. | Add Case HTML/CSS; minimal JS only if group headings need renumbering. | Preserve IDs/labels; verify browser accessibility tree and screen reader. |

### B. Evidence-backed usability concerns, not confirmed failures

| Current behavior/evidence | Proposed improvement | Benefit | Component | Risk / verification |
|---|---|---|---|---|
| One long form; no section index; desktop screenshot shows only its upper portion. | Compact links to currently visible sections. | Faster orientation without changing one-page save flow. | Add Case HTML/CSS, limited navigation behavior if needed. | Verify hidden sections and modal focus/scroll. |
| Witness table has 650 px minimum; 320 px capture shows only first columns; other controls need pan. | Responsive Witness cards, or cards only below breakpoint. | Status/date/action become discoverable without horizontal pan. | Add Case HTML/CSS and row presentation boundary. | Check names, focus, values, counts, edit hydration, serialization; cards use more height. |
| Required state is not marked in initial markup; it becomes apparent during validation. | Identify only existing required fields before submission. | Users know current requirements sooner. | Add Case HTML/CSS. | Preserve UCR/court conditional rules; add no requirements. |
| Mobile footer is static at the end of the scrollable form; desktop footer is separate. | Evaluate persistent mobile actions. | Less travel to Save after long entry. | Add Case CSS/HTML. | Test virtual keyboard, safe area, short viewport, and last error. |
| Reset/Cancel/Close can discard unsaved input; native Reset may leave in-memory drafts/hearing state out of sync with visible fields. | Clarify Reset scope and test state behavior; if approved, add explicit Reset Form copy and safeguard. | Reduces loss and expectation mismatch. | Add Case JS/HTML. | Behavior change; owner approval and multiple-record/hearing/edit tests. |
| Generic helper copy does not explain FIR Master vs linked record. | Explain the two data layers and why record type reveals fields. | Makes workflow more predictable. | Add Case HTML. | Copy review; must not imply changed save rules. |

### C. Optional refinements

| Current behavior | Refinement | Benefit | Risk / verification |
|---|---|---|---|
| Section markers mix letters and numbers. | Standardize section heading treatment. | Faster scanning. | Low; preserve section names and semantics. |
| Labels float/overlay for many controls and remain permanent for others. | Normalize label placement per control type while keeping visible labels persistent. | More consistent reading and fewer error overlays. | Check dates, search, textareas, disabled states, both themes. |
| Remove target is 34×34 px; Add controls are about 38 px high in the Phase 5B fixture; mobile footer actions have 44 px minimum. | Increase effective targets toward 44×44 with spacing. | Easier touch use. | Verify density and clipping. |
| Section help is about 12 px. | Use readable support text for workflow-critical guidance. | Better mobile comprehension. | Check wrapping at 320–430 px. |

## 14. Prioritized improvement matrix

| Priority | Improvement | Rationale | Approval / risk |
|---|---|---|---|
| P0 | Confirm Option B or select A; freeze fields, mappings, rules, minimum entries, and reset/unsaved-state scope. | Prevents design work drifting into workflow/backend changes. | Owner approval before code. |
| P1 | Add named Accused/Witness groups and preserve Phase 5B behavior. | Closes remaining repeated-entry context gap. | Page-specific markup; interaction and assistive-technology checks. |
| P1 | Replace narrow Witness table presentation with responsive cards. | Strongest evidence-backed mobile discoverability concern. | Regression-test all fields, counts, edit hydration, and save mapping. |
| P1 | Add compact section navigation and explain FIR Master vs linked-record flow. | Addresses long-form orientation without a wizard. | Exclude hidden sections from navigation. |
| P1 | Show current required state and associate custom errors. | Reduces avoidable submission errors while preserving requirements. | No new required controls; test UCR/court conditional behavior. |
| P2 | Validate mobile action reachability, target sizes, themes, focus, and errors. | Improves phone operation and visual confidence. | Full dialog across seven widths and both themes. |
| P2 | Decide whether Reset/Cancel/Close need unsaved-change protection. | Could prevent accidental loss, but changes interaction. | Separate owner decision before implementation. |

## 15. Proposed implementation roadmap (future approval only)

| Proposed phase | Scope and likely files | Dependencies / approval | Acceptance and regression tests |
|---|---|---|---|
| 5C-A — Design freeze/baseline | Confirm Option B, section order/index, card treatment, mobile action target, and reset/unsaved-state decision. Capture approved full-dialog states. | Owner approves page-specific design; record Phase 5B behavior. | No code changes. Approve copy, requirement visibility, and non-removable originals. |
| 5C-B — Hierarchy/orientation | `components/add-case/add-case.html`, `add-case.css`; optional small anchor behavior in `add-case.js`. Clarify FIR/record descriptions and add section links. | Approved copy/navigation; no stored navigation state. | Verify new FIR, edit FIR, court, UCR, and hidden-section links; keyboard anchor navigation and modal scrolling. |
| 5C-C — Repeated-entry cards/semantics | Same component HTML/CSS; minimal source rendering changes only if needed. | Approved Witness card treatment; template entries stay non-removable. | Repeated add/remove/re-add; Phase 5B focus; IDs/names/labels; values/counts; edit hydration; exact serialization equality. |
| 5C-D — Responsive/validation/actions | `components/add-case/add-case.css` and, only if needed, HTML/JS. Apply grid, touch size, Required visibility, inline errors, mobile footer. | Owner separately approves any Reset/action behavior change. No new required fields. | Existing validation/status rules; reset/cancel/close; seven widths and both themes; virtual keyboard and short-height modal. |
| 5C-E — Visual/workflow acceptance | Test-only evidence and final report; source only for a specifically approved defect. | Design sign-off; synthetic browser environment. Authenticated verification separately authorized. | Screenshot comparison, keyboard and assistive-technology checks, unchanged data mappings/relationships; existing tests, syntax/build/diff checks if implementation is approved. |

No phase authorizes schema/data migration, Firestore/auth/backend edits, autosave/drafts, or a multi-step wizard. A future implementation request must approve exact scope and verification boundaries.

## 16. Risks and dependencies

- **Mapping:** Markup/CSS work can change `name`, `id`, disabled state, order, field ownership, or FormData. Compare `proceedingFieldsFromForm()` outputs before/after with synthetic create/edit values.
- **Conditional state:** Court and UCR records show different fields and requirements. Navigation/progress cues must follow the active type; do not expose hidden links or imply a linear workflow.
- **Multiple records:** One FIR may link multiple proceedings and committed predecessor/successor records. Do not merge or overwrite records or alter the one-UCR restriction.
- **Dynamic identity:** Ordinals change while control IDs remain stable. Update accessible names/legends after removal without reusing IDs.
- **Mobile overlay:** Persistent actions can cover content or conflict with the virtual keyboard. Test viewport height, safe area, focused fields, and errors.
- **Reset/data loss:** Native Reset, modal-open reset, draft state, and hearing records are separate. Decide intended behavior with the owner before changing it.
- **Accessibility evidence:** Browser accessibility tree is not screen-reader verification. Named groups, error announcement, section links, and dynamic actions need assistive-technology testing.
- **Theme/contrast:** Reuse tokens, but rendered Add Case contrast has not been measured. Check focus, errors, disabled states, and both themes.
- **Dependencies:** No external package/runtime is needed for Option B. Existing HTML/CSS/JS, shared tokens, and local browser test environment are sufficient.

## 17. Owner approval checklist

- [ ] Approve Option B or select Option A/Option C.
- [ ] Approve compact section links; confirm navigation only, not a wizard/progress gate.
- [ ] Approve semantic cards for Accused and Witness and mobile Witness cards.
- [ ] Approve visible Required markers for existing required fields only.
- [ ] Confirm mobile action-bar behavior and 44×44 px target goal.
- [ ] Decide whether Reset/Cancel/Close should warn about unsaved input; define whether Reset clears all form and in-memory draft/hearing state.
- [ ] Confirm fields, mappings, status rules, record relationships, and serialization remain invariant.
- [ ] Confirm original Accused/Witness entries remain non-removable and no minimum-count validation is added. **Final for Phase 5C.**
- [ ] Confirm no autosave, saved drafts, migration, backend change, or guided wizard.
- [ ] Approve a separate implementation scope and verification plan before source changes.

**Owner decision status:** Pending review of Option B, mobile Witness cards, section links, and reset/unsaved-state behavior. Template-entry non-removability is confirmed and recorded above.

## Source reference index

- `components/add-case/add-case.html`: FIR metadata/FIR/Complaint (lines 16–149); Case Records/details (159–189); Court Status/Registration (190–337); Hearings (339–373); UCR (375–423); Accused (425–548); Witness (550–632); footer (637 onward).
- `components/add-case/add-case.css`: section/modal layout (212 onward); grid (535 onward); Accused card (1498 onward); Witness table (1674 onward); responsive rules (1765 onward); mobile modal (1891 onward); validation/focus (1977 onward and 2406 onward); light overrides (2142 onward).
- `components/add-case/add-case.js`: `updateCaseStatusFields()` (1359); hearing load/storage (1602/1654); case-record mapping (1782 onward); conditional visibility (2124); chooser (2277 onward); open/edit/close (2459 onward); dynamic Accused/Witness (2883 onward); validation (3108 onward); submit/save (3196 onward).
- Mapping: `assets/js/proceeding-fields.mjs` — `proceedingFieldsFromForm()` / `proceedingPayload()`; `assets/js/fir-case-model.js` — `saveFirMaster()`.

---

**Phase 5C deliverable only.** No application HTML, JavaScript, CSS, Firebase configuration, backend logic, issue register, checklist, or prior phase report was modified. No production data, emulator, credentials, dependency installation, runtime download, deployment, merge, or push was used/performed. Await owner design approval before implementation.

