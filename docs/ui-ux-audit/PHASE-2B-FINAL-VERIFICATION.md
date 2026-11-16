# CaseTrack — Phase 2B Final Verification

**Date:** 12 November 2026  
**Status: Incomplete.** The authenticated Admin Panel data view is verified. The valid Password Setup form remains blocked by missing backend endpoints. No UI fixes, application source changes, production configuration changes, or rule changes were made.

## Runtime and isolation

- System Node remained `v24.22.0`. No installed Node 22 or available nvm/fnm/nvs/Volta/asdf manager was found.
- Official portable [Node.js 22.23.5](https://nodejs.org/en/blog/release/v22.23.5/) was extracted into the temporary `.phase2b-runtime/` directory. Its Windows x64 ZIP SHA-256 matched `4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3`. No system PATH or installed Node runtime was replaced.
- Existing `firebase.admin-panel.local.json`, `firestore.admin-panel.rules`, installed Firebase CLI 14.27.0, Java 21, Functions dependencies, and Playwright 1.58.2 were reused. No package installation or repository configuration change was needed.
- Emulator project: `demo-casetrack-role-prototype`; Auth `127.0.0.1:9198`, Firestore `127.0.0.1:8187`, Functions `127.0.0.1:5003`. The Vite app used `role-admin-local` on port 5174 with these existing port overrides.
- Browser: installed Chrome `156.0.8078.80`, fresh Playwright contexts with service workers blocked and remote Firebase service requests guarded. No remote Firebase request was observed by those browser guards.
- Two synthetic `@example.test` Auth users (Admin and Operator), two `userRoles`, one synthetic police station, an Admin governance document, and one hashed setup-token registry entry were seeded locally. No FIR/court records were required for these two remaining screens. Earlier Operator-route case fixtures and their evidence remain documented in the initial Phase 2B audit.
- Fixture creation used the Admin SDK against explicit emulator hosts. Browser access used actual Login form authentication and existing role checks; no Firebase session or role was injected into the browser.

## Functions startup and endpoint results

The first Node 22 attempt selected the correct host runtime but failed discovery with this exact error:

```text
Failed to load function definition from source: FirebaseError: User code failed to load. Cannot determine backend specification. Timeout after 10000. See https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization'
```

Loading `functions/index.js` directly under Node 22 with emulator environment variables succeeded. Restarting with a process-local discovery timeout override loaded all eight current exports. The capture run initially used `FUNCTIONS_DISCOVERY_TIMEOUT=60000`; the CLI interprets this value in **seconds**, not milliseconds. A final startup check with the corrected `FUNCTIONS_DISCOVERY_TIMEOUT=60` also loaded all eight exports and returned the same 401/404 endpoint results; see [restart evidence](screenshots/phase2b-final-restart.json). No source change was made to obtain discovery. Warm filesystem/module caches and the timeout change were not independently isolated as causes of the successful retry.

The emulator reported `Using node@22 from host` and initialized:

```text
saveFirMaster
listUserRoles
policeStations
createOperator
resetOperatorPassword
completeOperatorFirstPasswordChange
manageUserRole
getMyAccess
```

| Endpoint | Executed check | Result |
|---|---|---|
| `getMyAccess` | GET without credentials; application Admin login | HTTP 401 without credentials; HTTP 200 through actual signed-in app |
| `listUserRoles` | GET without credentials; authenticated Admin page | HTTP 401 without credentials; HTTP 200 with two synthetic role records |
| `policeStations` | GET without credentials; authenticated Admin page | HTTP 401 without credentials; HTTP 200 with one synthetic station |
| `validateOperatorSetupCode` | POST with registered synthetic UID/token; browser preflight | HTTP 404; OPTIONS also 404, without `Access-Control-Allow-Origin` |
| `completeOperatorPasswordSetup` | POST with empty body to check handler availability | HTTP 404; no password operation occurred |

The remaining four exported write endpoints were discovered, but their write workflows were not executed. Endpoint bodies and browser diagnostics are retained in [phase2b-final-supplement.json](screenshots/phase2b-final-supplement.json). Selected runtime log lines are in [phase2b-final-runtime.txt](screenshots/phase2b-final-runtime.txt).

## Admin Panel verification

**Verified:** actual Admin login redirected to `admin-panel.html`; the page displayed “Showing 2 user-role records.” and one synthetic police station. The current Admin row, Operator row, role/status/station columns, Manage/reset actions, Create Operator form, and Police Station Master form/table rendered.

All seven sizes were captured in both themes: 320×700, 375×812, 430×932, 768×1024, 1024×768, 1366×768, and 1920×1080. The 14 data-view screenshots are `admin-panel-data-<width>-<theme>.png`. All were visually reviewed. Document width equaled viewport width in all 14 states; there was no page-wide horizontal overflow. The Users table remained 960 px wide inside containers as narrow as 260 px, with role/status/actions offscreen on smaller views. This extends existing UX-009 rather than creating a duplicate.

The shared shell, headings, field spacing, and responsive stacking render across the matrix. Desktop at 1366/1920 exposes all user columns. Narrower views require table panning; at 1024 the desktop sidebar also reduces available table width. The Admin form fields have associated labels in the captured DOM. Main page measurements and endpoint responses are in [phase2b-final-verification.json](screenshots/phase2b-final-verification.json).

Interaction checks used synthetic records and did not apply role changes or reset credentials:

- Manage opens the native dialog and initially focuses `roleManagementAction`. Tab reached the reason, Cancel, and Apply controls. One transition reported BODY focus before returning to the action selector; no background page control was observed receiving focus. This limited sequence is not a full focus-containment certification.
- Escape closed the dialog and restored focus to its Manage button.
- An empty Create Operator submission produced “Enter a valid email and select one police station.” without an account write.
- The Admin matrix produced no uncaught `pageerror` events. A transient `endpoint-unavailable` console message was recorded by Vite during reloads; subsequent authenticated loads returned 200 and all retained matrix captures show hydrated data. No zero-console-error claim is made.

## Password Setup blocker

**Not verified:** the valid form never became visible. The synthetic token was registered through the repository's existing `createSetupCodeRegistry`, and `isCurrentActiveToken` returned **true** for the active synthetic Operator. Token and credentials are absent from retained evidence.

The endpoint failure is exact and reproducible:

```text
Function us-central1-validateOperatorSetupCode does not exist, valid functions are: us-central1-saveFirMaster, us-central1-listUserRoles, us-central1-policeStations, us-central1-createOperator, us-central1-resetOperatorPassword, us-central1-completeOperatorFirstPasswordChange, us-central1-manageUserRole, us-central1-getMyAccess
```

`functions/index.js` exports neither `validateOperatorSetupCode` nor `completeOperatorPasswordSetup`. Repository search found these names in the frontend and older E2E expectations, but no current backend handler/export. The token registry helper alone does not expose an HTTP handler.

The browser's preflight received 404 and no CORS header. Chrome logged `No 'Access-Control-Allow-Origin' header is present on the requested resource`, then `net::ERR_FAILED`; the page displayed the expired/invalid/unavailable-link message and kept `#setupForm` hidden. This CORS symptom follows the missing route; weakening CORS or authentication would not establish a working handler.

Fourteen `password-setup-node22-<width>-<theme>.png` captures document the resulting blocked state. Light/dark preference pairs have identical file hashes at every size: this standalone page does not apply the authenticated theme preference. These are **not valid-form screenshots**. UX-011 remains open.

## New findings

| ID | Severity | Verified finding | Evidence |
|---|---|---|---|
| UX-016 | High | Manage account access dialog has a transparent surface in both themes. Background page text shows through behind its title, target, labels, and controls. Computed background is `rgba(0, 0, 0, 0)` and `--panel` resolves empty. | [1366 light](screenshots/admin-panel-dialog-viewport-1366-light.png), [320 dark](screenshots/admin-panel-dialog-viewport-320-dark.png); computed styles in supplement JSON |
| UX-017 | High | Admin light-theme tables have insufficient text contrast: station headings approximately **1.24:1**, user UID text approximately **2.33:1**. These are 12/13 px texts. | [1366 light](screenshots/admin-panel-data-1366-light.png), [320 light](screenshots/admin-panel-data-320-light.png); computed sRGB colors and calculation in supplement JSON |

Contrast used WCAG relative luminance on browser-computed colors. The station header's `rgba(16,31,52,0.9)` was composited over its opaque white panel and compared with `rgb(24,38,56)`. The first UID uses `rgb(169,158,255)` on white. These measurements cover these elements only, not whole-page accessibility conformance.

UX-001 through UX-015 are preserved. UX-009 now also has Admin table evidence. No issue was fixed or closed.

## Evidence and remaining work

This pass added **35 PNGs**: 14 Admin data views, 14 blocked setup states, two full-page Manage dialog captures, four viewport-only dialog captures, and one empty-form validation capture. All 231 earlier PNGs remain, for **266 total**. The screenshot index distinguishes previous shell/error evidence from the new Admin data view.

The valid Password Setup layout, labels, validation, success/error submission states, and one-time consumption remain unverified. Role mutations, credential-reset/provisioning success, pagination beyond two users, screen-reader output, complete keyboard traversal, zoom, and automated accessibility scans were not exercised. Earlier Operator-route checks remain as previously recorded; they were not repeated in this pass.

The remaining blocker requires a separately authorized backend source change or an approved existing implementation that provides both setup handlers. Current approval explicitly prohibits application source changes, so this audit does not implement those handlers. After that change, re-seed a synthetic active Operator/token and repeat the seven-size valid-form matrix and relevant interactions through the genuine endpoint.

## Cleanup

Synthetic Auth accounts and Firestore documents were explicitly cleared through the fixed demo emulator endpoints; both DELETE operations returned HTTP 200. Browser contexts were closed. Final service shutdown, temporary runtime/script/credential removal, and source-preservation checks are recorded in the current [environment status](AUDIT-ENVIRONMENT-STATUS.md).
