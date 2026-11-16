# CaseTrack — Phase 2B Responsive Audit Report

## Viewport matrix

All 12 Operator routes were authenticated and captured in both light and dark themes at every target viewport. Admin Panel, Password Change, and the Password Setup invalid/unavailable state were also captured at each size in both theme settings. Final verification now adds populated Admin data at every size/theme. The valid setup form remains blocked by missing HTTP handlers; its new captures still show the unavailable-link state.

| Viewport | Operator routes | Admin Panel | Password Change | Password Setup |
|---|---|---|---|---|
| 320×700 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 375×812 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 430×932 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 768×1024 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 1024×768 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 1366×768 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |
| 1920×1080 | Rendered, hydrated; light and dark | Data rendered; light/dark | Form reached | Invalid/unavailable state |

Viewport mapping and filenames are documented in [SCREENSHOT-INDEX.md](SCREENSHOT-INDEX.md); the exact screenshot inventory and smoke results are in [phase2b-browser-evidence.json](screenshots/phase2b-browser-evidence.json).

## Rendered observations

### Dashboard

- At 320 px, KPI cards and lower panels stack vertically in both themes.
- “Case Trends” collides with its period selector at 320 px (UX-013).
- Chart labels and the adjacent status legend are cramped and small at 320 px (UX-014).
- Two synthetic hearings and dashboard totals render after data hydration.

### Cases and FIR registers

- All Cases displays six synthetic rows after hydration. At 320 px the table shows its first few columns, while court/date/action fields are outside the visible area; there is no persistent horizontal-scroll cue. This confirms UX-009.
- FIR Index similarly places later columns outside the visible 320 px region (UX-009).
- FIR Register's narrative FIR details stack in mobile view, but its accused table still extends beyond the phone-width card.
- PO Cases uses a readable mobile row presentation for the synthetic PO record. Disposed Cases remains a dense register on mobile.

### Register Diary

- The notebook/calendar presentation renders across the viewports.
- On the selected 14 Dec 2026 date, a synthetic hearing is visible at desktop. At 320 px, judge/court text, status controls, and the FIR link overlap (UX-015).

### Other pages

- FIR Status Map and Report show synthetic status and summary data.
- Judges and IO lists render two records each; Settings controls render without saving changes.
- Password Change is reached through the must-change-password login flow. Password Setup's active synthetic registry token did not reveal the form because the validator handler is absent (HTTP 404).
- Final Admin Panel displays two synthetic users and one station in all 14 states. Document width equals viewport width. Users table widths/containers at 320/375/430/768/1024 are 960/260, 960/315, 960/370, 960/704, and 960/688 px, respectively; existing UX-009 applies. Forms stack without page-wide overflow. Manage dialog is transparent at 320/1366 in both themes (UX-016); light-theme table contrast is poor (UX-017).

## Evidence limits

The route smoke confirmed all Operator routes at 1366×768 after data hydration and produced zero browser page errors. Browser screenshots were used for layout review. The initial Operator run did not measure keyboard, touch, screen readers, zoom, or contrast. The final Admin pass added targeted label, dialog keyboard, and two table contrast checks; broader coverage remains unverified. No accessibility conformance claim is made.

## Remaining follow-up

Node 22.23.5 and Admin data verification are completed. The remaining valid Setup matrix requires a separately approved backend change to provide its missing validator/completion handlers. Keep the demo project, existing rules, and synthetic data. Targeted Admin dialog/label/contrast checks are in the [final report](PHASE-2B-FINAL-VERIFICATION.md); broader accessibility remains unverified.
