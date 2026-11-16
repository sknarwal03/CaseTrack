# CaseTrack — Master UI/UX Improvement Plan

**Planning-only baseline:** existing audit evidence through 12 November 2026. No issue is closed and this plan authorizes no implementation. The visual audit is **not complete**: Password Setup valid-token form and success/error states could not be verified because two backend handlers are missing. Existing audit reports and screenshots remain authoritative and unchanged.

## Executive decision summary

- Consolidated register: UX-001 through UX-017, all Open.
- Severity (canonical tracker): 1 Critical, 6 High, 8 Medium, 2 Low.
- Highest priority: separate diagnosis and approval of the Password Setup build route and backend endpoints; then accessible labels/dialogs and unimplemented exports/data trust; then confirmed high-impact visuals/accessibility; then systematic page refinement.
- Current visual findings confirmed in browser: UX-009, UX-013–017. UX-011 valid form remains unverified. UX-001 route omission is confirmed by source; deployed URL was not proven. Backend endpoint absence is confirmed by emulator 404 and export list.
- Do not access production police records. Use isolated emulator and synthetic fixtures only.

## Evidence baseline and limits

Source: `docs/UI-UX-AUDIT-REPORT.md`, `UI-UX-ISSUE-TRACKER.md`, `UI-UX-DESIGN-SYSTEM-REVIEW.md`, `UI-UX-IMPROVEMENT-ROADMAP.md`; rendered audit artifacts in `docs/ui-ux-audit/`. Latest `PHASE-2B-FINAL-VERIFICATION.md` supersedes earlier Admin limitations: actual synthetic Admin login/data view verified; Admin Manage dialog and low-contrast table text newly confirmed. The evidence reports 266 PNGs retained. Operator route screenshots cover 12 routes at seven widths and both themes; Admin populated data also covers seven widths/themes.

Limit: Password Setup valid state remains blocked, with no screenshot of valid form. Authentication/role mutation success, full screen-reader coverage, full keyboard traversal, zoom, automated accessibility scans and multiple other interactions remain unverified. This plan does not claim a completed accessibility conformance audit or complete visual audit.

### UX-001 technical diagnosis (keep concerns separate)

1. **Build/deployment path:** `pages/password-setup.html` exists, `vite.config.js` explicitly lists build inputs without it, while setup URL example points to `/CaseTrack/pages/password-setup.html`. Verify clean build artifact and hosting base/path separately; source evidence does not alone prove deployed behavior.
2. **Backend handlers:** current Functions emulator export list has eight functions and lacks `validateOperatorSetupCode` and `completeOperatorPasswordSetup`. Both endpoint checks returned HTTP 404 for an active synthetic token. `functions/index.js` has no exports; token registry helper presence is not an HTTP handler. This is a backend implementation/export/deployment blocker, not merely CORS. CORS failure follows the absent route. Do not bypass authentication or weaken CORS as a substitute.
3. **Approval:** implementing the missing handlers, token contract, or production backend/deployment changes requires separate explicit approval. Planning does not authorize these changes.

## Phased roadmap

### Phase 1 — Planning and baseline (this deliverable)

Consolidate evidence, preserve IDs, describe unknowns, define acceptance/test cases and approval gates. Done when the five documents exist and evidence limits are explicit.

### Phase 2 — Functional reliability (UX-001–005)

Order: UX-001 route/build diagnosis and separate backend scope; UX-002 Add Case naming; UX-003 dialog keyboard pattern; UX-004 exports; UX-005 KPI delta trust. Backend implementation and functional behavior changes require approval. Do not merge route/build, backend endpoints, accessibility, export, and KPI work as one change. Acceptance and verification details are in issue register and checklist.

### Phase 3 — Shared design system

After interaction baseline and design approval: inventory actual `shared.css` tokens, typography, spacing, colors and local overrides; standardize buttons, inputs, cards, tables, dialogs, navigation, status badges and interactive states using existing CaseTrack visuals. No framework/dependency addition. Do not alter semantics or broad CSS without regression evidence.

### Phase 4 — High-impact visual fixes (UX-009, UX-013–017; also UX-011 when unblocked)

First resolve Admin transparent dialog and contrast (UX-016/017), then Dashboard title/labels and populated Register Diary overlap (UX-013/014/015), and choose per-register UX-009 strategy. Determine shared CSS vs page-specific ownership before implementation. UX-016 may use shared dialog token only if inspection proves it is a reusable defect; otherwise local Admin selector. UX-017 is Admin table theme CSS. UX-013/014 are Dashboard layout/chart styles. UX-015 belongs to Register Diary row markup/styles. UX-009 spans Cases, FIR Index, Admin and potentially other tables; treat each register independently. UX-011 only after a real valid form can be tested.

### Phase 5 — Page-by-page refinement

