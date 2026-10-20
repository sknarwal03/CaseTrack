# CaseTrack Role Management Security Prototype

## Status and scope

> **Current architecture note (2026-10-20):** This directory remains a fixed-demo emulator scaffold. The application Admin Panel now uses the root `functions/` package for its real Firebase backend; see [the current production-readiness report](../../docs/25-Production-Readiness-and-Security-Report.md). Do not route normal website traffic to this prototype. The prototype's Admin-entered-password flow is historical and is not the approved onboarding path.

This is an isolated, local Firebase Emulator scaffold for testing role-aware Firestore Rules, Admin Panel user-role listing, Police Station Master create/list, and Operator account provisioning. It also documents a one-time, explicitly approved bootstrap of the local Admin account. The active emulator uses the separate, tested Admin/Operator Rules policy at `../../firestore.admin-panel.rules`; `firestore.rules` remains the deny-all baseline used by the original prototype Rules tests. These endpoints are experimental and local-only; they do not establish the feasibility of production role transitions, station isolation, or last-admin protection.

The Admin Panel navigation check uses the server-authorized Users endpoint rather than listing `userRoles` from the client. The local Rules allow an authenticated user to read only their own role record.

The local role-admin app uses its dedicated demo Firebase config. No production Firebase config, Rules, records, or deployment settings are used by this prototype.

## Isolation controls

- The only project ID accepted by this prototype is `demo-casetrack-role-prototype`.
- `firebase.json` configures Auth and Firestore Emulator endpoints on loopback (`127.0.0.1`) only.
- `firebase.json` loads the role-aware Rules from `../../firestore.admin-panel.rules`; it does not change production Rules.
- `firebase.json` also configures the Functions Emulator on loopback (`127.0.0.1:5001`).
- Functions test helpers fail closed unless they see the fixed demo project ID and expected local Auth and Firestore Emulator host/port values. The two Rules test projects use separate fixed IDs and ports.
- Rules Unit Testing is configured with explicit Firestore Emulator host/port values; the deny-all baseline and active Admin/Operator policy tests do not share the development emulator.
- The Functions prototype does not import the main application Firebase configuration.
- `functions/.env.demo-casetrack-role-prototype` holds a random local HMAC key used to compare request inputs without storing passwords in the idempotency journal. It is ignored by Git and must never be reused outside this emulator prototype.
- The package scripts provide only local Emulator and test commands. There is no deploy script or production target.
- The scripts pin the demo project ID and there is no deploy script. The Functions endpoint refuses to initialize unless the process uses the fixed demo project ID and exact loopback Auth and Firestore Emulator endpoints. Do not override these checks or run a separate deploy command with production credentials; a person who deliberately bypasses these controls and invokes Firebase CLI with production access is outside the protection this local scaffold can provide.
- Do not add production credentials, project IDs, Firebase configuration, or data here.

The baseline tests use Rules Unit Testing's mock authenticated contexts to exercise Firestore Rules. Auth Emulator is configured locally but no real sign-in flow is part of this baseline.

## Local Admin bootstrap

The one-time bootstrap is limited to the `demo-casetrack-role-prototype` Auth and Firestore Emulators. It is not an Admin-creation endpoint or a production procedure.

Before writing:

1. Confirm the project ID and loopback Auth/Firestore endpoints from the prototype configuration.
2. Read Auth Emulator identities and Firestore `userRoles` through the local Admin SDK. Match each UID to actual emulator data; do not infer identity from an email, a test name, or a target account.
3. Verify the proposed actor is a distinct, enabled Auth account with an active `admin` role record. A trusted actor must also be explicitly designated by the project owner; an active role alone does not establish trust. Stop if no separate trusted actor can be established.
4. Verify the target Auth UID/email and that its `userRoles/{uid}` document is missing. Do not overwrite an existing role.
5. Validate all active Admin role records against Auth Emulator accounts, then derive `activeAdminCount` from those records. Do not use a supplied or guessed count.

Create the target role, its initial history event, and `systemControl/adminGovernance` in one Firestore transaction. The role uses `role: "admin"`, `status: "active"`, server timestamps, and the verified actor UID for both `createdBy` and `updatedBy`. The history event uses `action: "assigned"`, `previousRole: null`, `newRole: "admin"`, the same actor UID, and a Firestore server timestamp. The governance document follows the ADR schema (`schemaVersion`, count, creator/updater UIDs, and server timestamps). Read all three documents back and compare the governance count to the validated active Admin roles.

