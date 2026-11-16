# CaseTrack — Design System Review

Audit date: 12 November 2026. This review evaluates source structure and consistency. Rendered appearance has not been verified in a browser.

## Summary

CaseTrack has the foundation of a small design system: shared CSS variables, a common layout shell, dark/light theme support, and page-level stylesheets. In practice, some controls and status treatments are implemented separately across pages. The strongest opportunity is to consolidate shared interaction patterns (especially dialogs and status labels) and document a small set of responsive table and form rules.

## Foundations

| Area | Current evidence | Assessment |
|---|---|---|
| Color and theme | `assets/css/shared.css:3-85` defines dark and light theme variables for page/surface, text, brand, semantic states, borders, and shadows. `assets/js/shared-layout.js:122-148` saves and switches theme. | Good foundation. Confirm semantic color contrast in rendered light and dark themes, particularly muted text, small status text, and colored pills. Contrast was not measured. |
| Typography | Shared styles and page styles use a common system-font approach, while pages own their heading scales and labels. | Likely coherent but no explicit documented type scale or line-height rules were verified. Establish named text roles if pages continue to diverge. |
| Spacing and shape | Shared tokens define several radius and spacing values; page styles also contain local values. | Reuse shared spacing/radius tokens for dialogs, cards, and controls; document when a page-specific exception is appropriate. |
| Navigation | `assets/js/shared-layout.js` generates the shared sidebar/top bar and manages mobile drawer state. | Strong reuse point. Dashboard is linked by the brand but is not a named sidebar item; current-page and focus states need consistent verification. |
| Buttons and actions | Page styles define action variants independently; export actions appear in Cases and Report without behavior in reviewed scripts. | Establish primary, secondary, destructive, and icon-only button rules, including disabled/loading/success states. A visual control should only look actionable when it is actionable. |
| Status colors | StatusMap defines a four-status FIR palette and a legend; FIR Register applies a generic treatment in parts of its detail UI. Case-list statuses also have page CSS. | Define status tokens by domain/status meaning and share them across map, register, badges, and filters. Pair each color with a visible label. |
| Dialogs | Native `<dialog>` exists for some flows; other pages use `.modal` and `setupModal()` from `assets/js/shared-utils.js:13-51`. | Two interaction models increase inconsistency. Adopt one accessible dialog pattern with predictable focus, Escape, background behavior, and scroll locking. |
| Forms | Add Case uses grouped cards and section headings; some labels are correctly associated and others are not. | Preserve the section grouping, but standardize label/control markup, required/optional cues, inline validation, and error summaries. |
| Tables | Registers use semantic table markup and overflow wrappers. | Provide a shared dense-table pattern: compact and comfortable density, sticky header where useful, visible sort state, row-action placement, empty/loading/error states, and a mobile strategy. |

## Component consistency priorities

### Dialogs

Create a shared dialog contract covering initial focus, tab sequence, Escape, close button naming, focus restoration, background interaction, and mobile height/scroll. Native dialogs should use the same visual tokens as custom dialogs. Verify with keyboard-only interaction and a screen reader.

### Status indicators

Maintain a central mapping from domain status to text, color token, and optional icon. Do not assume a color communicates meaning by itself. The StatusMap legend is a useful pattern; bring related register/detail badges into line with it.

### Tables and responsive behavior

Table overflow is a reasonable option for wide registers, but the scroll region should be discoverable and keyboard operable. A mobile pattern should prioritize the record identifier and next action, with secondary details available through expansion or a detail view. Test every shared pattern at 320, 375, 430, and 768 px, then confirm desktop widths 1366 and 1920 px.

### Forms

Use consistent label placement, required markers, helper text, inline validation, error summary, and save/cancel placement. For long case entry, consider an at-a-glance section navigator or progress indicator only if it improves orientation without hiding required fields.

## Accessibility review priorities

- Associate every visible label with its form control.
- Complete dialog focus behavior and keep focus visible.
- Ensure status is communicated with text, not color alone.
- Verify accessible names and keyboard behavior for custom year pickers, chart summaries, icon buttons, and mobile navigation.
- Check contrast in both themes and verify touch target dimensions on phones. These checks were not measured in this source-only review.

## Suggested token/component governance

1. Keep semantic color, typography, spacing, radius, and elevation tokens in the shared layer.
2. Prefer shared component classes for buttons, fields, status badges, dialogs, and table wrappers; limit page CSS to layout and domain-specific structure.
3. Record examples of valid states (default, hover, focus, disabled, loading, empty, error, success) for each shared component.
4. Include a small visual QA matrix for both themes and the six target viewport widths in release review.
