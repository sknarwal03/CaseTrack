# CaseTrack Performance Audit

**Audit date:** 1 November 2026  
**Scope:** Repository source, current Vite configuration, existing production build artifacts, and documented tests  
**Mode:** Read-only application audit; this report is the only new artifact  
**Implementation status:** No application code, Firebase data, or rules changed. Phase 4 is not started and requires owner approval.

## Executive summary

The strongest source-confirmed loading concerns are repeated full-case loads and an oversized shared application dependency graph. The shared shell imports the full Add/Edit Case module on every app page, starts a case-record load for hearing notifications, and several page modules separately load the same case collections. In the station-scoped production path, the shared case loader also issues one linked-case query for each FIR Master. These patterns grow in cost with the dataset and are likely contributors to slow initial readiness and navigation.

The repository does not contain a repeatable browser performance trace or Firestore read-count baseline. FCP, LCP, INP, TBT, dashboard-ready time, route navigation time, and real read counts therefore remain **Not measured**. The build artifacts already present in `dist/` are from 30 October 2026; they provide a static bundle-size snapshot, not a current before measurement. No build was run because it would rewrite existing build artifacts.

## Architecture and startup flow

- Multi-page Vite application. `vite.config.js` declares 14 HTML inputs; pages have separate module entry points and share `assets/js/shared-layout.js`.
- Firebase is initialized once per page by `firebase/firebase-config.js`. Auth and Firestore use the Firebase modular SDK. Production project ID is `casetrack-97a4e`.
- App pages load the shared shell. It injects navigation/profile UI, initializes notifications/search, and waits for Firebase Auth state. In the production station-scoped mode it also reads the current user's `userRoles/{uid}` document and verifies access before populating the shell.
- `shared-layout.js` statically imports `components/add-case/add-case.js` and `notification-date-dialog.js`. This means Add/Edit Case code and modal markup are part of the shared page graph even on routes that do not offer case creation.
- Most case-list/report/register modules call `loadCaseRecords(db)` at page startup. This helper concurrently reads whole `firMasters`, `linkedCases`, and legacy `cases` collections for the non-station-scoped path. The production station-scoped path reads station master and legacy records, then queries `linkedCases` per master.
- `caseAdded` events trigger new loads on several modules. Each page navigation creates a fresh page context; there is no cross-route in-memory case cache.
- The shared shell also performs a separate case load for hearing notifications at boot. Global search has its own lazy in-page cache after the first query, but does not share it with notifications or page modules.

## Static build snapshot

Existing `dist/` outputs are timestamped 30 October 2026 and were not regenerated during this audit.

| Artifact measurement | Snapshot |
|---|---:|
| Emitted JS files / raw bytes | 18 / 856,627 bytes |
| Emitted CSS files / raw bytes | 13 / 211,335 bytes |
| Largest JS chunk | `firebase-functions-*.js`, 448,298 bytes |
| Shared layout JS chunk | 168,698 bytes |
| Firebase SDK shared chunk | `index.esm-*.js`, 106,550 bytes |
| Shared layout CSS | 60,648 bytes |
| Add/Edit Case CSS | 34,692 bytes |

The existing dashboard HTML preloads the Firebase functions, Firebase SDK, shared layout, and PWA chunks. Those four identified chunks total at least 730 KB raw before counting the dashboard entry and PWA chunk. This is a static artifact-size observation, not compressed transfer size or browser timing. The full 448 KB Firebase functions chunk is unexpectedly large for a shared entry and should be inspected during implementation planning to determine why it is included on common routes.

Vite exposes `npm run build`; test scripts are Node's built-in test runner. The repository has unit tests for FIR status, hearing dates, proceeding fields, and Firebase project policy, plus separate emulator and E2E suites. Tests were inspected, not run.

## Findings

Severity describes expected user/performance impact based on source evidence, not measured user timings.