For this emulator state, `admin@example.test` / `B7iFjbLhzeFidr6tYxRClGznC8Un` was initialized using the separately verified and explicitly approved actor UID `yBusGg0DAv5qZSGc5WpXxUZHAv8Y`. This actor was a generated `role-list-*` test account and was approved for this bootstrap only; do not treat generated test accounts as trusted actors on a fresh emulator. Re-verify and obtain explicit approval for a separate actor after resetting or reseeding emulator data. No password or ID token belongs in bootstrap notes or logs.

## Files

- `firebase.json`: local Auth/Firestore Emulator configuration and prototype Rules path.
- `firestore.rules`: default-deny baseline used by the original prototype Rules tests.
- `../../firestore.admin-panel.rules`: local emulator policy for active Admin/Operator case-data access and protected role/station paths.
- `../../firebase.admin-panel.test.json` and `../../firebase.baseline.test.json`: isolated loopback configurations for the two Rules suites.
- `tests/case-data.rules.test.js`: focused Admin/Operator, station-isolation, and case-master Rules tests.
- `functions/index.cjs`: local-only `listUserRoles`, `policeStations`, and `createOperator` endpoints. Each verifies the Firebase ID token and the caller's active Admin role. Operator account creation is staged through disabled Auth, atomic role/history writes, then Auth enablement. The idempotency journal is scoped under `operatorCreationRequests/{adminUid}/requests/{requestId}`; it stores a keyed password fingerprint, never the password.
- `functions/package.json`: isolated Cloud Functions runtime dependencies.
- `functions/tests/users-list.test.js`: endpoint authorization, response allowlist, pagination, validation, and read-error tests.
- `functions/tests/police-stations.test.js`: station endpoint authorization, validation, create/list behavior, stable IDs, schema, error handling, and CORS tests.
- `functions/tests/operator-creation.test.js`: Operator endpoint authorization, validation, role/history creation, duplicate email, idempotency, mismatch rejection, staged-failure recovery, Users-list regression, and CORS tests.
- `OPERATOR-CREATION-IMPLEMENTATION.md`: approved local-only provisioning decisions, operation journal, and reconciliation procedure.
- `tests/fixtures.js`: fixed project/endpoint checks and isolated Rules test-environment setup.
- `tests/role-management.rules.test.js`: baseline denial checks for role, history, and governance paths.
- `tests/station-isolation.rules.test.js`: baseline denial checks for record paths.

## Prerequisites and current verification state

Dependency versions are declared in this directory's `package.json` and in `functions/package.json`. From this directory, install the emulator/test dependencies and Functions dependencies with:

```powershell
npm ci
Set-Location functions
npm ci
Set-Location ..
```

Generate a local-only HMAC key before first run:

```powershell
node -e "require('node:fs').writeFileSync('functions/.env.demo-casetrack-role-prototype', 'OPERATOR_REQUEST_HMAC_KEY=' + require('node:crypto').randomBytes(32).toString('hex') + '\n', { flag: 'wx' })"
```

The generated Functions env file is ignored by Git. The `emulators`, `test:*`, and Rules test scripts invoke the Firebase CLI through `npx --package=node@22`, so the Functions discovery process uses Node 22 even when the system `node` command points to Node 24. The Rules test scripts use separate demo projects and loopback ports (8186 and 8185); they do not reload Rules on the development emulator. With the development emulators already running, test the Functions suites without starting duplicate services:

```powershell
$env:GCLOUD_PROJECT = 'demo-casetrack-role-prototype'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
npx --yes --package=node@22 -- node --test --test-concurrency=1 `
  functions/tests/users-list.test.js `
  functions/tests/police-stations.test.js `
  functions/tests/operator-creation.test.js `
  functions/tests/role-transitions.test.js
```

For a clean environment, `npm run emulators` starts Auth, Firestore, and Functions on loopback for the fixed demo project. The local launcher also verifies the emulator process uses Node 22 and loads the configured role-aware Rules through the local Rules API without clearing emulator data.

### Latest verification (2026-10-20)

**LOCAL PROTOTYPE READY for local development use only.** No production Firebase project, data, credentials, Rules, or deployment were used.

