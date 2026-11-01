# FIR StatusMap Implementation

**Status:** Implemented locally; not deployed or merged  
**Status colors:** Refined premium palette approved by the owner on 1 November 2026  
**Scope:** FIR Register StatusMap navigation, dedicated page, authorized station/year data loading, sequential FIR grid, details popup, tests, and this document

## Architecture

- The FIR Register adds a StatusMap link beside its existing FIR Index link. It carries the selected year and any station ID already present in the route. The StatusMap's station/year selections are kept in its URL; its Back to FIR Register link carries those selections back. Browser history remains standard anchor navigation.
- `pages/fir-statusmap.html` is a separate Vite multi-page entry. It loads the CaseTrack shared shell, FIR Register styles for the matching hero/year picker, and the StatusMap page module/style.
- `assets/js/fir-statusmap.js` initializes the authorized station context, controls the FIR Register-style year picker, loading and error states, renders the summary/grid, opens the details dialog, and updates navigation URLs. It does not use realtime listeners or persist case data in browser storage.
- `assets/js/fir-statusmap-data.js` reuses `getCaseAccessContext()` and `normalizeCaseRecord()`. It rejects station IDs outside the context returned by the existing authorization path. It queries FIR Masters and legacy cases for the selected `policeStationId` and `firYear` only, then gets linked proceedings in Firestore `in` batches of up to 30 master IDs per request. Legacy cases are retained only when linked by master/FIR ID or matching FIR number/year/station identity; linked legacy counterparts are suppressed. It does not issue one linked-case query per FIR.
- `assets/js/fir-statusmap-model.mjs` filters by station/year, deduplicates numeric FIR slots, generates the sequence and gaps, calculates summary counts, resolves next hearing, and calls the existing `deriveFirStatus()` logic. It contains the approved status-color mapping and neutral fallback.

## Data mapping and identity

- FIR Master is the canonical source for FIR number, year, station identity/name, FIR date, and sections. The query binds the selected station and year before rendering.
- Linked proceedings are associated by `firMasterId` (with `firId` compatibility in the model) and the same station. Legacy proceedings linked by ID or matching FIR identity are also included, with duplicate legacy counterparts suppressed. Status is derived from the FIR Master and all fetched linked/legacy proceedings with the shared canonical engine; no separate status calculation was added.
- Numbered identity is FIR number + selected year + station. Numeric values such as `01` and `1` map to one number slot. The displayed value preserves the stored FIR number's leading zeroes. Duplicate Master numbers produce one neutral outlined slot, are counted separately, and are not silently assigned a status color.
- The sequence spans 1 through the highest valid positive integer FIR number. A missing slot has a dashed neutral appearance and opens a “No FIR registered” dialog. Registered masters with malformed or absent FIR numbers appear in a separate unnumbered-record list, count as registered, and are not confused with gaps.
- Total Registered FIRs counts unique numbered slots plus unnumbered Master records. Missing FIR Numbers counts unregistered slots within the generated sequence. UI/UCR/UT/Disposed and Other counts use the same filtered, deduplicated dataset. Duplicate records are surfaced in the status note/counter rather than creating duplicate cells.
- The data query expects canonical `firYear` stored as a four-digit string and `policeStationId` on FIR Masters and linked cases. Records that do not meet those canonical query fields will not be returned by this page. This requirement should be checked against an Emulator fixture before deployment.

## Current refined status palette

| Derived FIR status | Display | Color | HEX |
|---|---|---|---|
| Under Investigation (`UI`) | Under Investigation | Sapphire blue | `#5B8DEF` |
| UCR: Untraced or Cancellation | UCR / Cancellation | Muted gold | `#E6B84A` |
| Under Trial (`UT`) | Under Trial | Soft rose red | `#E66A73` |
| Disposed | Disposed | Jade green | `#42B883` |
| FIR number not registered | FIR Not Registered | Empty / neutral, dashed border | No status color |
| Registered but unmapped/duplicate | Unknown or Duplicate FIR number | Neutral outlined cell with `?` / `!` indicator | No status color |

