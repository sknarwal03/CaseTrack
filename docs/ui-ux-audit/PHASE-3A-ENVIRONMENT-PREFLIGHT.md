# CaseTrack — Phase 3A Environment Preflight

**Date:** 15 November 2026
**Type:** Read-only diagnostics and safe recovery assessment
**Outcome:** Authenticated verification remains blocked. No recovery action was executed.

## 1. Executive summary

The Phase 3 browser blocker is confirmed at the CUA/browser-host layer: `cua.getState()` reports `Browsers: Error: The browser access host is unavailable`. This is distinct from local browser availability. Google Chrome 157.0.8103.51 and Microsoft Edge 157.0.4341.60 are installed, and the nested E2E package contains Playwright 1.64.1. Chrome and Edge processes are running, but no accessible CaseTrack browser session was supplied. A local Playwright process not associated with this workspace was not reused.

The isolated demo configuration exists, but its services are stopped. Auth, Firestore, Functions, Vite test, Firebase hub/logging, Firestore websocket, and Functions companion ports all returned `ECONNREFUSED` on the configured loopback addresses. The required test environment variables are absent in this shell. The repository runner sets these variables per process, but it starts Vite and Firebase Emulators and creates synthetic Auth/Firestore records; it is not a read-only diagnostic.

There is an additional concrete recovery blocker: the prior infrastructure recovery log says Firebase CLI generated a temporary ADC copy and its removal was rejected by automatic approval review. A file matching that prior-run ADC-copy pattern is still present in the named temporary directory. Its contents were not read, copied, or modified. The user ADC file and credential environment variables are absent. The existing runner must not be repeated until the temporary copy is handled with explicit owner approval; its `npx --yes --package=node@22` invocation may also fetch a Node runtime, and no Node 22 executable is currently present at the checked prior-workspace paths.

No app source, Firebase configuration, Rules, credentials, ADC, or production data were modified or used. No browser smoke test, emulator startup, login, screenshot, or test-account creation was performed. No UX issue status was changed.

## 2. Read-only baseline

| Item | Observed state |
|---|---|
| Branch / commit | `codex/increment-1b-b1-token-infrastructure` / `17213a6b0c53cccbd9233a73517e254ed2b0622b` |
| Preflight working tree | Existing changes preserved. Porcelain summary at start: ` M` 23, `MM` 6, `M ` 10, `A ` 319, `AM` 3, `??` 22. This report is the only Phase 3A addition. |
| OS | Windows 10 Pro, 10.0.19045, 64-bit |
| Node / npm | Node `v24.22.0`; npm `11.19.1`. Phase 3 report records npm `11.19.4`; the version differs in this preflight and is recorded as currently observed without changing npm. |
| Chrome / Edge | Chrome exists at `C:\Program Files\Google\Chrome\Application\chrome.exe`, version 157.0.8103.51. Edge exists at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, version 157.0.4341.60. Neither executable is on PATH. |
| Browser automation package | `e2e/node_modules` contains Playwright and Playwright Core 1.64.1. The root package does not declare Playwright. No package was installed. |
| Existing test commands | Root `npm test`, `npm run build`; `e2e/package.json` has a historical Admin browser test. Current Phase 3 harness is `e2e/ui-ux.browser.test.cjs`; guarded wrapper is `e2e/run-ui-ux-infrastructure-recovery.ps1`. |
| Process observations | Chrome and Edge processes exist. A workspace-associated Vite process is listening on 5173, not the test runner's 5174; it was left untouched. A separate Playwright-tagged Node process was not associated with this workspace and had no listener; it was not reused or terminated. |

## 3. Browser host and executable diagnostics

