# Phase 3C — Local Browser UI Verification

**Date:** 15 November 2026  
**Purpose:** Verification only; no application changes  
**Browser:** Google Chrome 157.0.8103.51 with existing Playwright 1.64.1

## 1. Summary

The public Landing route rendered in the real local application. Dashboard, Register Diary, FIR Index, Admin Panel, and Report redirected to Login when unauthenticated. All Cases HTML remained visible, but its data loader reported that sign-in is required. No login was attempted and no auth state was created.

Source-based component fixtures used the real page markup, CSS, and shared-shell markup, with application scripts removed. Synthetic data was added only in the isolated browser DOM. Responsive layout, contrast, and visible dialog/table component checks passed in those fixtures. Dynamic chart data, authenticated navigation, real Register Diary records, table actions, and authenticated dialog behavior remain unverified.

No issue was closed or status changed. All screenshots and test artifacts remain outside the repository.

## 2. Environment baseline and safe local setup

| Item | Observed |
|---|---|
| Branch / commit | `codex/increment-1b-b1-token-infrastructure` / `17213a6b0c53cccbd9233a73517e254ed2b0622b` |
| Working tree before testing | Existing changes preserved; porcelain counts ` M=23, MM=6, M =10, A =319, AM=3, ??=24` |
| Node / npm | Node `v24.22.0`; npm `11.19.1` |
| Browser / Playwright | Chrome `157.0.8103.51`; Playwright `1.64.1` from existing `e2e/node_modules` |
| Server | Vite `role-admin-local` mode bound to `127.0.0.1:5189`; stopped after testing |

The default Vite mode contains a production Functions proxy and aliases Firebase to the production config. I used `role-admin-local`, whose config selects the demo project and directs Firebase clients to loopback Auth/Firestore/Functions ports; this mode does not configure the production proxy. Playwright allowed requests only to the Vite origin and aborted all other requests. Six Firestore emulator requests to `127.0.0.1:8080` were blocked before connection. Firebase Emulators were not started. External CDN and Google connectivity requests were also blocked before connection. No production Firebase request was made.

For component checks, fixtures were built from local source HTML and CSS with application scripts removed. The shared sidebar and topbar markup was taken from `shared-layout.js` so the desktop layout retained its actual shell geometry. The Admin component was rendered only as a source-based static fixture; the live Admin route stayed authentication blocked. Synthetic rows and hearing content existed only in the temporary browser context.

## 3. Actual route matrix

| Route | Observed result | Classification |
|---|---|---|
| `/CaseTrack/` Landing | HTTP 200; hero, preview, and CTAs rendered | **ACTUAL ROUTE VERIFIED** for visible layout only |
| `/CaseTrack/pages/dashboard.html` | Redirected to `/CaseTrack/pages/login.html` | **AUTHENTICATION BLOCKED** |
| `/CaseTrack/pages/register-diary.html` | Redirected to `/CaseTrack/pages/login.html` | **AUTHENTICATION BLOCKED** |
| `/CaseTrack/pages/cases.html` | HTML stayed at route; case loader reported “Sign in is required” | **AUTHENTICATION BLOCKED** for case data and actions |
| `/CaseTrack/pages/fir-index.html` | Redirected to `/CaseTrack/pages/login.html` | **AUTHENTICATION BLOCKED** |
| `/CaseTrack/pages/admin-panel.html` | Redirected to `/CaseTrack/pages/login.html` | **AUTHENTICATION BLOCKED** |
| `/CaseTrack/pages/report.html` | Redirected to `/CaseTrack/pages/login.html` | **AUTHENTICATION BLOCKED** |

No route guard was removed, no credentials were supplied, and no auth flow was bypassed.

## 4. Issue-by-issue results

