# Add/Edit Case UI/UX Standards

**Authority:** Preserve the existing modal and CSS. This document records current interaction patterns and the consistency rules for future approved changes; it does not authorize visual redesign.

## Existing structure

The modal uses the current `components/add-case/add-case.css` design and progressive disclosure: FIR metadata and FIR details, case-record chooser/list, active record editor, court status/registration, hearing history, conditional UCR, repeatable accused, repeatable witnesses, then form actions. Record-specific fields are activated from the case-record list. UCR details are hidden/disabled unless an UCR record is active; court and accused/witness controls are record-context dependent.

## Consistency rules

- Retain existing section order, styles, spacing, typography, and responsive behavior unless an approved change specifically affects them.
- Use visible labels connected to controls, indicate required fields consistently, explain conditional requirements next to the relevant section, and preserve existing accessible names, roles, live regions, keyboard controls, and focus behavior.
- Use native controls where already established: selects for enumerated choices, date inputs/pickers for dates, checkboxes for booleans, textareas for addresses. Do not change a control type or labels as a side effect of a data change.
- Repeated accused/witness/hearing records must preserve their individual values and stable saved IDs through add/edit/remove operations. Empty optional rows should not silently become meaningful records.
- Validation must identify the affected record and field, show a plain-language message, focus or activate the relevant control where practical, and preserve entered values after failure.
- Conditional fields should follow the existing record-type/state logic. Hidden inactive UCR/court fields must not leak into another record's save payload.
- During load/save, keep the existing button disable/progress text, status/live region, partial-failure explanation, and success confirmation behavior. Avoid reporting success while a required status refresh failed.
- Responsive and accessibility verification belongs to browser QA; markup inspection alone does not establish it.

## Current validation and feedback evidence

The HTML uses `novalidate`; custom JS validates required FIR fields, active court type/status, and UCR number/year/type/disposal date. FIR year is derived from FIR date. Save button changes to Preparing/Saving and is disabled during the operation; failure feedback can identify record index and retain the modal. No browser verification was performed for this audit.