- Root FIR-status suite: `npm test` — **19 passed, 0 failed**.
- Functions Emulator suites (Users, Police Stations, Operators, role transitions): Node **v22.23.3** — **47 passed, 0 failed**.
- Firestore Rules: `npm run test:rules` — default-deny baseline **2 passed**, active Admin/Operator and station-isolation policy **10 passed**, **0 failed**. The suites ran on isolated ports/projects.
- The local launcher’s Node 22 process check and Rules synchronization helper passed against the running emulator; the configured policy already matched, so no Rules write or data change was needed.
- Production-mode local build: `npm run build` — **passed**. Existing Vite config-loader and large-chunk advisory warnings remain.
- Browser checks on the loopback `role-admin-local` app: a fresh email/password Admin login reached Admin Panel; the Admin created a station (HTTP 201), created an Operator (HTTP 201), assigned that Operator to the new station, and saw the active assignment in Users. An unauthenticated station-list request returned HTTP 401. The temporary Operator was promoted only for the Admin-login check, then demoted; its Auth account, role/history, station, and exact request-journal records were removed. Existing emulator accounts and station records were retained.
- The case-data Rules tests verified an Operator can query only its own station while cross-station reads/queries and forged ownership are denied; Admin access, malformed-role denial, legacy cases, linked proceedings, and FIR-master preservation also passed.
- Existing local `cases`, `firMasters`, and `linkedCases` collections were fingerprinted before and after verification: **0 documents in each**, with the same SHA-256 fingerprint `2139503d9af00cba7a0cec0ca7852592c6d527b4d3202245fe4eac4fb345297f`. No case data was created, changed, or deleted. The Admin governance counter remained consistent at **2 active Admins**.
- A final read-only Admin SDK check after sign-out confirmed the temporary browser account is absent, **1 retained station**, **3 role records**, **2 active Admins**, and governance count **2**. The browser was left signed out on the login page.
- Browser automation's pointer clicks did not stabilize on the form controls. The browser still exercised the actual form submit handlers, local Functions requests, Auth sign-in flow, redirects, and rendered state using native form submission; physical pointer activation was not independently verified.
- Functions dependency installation reported **8 moderate npm audit advisories**. They were not remediated in this local-prototype task and must be assessed before any production work.

`npm run test:rules` now isolates the original deny-all baseline tests from the active development emulator. Do not manually run the baseline Rules test fixture against `demo-casetrack-role-prototype`; it uses a separate project and port specifically to prevent changing the development Rules. Functions tests use the Admin SDK for fixture setup, so their endpoint authorization is tested separately from Firestore client Rules.

### Remaining limitations

- This verification establishes local prototype behavior only. It does not validate a production project, deployed Rules, production IAM, production credentials, or deployment configuration. Do not deploy this prototype or copy emulator records or credentials to production.
- Operator provisioning still asks the Admin for an initial password; Operator setup links, password reset, invitation email, and direct Operator station reassignment are not implemented.
- Station rename and deletion are not implemented.
- Last-Admin governance assumes the initial counter is reconciled and this transition endpoint is the exclusive role-transition writer. Out-of-band Admin SDK or console changes can make the counter stale; reconcile it before relying on the local guard.
- Case writes are not atomically coupled to immutable audit events. This remains a production release blocker.
- Keep the ignored HMAC key and operation journal local; losing the key can block recovery of outstanding requests.

## Explicit non-goals

- No production role-management UI or application integration.
- No self-service Admin creation; the documented one-time local emulator bootstrap requires explicit approval.
- Clients cannot write trusted role records or role history directly; role changes go through the server-authorized local endpoint.
- No station rename/deletion, Operator invitation flow, setup link, or password reset.
- The local Admin governance counter is not reconciled automatically after out-of-band role changes.
- No production Rules, data migration, or deployment path.

## Admin Panel local Vite mode status (2026-10-19)

### Configuration and implementation

The root Vite configuration supports the `role-admin-local` mode. The intended startup command, run from the repository root, is:

```powershell
npm run dev -- --mode role-admin-local --host 127.0.0.1
```

In that mode, the served login module is expected to import `firebase/local-role-admin/firebase-config.js`. That local config targets the fixed demo project `demo-casetrack-role-prototype` and connects Auth, Firestore, and Functions to `127.0.0.1:9099`, `127.0.0.1:8080`, and `127.0.0.1:5001`, respectively. The runtime behavior verified below matches this expected config selection.

### Runtime verification (2026-10-19)

Read-only checks confirmed that the new Vite process (PID 5980) is listening on `127.0.0.1:5174` with `--mode role-admin-local --host 127.0.0.1`. `GET http://127.0.0.1:5174/CaseTrack/assets/js/login.js` returned HTTP 200 and imports `/CaseTrack/firebase/local-role-admin/firebase-config.js`; it does not import the main `/CaseTrack/firebase/firebase-config.js`. `GET http://127.0.0.1:5174/CaseTrack/pages/login.html` also returned HTTP 200 and served the CaseTrack login page.

The separate listener on port 5173 belongs to node.exe PID 3728, running the repository's Vite executable with `--host` (parent command: `vite --host`). It was observed listening on IPv6 unspecified address `::`; its login page returned HTTP 200 and its served login module imports the main `/CaseTrack/firebase/firebase-config.js`. This is the existing general Vite dev server, not the verified loopback-only role-admin-local server. It was not stopped or modified.

No login was attempted. Browser-to-Auth-Emulator connectivity and sign-in behavior remain unverified; the HTTP checks above verify serving and configuration selection only. No account, password, role, emulator data, or unrelated file was changed.

