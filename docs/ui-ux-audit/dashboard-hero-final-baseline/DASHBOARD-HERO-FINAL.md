# CaseTrack Dashboard Hero — Final Approved Baseline

**Baseline date:** 24 November 2026  
**Visual design:** APPROVED  
**Responsive design:** APPROVED at all ten listed widths in Dark and Light themes  
**Design baseline:** FROZEN  
**Production release:** NOT AUTHORIZED

Owner approval freezes the current Green + Blue Hero design. It does not authorize production release or deployment. Do not make further Hero visual changes without separate owner approval. Application source was not edited for this documentation consolidation.

## Approved implementation and design

Preserve the current Dark and Light theme appearance, background and ambient lighting, border and selective edge lighting, courthouse illustration and ground integration, metallic divider, typography, icons, badges, date, New Case behavior and responsive layout. Preserve the owner-selected **Officer!** label and time-based greeting.

### Layout, surface, and theme colors

Source: assets/css/dashboard.css, .dashboard-hero selectors around lines 2119–2309. Hero colors are mostly literal CSS values rather than shared theme tokens. The --hero-navy declaration is #081d2d in Dark Theme and #f5f9fd in Light Theme.

- Desktop grid is 50% / 28% / 22%; height 178px; bottom margin 24px; 1px border; 24px radius; overflow hidden; isolated stacking context.
- Dark background declaration: radial-gradient(ellipse 37% 15% at 64% 101%, rgba(64, 166, 192, .18) 0%, rgba(41, 118, 148, .09) 52%, transparent 100%), radial-gradient(ellipse 38% 135% at 64% 83%, rgba(42, 115, 164, .43) 0%, rgba(22, 75, 112, .21) 42%, transparent 76%), radial-gradient(ellipse 24% 42% at 64% 105%, rgba(43, 126, 145, .2) 0%, transparent 74%), linear-gradient(112deg, #061827 0%, #0b2943 54%, #08192d 100%).
- Dark border #367f9e; shadow 0 5px 14px #0209142e; inset top #a3e9f29e, bottom #58b6ce85, inner line #21465d38. Selective top edge is 1px high and 36% wide, pale cyan fading to transparent.
- Light background declaration: radial-gradient(ellipse 37% 15% at 64% 101%, rgba(99, 164, 188, .12) 0%, rgba(92, 151, 178, .06) 52%, transparent 100%), radial-gradient(ellipse 38% 135% at 64% 83%, rgba(88, 151, 197, .2) 0%, rgba(92, 151, 193, .08) 42%, transparent 76%), radial-gradient(ellipse 24% 42% at 64% 105%, rgba(82, 157, 178, .1) 0%, transparent 74%), linear-gradient(112deg, #f8fbff 0%, #eef5fb 54%, #f8fbff 100%).
- Light border #b8d2e5; shadow 0 5px 14px #31597916 with inset white top, #a9d2e2 bottom and #d9eaf744 inner line; top edge fades from white.

### Typography and metadata badges

Desktop heading: Inter, "Segoe UI", Arial, sans-serif; 31px, weight 700, line-height 1.2, letter-spacing -.3px. Subtitle: 17.5px, weight 450, line-height 1.25; dark #c3d5e7, light #536b82. At 360px measured heading is 700 19px/22.8px and badge text 600 11px/11px.

Desktop badges use min-height 38px, padding 5px 12px, icon gap 8px, border 1px solid #347694, 999px radius, navy two-stop surface gradient, subtle inset highlight, 13px weight-600 text and 10px group gap. Icons are 21px with dark stroke #91efc9. Light badges use #c5d8e7 border, white-to-#f4f8fc surface, #243e55 text and #168e79 icon stroke. Responsive rules reduce badge min-height to 36px and adjust padding and type.

Station badge cap is min(100%, 240px); for hero containers 1041–1099px it is min(100%, 175px). The label is nowrap, overflow hidden and visually ellipsized; full text remains in the DOM.

### Courthouse artwork

- Runtime asset: assets/images/dashboard-courthouse-lush-gardens.webp
- Dimensions 1547 × 774px; file size 321,610 bytes.
- SHA-256 B25310BDDCD708C5822ED8EA9EF6743E4340CE38EB6159BAE912619F5688D7C4. The source was cropped to visible artwork with safety padding and encoded as quality-94 WebP; no redraw or recoloring was used.
- WebP preserves the supplied transparent alpha; source crop included safety padding and quality-94 encoding. Artwork was not redrawn or recolored.
- Base CSS: width and height 100%, object-fit contain, object-position center bottom, scale(1.12), transform origin right bottom. At max-width 1100px: max-height 150px and transform none. At 901–1100px: max-height 136px. Container widths 1000–1099px scale 1.15; 1100–1257px scale 1.08; 1258px+ reset transform.
- At 1366px, measured hero 1066 × 178px and artwork box 298 × 176px. At 1024px, flag starts about 7.75px below the hero border. Wrapper is aria-hidden and image alt is empty because artwork is decorative.

### Metallic diagonal divider

.dashboard-hero-divider: left 47.5%, width 2.1%, top and bottom -10%, skewX(-27deg). It uses crisp metallic navy/blue/teal/cyan gradient stops, 1px border edges and inset highlights; Light Theme uses muted metallic blue/teal. It is hidden by the dashboard-hero container query through 1040px and by the max-width 900px media rule. Preserve angle, width, colors, position and container visibility.

### Dynamic content and New Case

Source: pages/dashboard.html; assets/js/dashboard.js; components/add-case/add-case.js.

- Local time chooses Good Morning at 05:00–11:59, Good Afternoon at 12:00–16:59, Good Evening at 17:00–20:59, otherwise Welcome Back. Owner-selected name remains Officer!.
- Date uses en-GB weekday/day/month/year formatting. Week and April-start financial year use existing calculations.
- Station presentation uses loaded dashboardStationNames: one name, “N stations”, or “Station unavailable”.
- New Case is the native button with data-open-add-case and type button. Desktop size 195 × 55px; dark gradient #32d77b to #9bf5c4, border #b4f5d2, 18px radius; light gradient #3caf88 to #80d8b3, border #76cbaa. Existing focus-visible outline is 3px with 3px offset; global hover adds the existing lift, shadow and brightness. Delegated click opens the existing Add Case dialog.
- Synthetic browser checks previously verified focus, Enter and click opening the dialog at 390px and 1366px in both themes; no save action was performed.

### Accessibility and station-name handling

Hero section has aria-label “Dashboard overview”. Sun, badge, date, courthouse and divider artwork are decorative and hidden from assistive technology; officer SVG has accessible name “Police officer”. New Case remains a native keyboard-operable button with visible focus indication. Long station synthetic fixtures at 390, 1024 and 1366px in both themes showed bounded badges and visual ellipsis while full label text stayed in the DOM.

Authenticated station-name resolution remains **PENDING**. Synthetic local fixtures did not read or write Firestore.

## Approved responsive baseline

CSS/browser geometry from the latest standard fixture; these are baseline measurements, not fixed requirements for all content states. Fractional CSS heights rasterize to whole PNG pixels.

| Viewport | Hero dimensions | Courthouse | Divider |
|---:|---:|---|---|
| 360px | 332 × 220.25px | Hidden | Hidden |
| 390px | 362 × 221.5px | Hidden | Hidden |
| 430px | 402 × 202.5px | Hidden | Hidden |
| 560px | 532 × 202.5px | Hidden | Hidden |
| 768px | 740 × 208.5px | Visible | Hidden |
| 1024px | 724 × 216.75px | Visible | Hidden |
| 1280px | 980 × 178px | Visible | Hidden |
| 1366px | 1066 × 178px | Visible | Visible |
| 1440px | 1140 × 178px | Visible | Visible |
| 1920px | 1444 × 178px | Visible | Visible |

Relevant media breakpoints: 1100px, 900px, 560px, 380px, 390px, 431–560px and 901–1100px. Hero container-query ranges: 1000–1099px, 1041–1099px, 1100–1257px, 1258px and wider, and max-width 1040px. Keep the existing container-based divider visibility rule.

## Approved screenshot and measurement evidence

Latest comparison sheets are co-located with this document. They show the owner-approved Officer! greeting and both themes at native proportions:

- [01-MOBILE-RESPONSIVE-REVIEW.png](01-MOBILE-RESPONSIVE-REVIEW.png) — 360, 390, 430 and 560px.
- [02-TABLET-RESPONSIVE-REVIEW.png](02-TABLET-RESPONSIVE-REVIEW.png) — 768 and 1024px.
- [03-DESKTOP-RESPONSIVE-REVIEW.png](03-DESKTOP-RESPONSIVE-REVIEW.png) — 1280, 1366, 1440 and 1920px.
- [measurements.json](measurements.json) — latest authoritative 20 standard theme/viewport measurements and synthetic station-name / CTA interaction evidence.

The latest saved package contained 20 before and 20 after individual PNGs. Comparison sheets retain the visual evidence; the measurement JSON retains geometry, overflow and interaction evidence. No active automated visual-regression test consumes individual hero screenshots. The obsolete Hero-only artifacts were manually removed by the project owner and post-cleanup verification confirmed all 450 inventoried candidate files are absent. This directory contains only the three approved comparison sheets, this final document and the authoritative measurements JSON. No new captures were generated.

## Visual regression checklist

For future Dashboard changes compare both themes at all ten widths above. Check hero size, approved typography and alignment, subtitle readability, badge layout/wrapping, date and New Case alignment, courthouse/divider visibility and clearance, background/theme lighting, overflow, clipping, overlaps and long synthetic station names. Verify native New Case click, Enter and visible focus behavior. Review source diffs for unintended Hero or protected pie-chart impact. Keep visual approval distinct from release approval.

## Final verification

- Production build: **PASS** — npm run build; Vite 8.3.0, 116 modules transformed. Existing advisory for chunks over 500 kB.
- Automated tests: **62 passed / 1 failed** (63 total). Known unrelated status-map failure: test/fir-statusmap.test.mjs:47, assertion at line 60 expects #5B8DEF but receives undefined. It was not fixed.
- git diff --check: **PASS**, with line-ending warnings for existing unrelated files.
- Post-cleanup verification: **PASS** — all 450 inventoried obsolete files are absent; the final baseline folder contains exactly five approved artifacts; all retained links resolve; the canonical snapshot and all five SHA-256 checksums match.
- Existing responsive measurement file reports document width equal to viewport width across standard captures. CTA and long-label evidence is from prior isolated synthetic runs, not authenticated app data.
- Authenticated station-name resolution: **PENDING**. Production release: **NOT AUTHORIZED**.

## Selective rollback and recovery snapshot

Canonical recovery snapshot retained: [.release-local/dashboard-hero-approved-baseline-20261124](../../../.release-local/dashboard-hero-approved-baseline-20261124/). It includes copies of current dashboard.css, dashboard.html, dashboard.js, approved courthouse WebP and previous courthouse WebP, plus [checksums.json](../../../.release-local/dashboard-hero-approved-baseline-20261124/checksums.json). Post-cleanup verification confirmed that the five recorded snapshot/source SHA-256 pairs still match. The unrelated `.release-local/backup-state.json` was retained.

For recovery, compare hashes and selectively restore only the .dashboard-hero CSS rules, Hero section markup, updateTodayDate/updateDashboardHero functions or artwork as required. Never replace a whole application stylesheet, markup or JavaScript file; that could overwrite unrelated working-tree edits. Review current diffs first, preserve unrelated changes, then run build, tests and the responsive matrix.

Snapshot source hashes captured before cleanup:

| File | SHA-256 |
|---|---|
| pages/dashboard.html | C090FC327380FDB5126CF622A03D31614233AD1FFEF3DD2BD212408B459DDF0A |
| assets/css/dashboard.css | AD9984CDAA5C30D343F0DB19B5406F576A9F5F02523336C812DC3A3EA32555C5 |
| assets/js/dashboard.js | 276FCC93097A109198DD257744153100FA4862F668DF5D4FE37DCBB83DF858B4 |
| assets/images/dashboard-courthouse-lush-gardens.webp | B25310BDDCD708C5822ED8EA9EF6743E4340CE38EB6159BAE912619F5688D7C4 |
| assets/images/dashboard-courthouse.webp | A3BC1227FEBB6188C57B59782DA516CD2726CA90E9770E03A08A882D16C34DBD |

## Consolidation and retained uncertain artifacts

The previous seven separate final-baseline documents have been consolidated here. The project owner manually removed the 450 obsolete Hero-specific documents, capture artifacts, temporary files and superseded snapshots listed in the approved cleanup inventory. Post-cleanup checks found no remaining candidates. The general screenshot index, cross-page hero audits, active application assets and unrelated backup state remain retained.

**Design status:** DESIGN APPROVED · FROZEN · CLEANUP COMPLETE. **Release authorization:** NOT AUTHORIZED. Authenticated station-name verification remains PENDING.

<!-- After-cleanup checksum comparison: verify the five files above match their current SHA-256 values; source files are frozen and must not be changed by cleanup. -->


