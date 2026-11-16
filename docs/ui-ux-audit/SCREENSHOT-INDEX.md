# CaseTrack — Phase 2B Screenshot Index

All captures are actual Chrome/Playwright screenshots from the local `role-admin-local` Vite server. Authenticated captures used the visible login form and synthetic Emulator accounts. No production Firebase request or real case record was used. Images are full-page captures except the four final `admin-panel-dialog-viewport-*` images, which capture the visible viewport. Width suffixes map to the viewport dimensions below.

## Matrix

The seven viewport suffixes are `320`, `375`, `430`, `768`, `1024`, `1366`, and `1920`, corresponding to 320×700, 375×812, 430×932, 768×1024, 1024×768, 1366×768, and 1920×1080. Theme suffixes are `light` and `dark`.

For each listed route, the filenames are `<route>-<viewport>-<theme>.png` for all seven viewports and both themes.

| Route/state | File prefix | Coverage / note |
|---|---|---|
| Dashboard | `dashboard` | Operator; 14 viewport/theme captures. Case Trends collision and analytics crowding at 320 are visible in [light](screenshots/dashboard-320-light.png) and [dark](screenshots/dashboard-320-dark.png). |
| All Cases | `cases` | Operator; 14 hydrated captures; 320 px captures were refreshed after data hydration. [320 light](screenshots/cases-320-light.png) confirms UX-009. |
| FIR Register | `fir-register` | Operator; 14 captures; FIR detail and nested accused table. |
| FIR Index | `fir-index` | Operator; 14 captures; [320 light](screenshots/fir-index-320-light.png) confirms UX-009. |
| FIR Status Map | `fir-statusmap` | Operator; 14 captures. |
| PO Cases | `po-cases` | Operator; 14 captures. |
| Disposed Cases | `disposed-cases` | Operator; 14 captures. |
| Report | `report` | Operator; 14 captures. |
| Register Diary | `register-diary` | Operator; 14 captures at current date. |
| All Judges | `all-judges` | Operator; 14 captures. |
| Manage IO | `manage-io` | Operator; 14 captures. |
| Settings | `settings` | Operator; 14 captures. |
| Initial Admin Panel shell | `admin-panel` | 14 historical blocked shell captures, retained. The final data-view matrix below supersedes this coverage limitation. |
| Password Change | `password-change` | Must-change-password account via actual Login; 14 captures; not submitted. |
| Password Setup | `password-setup` | 14 captures with synthetic link; validator did not expose valid form, so these show invalid/unavailable state. |

## Additional interaction captures

- [Add Case dialog](screenshots/dashboard-add-case-1366-light.png) — opened from Dashboard; no form submitted.
- [Tasks & Reminders, light](screenshots/dashboard-task-dialog-1366-light.png) and [dark](screenshots/dashboard-task-dialog-1366-dark.png) — opened; no task submitted.
- [Synthetic case details](screenshots/case-details-1366-light.png) — FIR 703/26 detail dialog.
- [Register Diary, populated 14 Dec, desktop](screenshots/register-diary-2026-12-14-1366-light.png) and [mobile](screenshots/register-diary-2026-12-14-320-light.png) — synthetic hearing visible; no record changed. Mobile collision supports UX-015.

## Earlier Phase 2 captures retained

- Landing: [`landing-320-default.png`](screenshots/landing-320-default.png), [`landing-375-default.png`](screenshots/landing-375-default.png), plus the 430/768/1024/1366/1920 variants.
- Login: `login-<viewport>-default.png` for all seven viewports.
- Original no-token Password Setup: [`password-setup-1366-default.png`](screenshots/password-setup-1366-default.png).

## Initial inventory (retained)

[phase2b-browser-evidence.json](screenshots/phase2b-browser-evidence.json) lists every screenshot filename and the exact route, viewport/theme matrix, synthetic data summary, route smoke results, and emulator limitations. It includes 216 Phase 2B captures and the 15 retained baseline captures, 231 PNGs total.

## Final verification additions — 35 PNGs