**Status:** loopback binding, the local role-admin config import, and the local login page response are verified on port 5174. No blocker remains for those checks; login behavior remains intentionally untested.

## Windows one-click Admin Panel startup (2026-10-19)

### Launcher

Double-click [`scripts/start-admin-panel-local.cmd`](../../scripts/start-admin-panel-local.cmd) to launch [`scripts/start-admin-panel-local.ps1`](../../scripts/start-admin-panel-local.ps1). The PowerShell launcher checks Node, npm, Java, curl, installed CLI files, the ignored local Functions environment file, and cloud-credential environment variables. It does not install dependencies or generate secrets.

Startup order:

1. Verify or start Auth, Firestore, and Functions using the prototype's existing `npm run emulators` script in `security-prototypes/role-management`. Expected loopback ports are 9099, 8080, and 5001 for project `demo-casetrack-role-prototype`. Check the Auth and Firestore HTTP endpoints and a Functions CORS preflight from the 5174 origin before proceeding.
2. Verify or start Vite on `127.0.0.1:5174` with `--mode role-admin-local --strictPort`.
3. Check that the login page returns HTTP 200 and that the served login module imports the local role-admin config, then open `http://127.0.0.1:5174/CaseTrack/pages/login.html`.

The `.cmd` file is directly double-clickable; an optional Windows shortcut can point to it. Emulator and Vite consoles remain visible for diagnostics.

### Safe process and port policy

The launcher reuses only listeners whose PID, command line, project/mode, and loopback address match the expected local services. It fails closed if a required port is occupied by another or ambiguous process, if only some emulator ports are occupied, or if another `role-admin-local` Vite instance is found. It never kills or modifies an existing process and never chooses a fallback port. The separate Vite process on port 5173 is not stopped or modified. Emulator data is not reset or reseeded, and no account, password, or role is created.

The Functions CORS allowlist now includes only the additional exact origin `http://127.0.0.1:5174`; existing origins are unchanged. Production Firebase configuration and root Firebase configuration were not modified.

### Verification status and remaining limits

- Verified from configuration and scripts: emulator endpoints/project, the combined emulator startup command, Functions' fixed local-project checks, and local Firebase client endpoints.
- Verified at implementation time: Node, npm, Java, Vite CLI, prototype Firebase CLI, and the ignored local Functions environment file exist. The emulator ports were owned by the expected local Firebase CLI/Firestore processes, and port 5174 was owned by the expected loopback `role-admin-local` Vite process. Port 5173 remains a separate general Vite process and was not changed.
- Runtime HTTP checks returned 200 from the Auth Emulator config endpoint and Firestore Emulator root, and the Functions Emulator returned HTTP 204 for a CORS preflight from `http://127.0.0.1:5174` with that exact origin allowed.
- The CORS allowlist and its focused handler test now include `http://127.0.0.1:5174`; the focused test passed (1 passed, 0 failed).
- Latest read-only inspection: PID 13804 is still active on `::1:5175`. It is `node.exe` running the repository Vite executable with `--mode role-admin-local`, created 2026-10-19 06:10:11, in Windows session 1. Its parent chain is `node.exe` PID 13804 -> `cmd.exe` PID 7620 -> `node.exe` PID 7272 (`npm run dev -- --mode role-admin-local`) -> `powershell.exe` PID 6164 -> VS Code `Code.exe` PID 1844. This identifies the owning VS Code integrated terminal shell (PowerShell PID 6164); the specific terminal tab title was not available from process metadata.
- The launcher smoke test verified emulator process checks, then safely refused to continue because of the extra Vite instance above. No browser was opened, and no process was stopped or modified. Ports 5173 and 5174 were not touched. Safely stop the extra server by finding the VS Code integrated terminal whose shell is PID 6164 and pressing Ctrl+C while its `npm run dev -- --mode role-admin-local` command is active. Do not use `Stop-Process` or close/stop other terminals. After confirming PID 13804 and its 5175 listener have exited, rerun the launcher.
- Remaining smoke-test checks (launcher re-run/reuse of port 5174 and browser open) are pending until PID 13804 exits.
- Not yet verified: a fresh launch with no services running, occupied-port/partial-emulator conflict scenarios beyond this detected duplicate, authenticated browser-to-Functions operations, and repeated-click idempotency on a clean machine.
- The launcher verifies emulator process identity and expected listeners, but does not perform authenticated emulator API operations or a login test. It only opens the login page after the Vite HTTP/module checks pass.

The launcher intentionally refuses to proceed when cloud credential/configuration environment variables are present. If prerequisites are missing or startup times out, existing service consoles are left open for inspection; the launcher does not auto-clean up anything.