| Component | State | Evidence |
|---|---|---|
| CUA browser host | **UNREACHABLE** | Current `cua.getState()` returned `Browsers: Error: The browser access host is unavailable`. No browser tab inventory or host endpoint was provided. The repository has no CUA host address/port to probe. |
| Local Chrome executable | **PRESENT** | Exact configured path exists; version 157.0.8103.51. `CHROME_EXECUTABLE` is unset in the current process, but the recovery script sets it locally when invoked. |
| Local Edge executable | **PRESENT** | Installed Edge executable/version observed; current E2E config selects Chrome, not Edge. |
| Playwright | **PRESENT** | Version 1.64.1 resolves from `e2e/package.json`; the root package cannot resolve it. The existing runner calls `chromium.launch()` with the installed Chrome executable and `--disable-gpu --disable-dev-shm-usage`. |
| Puppeteer / CDP client | **NOT PRESENT** | The checked packages `puppeteer`, `puppeteer-core`, and `chrome-remote-interface` are unavailable. No CDP endpoint is configured in the repository. |
| Browser host classification | **UNREACHABLE** | Chrome availability does not repair the inaccessible CUA host. No documented independent browser-host startup command exists. |
| Authentication/session | **BLOCKED / NONE AVAILABLE** | No CaseTrack browser tab could be inspected or reused. Existing Phase 2B records say its synthetic accounts were cleaned and emulators stopped. The current E2E harness would create synthetic accounts after emulator startup; that did not occur. No user session or credential was used. |

The earlier infrastructure recovery document records that local Playwright captured five static/landing/Login diagnostic images when launched with the two flags above. That is historical evidence of local screenshot capture only; no Phase 3A screenshot was attempted. Current screenshot capability for the inaccessible CUA host is **NOT TESTED / UNAVAILABLE**.

## 4. Isolated demo configuration and Firebase findings

| Item | Observed state |
|---|---|
| `firebase.ui-ux-local.json` | Present; binds Auth `127.0.0.1:9198`, Firestore `127.0.0.1:8187`, Functions `127.0.0.1:5003`; `singleProjectMode` is false. This is the config selected by the recovery wrapper. |
| `firebase.admin-panel.local.json` | Present; same local ports, but `singleProjectMode` is true. It is not the config selected by the current Phase 3A recovery wrapper. |
| `.firebaserc` | Default project is `casetrack-97a4e` (production). The recovery wrapper explicitly passes `--project demo-casetrack-role-prototype`; running a Firebase command without that explicit override would be unsafe. |
| Local Vite alias | `vite.config.js` has a `role-admin-local` mode that selects `firebase/local-role-admin`; normal development mode includes a production Functions proxy. The wrapper sets the local mode and checks its transformed endpoints before proceeding. This check was not exercised because Vite was not started by this task. |
| Required runtime environment | `GCLOUD_PROJECT`, emulator host variables, `CASETRACK_E2E_MODE`, `CHROME_EXECUTABLE`, `FIREBASE_CONFIG`, `FIREBASE_TOKEN`, and `GOOGLE_APPLICATION_CREDENTIALS` are absent in this shell. This is expected before wrapper initialization, but means direct E2E invocation would fail its isolation assertions. Values were not printed. |
| Emulator listeners | None on ports 9198, 8187, 5003, 4400, 4500, 9150, 9299, or 9499. Targeted TCP checks to `127.0.0.1` returned `ECONNREFUSED`; no broad scan was run. |
| Vite test listener | Port 5174 is closed (`ECONNREFUSED`). Port 5173 has an existing workspace Vite process and was not used or stopped. |
| Emulator status | **STOPPED** on the documented test ports. There is no DNS issue: configured emulator hosts are numeric loopback addresses. |
| Existing test records | No current emulator records were queried because services are stopped. Existing Phase 2B cleanup evidence says synthetic Auth/Firestore data was cleared when those emulator processes stopped. The current harness refuses a nonempty emulator before creating data. |

**Demo environment classification: UNSAFE / UNVERIFIED for immediate use.** The repository contains a guarded, local-only demo workflow, but it is inactive. The shell is not configured, emulator services are absent, the default Firebase alias is production, and a prior temporary credential copy remains. It must not be treated as ready merely because the demo config file exists.

## 5. ADC inspection