| State | Prefix / files | Result |
|---|---|---|
| Admin populated data | `admin-panel-data-<width>-<theme>.png` | 14 verified captures, all seven sizes × light/dark. [320 light](screenshots/admin-panel-data-320-light.png), [1366 dark](screenshots/admin-panel-data-1366-dark.png). |
| UX-009 responsive table update | No after screenshots captured | Baseline captures remain linked in the All Cases, FIR Index, and Admin rows above. The post-change seven-width × two-theme matrix was not captured because the browser access host was unavailable; do not treat baseline images as after evidence. Nested accused-table after evidence is also pending. |
| Setup attempt under Node 22 | `password-setup-node22-<width>-<theme>.png` | 14 blocked-state captures. Active registry token, missing HTTP validator. No valid form; theme pairs byte-identical. [1366](screenshots/password-setup-node22-1366-light.png). |
| Manage dialog, full page | `admin-panel-manage-dialog-1366-light.png`, `admin-panel-manage-dialog-320-light.png` | 2 captures; native backdrop covers the viewport portion of these full-page images. |
| Manage dialog, viewport only | `admin-panel-dialog-viewport-<width>-<theme>.png`, widths 320 and 1366 | 4 captures; UX-016. [1366 light](screenshots/admin-panel-dialog-viewport-1366-light.png), [320 dark](screenshots/admin-panel-dialog-viewport-320-dark.png). |
| Empty Operator validation | `admin-panel-empty-operator-validation-1366-light.png` | 1 capture; invalid empty submission displayed guidance, no account created. |

All 231 earlier PNGs are retained; **266 PNGs total**. The final filenames, viewport measurements, and interaction results are listed in [phase2b-final-verification.json](screenshots/phase2b-final-verification.json) and [phase2b-final-supplement.json](screenshots/phase2b-final-supplement.json). Endpoint errors and current incomplete status are explained in [PHASE-2B-FINAL-VERIFICATION.md](PHASE-2B-FINAL-VERIFICATION.md). The original browser evidence JSON now also links this final verification while preserving its initial-run results.

## UX-017 contrast correction captures

The UX-017 increment adds 14 `ux-017-admin-tables-<width>-<theme>.png` screenshots and `ux-017-visual-measurements.json`, covering 320, 375, 430, 768, 1024, 1366, and 1920 px in both themes. The captures are **CSS/layout fixtures**, not authenticated application snapshots: Admin page JavaScript was stubbed and synthetic display rows were inserted in the browser. They are suitable for checking scoped table CSS, contrast, row hover, focus, disabled styling, and page/wrapper geometry; they do not verify live Admin workflows or table action behavior. The cumulative audit screenshot directory now contains 280 PNGs.

## UX-016 dialog surface correction

The pre-change evidence remains [`admin-panel-dialog-viewport-1366-light.png`](screenshots/admin-panel-dialog-viewport-1366-light.png), [`admin-panel-dialog-viewport-320-dark.png`](screenshots/admin-panel-dialog-viewport-320-dark.png), and the other two 320/1366 theme variants. After-capture attempts for 320, 375, 430, 768, 1024, 1366, and 1920 px in both themes failed because Chrome returned `Page.captureScreenshot: Unable to capture screenshot` for the native/fixture page. No after screenshots were created or claimed. Browser-computed surface, backdrop, geometry, and page-width measurements are recorded in the UX-016 section of `MASTER-UI-UX-ISSUE-REGISTER.md`; screenshots and authenticated Admin interaction verification remain outstanding.

## UX-015 Register Diary responsive correction

Before evidence remains [`register-diary-2026-12-14-320-light.png`](screenshots/register-diary-2026-12-14-320-light.png) and its [`1366 light`](screenshots/register-diary-2026-12-14-1366-light.png) counterpart. After screenshots were attempted for 320, 375, 430, 768, 1024, 1366 and 1920px in both themes. Chrome returned `Page.captureScreenshot: Unable to capture screenshot`; no after images are claimed, and no UX-015 PNGs were added. The synthetic CSS/layout geometry results are in [`ux-015-visual-measurements.json`](screenshots/ux-015-visual-measurements.json). The fixture covers long Judge/Court text, missing metadata, populated/empty linked dates, multiple rows and status states, but blocks application JavaScript and does not represent authenticated workflow behavior. At the time of this UX-015 verification, the audit contained 280 PNGs; five testing-infrastructure diagnostics have since been added, bringing the current total to 285.

## Testing infrastructure recovery diagnostics (15 November 2026)