| Issue ID | Module | Root cause | Evidence | Severity | Proposed fix |
|---|---|---|---|---|---|
| PERF-01 | Shared shell, Dashboard, All Cases, FIR Register/Index, PO, Disposed, Diary, Reports | Redundant full dataset reads during first view. Notifications load all case records at shell boot; page modules independently load all records. | `shared-layout.js` calls `loadCaseRecords` in notification refresh; dashboard, cases, FIR register/index, PO, disposed, register diary, and report each call it on initialization. | Critical | First measure read counts and startup timings. Share safe in-memory results within a page/request lifecycle and avoid duplicate notification/page fetches while preserving access checks and freshness. Longer term, use purpose-built query endpoints/pagination where semantics allow. |
| PERF-02 | FIR Master and Linked Cases; all station-scoped consumers | N+1 linked-case queries: one query per FIR Master in `loadStationScopedCaseRecords`. | `fir-case-model.js` maps every master to a `getDocs(query(linkedCases, policeStationId, firMasterId))` call. Reads and request fan-out grow with master count. | Critical | Replace with a bounded/batched retrieval design that preserves station authorization and master/proceeding relationships. Validate index requirements and read-count correctness in Emulator before rollout. |
| PERF-03 | App Shell / all application routes | Shared layout statically imports Add/Edit Case, causing modal code and markup to be evaluated/included for unrelated routes. It also eagerly fetches `crimeHeads` at module load. | `shared-layout.js` imports `add-case.js`; `add-case.js` injects modal HTML and immediately runs `loadMasterList`/`getDocs`. Shared CSS includes 34,692-byte add-case CSS. | High | Load Add/Edit Case code and modal styles only on routes that expose the feature or on first user intent; preserve current form state and event semantics. |
| PERF-04 | Build / Authentication and App Shell | Large common JS dependency graph. Existing build has 448,298-byte Firebase functions chunk, 168,698-byte shared-layout chunk, and 106,550-byte Firebase SDK chunk. Dashboard preloads at least the first three plus PWA. | Existing `dist/assets` sizes and dashboard HTML `modulepreload` links, timestamped 30 October. | High | Inspect chunk composition and import graph; split route-only code and functions/admin dependencies. Rebuild and record compressed per-route transfer sizes after approval. |
| PERF-05 | FIR Register, FIR Index, All Cases, PO, Disposed, Register Diary, Reports, Dashboard | Client-side full collection loading and in-memory filtering/aggregation; All Cases materializes rows for every loaded record. FIR Index pagination limits visible rows only after all records were fetched and summarized. | Module startup loaders call `loadCaseRecords`; table rendering iterates the complete cached list; FIR Index applies `pageSize` only in `renderRows` after client load. | High | Use server-side filtering/pagination or incremental rendering after defining sorting, counts, search, and legacy compatibility behavior. Avoid changing completeness or status derivation. |
| PERF-06 | Authentication / case data access | Repeated access-context resolution can repeat role/station reads for independent loader calls. Session restoration and role verification are separate async operations; no measured auth-ready timing exists. | `getCaseAccessContext` waits for Auth, reads `userRoles/{uid}`, then for operators reads their station; `shared-layout` independently verifies role on every page. | Medium | Measure auth and role-check phases; share a request-scoped access context where safe and retain server-authoritative checks. |
| PERF-07 | Add/Edit Case | Judge list is read in full each time the form loads judges; IO list uses a real-time listener while the form is active. The listener is explicitly stopped before a new subscription, but no module/page-level cleanup is visible. | `loadCaseJudges` uses whole-collection `getDocs`; `subscribeCaseIOs` calls prior unsubscribe then `onSnapshot`. | Medium | Measure open-form latency and listener lifecycle; cache reference data with clear invalidation or use one-shot reads if live updates are not needed, preserving selection freshness. |
| PERF-08 | All Judges | Entire judges collection is held in a live snapshot and sorted/re-rendered on each update. Listener has no explicit unsubscribe, though page navigation normally destroys the document context. | `all-judges.js` subscribes with `onSnapshot(judgesCollection, ...)` and rebuilds the complete list. | Low | Keep realtime if it is a product requirement; otherwise assess one-shot load and explicit cleanup. Measure list size and update frequency first. |
| PERF-09 | FIR Register / All Cases / Register Diary | Flatpickr is loaded from jsDelivr; some pages also reference an external stylesheet. Network, cache, and blocking impact are unmeasured. | HTML includes CDN script/style references; FIR Register's classic Flatpickr script is not deferred. | Medium | Capture a production network trace; consider self-hosting or deferring the dependency if trace confirms it delays readiness. |

## Module-by-module review