- `gcloud` is not available on PATH.
- `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_TOKEN`, and `FIREBASE_CONFIG` are absent from the current shell.
- The standard `%APPDATA%\gcloud\application_default_credentials.json` file is absent.
- The earlier recovery record states that Firebase CLI detected a local CLI login and generated an ADC copy under its isolated temporary `APPDATA`; prior cleanup was rejected by automatic approval review.
- Read-only presence checking confirms one matching ADC-copy file remains in the exact temporary Firebase subdirectory recorded in `UI-UX-TEST-INFRASTRUCTURE-RECOVERY.md`. Its name and contents were not included here; its contents were not opened.

The guarded browser test uses explicit demo-project/emulator variables and refuses cloud credential environment variables. It does not require production ADC for the app's local emulator traffic. However, the recorded temporary credential copy is a cleanup/security blocker for rerunning the existing workflow. **ADC disposition: BLOCKED for recovery; no ADC file was read or changed.**

## 6. Root-cause assessment for Phase 3 blockers

| Phase 3 report | Confirmed cause / limit |
|---|---|
| Browser access host unavailable | Confirmed CUA host error reproduced in Phase 3A. The local browser executables are present, so this is not evidence of a missing Chrome binary. The underlying remote host failure cannot be diagnosed from repository configuration because its endpoint/process is not exposed. |
| Emulator ports not listening | Confirmed: configured test ports have no listeners and local TCP connects are refused. The services were stopped, not timing out or failing DNS. Historical Phase 2B cleanup confirms emulators were shut down. |
| Isolated test environment unset | Confirmed in the current shell. The wrapper normally assigns process-local values, so this is not by itself an incorrect persistent configuration. Directly running the E2E test without the wrapper would fail the test's explicit isolation assertions. |
| Authenticated routes inaccessible | Confirmed consequence: no reachable CUA browser/session, no app server on 5174, and no Auth/Firestore/Functions emulators on their required ports. Historical synthetic accounts were cleaned; the current harness would create new ones, which did not happen. |
| No Phase 3 screenshots | Confirmed: no Phase 3 browser route run occurred; CUA was unavailable. The historical five-image local smoke capture was not a Phase 3 route/theme/viewport matrix and cannot substitute for it. |

## 7. Safe recovery decision matrix

| Component | Current state | Root cause evidence | Safe action | Approval required |
|---|---|---|---|---|
| Browser host | **UNREACHABLE** | Reproduced CUA host error; no exposed endpoint | Restore the managed browser host through its owner/operator. No repository startup command exists. | Yes, external host recovery if needed |
| Browser executable | **PRESENT** | Chrome and Edge installed; Chrome version matches historical capture environment | Reuse the installed Chrome only through the existing isolated runner after blockers are cleared. | No installation needed; runner approval still applies |
| Automation framework | **PRESENT** | E2E-local Playwright 1.64.1 | Use existing package; do not install or update it. | No dependency change; execution requires emulator approval |
| Isolated demo environment | **BLOCKED / UNVERIFIED** | Config exists; required services/env absent; production `.firebaserc` default; stale temp ADC copy | Clear the identified temp copy only after approval, then review runner preconditions and project guard. | Yes |
| Authentication session | **BLOCKED** | No accessible CaseTrack session; prior synthetic accounts cleared | Create synthetic users only as part of the approved emulator harness. | Yes, for emulator/test-data execution |
| Firebase Emulator | **STOPPED** | All configured ports refused connections | Start only through the reviewed `demo-*` wrapper after credential cleanup and explicit approval. | **Yes** |
| ADC | **BLOCKED for recovery** | Standard ADC absent; prior generated temp ADC copy remains | Remove only that one isolated generated copy after explicit approval. Do not login/revoke/change global ADC. | **Yes** |
| Screenshot capture | **NOT TESTED in Phase 3A** | CUA host unavailable; historical local Playwright static capture passed with flags | Re-test through the existing local runner after environment approval; retain screenshots as evidence. | Yes for runner/route execution |

## 8. Actions completed and intentionally skipped

**Completed:** read-only document/script/config review; branch/commit/status/runtime/OS baseline; executable/package/process inspection; ADC path presence checks without opening contents; checks to only the configured local ports; reproduced the CUA inventory error.

