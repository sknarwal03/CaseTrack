# Dashboard Pie Chart UI/UX Rules

These rules preserve the dashboard pie chart's approved behavior. They apply whenever the user explicitly requests a pie chart change. Otherwise, follow the protection rule in the repository's `AGENTS.md` and leave the chart untouched.

## Approved behavior to preserve

- Render the chart as a hollow donut. The inner circle remains clear and keeps the total-case label visible.
- Hovering a segment moves that actual colored segment slightly outward. Do not draw a second colored highlight over the chart.
- Keep the hovered segment within the donut ring; it must not fill the hollow center.
- The vacated space behind a moved segment reveals the surrounding panel background, without a mismatched track color.
- Show the information tooltip near the pointer. Position it according to available space and flip it near viewport edges so it avoids covering the chart where possible.
- Match the tooltip's accent, border, and shadow to the currently hovered segment. Preserve the tooltip's existing background treatment unless the user asks to change it.
- Preserve readable tooltip text, keyboard focus styling, responsive layout, and both light and dark theme behavior.

## Change scope

Only change chart markup in `pages/dashboard.html`, chart logic in `assets/js/dashboard.js`, or chart-specific selectors in `assets/css/dashboard.css` when the user explicitly requests a pie chart change. Avoid unrelated dashboard edits in the same chart rules or selectors.
