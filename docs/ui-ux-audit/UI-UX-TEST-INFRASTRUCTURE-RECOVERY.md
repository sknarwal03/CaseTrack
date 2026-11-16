# CaseTrack UI/UX Testing Infrastructure Recovery

**Status: Incomplete — screenshot capture is repaired locally; the authenticated E2E matrix and complete emulator test workflow are not verified.** This increment changes test tooling and documentation only. No application behavior, Firebase Rules, indexes, production configuration, or deployed resources were changed.

## Environment inventory

| Area | Existing setup | Requirement / finding |
|---|---|---|
| Root tests | `npm test` runs five Node test files. | 42 tests passed in this run. |
| Functions tests | `npm test --prefix functions` runs `functions/tests/*.test.cjs`; three suites opt into Auth/Firestore Emulator tests when emulator host variables are set. | Tests intentionally use several `demo-casetrack-password-*` project IDs. They need a fresh emulator configuration with `singleProjectMode` disabled. |
| Browser test | `e2e/admin-panel.browser.test.cjs` uses Playwright and installed Chrome; its expectations include older invite/recovery APIs and do not match the current Admin UI contract. | Do not use this historical script as evidence for UX-015/016/017. A separate current-page harness was added in `e2e/ui-ux.browser.test.cjs`; its result report was not retained, so no authenticated E2E pass is claimed. |
| Browser engine | Playwright 1.64.1; installed Google Chrome 157.0.8103.51. | Headless screenshots failed without render flags and succeeded with `--disable-gpu --disable-dev-shm-usage`. |
| Vite | `vite.config.js` has a `role-admin-local` server mode that aliases Firebase imports to `firebase/local-role-admin/firebase-config.js`. | The recovery runner sets ports 9198/8187/5003 and checks the transformed module before testing. Production mode is not used for the test server. |
| Firebase project | `.firebaserc` defaults to `casetrack-97a4e` (production). `firebase.admin-panel.local.json` selects loopback ports 9198/8187/5003 but has `singleProjectMode: true`. `firebase.json` uses 9099/8080/5001. | Always pass a `demo-*` project explicitly and use the local Vite mode. Never seed through the production alias. |
| Emulator source/runtime | `firebase.admin-panel.local.json` points to the root `functions` package, which declares Node 22. The prototype launcher starts its own emulator configuration on different ports. | This host has Node 24.22.0 system-wide; the existing npm-cached Node 22.23.5 runtime is used for Firebase CLI and Functions discovery. `FUNCTIONS_DISCOVERY_TIMEOUT=60` is set for emulator startup. |
| Data setup | Existing Admin E2E uses the Firebase Admin SDK to create Auth identities and Firestore roles; the browser signs in through the real Login form. | The new harness uses random `@example.test` identities and synthetic cases, and refuses to seed a project containing Auth users or root Firestore documents. No browser session or role is injected. |

## Screenshot failure diagnosis

The exact `Page.captureScreenshot: Unable to capture screenshot` error reproduced on a minimal static HTML page using headless Chrome 157.0.8103.51 through Playwright 1.64.1. Captures failed with Playwright's default launch flags. The same static capture passed when Chrome launched with `--disable-gpu --disable-dev-shm-usage`.

The corrected launch flags are scoped to the new E2E harness. They do not change product CSS or the visual result. Five real, nonempty PNGs were produced and decoded successfully:

- `screenshots/infrastructure-recovery/static-320-default.png` — 320×700 static diagnostic.
- `screenshots/infrastructure-recovery/landing-320-light.png` — 320×700 CaseTrack landing route.
- `screenshots/infrastructure-recovery/login-320-light.png` — 320×700 unauthenticated Login route.
- `screenshots/infrastructure-recovery/landing-1366-dark.png` — 1366×768 CaseTrack landing route.
- `screenshots/infrastructure-recovery/login-1366-dark.png` — 1366×768 unauthenticated Login route.

