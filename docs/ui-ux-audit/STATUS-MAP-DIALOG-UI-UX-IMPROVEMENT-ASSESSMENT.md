# FIR Status Map Dialog — UI/UX Improvement Assessment

**Assessment date:** 20 November 2026
**Scope:** Existing FIR Details dialog on the FIR Status Map page. This report is analysis and recommendations only; no application source or Firestore data was changed.

## 1. Executive summary

The dialog is a compact, native HTML `<dialog>` with a clear set of FIR facts, a status badge, a contextual View FIR link, and useful missing-record handling. The source uses semantic `<dl>` details, `showModal()`, a labelled dialog, a labelled close control, and the browser's native modal keyboard/focus behavior. The data flow is understandable: records are loaded and normalized before a user clicks; the cell handler passes its in-memory record to the dialog renderer.

The main opportunity is information priority. FIR number and status are visible immediately, but the FIR year is omitted from the displayed identity, and the view contains no court name, case number, or judge even when those fields exist on linked proceedings. The UI also has a very small type scale, 36px close and 38px navigation controls, and no explicit component focus treatment. Court and investigation data should be available progressively, not all crowded into the initial view.

**Recommended direction:** Concept C, an adaptive presentation using Concept B's structured information hierarchy: centered modal on desktop, a medium-width dialog on tablet, and a full-screen detail sheet on narrow mobile. Keep the first screen focused on FIR identity, current status, station, date/sections, and the next court event. Place linked proceedings, people, investigation, incident, and disposal data in expandable sections when those values are present.

There are **8 improvement opportunities** in the register: **0 P0, 4 P1, 3 P2, and 1 P3**. The four P1 items address displayed identity, court context, touch sizing, and explicit dialog-control focus styling. They are high-impact recommendations; the current source is not blocked from use.

## 2. Current dialog architecture

### Markup and fields

The dialog is statically declared in `pages/fir-statusmap.html` as `<dialog id="firDetailsDialog" class="statusmap-dialog" aria-labelledby="dialogTitle">`. It contains a `method="dialog"` form, a close button, a `FIR RECORD` kicker, a dynamic heading, a status paragraph, and a definition list with five values:

- FIR Number
- FIR Date
- Sections
- Police Station
- Next Hearing (date and, when available, stage)

