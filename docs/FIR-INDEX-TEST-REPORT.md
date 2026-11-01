# CaseTrack FIR Index Test Report

**Audit date:** 1 November 2026  
**Scope:** FIR Index page source, its shared data model, relevant business rules, existing unit tests, responsive CSS, and repository-configured Firestore rules  
**Execution mode:** Static source review plus existing local unit suite  
**Code changes:** None. No Firebase records or security rules were changed.

## Health assessment

**Status: Needs browser and Emulator verification.** The page implementation is straightforward and uses the shared FIR model/status derivation. Its dynamic output is built with DOM APIs and `textContent`, the table supports keyboard activation, and only one page of up to 50 FIR rows is rendered at a time. However, the page still downloads and groups the complete case dataset, has an avoidable repeated scan during non-empty search, and has no page-specific automated coverage. No live data was read, so correctness against actual Firestore documents, access boundaries in the deployed environment, and user-visible timing remain unverified.

## Architecture and data flow

1. `pages/fir-index.html` defines the annual index table, year picker, search box, pagination controls, print button, and back link. It loads shared layout, `assets/js/fir-index.js`, and PWA registration.
2. `assets/js/fir-index.js` calls `loadCaseRecords(db)` once during initialization. It does not install a Firestore listener or maintain a shared cross-route cache.
3. `assets/js/fir-case-model.js` reads `firMasters`, `linkedCases`, and legacy `cases`, merges records by established relationships/legacy identity, suppresses linked legacy counterparts, overlays master-owned FIR fields, and calls `deriveFirStatus()` through `getFirSummaries()`.
4. The index deduplicates/group summaries, sorts them by numeric FIR number with locale fallback, filters by selected year and query, and renders pages of 50.
5. Selecting a row navigates to `fir-register.html?year=…&fir=…`; the FIR Register resolves that stable key into its selected record. The page also offers a back link, year navigation, previous/next pagination, print, and the global app shell. No add/edit action is implemented on the index itself.

The repository's configured `firestore.admin-panel.rules` uses station checks for `firMasters`, `linkedCases`, and legacy `cases`; the production project is handled by the station-scoped branch in the shared model. This is source evidence only. Deployed rules and unauthorized access behavior were not exercised.

## Actual page features and displayed fields

| Feature | Observed behavior |
|---|---|
| Year | Picker offers the current year plus five years on either side. A valid `?year=YYYY` outside that range is added to the options. |
| Search | Case-insensitive substring matching after trimming outer whitespace. Supported values include FIR number/file number, year, FIR date, station, complainant/father/mobile, incident place, section/crime head, linked court/judge/registration, IO, UCR number, proceeding status, and accused names. It does not search address, hearing dates/stages, witness names, station ID, or arbitrary fields. |
| Table | Sr. No., FIR number/year, FIR date, Under Section, Police Station, and FIR status. Other indexed values are not columns. |
| Status | FIR summary status is derived by the shared status engine; proceeding status remains per linked/legacy record. |
| Row open | Click, Enter, or Space opens the FIR Register at the selected FIR key. |
| Pagination | Client-side, 50 FIRs per page; year/search changes return to page one. |
| Print | Calls `window.print()`; print CSS hides shell/search/pagination and expands the table wrapper. |
| Linked cases/hearings | Linked proceedings are used in grouping/search and FIR status derivation. Hearing history and next date are not displayed or searched on this index. They are available on the FIR Register detail view. |
| Refresh/edit/add | No page-specific refresh, edit, add, linked-case menu, or modal action is present. The global shell remains available. |

Search and result updates occur on every input event; there is no debounce. The query parameters support initial year and search restoration. There is no explicit clear/reset button; clearing the input restores all FIRs for the selected year.

## Firestore mapping review

| Index field | Source and mapping observed |
|---|---|
| FIR number/year/date, station, sections, crime head, complainant and incident fields | FIR Master is canonical when present; `mergeCaseRecords()` overlays master-owned values onto linked and legacy records. Legacy-only FIRs use their record fields. Year has fallback to `year`, then a four-digit year parsed from `firDate`. |
| FIR status | `getFirSummaries()` invokes `deriveFirStatus(master-or-base, proceedings)`. A master without proceedings remains a summary and follows shared status rules. Existing FIR status tests cover no proceedings, multiple proceedings, UCR, committed/disposed, and reopening behavior. |
| FIR identity / duplicate grouping | Master ID for master/linked associations; legacy FIR number + year + station key when available; otherwise record collection/document identity. `mergeCaseRecords()` also excludes linked legacy counterparts identified by `legacyCaseId`. |
| Court, judge, registration, IO, accused, UCR values | Read from related linked/legacy proceedings for search; they are not displayed as index columns. |
| Hearing and next date | Not used by FIR Index rendering or search. Hearing history belongs to proceeding documents under the canonical data mapping. |

This review did not compare any rendered value to a live document. Null and malformed values are mostly converted to empty text or an em dash for visible cells; exact behavior for malformed date strings is not validated. No live duplicate, orphaned-link, deleted-record, or stale-update scenario was run.

## Root-cause and issue table

