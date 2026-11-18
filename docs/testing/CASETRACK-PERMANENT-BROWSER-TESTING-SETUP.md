# CaseTrack Permanent Browser Testing Setup

**Status: PARTIAL — repeatable, isolated Playwright infrastructure is working; existing Add Case UX defects and unapproved visual baselines remain.**

Updated: 2026-11-18

## What changed

This phase adds repository-managed Playwright Test and Firebase Emulator execution for Windows. The app's production source, business logic, Firebase production configuration, and production rules were not changed. Existing worktree changes were preserved.

The tests start their own Vite server at `http://127.0.0.1:5185/CaseTrack/` and Auth/Firestore emulators at `127.0.0.1:9099` and `127.0.0.1:8080`. They sign in through the regular CaseTrack login page using a randomly generated synthetic account. They do not reuse an external Chrome tab, bypass authentication, or submit a case.

## Root cause analysis

The recurring failures had more than one cause:

- Chrome was installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`, but the previous computer-control host was unavailable. This was a browser-control-host issue, not a missing system Chrome installation.
- Playwright Test was not a root project dependency, and the current environment did not have its matching Playwright Chromium binary installed. A nested package did not provide a reproducible project-level setup.
- The known Vite URL responded on `localhost:5173`, while the same server was not reachable on `127.0.0.1:5173`. Hostname/address-family behavior made it an unreliable automation endpoint.
- CaseTrack's normal Firebase config targets production project `casetrack-97a4e`; authenticated UI tests therefore needed a separate, fail-closed test entry point and synthetic account.

The setup addresses each condition separately: it locks Playwright and Firebase CLI in the project, installs Playwright's matching Chromium, starts Vite on strict IPv4 loopback at port 5185, and substitutes emulator-only Firebase/Functions modules in a dedicated test build.

## Files added or changed

- `package.json`, `package-lock.json`: pinned test dependencies and commands.
- `playwright.config.js`: Chromium project, deterministic locale/timezone/viewport/scale, retries on CI, timeouts, HTML/JSON reporters, failure screenshots/traces, and owned local servers.
- `vite.e2e.config.js`: dedicated `test` mode, strict loopback server, emulator config alias, and local Functions stub alias.
- `firebase.e2e.config.json`: demo-project Auth and Firestore emulator ports and existing test rules.
- `e2e/playwright/global-setup.js`: credential/environment guards and random synthetic Auth/role fixture creation.
- `e2e/playwright/helpers.js`: normal-UI login, test-mode verification, and a browser network allowlist.
- `e2e/fixtures/firebase-functions.test.js`: prevents the production Functions endpoint resolver from being used in E2E.
- `e2e/playwright/isolation.spec.js`, `smoke.spec.js`, `add-case.spec.js`, `visual-matrix.spec.js`: isolation, smoke, Add Case regression, and responsive screenshot tests.
- `scripts/check-playwright-browser.mjs`: browser readiness check.
- `docs/testing/evidence/`: six representative Chromium screenshots retained for review.

No application source file was modified for this infrastructure phase. The existing `firestore.test.rules` is reused; production rules were not changed. `.gitignore` already excludes generated `test-results/` and `playwright-report/` outputs, so no ignore change was needed.

## Isolation design

The test Vite config aliases `@config/firebase-config.js` to `firebase/firebase-emulator-config.js`. That module throws unless Vite is in `test` mode and the project ID is exactly `demo-casetrack-date-regression`. Auth and Firestore point to `127.0.0.1` only. The production Functions endpoint resolver is replaced with a test stub that keeps any accidental request on the local test origin.

Before fixtures are created, global setup refuses a non-demo `GCLOUD_PROJECT` and refuses execution if `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_TOKEN`, or `FIREBASE_CONFIG` is present. A browser route guard allows only the test Vite origin and the two emulator origins; requests to every other origin are aborted. The isolation test checks the runtime project marker and records blocked origins. Tests perform authentication through the regular login UI with a new `@example.test` user and synthetic role/station data.

The app's Firestore listener emitted `WebChannelConnection` / “Could not reach Cloud Firestore backend” warnings during browser runs, even though the emulator started and the UI tests continued. These requests were to the local emulator and were never redirected to production. Backend-backed business workflows are not considered verified by these UI-only checks. Firebase CLI also made its public CLI metadata request to `firebase-public.firebaseio.com` on startup; this is CLI metadata, not CaseTrack production data.

## Installation and running on Windows

Use a clean PowerShell session for E2E. Do not set cloud credential variables for these commands. The test setup deliberately fails if credential variables are present.

```powershell
npm ci
npm exec -- playwright install chromium
npm run test:e2e:ready
npm run test:e2e:isolation
npm run test:e2e:smoke
npm run test:e2e:interaction
npm run test:visual
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:report
```

`npm ci` uses the committed lockfile. Install Chromium once per Windows/Codex environment with the command above; browser downloads are not shared between environments. Firebase CLI needs Java to run Firestore Emulator; this environment used the already installed Java 21. The first emulator start may fetch the Firestore emulator JAR if it is not cached. Do not point this configuration at a production project or production emulator export.

The Playwright config owns both servers, so do not start `npm run dev:e2e` or a Firebase emulator separately before invoking the tests. It binds to fixed ports 5185, 9099, and 8080 with strict port handling. If a port is occupied, stop the process that owns that local test port and retry. Do not change production Firebase settings or system-wide Chrome settings to work around a local port issue.

Useful individual commands:

| Command | Purpose |
| --- | --- |
| `npm run test:e2e:ready` | Launch Chromium, render a tiny local page, and print its version. |
| `npm run test:e2e:isolation` | Verify the demo project marker and reject non-local browser origins. |
| `npm run test:e2e:smoke` | Sign in with synthetic UI credentials, open Cases, assert the app shell, save a screenshot, and close Chromium. |
| `npm run test:e2e:interaction` | Run Add Case navigation, Witness, Reset, action-bar, and keyboard checks. |
| `npm run test:visual` | Capture the Add Case Witness section at seven widths in both themes. |
| `npm run test:e2e` | Run the complete Playwright suite. This currently exits nonzero while the documented UX regressions remain. |
| `npm run test:e2e:headed` | Run the suite in a visible Chromium window for debugging. |
| `npm run test:e2e:report` | Open the most recent HTML report. |

If `test:e2e:ready` reports a missing executable, install the matching browser with `npm exec -- playwright install chromium`; do not download a different Chrome version or change system Chrome. If global setup refuses because cloud credentials are present, use a clean terminal with those variables absent; do not weaken the guard.

## Verification results

| Check | Result | Details |
| --- | --- | --- |
| Playwright/Chromium readiness | PASS | Playwright Test 1.64.1; Chromium 156.0.8078.4 launched and closed. |
| Emulator isolation | PASS | 1/1 test; project marker was `demo-casetrack-date-regression`; browser origin guard active. |
| Browser smoke test | PASS | 1/1 test; Chromium opened the local Vite app through the normal UI login, found the Cases shell, saved a real screenshot, and closed. |
| Visual viewport/theme matrix | PASS | 14/14 tests: 320, 375, 430, 768, 1024, 1366, and 1920 px in light and dark themes. Device scale 1. Witness card bounds stayed inside the viewport and the document had no horizontal overflow. |
| Add Case interaction suite | PARTIAL | 3/7 pass; 4/7 fail on the UX defects listed below. |
| 320 px keyboard/sticky-footer reachability | PASS | Tab reaches Add Another Witness; browser scrolls it fully above the sticky action footer; document width remains within 320 px. |
| Existing unit tests | PASS | 60 passed, 0 failed, 0 skipped. |
| Production build | PASS | `npm run build` completed. Existing warning: several generated chunks exceed 500 kB. |
| Syntax checks | PASS | All new E2E config, helper, fixture, and spec files passed `node --check`. |
| `git diff --check` | PASS | No whitespace errors in the final worktree diff. |

### Interaction failures observed

The tests exercise the actual local CaseTrack Add Case UI and use synthetic values only.

1. **Section active marker:** the Witness heading reaches the viewport, but its navigation link does not receive `aria-current="location"`; the Accused link remains highlighted in the captured state. Evidence: [Witness navigation screenshot](evidence/witness-nav-highlight-not-updated.png).
2. **Reset dialog focus:** the confirmation dialog opens, but the expected initial focus on “Keep Editing” does not occur. Soft Tab/Shift+Tab focus assertions also report an unexpected active element. The test continues through the reset flow and observes the reset result. A later screenshot after the dialog closes shows focus back on the FIR Number field: [Reset flow screenshot](evidence/reset-confirmation-focus-failure.png).
3. **Reset leaves dynamic entries:** after confirming Reset, dynamic Witness and Accused cards remain (2 cards observed where 1 original template is expected).
4. **Reset leaves in-memory draft:** after confirming Reset, the local case-record list still contains the synthetic Chargesheet draft (1 item observed where 0 is expected).

The date and Witness-select Keep Editing checks execute, but the combined date/select/Accused test ultimately fails because the additional Accused card remains after Reset. The select is changed after selecting Chargesheet, which already marks the form dirty, so a select-only dirty trigger is not independently established. The pristine Reset click, dialog dismissal, and mobile/desktop action visibility checks execute in the suite.

Passing screenshots include [320 px light](evidence/visual-witness-320-light.png), [320 px dark](evidence/visual-witness-320-dark.png), [1920 px light](evidence/visual-witness-1920-light.png), and [320 px keyboard-reachable Add Witness](evidence/mobile-witness-add-control-320.png). The full 14-image matrix is regenerated under ignored `test-results/` whenever `npm run test:visual` runs.

## Visual baseline status

The current matrix captures real Chromium screenshots and checks theme state, document overflow, and Witness-card viewport bounds. It does **not** compare pixel output against approved committed baselines yet. No baseline was automatically approved or updated. Baseline review is still required before enabling screenshot-diff assertions, especially for fonts, platform rendering, and modal scroll position. Until that review is complete, call this responsive screenshot coverage rather than full pixel-diff visual regression.

Generated failure screenshots, traces, JSON results, and HTML reports are written to ignored `test-results/` and `playwright-report/`. The configuration retains traces on failure and provides list, HTML, and machine-readable JSON reporters. Six representative images are kept in `docs/testing/evidence/`; the full matrix remains reproducible without checking in 14 additional binaries.

## Remaining gaps and next steps

- Have the UI owner review the active-section marker and Reset behavior failures before any application-source fix.
- Correct and re-run the UX tests after those owner-reviewed fixes; do not skip or soften these assertions to make the suite green.
- Review visual examples and choose approved screenshot baselines; then add screenshot-diff assertions and a manual-only baseline update workflow. Do not update baselines automatically in regular tests.
- Run screen-reader testing and a real device/safe-area test separately. Chromium emulation does not prove behavior on physical iOS/Android devices.
- Investigate the local Firestore Emulator WebChannel warnings before treating realtime/backend-backed flows as verified.
- Accessibility checks here use DOM/ARIA assertions and keyboard interaction; no screen-reader engine or automated axe scan was run.

## Instructions for future Codex sessions

Read this file before browser work. Run `npm run test:e2e:ready` first. Use the repository scripts so Playwright starts its owned test servers and fail-closed isolation checks. Never substitute the production Vite Firebase config or external Chrome tab for E2E. If the test-mode marker, credentials guard, or local-origin guard fails, stop and fix the test environment before opening authenticated pages. Inspect `test-results/results.json`, the HTML report, failure screenshots, and traces before changing assertions.

The current setup is usable and repeatable, but the browser suite is expected to exit nonzero until the four documented Add Case UX failures are resolved and retested. This infrastructure phase did not fix those UI behaviors or close UX-002.