## Initial role-admin-local runtime verification snapshot (2026-10-19)

### Verified results

- The Vite process serving `http://127.0.0.1:5173/CaseTrack/pages/login.html` runs with `--mode role-admin-local --host 127.0.0.1`. A read-only listener inspection found only `127.0.0.1:5173`; there were no listeners on `0.0.0.0:5173` or `[::]:5173`.
- A browser reload requested `assets/js/login.js` and `firebase/local-role-admin/firebase-config.js`. It did not request the main production Firebase config module.
- The browser console reported Vite connecting and connected; no console errors were observed during reload.
- No Auth, Firestore, or Functions emulator requests were observed in the browser request capture. No login or other account/data operation was attempted.
- The local Firebase config names Auth at `127.0.0.1:9099`, Firestore at `127.0.0.1:8080`, and Functions at `127.0.0.1:5001`; these are configuration values, not runtime request evidence.

### Blockers observed at the initial check (resolved below)

- No listeners were found on ports 9099, 8080, or 5001, and safe HTTP GET probes to all three loopback endpoints failed to connect. Auth, Firestore, and Functions emulator availability and actual request destinations therefore remain unverified. No Functions emulator process/listener was found, so Functions loading could not be verified.
- No process was stopped, no service was deployed, and no account, role, seed data, emulator data, or production resource was changed.

## Functions Emulator discovery remediation (2026-10-19)

- **Cause:** The original emulator CLI process ran under Node `v24.22.0` even though the Functions runtime is configured as Node 22. Firebase CLI logged that it was falling back to host Node 24; that run then failed HTTP function discovery with `User code failed to load. Cannot determine backend specification. Timeout after 10000`.
- **Fix:** Restarted the local Auth, Firestore, and Functions Emulators with Node `v22.23.3`. No application code, dependency manifests, or production resources were changed.
- **Verified:** Firebase CLI reported `Using node@22 from host`, loaded `listUserRoles`, `policeStations`, and `createOperator`, and initialized all three at their `us-central1` loopback Functions URLs on port 5001. The Functions `/backends` endpoint now lists all three triggers. Read-only unauthenticated GET requests reached the handlers: `listUserRoles` and `policeStations` returned HTTP 401, while `createOperator` returned HTTP 405 because GET is not an allowed method. No login, account, role, or application-data write was performed.
- **Emulator data note:** The suite was restarted without an export/import. Data held only in the previous emulator processes may not have persisted; no explicit data-clear operation was run.
- **Runtime note:** The previous Node 24 module-loader probe did not reproduce the emulator's discovery timeout. The timeout is verified resolved by running the emulator CLI and Functions runtime under Node 22; do not attribute it to an exception in `index.cjs`, since the timeout log did not report one.

## Admin Login flow verification (2026-10-19)

- After the emulator restart, read-only inspection found no Auth users and no `userRoles` documents. With explicit operator approval, two disposable Auth Emulator identities using generated `example.test` addresses were created; the first was designated as the trusted bootstrap Admin actor. Their two active Admin role records, assignment-history events, and `systemControl/adminGovernance` were initialized locally. Read-back confirmed both Auth accounts are enabled and `activeAdminCount` is 2. Generated passwords were not written to files or logs.
- The login form submitted successfully to the local Auth Emulator using the local role-admin Firebase config. It redirected to the dashboard, where the active Admin role check enabled the Admin Panel navigation. Opening the collapsed mobile navigation and selecting Admin Panel reached the protected route.
- The Admin Panel authorization check succeeded, the Users endpoint returned both role records, and Police Station Master returned an empty list. No station, Operator, or other application data was created.
- The dashboard initially showed a hardcoded personal name unrelated to the signed-in local account. Replaced it with an authenticated-user greeting and removed the cached-name prefill; browser verification now shows `Welcome Back, User!` for the generated account and the Admin Panel link remains available.
- The Dashboard previously logged `false for 'list' @ L6` because `components/add-case/add-case.js` read `crimeHeads` while the active emulator used the deny-all baseline. `assets/js/fir-case-model.js` also issued unfiltered collection reads against `firMasters`, `linkedCases`, and `cases`, which the tested Rules intentionally reject.
- The browser remains signed in to the local demo Admin account and the local emulator state remains in memory. Restarting the emulators without export/import may discard these disposable identities and role records. No production service or resource was used.

## Dashboard Firestore Rules fix and verification (2026-10-19)

