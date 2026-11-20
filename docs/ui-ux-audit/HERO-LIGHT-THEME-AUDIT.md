# CaseTrack â€” Global Hero Section Light Theme Audit

**Audit type:** Read-only source audit with limited local render preflight
**Date:** 20 November 2026
**Application source modified:** No

## A. Executive Summary

The configured Vite application has 17 entry pages and 14 page-level hero/header regions. Five register heroes use hardcoded dark navy backgrounds that persist in Light Theme: All Cases, FIR Index, FIR Register, FIR StatusMap, and PO Cases. Disposed Cases adds a fixed blue-tinted gradient endpoint to token-based surfaces. These treatments conflict with the light page surface; light-token headings over fixed navy can also have poor contrast. PO Cases adds violet accents outside the Blue + Green identity.

Other headers are token-driven welcome headers or intentional notebook-style exceptions (All Judges, Manage IO, Register Diary). Their design intent should be confirmed.

**Confirmed Light Theme inconsistencies:** 6 of 14. **Findings:** 1 High, 3 Medium, 2 Low. These are source findings; visual matrix verification is incomplete.

## B. Page Inventory

| Page | Hero Component | Light Theme | Dark Theme | Severity | Issue |
|---|---|---|---|---|---|
| Landing | `.hero` | Dark presentation; no shared light variant found | Dark presentation | Medium | H-03 |
| Dashboard | `.welcome` | Token-based header; no standalone hero | Token-based | Low | None |
| All Cases | `.cases-hero` | Hardcoded navy gradient; light-token heading | Navy gradient | High | H-01 |
| FIR Register | `.fir-register-hero` | Hardcoded navy gradient and pale subtitle | Navy gradient | High | H-01, H-03 |
| FIR Index | `.fir-index-hero` | Hardcoded navy gradient | Navy gradient | High | H-01 |
| FIR StatusMap | `.fir-register-hero.statusmap-hero` | Inherits FIR Register gradient | Navy gradient | High | H-01 |
| PO Cases | `.po-hero` | Navy/indigo gradient and violet details | Navy/indigo gradient | High | H-01, H-02 |
| Disposed Cases | `.archive-hero` | Token surface with blue-tinted endpoint | Dark surface gradient | Medium | H-03 |
| All Judges | `.judges-header` in `.judges-book` | Paper/notebook palette | Paper/notebook palette | Medium | H-04 |
| Manage IO | `.judges-header` in `.io-book` | Paper/notebook palette | Paper/notebook palette | Medium | H-04 |
| Register Diary | `.diary-header` in `.diary-book` | Paper/notebook palette | Paper/notebook palette | Medium | H-04 |
| Reports | `.welcome.report-header` | Shared token-based header | Shared token-based header | Low | None |
| Settings | `.welcome.settings-header` | Shared token-based header | Shared token-based header | Low | None |
| Admin Panel | `.welcome` | Shared token-based header | Shared token-based header | Low | None |
| Login | Login heading; no page hero | Auth-specific | Auth-specific | Low | No hero |
| Password Change | No page hero identified | Auth-specific | Auth-specific | Low | No hero |
| Password Setup | No page hero identified | Auth-specific | Auth-specific | Low | No hero |

Configured entries are in `vite.config.js`; `pages/debug-cases.html` is excluded. Landing is `index.html`.

## C. Design Token Analysis

`assets/css/shared.css` defines dark values in `:root` and light overrides under `body.light-theme`.

| Token | Dark | Light |
|---|---|---|
| `--page-bg` | `#071321` | `#f3f6fa` |
| `--surface` | `#0c1b2d` | `#ffffff` |
| `--surface-raised` | `#101f34` | `#f7f9fc` |
| `--text-primary` | `#f4f7ff` | `#182638` |
| `--text-secondary` | `#9cb1d0` | `#5d6f85` |
| `--text-muted` | `#8096b4` | `#718198` |
| `--border-color` | `#1b3552` | `#d7e0eb` |
| `--brand-primary` | `#348dff` | `#287cf3` |
| `--state-success` | `#19b987` | `#13845f` |
| `--shadow-card` | `0 16px 32px rgba(0,0,0,.12)` | `0 12px 28px rgba(35,57,82,.08)` |

