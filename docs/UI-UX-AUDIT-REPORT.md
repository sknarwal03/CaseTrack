# CaseTrack — UI/UX Audit Report

**Audit date:** 12 November 2026  
**Scope:** Active CaseTrack page templates, shared navigation and dialogs, page-specific CSS/JS, and the current Vite production entry configuration.  
**Method:** Static source review with line-level evidence. No application source was changed for this audit.

## Executive summary

The application has a recognizable shared visual language: dark/light theme tokens, a common navigation shell, page-specific layouts, and status treatments. The strongest confirmed risks are the password-setup page being absent from the Vite build inputs, incomplete accessible naming and focus handling in custom case dialogs, and visible export controls without corresponding behavior. Dashboard KPI change percentages are hard-coded, while Tasks & Reminders are browser-local follow-up notes rather than scheduled notifications. These issues can undermine onboarding, keyboard use, and confidence in displayed data.

The dashboard Case Trends area is sourced from case dates and has a period selector; the UI also explicitly describes the pending series as estimated. This audit did not find a reason to mark that recently updated chart as broken from source review alone.

## Verification limits

- Browser automation and the browser UI host were unavailable during this review. Rendered visual checks, keyboard walkthroughs, screen-reader output, and screenshots were therefore **not verified**.
- Responsive behavior at 320, 375, 430, 768, 1366, and 1920 px was **not verified in a browser**. CSS breakpoints and overflow rules were reviewed as source evidence only.
- Findings below distinguish confirmed source behavior from runtime questions. No usability or performance metric is presented as measured.
- Existing uncommitted application changes predate this audit and were left untouched.

## Route and page coverage

The Vite build configuration lists 16 HTML entries including the landing page. `pages/password-setup.html` exists but is not listed as an entry; `pages/debug-cases.html` is a development/debug page and was not treated as a user-facing route.

| Page / route | Review coverage | Source observations |
|---|---|---|
| `index.html` | Reviewed | Landing/preview page; static marketing sample content is not treated as live case data. |
| `pages/login.html` | Reviewed | Authentication form, password visibility control, status message. |
| `pages/dashboard.html` | Reviewed | KPI cards, trend and status charts, hearing and PO panels, task dialog. |
| `pages/cases.html` | Reviewed | Filters, sortable register, export control, case details dialog. |
| `pages/fir-register.html` | Reviewed | FIR register search, year control, record navigation, print action. |
| `pages/fir-index.html` | Reviewed | Searchable/printable index and custom year picker; responsive behavior not rendered. |
| `pages/fir-statusmap.html` | Reviewed | Year selector, summary, status grid, legend, native details dialog. |
| `pages/disposed-cases.html` | Reviewed | Month/year archive, print, details dialog. |
| `pages/po-cases.html` | Reviewed | PO register, filters, summary, table. |
| `pages/report.html` | Reviewed | Summary metrics, charts and lists, export control. |
| `pages/settings.html` | Reviewed | Preferences, account/security, password dialog. |
| `pages/admin-panel.html` | Reviewed | Operator management forms/tables and dialogs. |
| `pages/password-change.html` | Reviewed | Temporary-password flow. |
| `pages/password-setup.html` | Source reviewed; build inclusion issue | Secure-link password form exists but is omitted from Vite entry list. |
| `pages/register-diary.html` | Reviewed | Date navigation, diary actions, date dialog, case details. |
| `pages/all-judges.html` | Reviewed | Judge register and add/edit dialog. |
| `pages/manage-io.html` | Reviewed | Investigating Officer register and add action. |
| `pages/debug-cases.html` | Excluded from active-route count | Debug utility, not listed as a Vite entry. |

Shared shell and component coverage includes `assets/js/shared-layout.js`, `assets/css/shared.css`, `assets/js/shared-utils.js`, and `components/add-case/*`.

## Findings overview

| ID | Severity | Category | Finding | Status |
|---|---|---|---|---|
| UX-001 | Critical | Workflow / deployment | Password setup route is missing from Vite build entries. | Open |
| UX-002 | High | Accessibility | Several Add Case labels are not programmatically associated with their controls. | Open |
| UX-003 | High | Accessibility | Shared custom dialogs do not implement focus entry, trapping, and restoration as a complete pattern. | Open |
| UX-004 | High | Functionality | Cases and Report export controls have no export behavior in reviewed source. | Open |
| UX-005 | High | Content / trust | Dashboard KPI percentage deltas are hard-coded. | Open |
| UX-006 | Medium | Expectations / reminders | Dashboard reminders persist in browser local storage and do not schedule notifications. | Open |
| UX-007 | Medium | Visual consistency | FIR status uses different visual treatments between StatusMap and FIR Register. | Open |
| UX-008 | Medium | Navigation | Shared sidebar has no explicit Dashboard item; users must use the brand link. | Open |
| UX-009 | Medium | Responsive usability | Dense registers rely on horizontal table scrolling at narrow widths. | Open; runtime check needed |
| UX-010 | Medium | Data clarity | Report summary labels do not explain their underlying status definitions. | Open |

Detailed evidence, recommendations, and acceptance criteria are in [UI-UX-ISSUE-TRACKER.md](UI-UX-ISSUE-TRACKER.md).

## Cross-page observations

### Navigation and orientation

The shared shell provides consistent links for the core registers and a responsive drawer. The brand points to the dashboard, but there is no separately labeled Dashboard navigation item. On desktop, users who do not recognize the brand as a home action may have trouble returning to their overview. The mobile drawer’s visual and focus behavior still needs browser verification.

### Forms and dialogs

Native `<dialog>` is used for the dashboard task form and several focused flows. Other dialogs use a custom modal helper that toggles visibility and body scrolling, but does not itself manage focus. Add Case is a long multi-section form; its section headings provide some grouping, but source shows some labels without `for`/control nesting. Keyboard and screen-reader behavior needs a focused follow-up after fixes.

### Tables and narrow screens

FIR Index, PO Cases, Disposed Cases, and All Cases use table-oriented layouts. Their CSS includes overflow handling, which may keep columns available but requires sideways movement on small screens. Whether essential columns/actions remain discoverable at 320–430 px needs rendered verification at the specified viewport widths.

### Dashboard content

Task CRUD interactions are implemented in the dashboard script, with user-scoped browser-local storage. The interface calls entries “Tasks & Reminders”; no notification scheduling is evidenced in the implementation. KPI arrows and percentages are hard-coded in the HTML. Case Trends has a period selector and date-derived values; the pending trend is disclosed as an estimate in the page.

## Recommended priority

1. Confirm/repair the password-setup build route and verify the deployed onboarding link.
2. Fix form labels and establish a complete, consistent modal keyboard/focus pattern.
3. Implement or remove the export controls, then verify a real file is produced.
4. Replace hard-coded dashboard deltas with measured values or remove the delta treatment.
5. Clarify reminder delivery and report metric definitions.
6. Complete the browser-based viewport and keyboard review, especially dense tables and mobile navigation.

## Artifacts

- [Issue tracker](UI-UX-ISSUE-TRACKER.md)
- [Design system review](UI-UX-DESIGN-SYSTEM-REVIEW.md)
- [Improvement roadmap](UI-UX-IMPROVEMENT-ROADMAP.md)