**Intentionally skipped:** no browser smoke test, no navigation/authentication, no screenshot, no Playwright process reuse, no Vite/emulator startup, no Firebase CLI command, no Node/package download, no account/record creation, no credential cleanup, no ADC/Rules/config change, and no production request.

No application source or Firebase configuration was edited. The pre-existing staged, unstaged, and untracked workspace changes remain. No production data was accessed or changed.

## 9. Approval-required commands and effects

### A. Remove the one prior-run temporary ADC copy

Proposed guarded command (not executed):

```powershell
$dir = Join-Path $env:LOCALAPPDATA 'Temp\casetrack-uiux-recovery-336c44eed0624db89c080341df689e6d\appdata\firebase'
$files = @(Get-ChildItem -LiteralPath $dir -Filter '*_application_default_credentials.json' -File)
if ($files.Count -ne 1) { throw 'Expected exactly one prior-run generated ADC copy.' }
Remove-Item -LiteralPath $files[0].FullName
```

**Purpose:** clear the single generated ADC copy recorded by the previous test run. **Effect:** permanently removes that file; it does not revoke the underlying Firebase CLI login or affect the standard ADC path. **Persistent state:** yes, one local credential copy is deleted. **Security:** the file contains credential material; this preflight deliberately did not read it. The command is tightly scoped to the recorded temp directory and requires exactly one match. **Rollback:** there is no safe automatic rollback; restoring it would require an authorized copy or new authentication. The file's removal requires explicit owner approval. This is the cleanup action previously rejected by automatic approval review.

### B. Run the existing isolated recovery harness

Proposed command (not executed):

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\e2e\run-ui-ux-infrastructure-recovery.ps1
```

**Purpose:** configure process-local demo variables; start Vite at 5174; validate that its transformed config targets only local demo emulators; run Auth, Firestore and Functions emulators under explicit `demo-casetrack-role-prototype`; run the 56-screenshot authenticated route harness, root tests, build and syntax checks; run a separate Functions emulator suite. **Effect:** creates a temporary runtime, local emulator state, synthetic Admin/Operator accounts and Firestore records, and screenshot/report files under the audit directory. **Persistent state:** process environment is restored and services are intended to stop in `finally`; successful evidence files remain in the repo; failure may retain diagnostic runtime data. The command invokes `npx.cmd --yes --package=node@22`, which may fetch Node 22 because no Node 22 runtime was found at the checked prior paths. **Security:** the wrapper has guards for cloud credential variables, explicit demo project, local endpoint selection, fresh emulator state, and remote request blocking. Those guards reduce risk but were not re-executed here; the default `.firebaserc` is production. The existing temp ADC copy and historical cleanup blocker make rerun unsafe without approval. **Rollback:** on a clean successful run the script restores process variables, stops its Vite process and emulator sessions, removes its temporary runtime, and its E2E harness deletes synthetic users/records. Captured evidence remains. Failure cleanup is not guaranteed, so do not use this as a reversible or read-only command.

The command above requires explicit approval for emulator startup and synthetic data creation, and separate approval for handling the existing ADC copy. Its potential Node 22 download must also be authorized or replaced with an already-provisioned runtime in a separately approved change. No safe CUA-host startup command was found; that host requires external recovery.

## 10. Remaining blockers and next step

1. Have the browser-host owner restore the CUA browser service; no local Chrome reinstall is indicated.
2. Obtain explicit approval for the single generated temporary ADC copy cleanup. Do not run `gcloud` login/revoke or change global credentials.
3. Confirm an already available Node 22 runtime or explicitly authorize the runner's potential `npx` download.
4. Obtain explicit approval before starting the guarded local Firebase Emulators and creating synthetic accounts/records.
5. Only after those approvals and preconditions, run the existing harness; then assess its report and retained screenshots before updating Phase 3 verification statuses.

Until then: **Browser Host — BLOCKED; Demo Environment — BLOCKED/UNVERIFIED; Firebase Emulator — STOPPED; ADC — BLOCKED for recovery; Screenshot Capability — NOT TESTED in this phase (historical local static capture succeeded); Authenticated Verification — BLOCKED.** No UX issue status is changed.
