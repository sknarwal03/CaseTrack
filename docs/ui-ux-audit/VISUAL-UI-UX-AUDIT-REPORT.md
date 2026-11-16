# CaseTrack — Phase 2B Rendered Visual UI/UX Audit

**Audit date:** 12 November 2026  
**Overall status: Incomplete — authenticated Operator and Admin data views verified; valid Password Setup blocked by missing backend handlers.**  
**Method:** Existing local Vite mode and Firebase demo emulators, actual UI sign-in with synthetic users, Playwright/Chrome screenshots. No UI fixes were made.

## Current results

The initial Phase 2B run completed the 12 Operator routes with representative synthetic FIR/court data at seven viewports and both themes. The final verification made portable Node 22.23.5 available, loaded the existing Admin Functions, and verified the Admin Panel data view through actual login and role checks. Two synthetic user-role records and one station rendered.

Password Setup remains incomplete. A newly registered synthetic token was confirmed active by the existing registry helper, but the current Functions source exports neither `validateOperatorSetupCode` nor `completeOperatorPasswordSetup`. Both endpoints returned 404. The browser preflight failed and the setup form remained hidden. No missing backend behavior was mocked or implemented.

See [final verification details](PHASE-2B-FINAL-VERIFICATION.md) for exact startup errors, endpoint responses, browser evidence, test limits, and the remaining source-change approval requirement. See [environment status](AUDIT-ENVIRONMENT-STATUS.md) for isolation and cleanup.

## Coverage

| Measure | Result |
|---|---:|
| Operator route/viewport/theme captures | 168: 12 × 7 × 2, retained from initial run |
| Initial Admin shell / Password Change / blocked Setup captures | 42: 14 for each state, retained |
| Initial additional interactive captures | 6, retained |
| Initial Phase 2B screenshots | 216 |
| Earlier public baseline screenshots | 15, retained |
| Final Admin data-view captures | 14, verified |
| Final blocked Setup captures | 14; valid form NOT visible |
| Final Admin interaction captures | 7: six dialog captures and one empty-form validation |
| New final-verification screenshots | 35 |
| Total PNGs | 266 |
| Target sizes | 320×700, 375×812, 430×932, 768×1024, 1024×768, 1366×768, 1920×1080 |

All Admin data-view screenshots were visually reviewed. Document width matched viewport width at every size. Users tables require horizontal panning through 1024 px: at 320 px a 960 px table sits in a 260 px wrapper. This extends UX-009. The standalone Setup page does not apply theme preference; each light/dark screenshot pair is byte-identical and shows the same unavailable-link state.

## Retained Operator data results

The earlier run used four FIR masters covering Under Investigation, UCR, Under Trial, and Disposed, plus five linked proceedings, Lower/Session/JJB courts, a PO accused, hearing dates, two judges, and two investigating officers. No real records were used.

| Route | Earlier hydrated result |
|---|---|
| Dashboard | 4 FIRs, 4 proceedings, 2 active, 2 pending hearings, 1 disposed |
| All Cases | 6 records; captures refreshed after hydration |
| FIR Register / FIR Index | 4 masters / 4 FIRs |
| FIR Status Map | 4 total, one per UI/UCR/UT/Disposed state |
| PO / Disposed | 1 record each |
| Report | 4 unique FIRs, 1 disposed, 3 pending, 2 next hearings |
| Register Diary | Populated hearing reviewed on 14 December 2026 |
| All Judges / Manage IO | 2 records each |
| Settings | Preferences/account areas rendered without saving |
| Password Change | Actual must-change-password login reached the form; no submission |

The Operator smoke at 1366×768 had no uncaught page errors. These routes were not repeated during final Admin/setup verification. Original detailed evidence is preserved in [phase2b-browser-evidence.json](screenshots/phase2b-browser-evidence.json).

## Findings and interactions

UX-001–UX-015 remain preserved and open. The final pass adds:

- **UX-016, High:** Manage account access dialog has a transparent surface in both themes, making underlying page text collide visually with dialog labels/content.
- **UX-017, High:** Light-theme station headings measure approximately 1.24:1 contrast; user UID text measures approximately 2.33:1. Both are small table text.

The [visual issue tracker](VISUAL-ISSUE-TRACKER.md) includes exact screenshots, reproduction, impact, recommendations, and acceptance criteria. Existing UX-009 also applies to Admin tables; UX-011 continues to cover Setup styling. Missing backend setup handlers are tracked as a completion blocker, not a duplicate visual issue.

Manage dialog initial focus, Tab sequence, Escape closure, and focus restoration were exercised; Escape restored the invoking button. One Tab transition reported BODY focus before returning to dialog controls, so full focus containment is not certified. Empty Create Operator validation displayed the expected guidance without an account write. No role or password change was applied. Targeted form-label and computed table-contrast checks were performed; no broad accessibility conformance claim is made.

The final matrix had no uncaught page errors. Vite recorded one transient Admin endpoint-unavailable console message during reloads; later authenticated requests returned 200 and every retained Admin data capture was hydrated. Setup produced expected CORS/404 console errors. Current machine evidence is [browser matrix](screenshots/phase2b-final-verification.json) and [endpoint/style supplement](screenshots/phase2b-final-supplement.json).

## Completion boundary

Admin Panel is verified. Valid Password Setup layout, validation, success, and one-time use remain unverified. Completing it requires approved backend source work, which this audit explicitly excludes. Role mutations, provisioning/reset success, full pagination, screen readers, zoom, and complete accessibility testing remain outside the executed checks. All evidence is retained; local data/services and temporary credentials/runtime are cleaned up as recorded in the environment status.
