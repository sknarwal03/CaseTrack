# CaseTrack — Canonical Design System Specification (Proposed)

**Status:** planning proposal, grounded in existing CaseTrack styles. This document does not authorize implementation. Existing dark/light identity, blue/violet actions, rounded surfaces, shared shell and system-font foundation remain the baseline. Validate candidate values against `assets/css/shared.css` before adoption; existing verified token values must be inventoried before changing them.

## Principles

1. Extend current CSS variables and components; retain current brand palette and page identity.
2. Semantic status and controls always carry text/accessible names; color alone never carries meaning.
3. Shared rules live in shared tokens/components; page exceptions stay local and documented.
4. Preserve data, workflow, role access, schemas, and status semantics.
5. Validate both themes and seven audit widths. WCAG 2.2 AA is the target for contrast and focus behavior.

## Current foundation and proposal

| Area | Existing evidence | Proposed canonical direction |
|---|---|---|
| Theme/color | `shared.css` has dark/light page, surface, text, brand, semantic, border and shadow variables. Admin has unresolved low-contrast overrides (UX-017). | Keep current palette; inventory actual values, map semantic aliases, and eliminate unpaired page literals only as each component is touched. Text >=4.5:1; large text >=3:1; non-text control/focus boundaries >=3:1 where WCAG applies. Calculate alpha-composited colors. |
| Typography | System-font approach; page-local sizes/line heights, some use Inter fallbacks. | Preserve installed/system stack. Normalize named roles and avoid tiny data labels. Base 16px/1.5; body small 14px/1.45; metadata minimum 12px only when contrast and legibility validated; headings 32/28/24/20px with 1.2–1.3 line-height. These are proposed roles, not audited current values. |
| Spacing | Shared spacing/radius tokens exist; page-local values remain. | 4px base rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48. Prefer token reuse for layout, controls and dialog padding. |
| Shape/elevation | Rounded panels, borders, shadows recur. | Retain current radius character; define small/control, card, dialog aliases from the existing token inventory. Avoid new decorative elevation unless needed for hierarchy. |
| Responsive | Current layouts use varied breakpoints; observed rules include 780px and 500px. | Canonical review bands: <=430 phone, 431–780 compact/tablet, 781–1100 narrow desktop, >1100 desktop. These are review bands, not a mandate to rewrite every media query. Also verify exact 320, 375, 430, 768, 1024, 1366, 1920 widths. |

## Component standards

### Buttons and links

- Variants: primary, secondary/outline, tertiary/quiet, destructive, icon-only.
- States: default, hover, active, focus-visible, disabled, pending, success/error feedback.
- Preserve link semantics for navigation and button semantics for actions. Icon-only actions need a stable accessible name and a visible tooltip where appropriate.
- Proposed minimum target 44×44 CSS px for primary touch actions; compact controls must retain clear spacing and WCAG target-size exceptions where applicable.

### Inputs and validation

- Visible label permanently associated with each control; placeholder is not a label.
- Required/optional and format guidance stated before errors; errors connected with `aria-describedby` and invalid state.
- Group related options with fieldset/legend. Keep existing field values, names and validation behavior unless a separate functional scope is approved.

### Cards, tables, and dense registers

- Cards use shared surface, border, spacing and heading roles. Include defined loading, empty, error and populated states.
- Tables keep semantic header/cell relationships, announced sort state, stable row identity and action labels. Provide compact and comfortable density only if the user benefit is established.
- Responsive strategy is decided per register: prioritized rows/cards or an explicitly labeled, keyboard-focusable scroll region with visible cue. Do not silently hide required fields/actions. Avoid changing dataset, filtering, sort or record relationships.
- Table row height target 48–60px comfortable and 40–48px compact, subject to actual content and target size.

### Dialogs

- Prefer native `<dialog>` for modal flows if compatible with existing behavior. Otherwise use the shared controller pattern.
- Accessible title, initial focus, tab containment, Escape/cancel policy, background inertness, scroll lock, close button name and focus restoration are required.
- Opaque theme surface, bounded viewport height, internal scroll for long content, and clear primary/cancel separation. Avoid broad CSS selectors that affect unrelated dialogs.

### Navigation

- Dashboard is an explicit destination on all authenticated routes; active route state is visible and programmatically exposed.
- Drawer exposes expanded state, predictable keyboard open/close, Escape and focus return. Do not change role-based route visibility.

### Status badges

| Domain state | Existing abbreviation | Proposed semantic alias | Required non-color cue |
|---|---|---|---|
| Under Investigation | UI | `status-investigation` | “UI / Under Investigation” as applicable |
| Untraced | UCR | `status-untraced` | UCR / Untraced text |
| Under Trial | UT | `status-trial` | UT / Under Trial text |
| Disposed | Disposed | `status-disposed` | Disposed text |
| Missing/unknown | Existing view-specific fallback | `status-unknown` | “Unknown” or explicit unavailable label |

The aliases map to existing colors only after reviewing current values and contrast. Do not alter status transitions or stored data. Court-proceeding status remains distinct from FIR Master status.

## Theme and state requirements

Every shared component must be inspected in dark and light themes for default, hover/focus, disabled, error, empty/loading states as applicable. Text contrast target: 4.5:1 normal, 3:1 large; interactive boundaries and focus indicators should be visibly distinct and meet applicable non-text contrast requirements. Theme-specific exceptions need documented rationale and measured values.

## Adoption path

1. Inventory `shared.css` and page-level overrides, documenting current token values and component ownership.
2. Fix confirmed local defects (UX-016/017, UX-013/014/015) in isolated increments using existing styling.
3. Consolidate token aliases and shared patterns only after parity comparison and explicit approval.
4. Migrate page-by-page, checking screenshot diffs, behavior and light/dark states.

No new UI framework or dependency is proposed. Any token overhaul, shared component refactor, visual redesign or dependency addition requires a separate approval gate.
