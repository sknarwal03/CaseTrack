# Repository instructions

## Protected dashboard pie chart

Treat the dashboard pie chart as a protected component during general UI/UX, styling, cleanup, and refactoring work. Do not modify, restyle, restructure, or otherwise affect it unless the user explicitly asks to change the pie chart.

The chart's protected implementation is in:

- `pages/dashboard.html` — chart markup
- `assets/js/dashboard.js` — chart data, SVG slices, hover behavior, and tooltip positioning
- `assets/css/dashboard.css` — chart, legend, tooltip, and responsive styling

This protection applies even when the request is to update the dashboard or the site's overall UI/UX. Keep changes outside the chart's markup, logic, and chart-specific CSS. Read [dashboard pie chart UI/UX rules](docs/ui-ux-audit/DASHBOARD-PIE-CHART-UI-UX-RULES.md) before making any explicitly requested chart changes.