| Issue | Result | Evidence and remaining gap |
|---|---|---|
| **UX-012 — Landing hero** | **ACTUAL ROUTE VERIFIED**, visual scope only | At all seven widths, the actual Landing route had no page-wide horizontal overflow; hero text and preview remained visible. Supporting text computed to 17px and preview heading to 15px. The page uses a fixed dark palette and does not support a light theme. Screenshots: actual route at 320px and 1366px. CTA destinations were not followed. |
| **UX-013 — Dashboard Trends header** | **COMPONENT VERIFIED** | Actual Dashboard markup/CSS fixture showed the title and period selector visible without overlap at 320, 375, 430, 768, 1024, 1366, and 1920px in both theme classes. The selector has an accessible label. Dashboard route remains authentication blocked; period filtering was not executed. |
| **UX-014 — Dashboard charts** | **PARTIALLY VERIFIED** | The static New/Closed/Pending chart key wrapped without collision at the seven widths in both theme classes. The chart region is labelled and focusable, and the horizontal hint appears at narrow widths. The data-driven SVG series and donut legend were not populated; no live chart data or chart calculations were tested. ArrowRight did not change the chart region’s horizontal `scrollLeft` in the fixture. |
| **UX-015 — Register Diary row** | **COMPONENT VERIFIED** | A synthetic long Judge/Court row using the existing session-register classes and CSS had no overlap or page overflow at seven widths in both themes. FIR text remained visible. Status controls measured 44×44px at 320, 375, and 430px. Actual rows, status handlers, persistence, and case navigation remain authentication blocked. |
| **UX-016 — Admin Manage dialog** | **PARTIALLY VERIFIED** | The source-based dialog fixture had an opaque surface and readable foreground in both themes at all seven widths. At 320px it measured 286px wide and fit in the viewport; the desktop fixture used 560px. The native backdrop computed to `rgba(0, 0, 0, 0.65)`. Initial focus entered the dialog and Escape closed it. A Shift+Tab check did not remain within the dialog at the immediate check; the subsequent Tab returned focus inside. The authenticated Admin dialog and its application event handling remain untested. |
| **UX-017 — Admin table contrast** | **COMPONENT VERIFIED** | Computed/composited ratios across seven widths in both themes: light UID **15.29:1**, Police Station heading **11.52:1**; dark UID **8.03:1**, heading **10.75:1**. All measured ratios exceed 4.5:1. Synthetic row content only. Ancestor alpha backgrounds were composited; CSS background gradients were represented using computed `background-color`. |
| **UX-009 — Mobile tables** | **PARTIALLY VERIFIED** | All Cases, FIR Index, and Admin Users source-based fixtures had no page-wide overflow, visible horizontal scroll hints, and focusable labelled `role=region` wrappers at seven widths and both themes. Synthetic rows confirmed inner horizontal overflow remained in the scroll regions. ArrowRight did not change `scrollLeft` for these wrappers in Chrome. Nested FIR detail tables, real data, touch scrolling, sorting, filtering, pagination, row navigation, and actions remain untested. |
| **UX-005 — KPI presentation** | **PARTIALLY VERIFIED** | Static Dashboard markup contains the five count bindings and no KPI delta `<em>` elements. Live count updates, loading/error/empty states, and card navigation remain untested. |
| **UX-006 — Tasks copy** | **PARTIALLY VERIFIED** | Dashboard markup says “Saved in this browser. No automatic alerts.” No task actions or local persistence were exercised. |
| **UX-008 — Dashboard navigation** | **PARTIALLY VERIFIED** | The shared source markup includes one explicit Dashboard link to `dashboard.html`. Active state, mobile drawer, keyboard behavior, and role visibility require the live authenticated page and remain untested. |
| **Other registered issues** | **NOT TESTED or AUTHENTICATION BLOCKED** | UX-001/011 require their backend-backed states; UX-002/003/004/007/010 and other authenticated behaviors were not re-exercised here. Existing statuses remain unchanged. |

## 5. Responsive matrix

All applicable component fixtures were measured at 320, 375, 430, 768, 1024, 1366, and 1920px in light and dark theme classes. No page-wide overflow or overlap was measured in the passing layout fixtures. The Landing page is dark-only. Chart data, table business interactions, and authenticated route behavior are outside the measured presentation results.

| Component | Method | Responsive result |
|---|---|---|
| Landing | Actual route | 7/7 widths, no page overflow; fixed dark palette |
| Dashboard header and static chart key | Actual markup/CSS fixture | 14/14 width/theme pairs pass layout checks |
| Register Diary row | Synthetic row in actual component/CSS fixture | 14/14 layout pairs pass; mobile status controls 44×44px |
| Admin Manage dialog | Static source component fixture | 14/14 pairs opaque and within viewport |
| All Cases, FIR Index, Admin Users | Synthetic table rows in actual markup/CSS fixtures | 42/42 pairs pass page-width/wrapper checks; keyboard horizontal movement not observed |
| Admin UID and Police Station heading | Synthetic data, computed CSS | 14/14 pairs at or above 4.5:1 |