Playwright 1.64.1 with installed Chrome 157.0.8103.51 could not capture even a minimal static page using default headless launch flags. With `--disable-gpu --disable-dev-shm-usage`, the same static capture succeeded. Five real PNGs were verified nonempty, decodable, and sized to their viewports:

- [Static page, 320×700](screenshots/infrastructure-recovery/static-320-default.png)
- [CaseTrack landing, 320×700](screenshots/infrastructure-recovery/landing-320-light.png)
- [CaseTrack Login, 320×700](screenshots/infrastructure-recovery/login-320-light.png)
- [CaseTrack landing, 1366×768](screenshots/infrastructure-recovery/landing-1366-dark.png)
- [CaseTrack Login, 1366×768](screenshots/infrastructure-recovery/login-1366-dark.png)

These are diagnostics only, not authenticated Admin or Register Diary evidence. The requested 56-image matrix and authenticated E2E report were not retained. Existing UX-015/016/017 before screenshots and CSS fixture screenshots remain unchanged; issue statuses remain Open. The complete infrastructure result and cleanup blocker are in [`UI-UX-TEST-INFRASTRUCTURE-RECOVERY.md`](UI-UX-TEST-INFRASTRUCTURE-RECOVERY.md).

## UX-013 Dashboard Case Trends responsive fix

Fourteen CSS/markup fixture screenshots were captured and decoded at 320, 375, 430, 768, 1024, 1366 and 1920 px in light and dark themes using the previously confirmed Chrome launch flags; no screenshot infrastructure was changed. Examples: [320 light](screenshots/ux-013/ux-013-320-light.png), [320 dark](screenshots/ux-013/ux-013-320-dark.png), [1366 light](screenshots/ux-013/ux-013-1366-light.png), and [1366 dark](screenshots/ux-013/ux-013-1366-dark.png). The screenshots contain the Case Trends panel with current shared/dashboard styles and matching markup, not the authenticated full Dashboard page. Responsive DOM geometry checks passed for all 14 viewport/theme combinations with no title/control overlap or page-wide overflow; the selector remained visible and `lastYear` could be selected/read back. Existing full Dashboard baselines remain [`dashboard-320-light.png`](screenshots/dashboard-320-light.png) and [`dashboard-320-dark.png`](screenshots/dashboard-320-dark.png). Full-route visual review remains outstanding; UX-013 stays Medium/Open.

## UX-014 Dashboard chart and legend readability

Before evidence: [`dashboard-320-light.png`](screenshots/dashboard-320-light.png) and [`dashboard-320-dark.png`](screenshots/dashboard-320-dark.png). After evidence consists of the 14 synthetic CSS/chart fixture screenshots below. The fixture uses the exact current Case Trends and Case Status markup/styles and the existing `renderCaseTrends`/`renderDonut` functions, with 1,234 synthetic records and long category names. It is not an authenticated full Dashboard capture. All images were captured and PNG-decoded successfully.

| Viewport | Light | Dark |
|---:|---|---|
| 320px | [After](screenshots/ux-014/ux-014-320-light.png) | [After](screenshots/ux-014/ux-014-320-dark.png) |
| 375px | [After](screenshots/ux-014/ux-014-375-light.png) | [After](screenshots/ux-014/ux-014-375-dark.png) |
| 430px | [After](screenshots/ux-014/ux-014-430-light.png) | [After](screenshots/ux-014/ux-014-430-dark.png) |
| 768px | [After](screenshots/ux-014/ux-014-768-light.png) | [After](screenshots/ux-014/ux-014-768-dark.png) |
| 1024px | [After](screenshots/ux-014/ux-014-1024-light.png) | [After](screenshots/ux-014/ux-014-1024-dark.png) |
| 1366px | [After](screenshots/ux-014/ux-014-1366-light.png) | [After](screenshots/ux-014/ux-014-1366-dark.png) |
| 1920px | [After](screenshots/ux-014/ux-014-1920-light.png) | [After](screenshots/ux-014/ux-014-1920-dark.png) |

The 70 synthetic scenario/theme/viewport checks passed. Full authenticated Dashboard/Firebase verification was not run and is not claimed. UX-014 is marked Medium · Fixed/Verified based on the allowed synthetic CSS/chart fixture.