- **Secure Rules path:** The role-management `firebase.json` now loads `../../firestore.admin-panel.rules`. The deny-all `firestore.rules` baseline remains in place for its existing prototype tests. The active emulator Rules were updated through the Firestore Emulator Rules API without restarting the service or clearing emulator data.
- **Collection/query fix:** The local demo path in `fir-case-model.js` reads only the caller's own active role, obtains station IDs for Admins from the ID-token-protected `policeStations` Function, and scopes `firMasters` queries by `policeStationId`. `linkedCases` queries additionally constrain `firMasterId`; `cases` queries constrain `policeStationId`, allowing station-owned legacy cases to be discovered even when FIR-reference fields are absent. Operators use only their assigned station. `crimeHeads` reads are limited to active Admins/Operators, and valid creates are permitted; the case-form startup now reads stored values without seeding default documents.
- **Rules verification:** The isolated Rules suite ran against `firestore.admin-panel.rules`: 8 passed, 0 failed. It verifies the supported station/master query shapes, case ownership and linked-master checks, role/station write restrictions, and the `crimeHeads` read/create boundary. Unfiltered case queries and unauthorized cases remain denied.
- **Browser/emulator verification:** Reloaded the already signed-in local Admin Dashboard without submitting a login or changing roles. Browser resource timing showed Auth traffic at `127.0.0.1:9099`, Firestore traffic at `127.0.0.1:8080`, and the Admin Functions `listUserRoles` and `policeStations` at `127.0.0.1:5001`. No console errors were captured. Dashboard case totals and panels rendered their empty states.
- **Data preservation:** Read-only Admin SDK counts after the reload were 2 `userRoles` documents and 0 each in `policeStations`, `crimeHeads`, `firMasters`, `linkedCases`, and `cases`; no accounts, stations, case records, or master documents were created or changed.
- **Remaining verification limits at that time:** There were no station or case records in that emulator session, so the browser did not execute a per-station case query against live records; the Rules suite verified those query shapes with isolated test data. Add/Edit workflow paths were not yet verified.

## Add/Edit Case station-scoped Firestore audit (2026-10-19)

### Changes

- In local `role-admin-local` mode, case data loads are station-scoped: Admin station IDs come from the authenticated `policeStations` Function, Operators use their assigned station, FIR Masters are queried by station, and linked proceedings by station plus master ID. Legacy `cases` are queried by station alone so records missing both `firMasterId` and `firId` remain discoverable without exposing records owned by another station. Master lookup for a requested FIR now uses the authorized station-scoped master queries rather than a direct lookup that could be denied for an absent or out-of-scope ID.
- Admins select among authorized stations for new records; the station selection is locked when editing an existing record because Firestore Rules prohibit changing its station owner. Operators remain constrained to their assigned station.
- Ordinary edits to legacy `cases` omit `firMasterId` and `firId` from the update, retaining whichever fields are already present and not adding missing links. Legacy FIR linking remains an explicit confirmation step that states it adds a master link; it retains existing document IDs and hearing history. The Add/Edit save no longer removes legacy IO or Register Diary fields from existing records.
- The IO editor now discovers linked cases through the shared station-scoped loader, updates only those authorized case documents, and checks for an active Admin before changing shared officer records. The Judges editor also checks for an active Admin before writes. Automatic page-load migrations for judge designations and IO fields/cases were removed; legacy values continue to be read through existing fallback fields.
- Rules now allow active Admins and Operators to read the shared Judges and Investigating Officers collections; writes remain Admin-only. Case Rules allow station-authorized reads of legacy cases without FIR references while keeping valid station ownership and existing write validation in force.

### Verification

- The isolated Admin/Operator Rules suite passed **9/9** on the dedicated test Firestore Emulator at `127.0.0.1:8185`. It covers station isolation, station-owned legacy cases with both FIR references absent, preserving those missing fields and hearing history during a status update, and Admin/Operator read/write boundaries for Judges and Investigating Officers.
- FIR-status unit tests passed **19/19**.
- The production Vite build succeeded. Vite emitted its existing `__dirname` config-loader and large-chunk advisory warnings; no build errors occurred.
- The live local Firestore Emulator at `127.0.0.1:8080` initially had stale Rules. Its in-memory Rules were updated through the emulator-only Rules API, without restarting the process or clearing emulator data; a read-back confirmed the loaded Rules exactly match `firestore.admin-panel.rules`.
- `git diff --check` passed. Rules fixtures used only the dedicated test emulator. No live case CRUD, login, account creation, data migration, or production deployment was performed; the live role-admin emulator's application data was not intentionally changed.

### Remaining limitations

- No live Add/Edit browser CRUD operation was performed; per-record application behavior is covered by the isolated Rules tests, and the live emulator's loaded Rules were verified by read-back.
- Records without a valid `policeStationId` remain unreadable and unwritable, including to Admins. Records with malformed or cross-station master references fail closed under update Rules. These require a separately reviewed administrative reconciliation; this workflow does not silently repair or migrate them.
- Station-owned legacy records without FIR references are discoverable and editable without automatic linking, but remain separate from a FIR Master until an authorized user verifies and confirms the explicit linking action.