| Issue ID | Severity | Component | Root Cause | Status | Proposed Fix |
|---|---|---|---|---|---|
| FIR-INDEX-001 | Medium | Search in `assets/js/fir-index.js` (`searchMatch`, `applyFilters`) | For every candidate FIR that passes the year check, search filters the complete `records` array to rediscover related proceedings. This repeats relationship work for each keystroke and scales with FIR summaries × source records. | Confirmed source-level performance hotspot; runtime impact not measured. | Precompute a map from FIR identity key to related records once after load; use the map during search. Consider debounce only if browser measurement shows it is needed. Preserve all current searchable fields and association rules. |
| FIR-INDEX-002 | Low / data-dependent | Year picker in `assets/js/fir-index.js` (`populateYears`) | Normal picker options are limited to current year ±5. Older/newer years are selectable only when supplied in a valid URL query. If records exist outside that window, the user cannot reach them from the picker. | Conditional risk; no dataset evidence that such records exist. Not counted as a confirmed bug. | Compare available years with known records and approved retention expectations. If older years are in scope, derive picker years from the loaded summaries or an authorized year query. |

### FIR-INDEX-001 reproduction and verification criteria

- **Reproduction:** With multiple records per FIR and a non-empty query, enter successive characters. In `searchMatch()`, each FIR candidate filters the entire `records` list to find related records. Source-path reproduction is confirmed; no browser timing reproduction was possible here.
- **Expected:** Related records are reused while typing, with current matching behavior unchanged.
- **Actual:** Related records are rescanned for each candidate FIR on each input event.
- **Regression risks:** Losing a searchable proceeding field or changing linked/legacy grouping could cause false negatives. Test records with multiple court proceedings, UCR, legacy-only records, and duplicate-link suppression.
- **Verification criteria:** Page-specific tests demonstrate search equivalence for all currently supported fields and the repeated related-record scan is removed; compare input-to-render time with a representative 1,000+ FIR fixture.

No confirmed functional, data-integrity, security, or visual bug was established without interactive or live-data verification. This does not prove those areas are defect-free.

## Functional and security test results

### Executed automated tests

Ran `npm test` (the repository's existing Node unit suite): **26 passed, 0 failed, 0 skipped**. Coverage includes shared FIR status derivation, legacy/FIR identity and unique summary behavior, project/station authorization selection, hearing-date ordering, and proceeding-field serialization. These tests do **not** import or exercise the FIR Index page code, DOM events, navigation, CSS, or Firestore queries.

**FIR Index page-specific automated tests executed: 0.** No existing tests were found for page search, year selection, pagination, row navigation, rendering, or error states.

### Requested checks not executed

| Check | Status | Reason |
|---|---|---|
| Exact/partial FIR, year, station, complainant, accused, IO, sections, and status search | Blocked as interactive test; supported fields traced statically | No browser automation package or local browser test server is available. |
| Empty results, invalid query parameters, error UI, page reset, 50-row pagination | Blocked as interactive test; code path reviewed | Requires browser DOM execution. |
| Open FIR and state restoration to FIR Register | Blocked as interactive navigation test; URL contract traced in both modules | Requires browser execution and representative data. |
| Lower Court / Sessions / JJB, UCR, mixed/disposed cases, hearing mapping, missing/malformed records | Blocked | No safe representative fixture dataset or running Emulator. |
| 360, 390, 768, 1366, 1920 pixel rendering and touch/keyboard/accessibility checks | Blocked | No browser automation package/browser session was available for this task. CSS rules were reviewed only. |
| Firestore read/query counts, 0/1/100/1,000+ datasets, search latency, memory/listener lifecycle | Blocked | No Emulator running (`127.0.0.1:8080` unavailable), no representative data, no browser instrumentation. |
| Unauthorized station access, permission denied, deployed security behavior | Blocked | Deployed rules/data are not inspected; no Emulator session was started. Source-configured rules and client scoping were reviewed only. |
| Production build | Not run | Existing `dist/` artifacts were left untouched; this audit required no code changes and no page tests are wired into build. |

## UI, accessibility, and performance findings

- CSS provides a narrow-screen layout at 780px and 520px breakpoints. The table has a 720px minimum width within an overflow-enabled wrapper, so small screens rely on horizontal scrolling by design. Visual behavior at requested viewport sizes was not measured.
- Table rows have `tabIndex=0`, an accessible label, focus styling, and Enter/Space handling. The year picker uses a custom `listbox` with button elements assigned `role=option`; there is no arrow-key/roving-focus implementation. This is an accessibility concern to verify with a browser/screen reader, not a confirmed assistive-technology failure.
- Empty and load-error states are present. The load failure is shown in the table and disables the year selector; it is not a realtime view and will not update until reload.
- Rendering is capped at 50 DOM rows per page, but Firestore loading and summary grouping are whole-dataset. Search's repeated relationship scan is the only confirmed page-specific source hotspot. Actual timings, read counts, memory use, and perceived responsiveness are unavailable.
- Dynamic record fields are inserted with `textContent`/created text nodes rather than interpolated into HTML, reducing the identified XSS surface. User-controlled text was not tested in a live browser.

## Issue priority and recommended order

1. Fix FIR-INDEX-001 with a precomputed relationship map and focused equivalence tests.
2. Validate FIR-INDEX-002 against authorized historical records and retention expectations before changing year-selection behavior.
3. Add page tests for grouping/mapping, search, year filtering, pagination, navigation, empty/error UI, and special FIR/proceeding combinations.
4. Run Emulator tests for station scoping, query behavior, and denied cross-station reads using safe fixtures.
5. Run browser checks at the requested widths and measure search/render responsiveness with a 1,000+ record fixture.

No application implementation is authorized by this report. The canonical `PROJECT-ISSUE-TRACKER.md` and `PROJECT-STATUS.md` were not changed: their workflow requires an explicit issue-registration request, and this task requested task-specific report/tracker artifacts only. Existing staged and unstaged work was preserved.