## 6. Accessibility results

- Dashboard period selector: accessible name present in markup.
- Chart scroll region: labelled and `tabindex=0`; narrow-screen scroll hint visible. ArrowRight did not move its horizontal offset.
- Table regions: labelled, focusable, with scroll hints. ArrowRight did not move their horizontal offsets in this Chrome fixture.
- Admin dialog: native `<dialog>` has an accessible name; `showModal()` placed initial focus inside and Escape closed it. Shift+Tab containment was not demonstrated in the static fixture; do not treat this as full application focus verification.
- Admin text contrast: all measured UID and Police Station heading ratios exceeded 4.5:1 in both theme classes.
- Register Diary controls: synthetic row controls retained labels and met the 44×44px mobile size check. Keyboard handlers were not loaded.
- No authenticated accessibility workflow was tested.

## 7. Screenshot evidence

Eleven PNG screenshots were captured and verified as nonempty. They remain in:

`%TEMP%\casetrack-phase3c-194bfbdae0614b579db9dd0f9dac1c8c\`

| Evidence | State |
|---|---|
| `actual-landing-320-dark.png`, `actual-landing-1366-dark.png` | **ACTUAL ROUTE / UNAUTHENTICATED** |
| `dashboard-header-320-light.png`, `dashboard-header-320-dark.png` | **SYNTHETIC / COMPONENT-LEVEL** |
| `diary-session-320-light.png`, `diary-session-1366-dark.png` | **SYNTHETIC / COMPONENT-LEVEL** |
| `admin-dialog-320-light.png`, `admin-dialog-1366-dark.png` | **SYNTHETIC / COMPONENT-LEVEL** |
| `cases-table-320-light.png`, `fir-index-table-320-dark.png` | **SYNTHETIC / COMPONENT-LEVEL** |
| `admin-contrast-1366-light.png` | **SYNTHETIC / COMPONENT-LEVEL** |

The screenshot index was not changed because no evidence was copied into the repository.

## 8. Build, tests, failures, and limitations

| Check | Result |
|---|---|
| `npm test` | **PASS — 60 passed, 0 failed, 0 skipped** |
| JavaScript syntax | **PASS — 7 files:** dashboard, Register Diary, Admin Panel, Cases, FIR Index, shared layout, PWA |
| `npm run build -- --emptyOutDir` | **PASS — 107 modules, all 17 HTML entries**. Existing non-fatal chunk-size warning for `pdfmake` and `exceljs` (>500 kB). |
| `git diff --check` | **PASS — exit 0**. Git emitted existing LF-to-CRLF working-copy warnings. |
| Playwright browser cleanup | **PASS**. The isolated Chrome context closed; the Vite server was stopped; port 5189 has no listener. |
| Firebase / ADC | **UNTOUCHED**. No emulator started; no ADC read or modified. |

The local Vite development run showed a manifest path discrepancy: a browser request resolved to `/CaseTrack/CaseTrack/manifest.webmanifest` and received the HTML fallback, which produced a browser manifest parse error. The production build output contains a single-prefixed `/CaseTrack/manifest.webmanifest` link and `dist/manifest.webmanifest`, so this run does **not** establish a production manifest defect. No source change was made.

Requests to external CDNs, Google’s clear-dot URL, and the stopped local Firestore emulator were intercepted and aborted before connection. Corresponding browser console/Firebase offline messages are expected from the guarded unauthenticated check and are not evidence of a production service failure. No production Firebase host was requested.

No new production UI defect was confirmed. The table/chart ArrowRight and dialog Shift+Tab results are verification gaps recorded above; authenticated interaction is required before classifying application behavior conclusively.

## 9. Files and status

Only this report was added to the repository. No application source, Firebase configuration, screenshot, canonical issue register, or checklist was modified. No issue status changed. Existing staged, unstaged, and untracked workspace changes were preserved.

**Recommended next step:** After separate owner approval, run authenticated browser verification using an explicitly authorized isolated synthetic environment. Include focused keyboard tests for horizontal table/chart scrolling and dialog Tab/Shift+Tab boundaries. Emulator startup, authentication setup, and any credential cleanup require separate approval.