Theme switching uses `body.light-theme`; Settings exposes a theme control. `dashboard.css` supplies the page background, while shared.css defines semantic variables and aliases. Hero CSS often bypasses them. Repeated literals include navy (#0b1a2c, #0d1d31, #10243a, #122b43), mint (#55d1aa), blue (#348dff/#54a9ff), and PO violet (#6953f7/#aaa0ff). Radii vary 14â€“18px and declared hero heights 150â€“204px.

## D. Detailed Findings

### H-01 â€” Dark register gradients persist in Light Theme

- **Pages:** All Cases, FIR Register, FIR Index, FIR StatusMap, PO Cases.
- **Problem/expected:** Literal navy gradients persist in light mode. Light-theme heading tokens can resolve to dark text over navy. Use a theme-aware surface or bounded branded treatment with validated contrast; preserve dark mode.
- **Root cause:** Page-specific hardcoded backgrounds; StatusMap inherits FIR Register styles.
- **Sources/selectors:** `assets/css/cases.css:30-37` `.cases-hero`; `assets/css/fir-register.css:2-9` `.fir-register-hero`; `assets/css/fir-index.css:1-2` `.fir-index-hero`; `assets/css/fir-statusmap.css:3-7`; `assets/css/po-cases.css:2-9` `.po-hero`.
- **Severity:** High.
- **Recommendation:** Map hero surface/text/border/shadow to existing theme tokens; scope light overrides to `body.light-theme`.
- **Dark regression risk:** High if base selectors or gradients are replaced globally.

### H-02 â€” PO Cases uses a violet accent system

- **Page:** PO Cases.
- **Problem/expected:** Eyebrow, title emphasis, icon, and ornament use violet unlike sibling blue/green registers. Align with existing identity unless there is a semantic reason for violet.
- **Root cause/source:** Page-level literals in `assets/css/po-cases.css:2-16`; selectors `.po-hero`, `.po-eyebrow`, `.po-hero h1 em`, `.po-hero-mark`.
- **Severity:** Medium. **Recommendation:** Map to existing brand/state tokens and validate icon contrast. **Dark risk:** Medium; global replacement changes dark rendering.

### H-03 â€” Accent and subtitle literals are not consistently theme-aware

- **Pages:** FIR Register/StatusMap, All Cases, FIR Index, Disposed Cases, Landing.
- **Problem:** Mint/blue accents, subtitles, and landing palette are hardcoded; some are tuned to dark surfaces. Landing defines a separate dark-only token set.
- **Root cause/sources:** Page-specific literals in `assets/css/fir-register.css:7-9`, `cases.css:33-38`, `fir-index.css:5-12`, `disposed-cases.css:8-12,80-84`, and `landing.css:1`.
- **Severity:** Medium. **Recommendation:** Define semantic theme-specific accent roles and measure final composite contrast. **Dark risk:** Medium.

### H-04 â€” Notebook pages are visual exceptions

- **Pages:** All Judges, Manage IO, Register Diary.
- **Problem:** Fixed paper surfaces and serif typography diverge from app-shell styling. Confirm and document whether this is intentional; keep content and controls readable in both themes.
- **Root cause/sources:** Fixed page colors in `assets/css/all-judges.css` (`.judges-book`), `assets/css/manage-io.css` (`.io-book`), and `assets/css/register-diary.css:10-34` (`.diary-book`, `.diary-page`).
- **Severity:** Low; design question, not a demonstrated contrast defect. **Recommendation:** Retain if intentional and document theme behavior. **Dark risk:** Low untouched; medium for shared changes.

### H-05 â€” Responsive geometry is page-specific and unverified

- **Pages:** All 14 hero/header regions.
- **Problem:** Breakpoints differ (560, 680, 780, 800px); route-wide visual review did not establish wrapping, control collisions, or overflow.
- **Root cause:** Independent page rules. **Sources:** Hero styles above, `assets/css/disposed-cases.css:129-154`, notebook styles.
- **Severity:** Medium, verification gap only; no specific overflow is claimed.
- **Recommendation:** Verify 360, 390, 430, 768, 1024, 1280, 1440, 1920px in both themes. **Dark risk:** Medium if responsive rules are consolidated.

### H-06 â€” Contrast and focus are not measured

- **Pages:** All with hero actions, year controls, or interactive icons.
- **Problem:** Source contains some `:focus-visible` styles, but browser focus, hover, disabled states, and gradient contrast were not verified. No ratios are claimed.
- **Root cause/source:** Incomplete browser verification; literal colors complicate source-only assessment. `--focus-ring` is in `assets/css/shared.css`.
- **Severity:** Low, unverified rather than confirmed failure.
- **Recommendation:** Measure composited colors and test keyboard focus/states against WCAG 2.2 AA. **Dark risk:** Medium if global focus tokens change.

## E. Screenshot Evidence

No new screenshots are included. A local Vite server was started, but navigation stalled after the first route. A stable multi-page capture session and the requested 8-width Ã— 2-theme matrix could not be established. Existing screenshots are from other audit scopes and are not evidence for this report.

Findings are source-based, not browser-rendered; no contrast ratios are claimed. A full browser pass is required before implementation is visually validated.

## F. Recommended Design Specification

Recommendations only; no tokens or styles changed.

| Role | Candidate HEX | Guidance |
|---|---|---|
| Light hero surface | `#FFFFFF` | Existing shared surface |
| Light secondary surface | `#F7F9FC` | Subtle endpoint |
| Light border | `#D7E0EB` | Existing theme border |
| Primary text | `#182638` | Existing light text |
| Supporting text | `#5D6F85` | Existing light secondary text |
| Blue accent | `#1E68D5` | Existing brand-hover value; validate small text |
| Green accent | `#087347` | Existing disposed-status text; semantic use |
| Focus indicator | `#287CF3` | Existing light brand; verify adjacent contrast |

Prefer restrained low-opacity blue/green tint over a saturated full-card gradient. Retain current page content and icon concepts. A 16â€“18px radius, 24â€“32px desktop padding, and 18â€“22px mobile padding are useful starting points. Preserve page-specific height needs. Candidate colors require final contrast checks.

## G. Implementation Plan

1. Complete browser rendering and screenshots across routes, themes, and requested widths.
2. Confirm notebook and landing treatments are intentional.
3. Fix shared causes first: theme-aware register surfaces and text/accent roles; preserve dark selectors.
4. Align PO accents with blue/green while retaining page meaning.
5. Change welcome headers only if visual review confirms an issue.
6. Recheck contrast, focus, hover/disabled, responsive behavior, dark regression, and functionality.
7. Obtain explicit authorization before source changes.

## H. Regression Test Plan

- Render every active route in both themes at 360, 390, 430, 768, 1024, 1280, 1440, and 1920px.
- Capture hero and full-page screenshots labeled by route/theme/viewport.
- Compare dark backgrounds, gradients, typography, borders, shadows, buttons, and focus rings to baseline.
- Check wrapping, action alignment, year controls, icon clipping, and horizontal overflow.
- Measure normal/large text contrast over final composites; check applicable non-text contrast and keyboard focus under WCAG 2.2 AA.
- Keyboard-test hero actions; inspect hover/disabled states where present.
- Check console and route loads using isolated test data; avoid production writes.
- Confirm content, permissions, data, and functionality remain unchanged.

## Scope

No Firestore records/rules were inspected or changed. No application source was modified, no build was run, and end-to-end behavior was not verified. This audit does not authorize implementation.