It also contains a conditional “No FIR registered for this number.” message and a conditional “View FIR” link. Missing records show the warning and hide the link. The complete source is at [pages/fir-statusmap.html, lines 77–93](../../pages/fir-statusmap.html#L77).

### Click-to-close flow

1. `loadSelectedRecords()` obtains authorized records for the selected station/year, calls `buildFirStatusMap()`, then `renderModel()` creates actual cells with `makeCell()`.
2. Each numbered cell is a `<button>` with an accessible label and a click listener. Registered cells pass their in-memory record to `showDetails(record, record.number)`. An unregistered number passes `null` and sets `{ missing: true }`.
3. Unnumbered FIR records also use `showDetails(record, '—')`.
4. `showDetails()` updates the title and five fields with `textContent`, derives the next upcoming hearing from the record's proceedings, applies the status-category class, toggles the missing notice and View FIR link, then calls `detailsDialog.showModal()`.
5. The close button submits the `method="dialog"` form. Clicking the dialog backdrop closes it through a `click` listener. Escape is not handled in application code; the browser's native modal-dialog behavior closes it. The implementation is in [assets/js/fir-statusmap.js, lines 109–181 and 192–267](../../assets/js/fir-statusmap.js#L109).

The click itself does **not** make another Firestore request. It uses the rendered model record. Loading, access, and fetch errors are represented in the Status Map page message outside the dialog; the dialog is opened only for an available grid cell or unnumbered record.

### Current CSS and theme behavior

The dialog-specific rules are in [assets/css/fir-statusmap.css, lines 78–97](../../assets/css/fir-statusmap.css#L78). The surface, text, borders, and shadow use shared variables that switch under `body.light-theme` in [assets/css/shared.css, lines 3–95](../../assets/css/shared.css#L3). Status badge backgrounds use the existing FIR palette via `.fir-statusmap-theme` aliases at `fir-statusmap.css:1` and status tokens in `shared.css:22–30, 77–80`.

The dialog is centered by the native dialog element, capped at 480px wide, and capped at `100dvh - 32px` tall with internal scrolling. At widths up to 390px, form padding drops from 23px to 19px (`fir-statusmap.css:102`). Print CSS hides the dialog (`:103`). There are no dialog open/close animations or separate dialog-specific light-theme declarations; the shared theme variables provide the theme change.

## 3. Current UI/UX findings

### Confirmed strengths

- FIR number and status are at the top of the dialog, and the heading is associated through `aria-labelledby`.
- Native `<dialog>.showModal()` gives modal semantics and native focus containment/keyboard behavior. The component has no custom focus manager; native behavior is relied upon.
- The close control has the accessible name “Close FIR details.” The View FIR action is hidden when the record is missing or lacks a master ID.
- `<dl>`, `<dt>`, and `<dd>` provide useful label/value semantics.
- User data is assigned via `textContent`, not interpolated into HTML. The View FIR URL is built with `firRegisterUrl()` and encodes year/master identity in query parameters.
- Status colors match the established Blue + Green case palette and the shared FIR UI/UCR/UT/Disposed statuses.
- The modal width and height respond to viewport dimensions; long contents can scroll within the dialog.

### Confirmed gaps and design preferences

| Type | Finding |
|---|---|
| Confirmed information gap | The dialog displays the FIR number without its year. The selected year is available from `yearSelect.value`, and the model carries `firYear`; it is not shown alongside the number. |
| Confirmed information gap | Only the next hearing date and optional stage are shown. Existing linked/legacy proceeding records can carry court type/number/name, registration number, judge, IO, accused/witness data, hearing history, and disposal fields, but the dialog doesn't surface them. |
| Confirmed duplicate case | The model marks duplicate-number records and retains `duplicateMasters`; the dialog only displays the “Duplicate FIR number” status and does not disclose the count or selectable records. |
| Confirmed styling gap | `.statusmap-kicker` has no matching rule in the loaded stylesheets; “FIR RECORD” therefore uses inherited/default styling. |
| Confirmed accessibility gap | Dialog close and View FIR have no authored component `:focus-visible` rule. The shared `.layout :is(button, a, …):focus-visible` selector does not cover this dialog because the dialog is a direct child of `body`, outside `.layout`. Browser defaults may still draw a focus indicator. |
| Confirmed sizing concern | Close is 36×36px and View FIR has 38px minimum height. They are usable but below the common 44px touch target recommendation for frequent mobile use. |
| Confirmed type scale | Dialog labels are 9px, values 12px, status 10px, and action 11px. This is compact, but less comfortable for quick outdoor/mobile scanning and zoomed text. |
| Preference | The first two definition-list entries use two columns; the remaining three span the width. The grouping is compact but mixes FIR identity and court activity in a single undifferentiated list. |
| Preference | There is no copy-number action, animation, sticky footer, or expandable detail area. These are optional; avoid adding them unless the workflow confirms a need. |

## 4. FIR information hierarchy

The dialog has access to `record.master`, `record.proceedings`, `record.statusLabel`, `record.statusCategory`, `record.firNumber`, and `record.duplicateMasters` from `fir-statusmap-model.mjs`. `nextHearingFor()` searches linked/legacy proceedings and selects the earliest current/future next hearing, including its trial stage.

The related records already expose these fields in the case data model and FIR Register UI (where populated):

- **FIR master:** FIR number/year, file number, date, station, sections, crime head, page number, incident date/place, beat details, and complainant name/contact/address (`fir-case-model.js:142–143`; FIR Register rendering at `fir-register.js:340–351`).
- **Linked/legacy proceedings:** court type/number/name, registration prefix/number/year/date, judge name/designation, next date, trial stage, hearing-date history, IO rank/name/belt/mobile, challan/charge dates, accused and witnesses, UCR/report information, decision/disposal fields (`fir-register.js:228–235, 286–298`).
- **Status:** derived from master and proceedings with the shared status presentation; it should continue to come from the existing status model rather than being recomputed in the dialog.

Recommended priority for a Parvi Officer:

1. **Always visible:** FIR number/year, police station, canonical FIR status, FIR date, sections, and the nearest upcoming court date/stage. Add court/case number and court name to this summary when a linked proceeding has those fields.
2. **Expandable “Court proceedings”:** Each linked case's court, registration number, judge, stage, hearing history, and disposal result. Keep each proceeding distinct; don't flatten multiple cases into one ambiguous court value.
3. **Expandable “Investigation & people”:** IO details, complainant, accused, incident/place, and witnesses, only when present and authorized in the loaded record.
4. **Secondary / conditional:** UCR and disposal dates/types, registration metadata, long address text, and duplicate master records. Display “Not recorded” or omit individual fields consistently; do not invent values.

## 5. Alternative design concepts

### Concept A — Compact Quick View

**Structure:** 400–440px centered modal. FIR number/year and status in one compact header row; station/date/sections and next hearing in a two-column definition list; View FIR in a short footer.

**Advantages:** Fast to scan, minimal vertical height, close to the current implementation, low implementation risk, and ideal when users mostly confirm identity/status.

**Disadvantages:** No clear place for multiple linked proceedings or investigation details; adding them later would make the dialog crowded or force scrolling.

**Mobile usability:** Fits as a centered dialog at 320–430px with 44px controls, but dense columns and 2–3 linked cases become hard to scan.

**Complexity:** Low.
**Compatibility:** Excellent; preserves the current native dialog and model.

### Concept B — Premium Structured Modal

**Structure:** 560–620px centered desktop modal. Compact identity header with FIR/year, station, and status; “FIR information” and “Court status” cards; a small list for multiple proceedings; optional expandable investigation/people section; clear action footer.

**Advantages:** Strong hierarchy, separates FIR identity from court activity, gives multiple proceedings a truthful structure, and uses the available data without putting all fields on screen at once.

**Disadvantages:** More vertical content and more conditional states; needs careful treatment for missing values, duplicate FIR numbers, and long hearing histories.

**Mobile usability:** Reasonable as a scrollable modal, but the desktop information cards lose their advantage on a narrow screen.

**Complexity:** Medium.
**Compatibility:** Good; existing status tokens, FIR data model, and native dialog can be retained.

### Concept C — Adaptive Dialog

**Structure:** Use Concept B's content hierarchy, with a centered modal on desktop, a medium-width dialog on tablet, and a full-screen detail sheet on narrow mobile/PWA. Keep the identity/status header compact and the primary action anchored at the bottom when content scrolls.

**Advantages:** Matches the interaction to viewport and likely record density; gives small phones enough width for court/proceeding rows; preserves a familiar desktop modal.

**Disadvantages:** Highest responsive QA burden; full-screen mobile layout needs safe-area handling, scroll/focus checks, and explicit close affordance.

**Mobile usability:** Best for small phones once expandable data is added. A full-screen sheet gives a stable reading surface and avoids a short floating window over the status map.

**Complexity:** Medium-high.
**Compatibility:** Good; can remain a native `<dialog>` and use existing CSS/data, with no new dependency.

### Comparison

| Criterion | A — Quick View | B — Structured Modal | C — Adaptive Dialog |
|---|---|---|---|
| Speed for FIR/status confirmation | Excellent | Very good | Very good |
| Multiple court proceedings | Limited | Good | Good |
| 320–430px readability | Fair | Fair | Best |
| Desktop use | Good | Best | Best |
| Change complexity | Low | Medium | Medium-high |
| Best fit for current/future data | Limited | Strong | Strongest across devices |

## 6. Recommended design and responsive specification

Select **Concept C**, using Concept B's information grouping. It preserves the current quick check but scales to linked-court details and mobile workflow. It reduces unnecessary scrolling by showing only identity and current court status first, with secondary information collapsed until needed.

### Desktop (≥ 1024px)

- Centered native modal; width 560px, maximum height `calc(100dvh - 48px)`.
- 24px outer padding; 8px spacing between title and status; 16px between information groups.
- Header: FIR number/year at 24–28px semibold, station as secondary text, status badge adjacent or immediately below.
- Summary: FIR date, section(s), and nearest hearing/stage; court name/case number included when linked record values exist.
- Proceedings section: one concise row/card per linked court record; expand for hearing history/disposal information.
- Footer: 44px View FIR primary action and 44px close control, with visible labels.

### Tablet (681–1023px)

- Centered modal at `min(92vw, 600px)`, max height `calc(100dvh - 40px)`.
- Keep two-column identity/date details only when each value has enough room; proceedings use a single column.
- Scroll the content region while keeping header identity and action footer available.

### Mobile/PWA (≤ 680px, including 320/360/390/430px)

- Full-screen detail sheet at viewport width/height, with `env(safe-area-inset-top/right/bottom/left)` padding; keep native dialog semantics.
- 16px content padding (minimum 12px at 320px if needed); one-column detail flow; no horizontal scrolling.
- Close control at least 44×44px and visible at the top. Sticky 44px View FIR action in a bottom safe-area-aware footer when link is available.
- Make court/proceeding groups expandable; keep FIR number, status, station, and next event visible without expansion.
- Let the content region scroll independently; avoid placing the virtual keyboard over actionable controls (no editable fields are needed in the dialog).

## 7. Theme, visual, and interaction recommendations

### Light and dark themes

- Retain the current shared `--surface`, `--surface-raised`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-color`, and `--border-strong` tokens; do not hardcode separate modal palettes.
- Keep the FIR status colors from `FIR_STATUS_PRESENTATION` and shared variables. Preserve dark foreground on filled status badges and verify contrast for each status token against that foreground in both themes.
- Use a moderate border and shadow; current 24px/80px dark shadow may feel heavy on the dark surface. Prefer a restrained shadow plus a clearly visible border, especially in dark theme.
- Use Blue for the primary View FIR action and Green for status/positive accents; avoid introducing pink/purple accents.
- Add an explicit `.dialog-close:focus-visible` and `.dialog-view:focus-visible` treatment using `--focus-ring` / `--brand-primary`, since the dialog is outside `.layout` and misses that scoped shared rule.

### Interaction

- Keep native Escape and backdrop-to-close. If adding custom animation, respect `prefers-reduced-motion`; don't delay closing or obstruct the native cancel behavior.
- Add the year to the identity line and a small Copy FIR number action only if copy/paste is a real workflow need. Announce copy success with an accessible status message.
- For duplicates, show the number of matching masters and provide a deliberate way to inspect each record; do not silently present only the first master as though unique.
- For linked proceedings, make each court case its own row with a clear View/expand affordance. Preserve the existing View FIR action.
- A loading skeleton is not needed inside the modal while cells are only rendered after a successful load. Keep page-level load/access error messaging. If future lazy detail fetching is introduced, add explicit loading, unavailable, and retry states.
- Avoid adding animation, copy controls, or broad “show everything” accordions unless operator research confirms value.

## 8. Accessibility assessment

- **Semantics:** Native `<dialog>` plus `aria-labelledby` is a sound base; `<dl>` semantics are appropriate. No explicit `role="dialog"` or `aria-modal` is required for a dialog opened with `showModal()`.
- **Keyboard:** Native dialog supports modal focus containment, Escape cancellation, and focus return. Close control is keyboard-operable. No custom Escape handler exists for this dialog.
- **Focus styling:** No dialog-specific authored focus-visible rule exists. The global rule in `shared.css:995` is scoped under `.layout`, while this dialog sits outside `.layout`; add explicit visible focus styles.
- **Name and description:** Close has an accessible label. The dialog is named by its heading. Consider `aria-describedby` only if a concise stable description is added; do not point it at the entire detail list.
- **Status announcement:** Status is a plain paragraph. It is present at dialog open, but lacks explicit live/status semantics. Ensure the visible status is announced during dialog opening; a status role may be considered if dynamic updates occur after open.
- **Touch:** Existing 36×36 close and 38px action heights are below the recommended 44px comfort target. Raise close and primary action to 44px.
- **Text:** 9px labels and 10–12px values are compact. Increase values to 14–16px, labels to at least 11–12px, and preserve zoom/reflow without clipping.
- **Contrast:** Shared theme tokens adapt correctly. Validate every colored badge and muted label against WCAG contrast targets with measured color pairs before implementation; this assessment does not claim a contrast audit measurement.

## 9. Prioritized improvement register

| ID | Current problem | Recommended improvement | Priority | Complexity | Expected benefit |
|---|---|---|---|---|---|
| SM-DLG-01 | Displayed FIR identity omits year. | Show `FIR number / year` prominently, sourced from master/year selector. | P1 | Low | Reduces ambiguity when numbers repeat across years. |
| SM-DLG-02 | Court summary has only next hearing date/stage, even when linked proceedings have court/case/judge fields. | Add a concise latest/next court summary and separate rows for multiple linked cases. | P1 | Medium | Lets officers act on the court status without leaving the map. |
| SM-DLG-03 | Close and View FIR controls are 36px and 38px high. | Set both primary touch controls to ≥44px. | P1 | Low | Easier mobile operation. |
| SM-DLG-04 | Dialog controls lack authored focus-visible styling because shared focus rule is scoped to `.layout`. | Add explicit theme-token focus rings for close and View FIR. | P1 | Low | Makes keyboard position clear in both themes. |
| SM-DLG-05 | Compact 9–12px typography and an unstyled `FIR RECORD` kicker. | Establish a readable type scale and style the kicker as secondary metadata. | P2 | Low | Improves scan speed and visual polish. |
| SM-DLG-06 | All five values share one list; duplicate status doesn't expose duplicate records. | Group identity/court details and disclose duplicate count/selection when present. | P2 | Medium | Clarifies hierarchy and avoids ambiguity in duplicate records. |
| SM-DLG-07 | Centered, scrollable dialog remains the same pattern on narrow phones. | Use the adaptive full-screen mobile detail sheet with safe-area-aware sticky actions. | P2 | Medium-high | More comfortable reading surface on 320–430px screens. |
| SM-DLG-08 | No copy-number action exists. | Research whether copy is frequent; add a one-tap copy action only if confirmed. | P3 | Low | Saves time for copy/paste workflows without adding speculative complexity. |

There are no P0 findings. The current dialog remains functional; P1 items are significant workflow/accessibility improvements, not a claim that the page is unusable.

## 10. Phased implementation roadmap (not implemented)

| Phase | Likely files/components | Risks | Tests and acceptance criteria |
|---|---|---|---|
| A — Accessibility and functional corrections | `pages/fir-statusmap.html`; `assets/js/fir-statusmap.js`; `assets/css/fir-statusmap.css`; shared theme tokens only if needed | Native dialog focus behavior changes; missing/duplicate states regress. | Keyboard open/close with Enter, Space, Escape, backdrop; focus returns to clicked cell; close/action ≥44px; visible focus ring in both themes; screen reader announces title and status; no behavior regression for missing and unnumbered cells. |
| B — Information hierarchy | `fir-statusmap.js`; possibly a small pure formatter in `fir-statusmap-model.mjs`; dialog CSS/markup | Multiple linked cases and mixed master/proceeding fields may be flattened or misattributed. | Verify FIR/year/station/status, each linked case, nearest hearing/stage, duplicate masters, and missing values against synthetic fixtures; never change status derivation. |
| C — Responsive mobile/PWA | `fir-statusmap.css`; dialog structure in `fir-statusmap.html` | Safe-area/keyboard, scroll nesting, and sticky footer may obscure details. | Capture 320/360/390/430 portrait, tablet and desktop, both themes; no clipping or horizontal overflow; footer remains reachable; installed Android PWA separately if available. |
| D — Visual polish and regression | Same dialog files; existing Playwright coverage | Theme cascade and status contrast differences. | Light/Dark screenshots; contrast measurements; reduced-motion check if motion is added; automated DOM/keyboard tests and existing StatusMap/model suite pass. |

## 11. Risks and regression considerations

- Do not alter `deriveFirStatus`, `buildFirStatusMap`, status color/category mappings, or station authorization as part of the redesign.
- Preserve the difference between FIR master data and each linked court proceeding; never imply one court/judge applies to all linked records.
- Missing FIR sequence cells, registered but unnumbered records, duplicate number groups, unknown/unmapped statuses, and absent hearing dates each need distinct presentation.
- Continue using `textContent` for record values. Avoid adding user-controlled strings to `innerHTML`.
- Verify the “View FIR” URL still carries year and master ID and continues to open the intended register record.
- The Status Map page's current 390px breakpoint affects form padding only; tablet and short-height mobile layouts need explicit regression checks if the modal becomes full-screen.

## 12. Visual assessment and evidence limitation

The source was inspected directly. No dialog screenshot is attached, and no claim of rendered visual verification is made. The repository's Playwright setup can authenticate against local Firebase emulators, but its fixture creates only an Auth user and `userRoles` entry; it does not seed the required `policeStations`, `firMasters`, `linkedCases`, or legacy `cases` records. Reaching a populated FIR cell would therefore require writing test records or using a separate authorized environment with existing synthetic data. To honor the no-Firestore-write constraint, no such records were created and no production data was accessed.

## 13. Open product-owner questions

1. Should the dialog show every linked court proceeding or only the nearest upcoming one in its initial summary?
2. Should duplicates open a chooser of FIR master records, or should the dialog show one selected record plus a duplicate count?
3. Which identifiers should “View FIR” open when multiple linked cases exist: FIR master record only, or a selected proceeding context too?
4. Is Copy FIR number part of actual Parvi Officer workflow, or should the action remain out until requested?
5. For mobile, is a full-screen detail sheet acceptable, or does the team prefer a bottom sheet that keeps some of the Status Map visible?
6. Which fields are mandatory for operators when older records have incomplete master/proceeding data?

## Source map

| Concern | Source |
|---|---|
| Dialog markup and IDs | [pages/fir-statusmap.html:77–93](../../pages/fir-statusmap.html#L77) |
| Imports and DOM bindings | [assets/js/fir-statusmap.js:1–24](../../assets/js/fir-statusmap.js#L1) |
| Value population and open | [assets/js/fir-statusmap.js:109–129](../../assets/js/fir-statusmap.js#L109) |
| Cell construction/click handlers | [assets/js/fir-statusmap.js:131–181](../../assets/js/fir-statusmap.js#L131) |
| Record loading and render path | [assets/js/fir-statusmap.js:192–229](../../assets/js/fir-statusmap.js#L192) |
| Close-on-backdrop and startup | [assets/js/fir-statusmap.js:258–267](../../assets/js/fir-statusmap.js#L258) |
| Dialog visual rules and breakpoints | [assets/css/fir-statusmap.css:78–103](../../assets/css/fir-statusmap.css#L78) |
| Theme variables | [assets/css/shared.css:3–95](../../assets/css/shared.css#L3) |
| Status aliases | [assets/css/fir-statusmap.css:1](../../assets/css/fir-statusmap.css#L1) |
| Authorized station context and data retrieval | [assets/js/fir-statusmap-data.js:18–70](../../assets/js/fir-statusmap-data.js#L18) |
| FIR Status Map record shape, status, cells | [assets/js/fir-statusmap-model.mjs:23–180](../../assets/js/fir-statusmap-model.mjs#L23) |
| Next hearing and View FIR URL helpers | [assets/js/fir-statusmap-model.mjs:195–218](../../assets/js/fir-statusmap-model.mjs#L195) |
| Access checks and normalized case fields | [assets/js/fir-case-model.js:33–76, 115–153](../../assets/js/fir-case-model.js#L33) |
| Available proceedings fields used by FIR Register | [assets/js/fir-register.js:228–235](../../assets/js/fir-register.js#L228) |
