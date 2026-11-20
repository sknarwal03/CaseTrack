# CaseTrack Hero Phase 3: Height and Content Standardization

**Date:** 20 November 2026
**Scope:** Active page-level heroes, light and dark themes, responsive widths, source changes, and visual evidence.

## Outcome

Twelve standard application heroes now share the same rendered outer height at each tested viewport width: **128px through 600px, 120px from 601px to 1024px, and 136px above 1024px**. The exact height matched across all twelve pages in both themes at all eleven requested widths. No horizontal document overflow or hero child overflow was detected by the recorded checks.

The shared rules live in [page-hero-standardization.css](../../assets/css/page-hero-standardization.css). They retain each page's existing colors and theme treatment, set consistent radius and internal spacing, and include narrow-screen adjustments for the StatusMap title, archive orbit, and FIR year controls. FIR year controls and the disposed-register print action have 44px mobile control height.

## Active hero inventory

Baseline heights below are the measured min–max across the baseline width/theme matrix. Admin content was hidden by its operator access gate in the baseline, so its baseline hero height could not be measured. The final visual capture revealed the static admin content only in the test DOM to measure the hero; it did not change application authorization or data.

| Page / source | Hero title | Current description | Words | Baseline height | Layout and actions |
|---|---|---|---:|---:|---|
| Dashboard · `pages/dashboard.html` | Welcome Back, User! | Your cases and hearings at a glance. | 7 | 60.7–151.6px | Welcome card, New Case action |
| Cases · `pages/cases.html` | All Cases | Review cases and upcoming hearings. | 5 | 150.0–178px | Case overview header |
| FIR Register · `pages/fir-register.html` | FIR Register 2026 | Browse complete FIR records by year. | 6 | 154.9–247.2px | Year selector; compact mobile target |
| FIR Index · `pages/fir-index.html` | FIR Index 2026 | Find files and open complete FIR records. | 7 | 130.6–157.8px | Year selector |
| FIR StatusMap · `pages/fir-statusmap.html` | FIR StatusMap 2026 | One cell per FIR; colors follow CaseTrack status rules. | 9 | 151.3–227.2px | Year control and status-map context |
| PO Cases · `pages/po-cases.html` | PO Cases | Track proclaimed offenders and related proceedings. | 6 | 132.6–204px | Compact overview header |
| Disposed Cases · `pages/disposed-cases.html` | Disposed Cases | Browse concluded proceedings by month. | 6 | 204–205px | Print register action; mobile 44px target |
| Reports · `pages/report.html` | Case Insights | `REPORTS` eyebrow; no prose description | — | 57.8–117.3px | Export Report action |
| Settings · `pages/settings.html` | System Preferences | `SETTINGS` eyebrow; no prose description | — | 57.8–117.3px | Save Changes action |
| Admin Panel · `pages/admin-panel.html` | Admin Panel | Administration | 1 | Not measurable while access-gated | Operator-only content; measured via test-only static reveal |
| All Judges · `pages/all-judges.html` | All Judges | Maintain court assignments. | 4 | 116–116.8px | Header without hero action |
| Manage IO · `pages/manage-io.html` | Manage IO | Maintain investigating officer records. | 5 | 116–116.8px | Header without hero action |

### Other page-level headers

| Page / source | Header | Treatment |
|---|---|---|
| Landing · `index.html` | Every case. Clearly managed. | Marketing composition with preview, Login and Explore Features actions, and trust statement. Its long copy was shortened to “Track case files, hearings, status, and work that moves matters forward.” (11 words). The distinctive 610px marketing layout is intentionally not forced into the application-card height token. The page has no light-theme variant. |
| Register Diary · `pages/register-diary.html` | Register Diary calendar header | Custom calendar-control header; no prose subtitle. Its height follows the calendar and associated controls, so it remains a documented sizing exception. |

Route discovery found no active `chinhit` page or route in the app entry configuration. Login, password setup, and password change pages do not contain a page-level hero.

## Copy updates

Short page descriptions are now concise, purpose-specific sentences on Dashboard, Cases, FIR Register, FIR Index, FIR StatusMap, PO Cases, Disposed Cases, All Judges, and Manage IO. The landing marketing sentence was also shortened. Reports and Settings retain their existing section eyebrow labels; there was no descriptive sentence to shorten. No localization keys or dynamic/legal data were changed.

## Measurement results

| Requested viewport widths | Standard hero height | Result |
|---|---:|---|
| 320, 360, 375, 390, 430, 600px | 128px | All twelve pages equal in both themes |
| 768, 1024px | 120px | All twelve pages equal in both themes |
| 1280, 1440, 1920px | 136px | All twelve pages equal in both themes |

The matrix contains 264 standard hero observations (12 pages × 11 widths × 2 themes). At each requested width the maximum page-to-page height difference is **0px**. The final viewport evidence also includes the 22 Register Diary theme/width captures and 11 landing captures (dark-only marketing page), for 297 PNG screenshots total. The capture records include title, description, hero bounds, child-content bounds, visible controls, viewport/document widths, status, and image filename.

On mobile, the year selection controls on FIR Register, FIR Index, and FIR StatusMap and the Disposed Cases print action remain visible with at least 44px height. The tested document width did not exceed the viewport; measured hero children remained within the hero bounds. The StatusMap 320px title and disposed-case orbit overlap cases found during iteration were corrected before the final capture.

Evidence files are in [the Phase 3 evidence directory](evidence/phase-3-hero-standardization/):

- `baseline-measurements.json` — 286 baseline measurements.
- `final-measurements.json` — 297 final observations and capture records.
- PNG screenshots named by page, requested width, and theme.

## Verification and limits

- `npm run build` — passed. Vite reports the existing large-chunk advisory for PDF/Excel bundles.
- `npm test` — passed, 60 tests.
- Phase 3 Playwright responsive/theme matrix — passed, all requested widths; isolated Auth/Firestore emulators and synthetic test session.
- `git diff --check` — passed (Git emitted line-ending conversion notices only).
- PWA standalone display mode was not independently verified in an installed browser. The responsive browser matrix covers viewport sizing, not OS-installed display mode.
- The operator-only Admin Panel screenshot uses a test-only DOM reveal to measure its otherwise static hero. StatusMap emitted an access-check warning with the empty emulator fixture; neither observation represents production authorization/data behavior.

No commit or push was made.