The requested authenticated 56-image matrix is not present. UX acceptance screenshots must still be captured from the relevant real Admin and Register Diary routes. The full audit screenshot directory currently contains 285 PNGs, including these five diagnostics.

## Emulator diagnosis and current blocker

The repository contains several test setups with different ports and source directories:

- `firebase.json`: Auth 9099, Firestore 8080, Functions 5001.
- `firebase.admin-panel.local.json`: Auth 9198, Firestore 8187, Functions 5003, root `functions` source, single-project mode enabled.
- `scripts/start-admin-panel-local.ps1`: starts the role-management prototype configuration on the default 9099/8080/5001 ports.
- `e2e/admin-panel.browser.test.cjs`: expects the root Functions/Admin test on 9198/8187/5003.

This port/config split can produce `auth/network-request-failed` when the browser and emulator launcher select different configurations. The Functions package also intentionally creates clients for multiple `demo-casetrack-password-*` projects; running that package against `firebase.admin-panel.local.json` produced single-project warnings and an overall exit code of 1.

During this run, Firebase CLI 14.27.0 started Auth, Firestore, and Functions on loopback under Node 22.23.5. Functions discovery loaded ten exports. The prior audit's 10-second discovery timeout and successful 60-second retry remain documented in `PHASE-2B-FINAL-VERIFICATION.md`; the timeout effect was not isolated from warm caches, so it remains a startup sensitivity rather than a proven sole root cause.

A new `firebase.ui-ux-local.json` config sets the established 9198/8187/5003 ports and `singleProjectMode: false`. The workflow was changed to run browser/UI tests and the multi-project Functions tests in separate fresh `emulators:exec` sessions. That corrected workflow has **not** been verified end to end. No production connection or deployment occurred; emulator data was in memory, no import/export directory was configured, and the emulator processes shut down.

### Credential-copy cleanup blocker

Firebase CLI detected the existing local Firebase CLI login and generated an Application Default Credentials copy under the run's isolated temporary `APPDATA`. The credential contents were not read or logged. An attempt to remove that one generated temporary file was rejected by the automatic approval review, so this recovery is deliberately stopped before another emulator run. The temporary credential copy remains under:

`C:\Users\LENOVO\AppData\Local\Temp\casetrack-uiux-recovery-336c44eed0624db89c080341df689e6d\appdata\firebase\*_application_default_credentials.json`

Remove that generated file using the environment's approved cleanup mechanism before rerunning the workflow. The temporary directory also contains diagnostic logs and must not be recursively removed until the exact target has been reviewed. An earlier startup attempt from the prototype directory wrote to its ignored `firestore-debug.log`; its prior contents were not backed up, so the original log cannot be restored from this run.

## Prepared local workflow

