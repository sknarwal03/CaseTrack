# CaseTrack — Design System Gap Analysis

## Evidence boundary

Operator pages were rendered in Chrome at seven widths and in both theme settings. The existing source-based review remains in `docs/UI-UX-DESIGN-SYSTEM-REVIEW.md`. Admin user-list rendering is now verified. Valid Password Setup remains unavailable because its backend handlers are missing. No UI changes were made.

## Current strengths observed

- The authenticated shell applies a coherent CaseTrack palette and shared navigation across the Operator pages.
- Dashboard KPI cards, register panels, and dialogs share rounded surfaces, borders, and blue/violet primary actions.
- FIR Register details stack into readable cards on narrow screens, and PO Cases provides a compact row presentation.
- Both theme settings render across the Operator route matrix.

## Verified gaps

| Area | Rendered evidence | Gap |
|---|---|---|
| Dashboard chart header | `dashboard-320-light.png`, `dashboard-320-dark.png` | Case Trends heading collides with its period selector at 320 px (UX-013). |
| Dashboard data visualization | Same Dashboard captures | Chart labels and the status legend become crowded and small at 320 px (UX-014). |
| Responsive tables | `cases-320-light.png`, `fir-index-320-light.png`, related dark captures | Key fields are outside the phone viewport with no persistent scroll cue. UX-009 is confirmed and remains open. |
| Register Diary rows | `register-diary-2026-12-14-320-light.png` | Hearing metadata and controls overlap at 320 px (UX-015). |
| Account-flow surfaces | `password-setup-1366-light.png` and dark equivalent | Invalid/unavailable state stays on a white/gray surface that differs from CaseTrack; validator failure prevented inspection of the valid form (UX-011). |
| Landing illustration | `landing-320-default.png`, `landing-375-default.png` | Nested preview labels remain too small for mobile reading (UX-012). |
| Admin data view | `admin-panel-data-1366-light.png` and final matrix | Admin data is rendered. Light-theme station headers and UID text have measured contrast of 1.24:1 and 2.33:1 (UX-017); responsive table limitations extend UX-009. |
| Admin Manage dialog | `admin-panel-dialog-viewport-1366-light.png`, dark/mobile equivalents | Undefined `--panel` leaves a transparent dialog surface; background content shows through (UX-016). |

## Candidate CaseTrack design system

These remain governance recommendations, not implementation work.

1. Retain the existing brand; document semantic page/surface/text/border/focus/status tokens and pair state colors with text.
2. Define a type scale for page and section titles, body, fields, tables, helper text, and numeric summaries. Avoid microtext for operational data.
3. Reuse existing spacing tokens; validate the current card and form density before selecting a shared scale.
4. Define card, control, and dialog radii/elevation from actual shared patterns.
5. Document breakpoints and shared container widths based on the captured route matrix, including the chart-header and diary-row failures.
6. Standardize field labels, helper/error text, focus, disabled, loading, and validation states.
7. Specify table density, row identity, action placement, empty/error/loading states, and a deliberate small-screen/scroll strategy.
8. Specify native/custom dialog visual and keyboard behavior after interaction checks.
9. Keep public marketing and authenticated navigation as separate patterns that share type, color, spacing, and focus tokens.
10. Standardize loading, error, empty, and success feedback. Retest setup errors alongside the valid synthetic setup form.

## Remaining evidence

Node 22 and Admin data verification are complete. Valid Password Setup requires missing backend handlers to be supplied under separate authorization. Targeted Admin label, dialog keyboard, and two table contrast checks are now recorded; broader keyboard, touch, contrast, and assistive-technology coverage remains unverified. See [AUDIT-ENVIRONMENT-STATUS.md](AUDIT-ENVIRONMENT-STATUS.md).