| Module | Startup/data and rendering pattern | Audit assessment |
|---|---|---|
| Dashboard | Full case loader plus shared-shell notification loader; computes summaries and charts from all records. | Highest duplicate startup work; dashboard-ready time is Not measured. |
| All Cases | Full loader; renders all records into table rows, then filters/sorts rendered records in the browser. | Large datasets increase Firestore reads, JS work, DOM size, and filtering cost. |
| Add/Edit Case | Shared module is loaded on every app page; `crimeHeads` full read at import; judge full read when form loads; IO listener while form is active; case/FIR lookups also use shared loaders. | Significant shared startup cost and potential modal-open delay. Existing IO listener is replaced before another starts. |
| FIR Master / Linked Cases | Global loader reads three collections. Station-scoped loader queries each FIR master, then linked proceedings individually. FIR detail loader has several parallel lookups and station-scoped path can scan station legacy records. | Confirmed high read/query fan-out; linked case/hearing payload sizes and index health are unknown. No composite index manifest was found in the root Firebase configuration. |
| PO Cases | Loads full case records, then filters proceedings and accused with `poStatus`. | Full collection cost for a specialized view. |
| Disposed Cases | Loads full case records, derives disposed records, then renders them. | Full collection cost for a specialized view. |
| Chinhit Cases | No standalone Chinhit page or entry module found. Highlighted/star filtering is part of All Cases. | Include its filtering/render cost under All Cases; a distinct route-level metric is not applicable in the inspected repository. |
| Register Diary | Loads full cases and separately loads all judges; filters to court proceedings; renders calendar notes and case data. | Two startup reads plus full record materialization; calendar/notes render cost unmeasured. |
| Reports | Loads full case records for client-side charts, lists, and counts. | Full dataset read even when only aggregate outputs are needed. |
| All Judges | Full live collection snapshot, client sort, full list render. | Subscription remains active for page lifetime; no explicit unsubscribe, but page navigation tears down the page context. |
| Settings | Auth state listener, one settings preference document read, profile UI. | Small data footprint from inspected code; no verified bottleneck. |
| Authentication and App Shell | Auth state restored on app routes; production role verification; notifications independently load records; Add/Edit Case and its CSS are shared. | Confirmed shared work contributes to every route; actual auth/readiness delay is Not measured. |

## Root-cause ranking

| Rank | Opportunity | Expected benefit | Risk | Effort |
|---:|---|---|---|---|
| 1 | Remove duplicate full-case reads between shell notifications and page data; share safely within a page lifecycle | High on Dashboard and all case-heavy routes; reduces reads and competing startup work | Medium (freshness and auth-scope correctness) | Medium |
| 2 | Eliminate per-master linked-case query fan-out in station-scoped loading | High on production data with many FIRs; reduces query count and latency | High (authorization, indexes, relationship coverage) | High |
| 3 | Split Add/Edit Case out of shared entry and defer its reference-data reads/styles | High first-render and transfer improvement on routes not creating cases | Low/Medium (event wiring and first-open behavior) | Medium |
| 4 | Add server-side pagination/filtering or incremental rendering to large tables/registers | High for large datasets and DOM responsiveness | High (search/sort/count/legacy semantics) | High |
| 5 | Explain and split large common JS chunks; reduce functions/Firebase code in route graphs | High first-load transfer and parse potential | Medium | Medium |

## Measurements and limitations

| Metric | Baseline |
|---|---|
| FCP / LCP / INP / TBT | Not measured — no controlled browser performance trace was collected. |
| Initial load time / dashboard-ready time | Not measured — no production-equivalent browser/network run. |
| All Cases load time / navigation delay | Not measured. |
| Firestore reads by route | Not measured — no Emulator/browser instrumentation or safe test dataset run. Source code confirms repeated reads and query fan-out only. |
| Existing emitted JS / CSS | 856,627 / 211,335 raw bytes in `dist/`, built timestamp 30 October 2026. |
| Current source production build size | Not measured — build was not rerun to avoid replacing existing `dist/` artifacts. |
| Compressed route transfer size | Not measured. |
| Authentication restore timing | Not measured. |

No browser, Firebase Emulator, or production Firestore workload was exercised. Existing unit, emulator, and browser tests were inspected but not executed. The app's production rules/data were not inspected or changed. The audit identifies code-level patterns; it does not claim measured user impact or production index failures. No root Firestore composite index manifest was found in the inspected root configuration; whether any current query requires a composite index should be verified against Firebase configuration/Emulator before query changes.

## Recommended next step

Review this audit and authorize Phase 4 separately. Before implementing an optimization, capture a repeatable production-build browser baseline and a safe Emulator read-count baseline for Dashboard, All Cases, FIR Register, and Register Diary. Then address redundant page/shell loads and shared Add/Edit Case payload as reversible first changes. Treat the station-scoped N+1 query redesign and server-side pagination as higher-risk work requiring explicit query/index and relationship-integrity validation.