The prepared entry point is:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\e2e\run-ui-ux-infrastructure-recovery.ps1
```

The runner is **not currently safe to treat as verified or ready for repeated use** until the temporary credential copy is cleaned up and the two-project emulator workflow is exercised. It is designed to:

1. Refuse preexisting cloud credential variables, unexpected `GCLOUD_PROJECT`, and occupied required ports without stopping another process.
2. Start Vite in `role-admin-local` mode and confirm the transformed frontend selects only the demo project and local emulator hosts.
3. Start Auth, Firestore, and Functions through Firebase CLI `emulators:exec`, with Node 22 and the isolated test config.
4. Run current-page Admin/Diary Playwright checks, root unit tests, and a production build in a unique temporary output directory.
5. Run the Functions unit/Firestore Emulator suite in a separate fresh Auth/Firestore-only emulator session.
6. Save PNGs, browser diagnostics, and an E2E JSON report in a run-ID directory under `docs/ui-ux-audit/screenshots/infrastructure-recovery/`.
7. Stop services it starts and retain diagnostic logs when a test fails.

### Required service ports

| Service | Port | Use |
|---|---:|---|
| Vite | 5174 | Local CaseTrack browser pages. |
| Auth Emulator | 9198 | Synthetic email/password identities and actual browser sign-in. |
| Firestore Emulator | 8187 | Synthetic role, station and hearing records. |
| Functions Emulator | 5003 | Admin role/station API calls. |
| Firebase hub/logging | 4400/4500 | Firebase CLI internal coordination/logging. |
| Firestore websocket | 9150 | Firestore Emulator internal websocket. |
| Eventarc/Tasks | 9299/9499 | Functions Emulator companion services observed during startup. |

The launcher checks all nine listed ports before starting services. This preflight change has not yet been rerun.

## Results from this recovery attempt

| Check | Result |
|---|---|
| Screenshot capture | **Basic capture PASS** with the two launch flags; five actual PNGs decoded at expected dimensions. |
| Emulator startup | **PASS for startup only** on 9198/8187/5003 with Node 22; Functions discovery completed. |
| Synthetic Admin authentication | **Not verified**; there is no retained authenticated browser report. |
| Authenticated Admin E2E | **Not verified**. |
| Register Diary E2E | **Not verified**. |
| Screenshot matrix | **0/56 retained**; five basic static/landing/Login diagnostic images exist (285 PNGs total in the audit screenshot tree, including prior evidence). |
| Root unit tests | **42 passed, 0 failed, 0 skipped**. |
| Functions tests | **Command failed (exit 1)** while using a single-project emulator config with multiple demo project IDs. Exact suite counts were not retained. |
| Production build | **PASS** in isolated output directory `casetrack-uiux-production-build-4c850178410240d094243ff879963831`; Vite 8.3.0 transformed 98 modules and emitted `index.html`, `pages/admin-panel.html`, `pages/register-diary.html`, and `pages/password-setup.html`. |
| Syntax/config checks | **PASS**: `node --check e2e/ui-ux.browser.test.cjs`; PowerShell parser checks for all three new `.ps1` files; `firebase.ui-ux-local.json` parsed successfully. |
| Whitespace check | **PASS**: `git diff --check` (exit 0; Git only reported existing LF/CRLF normalization warnings for three modified audit documents). |
| Cleanup safety | **BLOCKED**: automatic approval review rejected removal of the isolated temporary ADC copy. The emulator workflow remains stopped and must not be rerun until this file is cleaned through an approved mechanism. |
| Acceptance issue status | UX-015 Medium/Open, UX-016 High/Open, UX-017 High/Open — unchanged. |

No issue status is changed by this document. Do not close UX-015/016/017 based on CSS fixtures or the basic screenshot probe.

## Troubleshooting

- If Chrome reports `Page.captureScreenshot` again, first verify the Playwright launch includes `--disable-gpu --disable-dev-shm-usage`. Reproduce on static HTML before testing application routes.
- If Vite startup fails, confirm port 5174 is free and that `role-admin-local` is used. Do not fall back to production Firebase mode.
- If Admin sign-in reports `auth/network-request-failed`, compare Vite's transformed `VITE_ROLE_ADMIN_*_PORT` values with the actual Auth/Firestore/Functions listeners.
- If Functions discovery times out, verify the CLI uses Node 22 and retain the Functions startup log. `FUNCTIONS_DISCOVERY_TIMEOUT` is measured in seconds in the observed CLI.
- If Firebase reports multiple project IDs under single-project mode, use the test-only config with `singleProjectMode: false` and keep the test's project IDs in the `demo-*` namespace.
- If a port is occupied, identify its process owner and stop without changing that process.
- Never pass `--import`, use production project IDs, run production credentials in application tests, or clear an existing emulator dataset.

## Rollback

The testing-only additions are `firebase.ui-ux-local.json`, `e2e/ui-ux.browser.test.cjs`, and the `e2e/run-ui-ux-*.ps1` helpers. Roll back by removing only these newly added files and reverting only the recovery section added to the issue register, checklist, screenshot index, and this document. Retain the five diagnostic PNGs unless their removal is separately requested. Do not touch prior application changes, UX-015/016/017 CSS, existing emulator configs, Firebase data, or unrelated screenshots.