## Local Admin Panel workflow verification (2026-10-19)

- In the signed-in local Admin browser session, the Police Station form submitted to `http://127.0.0.1:5001/demo-casetrack-role-prototype/us-central1/policeStations` and received HTTP 201. Its follow-up list requests received HTTP 200, and the new station appeared in the Operator station selector.
- The Operator form submitted to the local `createOperator` Function and received HTTP 201. The Users refresh called `listUserRoles` and received HTTP 200; the resulting row showed an active Operator assigned to the selected station. The browser captured no console errors during these requests.
- The Functions implementation and tests verify the account is created in the Auth Emulator, its active Operator role and station assignment are written with assignment history, and invalid station assignments are rejected server-side.
- The uniquely identified temporary station and Operator created for the browser check were removed from the Auth and Firestore Emulators, including the Operator role, history event, and idempotency request. Existing Admin records were retained.
- Verification passed: Police Station Functions tests **7/7**, Operator Functions tests **13/13** (including station-to-Operator assignment), Users Functions tests **14/14**, isolated Admin/Operator Rules tests **9/9**, and the production build. No production deployment was performed.

### Remaining limitations

- The workflow remains a local prototype; the verification does not establish production readiness or production authorization.
- There is no UI for role transitions, Operator revocation, station rename, or station deletion.
- Browser automation could not complete a pointer click because the click tool timed out waiting for a stable target. The browser form submit handlers were instead exercised with native `requestSubmit`; physical pointer interaction was not independently verified.

## Admin Panel authorization and data integrity audit (2026-10-19)

### Findings and fixes

- The callable-style HTTP Functions use Firebase ID-token verification with revocation checks, then read the caller's current `userRoles/{uid}` record and require exactly `role: "admin"` and `status: "active"` for user listing, station management, and Operator creation. The Firestore Rules independently require an active Admin or an active Operator with a valid station assignment for case data. Missing, inactive, unknown, and malformed role values fail closed. Client-side page guards are navigation controls, not authorization boundaries.
- Operator station assignment is validated by the server against a Firestore station document. The audit found that empty and whitespace-only station names passed the server check although the Rules reject them. The server now rejects those records, with an endpoint regression test.
- Firestore Rules previously allowed deleting an FIR master even when linked proceedings referenced it. The linked-case Rules then denied access because the referenced master was gone, hiding linked case and hearing history. Rules cannot query for child documents, so master deletion is now denied. A Rules test confirms the FIR master and linked hearing history remain available, while operators still cannot cross station boundaries.
- Tests confirm client SDK callers cannot create or alter trusted role records, station records, or role history. Admin Functions use the Admin SDK and bypass Firestore Rules, so their authorization checks remain in the HTTP handlers and require endpoint tests.

### Verification for this audit

- Added test coverage: malformed Admin role rejection at the Users HTTP endpoint, malformed station assignment rejection, and preservation of linked proceedings/hearing history by denying FIR master deletion.
- Admin/Operator Rules suite: **10 passed, 0 failed** on the isolated Firestore Emulator at `127.0.0.1:8185`, including station isolation, malformed roles, linked history preservation, and denial of master deletion.
- FIR status and legacy-history unit suite: **19 passed, 0 failed**.
- Production build: passed; Vite reported its existing config-loader and large-chunk advisory warnings.
- `git diff --check` and `git diff --cached --check`: passed (line-ending notices only).
- Functions emulator suites were not run: the local Auth and Functions Emulators were not running, and this host has Node 24 while the prototype requires Node 22 for Functions discovery. The root `npm test` command was also attempted, but it runs all emulator-dependent tests without the required emulator environment and consequently fails at setup; those results are not counted as product-test failures.

### Remaining risks and limits

- This audit covers the local Admin Panel implementation and emulator policy. It does not verify any production project, deployed Rules, production IAM bindings, runtime service account permissions, or deployment configuration.
- No role transition, Operator revocation, station deletion/rename, or last-Admin protection workflow is implemented. Direct Admin SDK or console access can bypass client Rules; such access must be separately governed.
- Existing records with missing or malformed station ownership, or invalid cross-station master references, remain denied and need a separately reviewed reconciliation. No migration was performed.
- Firestore Rules cannot prove that an FIR master has no linked child cases. Master deletion is therefore unavailable through these client Rules; a future deletion workflow would need a trusted server transaction/cleanup design with explicit history-preservation guarantees.

## Local Admin account lifecycle implementation and verification (2026-10-20)

### Implementation