These colors are used consistently in the seal motif, grid cells, legend swatches, summary counters, unnumbered records, and the FIR details popup. Cancellation aliases normalize to `Cancelled` through `normalizeFirStatus()` and use the UCR gold. Under Trial uses rose red. Disposed uses jade green only when `deriveFirStatus()` returns Disposed, which requires every applicable court proceeding to meet the existing terminal disposal rules. Active/mixed proceedings, committed predecessors, and UCR plus court proceedings retain canonical status behavior.

## Interactions and responsive behavior

- Authorized stations come from `getCaseAccessContext()`. The station selector and hero station label are removed; a valid authorized station in the URL is retained, otherwise the first authorized station is selected. Firestore authorization remains the server-side boundary.
- Year choices use the FIR Register-style hero picker, cover the current year plus or minus five years, and retain a valid requested year outside that list. Only the selected year is queried.
- Cells are keyboard-focusable buttons with accessible labels. Registered cells open a native details dialog with FIR number/date/sections/status/station/next hearing and a View FIR link. Missing numbers open a no-record message and have no View action.
- Next hearing uses future/current `kind: "next"` hearing-history entries when available, otherwise the proceeding's `nextDate` snapshot, and selects the earliest date across linked proceedings.
- A DocumentFragment replaces the grid once per load. A 1,000-number sequence is covered in unit tests. No per-cell network requests or realtime subscriptions are used. Responsive CSS adapts grid sizing and summary layout; actual browser viewport QA was not available during this run.
- Load, empty, access-denied, and network-error states are shown. A Refresh action re-queries the selected scope.

## Files created or modified

- Added: `pages/fir-statusmap.html`
- Added: `assets/css/fir-statusmap.css`
- Added: `assets/js/fir-statusmap.js`
- Added: `assets/js/fir-statusmap-data.js`
- Added: `assets/js/fir-statusmap-model.mjs`
- Modified: `pages/fir-register.html`
- Modified: `assets/js/fir-register.js`
- Modified: `assets/css/fir-register.css`
- Modified: `vite.config.js`
- Modified: `package.json` to include statusmap tests in `npm test`
- Added: `test/fir-statusmap.test.mjs`

No FIR status logic, collection schema, Firebase data, security rules, or deployment configuration was changed.

## Test results

- `npm test`: **42 passed, 0 failed, 0 skipped**. This includes 16 focused statusmap tests and the existing FIR status, identity, hearing-date, proceeding-field, and Firebase project-policy tests.
- `npm run build`: **passed** with Vite 8.3.0; the statusmap HTML, CSS, and JS assets were emitted successfully.
- Focused statusmap unit coverage includes the four exact colors and shared CSS tokens across cells/legend/counters/popup; UCR/cancellation aliases; UI without proceedings; mixed and multiple linked cases; legacy association and duplicate suppression; disposed criteria; year/station filtering; authorization selection guard; missing sequence numbers; leading-zero display; duplicate handling; unnumbered masters; FIR detail URL; next-hearing selection; and a 1,000-number dataset.
- The first focused test run found an incorrect expected URL in the new test. The assertion was corrected to match the existing `master:<document-id>` FIR Register key; the final full suite passes.

## Known limitations and follow-up

- No browser or Firebase Emulator session was available, so Firestore query/index behavior, deployed auth/rules, real station fixtures, permission-denied handling, navigation in a browser, and visual behavior at 360/390/768/1366/1920px were not exercised. Do not treat the production build as browser verification.
- The selected-year queries require canonical string `firYear`, valid station IDs, and linked `firMasterId` fields for linked proceedings. Confirm query indexes and these assumptions with safe Emulator fixtures before release.
- The map intentionally uses FIR Master records for its numbered grid; legacy-only records without a Master are not included. A separate compatibility requirement would need a scoped legacy query and an approved duplicate policy.
- The current design renders every number from 1 through the maximum FIR number. The 1,000-cell model is tested; extremely large or malformed sequence maxima have not been browser-profiled.
- Build output under ignored `dist/` was regenerated for the requested build check. No deployment or merge occurred.