| Page | Current findings | Target and shared parts | Responsive/accessibility/regression checks |
|---|---|---|---|
| Landing/Login | UX-012 on landing preview; login route captured | Preserve brand/CTA; clarify or simplify preview; shared auth typography only if reusable | 320–1920; keyboard form/visibility control, labels/errors, no clipping |
| Dashboard | UX-005, 006, 013, 014; shared dialogs UX-003 | truthful metrics/task wording; responsive chart heading/legend; shared cards/dialogs | all seven widths/themes; data untouched; keyboard chart/dialog and accessible summaries |
| All Cases | UX-004, 009; case detail dialog UX-003 | working or unavailable export decision; register strategy and shared table treatment | filters/sort/row detail/export scope; horizontal region reachable; synthetic linked cases |
| FIR Register | UX-007; nested accused table responsive concern; dialogs | shared status aliases and deliberate nested table treatment | multiple accused/courts; color+text; relationship remains stable |
| FIR Index | UX-009 | prominent identity/actions and deliberate scroll/card treatment | search/year/print, keyboard scroll, 320–1920 |
| FIR Status Map | UX-007 | shared status mapping while preserving legend and status behavior | all four statuses, no color-only cues, details dialog keyboard |
| Add/Edit Case | UX-002/003 | labels/field grouping and accessible dialog standard | validation, linked court/accused relationships, create/edit serialization unchanged |
| Register Diary | UX-015; shared date dialog | separate row metadata/actions | populated/empty days, hearing-date transitions and persisted notes unchanged |
| PO Cases | UX-009 if narrow interaction review confirms impact | shared table/card patterns | PO workflow and accused actions preserved |
| Disposed Cases | UX-009 if confirmed by review | archived register responsive treatment | month/year, print, records remain unchanged |
| Reports | UX-004, UX-010 | export behavior decision and metric definitions | counts reconcile; no false assumptions about statuses |
| All Judges | No consolidated issue currently | Keep common form/table/dialog patterns if evidence supports | add/edit/search keyboard, long names and mobile |
| Manage IO | No consolidated issue currently | Same; preserve shared IO dialog | CRUD flow test with synthetic records; no data behavior change |
| Settings | No consolidated issue currently | Reuse input/toggle/dialog patterns | theme persistence, keyboard toggles, account actions unchanged |
| Admin Panel | UX-009, UX-016, UX-017 | dialog surface and table contrast; narrow table strategy | synthetic role/station data, 7 widths/themes, role guards; no role mutation unless approved test scope |
| Password Change/Setup | UX-001/011; change flow captured, not submitted | setup account-flow visual parity only after endpoints exist | synthetic account; setup one-time token; seven sizes/themes; auth and password flow integrity |

For all pages, record current issue(s), proposed scope, shared ownership, responsive behavior, accessibility behavior and regression checks before implementation. “No consolidated issue” means no issue ID presently assigned, not a declaration of defect-free status.

### Phase 6 — Final verification

Run only after implementation increments are separately approved and complete. Build/units/E2E/emulator/browser visuals; seven viewports (320×700, 375×812, 430×932, 768×1024, 1024×768, 1366×768, 1920×1080); light/dark; keyboard/focus; dialogs; authenticated workflows with synthetic data. Never connect test browser to production police records. Test role access, schema/business invariants, and one-time token behavior where approved. Exact matrix in `UI-UX-REGRESSION-TEST-PLAN.md`.

## Implementation increments and dependency order

| Increment | Scope | Dependency / approval gate | Done when |
|---|---|---|---|
| A. Confirm production artifact map | UX-001 build/deploy route only | Verify configured host/base path; deployment config change separately approved | Clean build contains exact route; hosted staging path smoke passes |
| B. Implement setup backend contract | UX-001 handlers | Explicit backend approval; define auth/token/rate/error contract | Emulator tests confirm genuine validation/completion, single use and rejection paths |
| C. Verify account setup end-to-end | UX-001/011 | A+B complete; synthetic token only | Valid/error/expired/reused paths visible; valid form audit captured |
| D. Label Add Case fields | UX-002 | Field inventory | Accessible names/label clicks pass; payload unchanged |
| E. Shared dialog interaction standard | UX-003, then UX-016 | Dialog inventory; shared refactor approval | Keyboard/focus behavior passes every dialog; no surface regression |
| F. Export behavior decision/implementation | UX-004 | Product choice on file type and columns; functional approval | Correct test file and announcements or affordance removed |
| G. KPI/task/report semantics | UX-005/006/010 | Operational definitions; behavior approval if scope expands | Reproducible deltas or none; honest task copy; report definition reconciles |
| H. Admin dialog/contrast CSS | UX-016/017 | E where shared dialog CSS involved; design approval | Admin screenshots/contrast pass all target theme/widths |
| I. Dashboard and Diary responsive defects | UX-013/014/015 | Existing CSS ownership review | No collisions, legible labels, separated row controls; flows unchanged |
| J. Register responsive plan/build | UX-009 | Per-page column/action priority decision; visual approval | Every row field/action reachable and responsive behavior accessible |
| K. Shared design-system adoption | Cross-cutting | Token inventory and approval for shared refactor | Incremental migration, component matrix and no unapproved framework |
| L. Page-by-page residual review | UX-007/008/011/012 + other observations | Dependencies above | Acceptance matrix complete; issues remain open until evidence reviewed |

Every increment should be a small separate commit/change set with its own rollback (revert that increment; avoid data migration where possible). No multi-topic mega-commit. Keep a before/after screenshot set and issue-to-change mapping.

## Business logic and approval gates

Preserve FIR Master ↔ linked court-case relationships; UI/UCR/UT/Disposed semantics; multiple courts and accused; hearing-date transitions; Register Diary data behavior; PO and disposed workflows; Firestore schemas/security rules; role-based controls. Any required behavior/backend/data/schema change is explicitly scoped and approved separately. Approval of this plan is not implementation approval.

Before implementation obtain separate approval for: (1) backend/functional changes, (2) design-system/token changes, (3) shared-component refactoring, (4) page-specific visual changes, (5) new dependencies, and (6) data/schema migration. No new dependency is currently recommended.

## Required artifacts

- `MASTER-UI-UX-IMPROVEMENT-PLAN.md` (this document)
- `MASTER-UI-UX-ISSUE-REGISTER.md`
- `CASETRACK-DESIGN-SYSTEM-SPEC.md`
- `UI-UX-IMPLEMENTATION-CHECKLIST.md`
- `UI-UX-REGRESSION-TEST-PLAN.md`

Existing reports/screenshots are preserved. The new register records estimates as estimates, not commitments.