- `functions/index.cjs` now exports `manageUserRole`. Every request verifies a Firebase ID token with revocation checks and requires an active, well-formed Admin role. Admin records with a non-null station assignment are rejected. The transition transaction rechecks the actor, target, station assignment, and `systemControl/adminGovernance`.
- Supported transitions are Operator promotion to Admin, Admin demotion to Operator with an existing station, role revocation, and reactivation. Self-changes are denied. Operator assignments are validated against `policeStations`; revocation retains the role and station fields. Each successful transition appends actor-attributed history and updates the Admin governance counter in the same Firestore transaction.
- A per-Admin request journal makes transitions idempotent and resumable after a partial Auth failure. The browser requires a reason, confirms revocation, persists the request ID and transition inputs in session storage for retry, validates server responses, and refreshes the Users table after success. No password is stored in the transition journal.
- Auth enable/disable is a separate operation after the Firestore transaction because Firebase Auth and Firestore cannot share an atomic transaction. If Auth synchronization fails, the endpoint returns a retryable error with the same request ID; a revoked role remains blocked by Rules and server authorization, while a reactivated role can remain Auth-disabled until retry succeeds.
- `authorizeActiveAdmin` now also rejects malformed Admin station assignments. The Users and transition tests cover that fail-closed boundary.

### Verification performed

- The existing browser session was reused without signing in. The served app imported `firebase/local-role-admin/firebase-config.js`; browser resource origins for Auth, Firestore, and Functions were `127.0.0.1:9099`, `127.0.0.1:8080`, and `127.0.0.1:5001`. The Vite listener was bound to `127.0.0.1:5173`. No production Firebase service was contacted.
- Read-only GET checks confirmed the live Functions Emulator loaded `manageUserRole`, `listUserRoles`, `policeStations`, and `createOperator` (expected method/auth responses: 405, 401, 401, and 405 respectively).
- In the Admin Panel, a uniquely named temporary station and Operator were created successfully (HTTP 201). That Operator was promoted, demoted back to the selected station, revoked, and reactivated through the UI; each transition returned HTTP 201 and the Users table showed the expected state.
- Browser automation could not stabilize physical pointer clicks. The station/Operator forms used native `requestSubmit`, and the Manage action used the button's DOM click handler; their real HTTP requests, confirmation, and rendered results were verified, but pointer-driven interaction was not independently verified.
- Before cleanup, the temporary account was Auth-enabled and had one assignment plus four lifecycle history events. Firestore showed the expected two active Admins. The temporary station had no FIR Master, linked-case, or legacy-case references.
- Cleanup removed only the temporary Auth account, its role and history, its exact provisioning and lifecycle journal documents, and the exact temporary station. Read-back confirmed those records were absent and `activeAdminCount` remained 2.
- Verification passed: root FIR-status tests **19/19**; Users Functions **15/15**; Police Station Functions **7/7**; Operator Functions **14/14**; role transition Functions **11/11**; isolated Admin/Operator Rules **10/10**; production build; and JavaScript syntax checks. The Functions tests used Node 22 against the already-running local emulators. The build emitted existing Vite config-loader and large-chunk advisory warnings.

### Remaining limitations and release blockers

- This is still a demo-project, loopback-only prototype, not production authorization evidence. The governance counter guard assumes `activeAdminCount` was reconciled against trusted active Admin records before use and that this lifecycle endpoint is the exclusive role-transition writer. Out-of-band Admin SDK or console changes can make that counter stale; reconcile before relying on last-Admin protection.
- Auth and Firestore updates are not atomic. A failed revoke-side Auth disable can leave the account able to sign in, although the revoked role is denied by Firestore Rules and protected Functions. A failed reactivation-side Auth enable leaves the role active but the account disabled until the same request is retried.
- Station rename, deletion, reassignment, invitations/setup links, and password-reset workflows are not implemented. Operator provisioning still uses an Admin-entered initial password in this local prototype.
- The separate release blocker remains: case writes are still client-originated and are not atomically coupled to immutable audit events. Do not use this prototype as a production release.

## FIR Master identity claim hardening (2026-10-20)

- The shared trusted handler in `functions/save-fir-master.js` derives the SHA-256 FIR identity claim on the server, checks role and station authorization, enforces Admin-only identity corrections, and commits the master plus claim changes in one Firestore transaction.
- The local prototype exports that handler for emulator testing. Candidate Rules deny direct client writes to `firMasters` and `firIdentityClaims`; the Admin SDK Function is the only write path in this prototype.
- The dedicated FIR integrity suite passed **11/11**; the candidate station Rules suite passed **10/10**. Use the root report at [docs/25-Production-Readiness-and-Security-Report.md](../../docs/25-Production-Readiness-and-Security-Report.md) for the latest release status.
- This prototype and the candidate Rules are not the approved production deployment configuration. Do not deploy or infer production authorization from these local results.
