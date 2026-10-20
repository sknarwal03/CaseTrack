# CaseTrack — Production Readiness and Security Report

**Assessment date:** 2026-10-20\
**Assessment scope:** Current worktree, candidate Firestore Rules, Functions source, local emulator suites, build/deployment configuration, and the shared local Login page\
**Release outcome:** **NOT READY**

> Sections 8–14 preserve earlier assessment snapshots. Their references to an unapproved project, unavailable live metadata, Firebase Auth reset-action handling, or missing deployment authorization are historical and are superseded by the live release inspection in §15.

## 1. Executive summary

The FIR identity-claim bypass is closed locally. The trusted callable derives the SHA-256 claim key, authorizes Admins across stations and Operators only for FIR Masters already owned by their assigned station, and atomically updates the Master and old/new claims. Station ownership cannot be changed through an identity correction. Candidate Firestore Rules deny direct client writes to both `firMasters` and `firIdentityClaims`. Isolated integration coverage validates both roles, cross-station denial, duplicate/concurrent claims, failed-write rollback/retry, and direct claim-write denial.

The Admin Panel and email onboarding work locally against isolated emulators. The current browser workflow covers Admin login, station creation/listing, password-free Operator provisioning, custom setup email, resend revocation, failed-delivery recovery, duplicate rejection, recovery anti-enumeration/rate limit, server-side one-time password setup, native Firebase password-reset bypass rejection, role transitions, and Operator Admin Panel denial. Phase 2 FIR integrity tests cover identity uniqueness, station ownership and failure recovery.

**NOT READY.** Live read-only checks confirmed the approved project and IAM grants, but found that the Cloud Functions API is disabled, Secret Manager is unavailable on the Spark plan, production Firestore Rules permit any authenticated user to read/write all documents, no backup schedule/bucket/PITR is configured, and the deployed Admin Panel/setup pages return 404. No production writes or deploys were made. The current production release blockers are detailed in §15.

## 2. Production target and configuration evidence

| Item | Evidence and status |
|---|---|
| Firebase project ID in the normal frontend configuration | `.firebaserc` defaults to owner-approved `casetrack-97a4e`; normal frontend Functions resolution rejects other project IDs. `firebase projects:list` and live Firebase APIs confirmed the project is active. **Target approved and configured locally.** |
| Root Firebase deployment manifest / aliases | Root `firebase.json` selects Rules, Functions and Node.js 22; `.firebaserc` sets the approved default and predeploy hooks check the project selection. **Local target configured; no deploy command was executed.** |
| Hosting target | `.github/workflows/deploy.yml` deploys `dist` to GitHub Pages; `vite.config.js` sets `base: "/CaseTrack/"`. Firebase Auth authorizes `sknarwal03.github.io`. Read-only HTTPS requests returned **200** for the login page and **404** for `pages/admin-panel.html` and `pages/password-setup.html`. The Admin Panel frontend has not been published. |
| Hosting rewrites | No Firebase Hosting rewrite configuration is present. The Pages workflow is static; no SPA rewrite behavior was evidenced. **Not verified against a deployed site.** |
| Functions target/source | Root `firebase.json` selects `functions/`, Node.js 22 and a project guard; source endpoints use `us-central1`. The live Cloud Functions API returns **403: API disabled/not used**, so deployed Functions inventory could not be read. |
| Functions runtime | Root Functions manifest declares Node.js 22. The host only has Node.js 24.22.0; Firebase Emulator warned and used Node 24. **Node 22 execution is unverified.** |
| Firestore Rules | Live release `cloud.firestore` currently grants `read, write` to every authenticated user on every document. `firestore.admin-panel.rules` is a much stricter candidate, but was not deployed because compatibility with current user-role assignments and legacy records is unverified. |
| Indexes | Live Firestore has no composite indexes or field overrides; default automatic indexes remain. Repository has no `firestore.indexes.json`. Query review found equality filters supported by index merging and default document-ID ordering; no new composite index is currently identified. |
| Environment/secrets | Live Auth has email/password sign-in enabled and lists `sknarwal03.github.io` as an authorized domain. Cloud Functions API is disabled. Secret Manager is unavailable on the current Spark plan; production `SENDGRID_API_KEY` and sender verification could not be verified. No secret value was read. |
| Production configuration status | Project and IAM were verified read-only. Live Rules, backup, Functions API, Secret Manager/billing, SendGrid delivery, site publication and compatibility remain release gates. |

## 3. Security findings and fixes

| Finding | Severity | Evidence/status | Fix and remaining scope |
|---|---|---|---|
| An authenticated client could pair a duplicate FIR identity with a different arbitrary `firIdentityClaims` document ID. Candidate Rules checked claim/master consistency, not the SHA-256 derivation. | Medium, confidence 9/10 (independent review) | **Confirmed in candidate policy; direct-write denial reproduced after fix in an isolated emulator. Production exposure remains unknown.** | Fixed locally: Functions computes the SHA-256 key, validates role and existing station ownership inside the transaction, applies the approved Admin-all-stations/Operator-assigned-station correction policy, and commits master/claim changes atomically. Candidate Rules deny all direct client create/update/delete operations on both protected collections. |
| Four high-severity advisories were previously reported through `@firebase/firestore` to `@grpc/grpc-js`. | Dependency risk rechecked | A compatible root npm override updates the locked `@grpc/grpc-js` dependency; `npm audit --omit=dev` in both the root and Functions packages reports zero vulnerabilities. | The prior advisory state was addressed without a forced Firebase downgrade. Re-run audits against release lockfiles in CI. Runtime inclusion in the browser bundle was not independently assessed. |

### Authorization boundary

- The callable reads the trusted `userRoles/{uid}` record and referenced station; it rejects missing, revoked, unknown, malformed, or inconsistent roles.
- Operators may create/update and correct FIR identity only for FIR Masters already owned by their assigned station. Admins may correct identity across stations. The callable verifies the current role and existing Master ownership in the transaction; station reassignment is not allowed through this operation.
- Client Rules preserve station-scoped reads and deny all direct client writes to master/claim documents, including Admin clients. Privileged writes require the trusted Function.
- Existing Rules tests cover Admin cross-station reads, Operator station isolation, unauthenticated requests, malformed roles/ownership, linked-master constraints, and unauthorized writes.
- **Policy alignment:** the owner-approved Admin/Operator identity-correction policy is recorded in the Role Management ADR and Phase 2 plan and is implemented by the trusted callable. Tests verify assigned-station Operator correction, cross-station denial, and Admin correction at another station. Production deployment remains unverified.
- This local candidate Rules/Function pairing is not deployed-target evidence. Admin SDK Functions bypass Rules and must be deployed with the reviewed implementation and IAM/runtime settings.

## 4. FIR Master identity integrity

**Locally verified implementation**

- Server-side SHA-256 derivation from normalized FIR number/year and the exact stable `policeStationId`; no client-supplied claim ID is trusted.
- Create and identity correction use one Firestore transaction for the master and identity claim. A correction claims the new key and releases the old owned claim atomically.
- Existing master IDs remain stable. Existing proceeding IDs, hearing arrays, and relationship fields are not migrated or rewritten.
- A duplicate master or claim is rejected; a failed conflict/authorization path leaves the previous master and claim unchanged.
- Concurrent duplicate attempts result in one master/claim owner in the isolated emulator.
- A retry using the same preallocated master ID is idempotent. This tests the stable-ID retry boundary; a real network acknowledgement-loss browser scenario was not exercised.
- The server checks existing station-scoped Masters and legacy records before creating a claim. The query is station-scoped. Records with missing or ambiguous station IDs still require a separately reviewed inventory; no backfill or merge was performed.

**Not verified**

- Production claim inventory, existing duplicates, old/malformed claims, or station-ID completeness.
- Real deployment behavior and production transactions.
- Migration/backfill. No backfill is authorized or included.

## 5. Admin and Operator authorization results

| Scenario | Result |
|---|---|
| Admin reads permitted FIR Masters across stations under candidate Rules | Verified locally by Rules tests. Direct Master writes are intentionally denied; writes must use Functions. |
| Operator reads/writes proceeding records within assigned station | Candidate Rules tests cover station ownership and linked-master relationships; role-management Functions tests cover active role and assignment workflows. |
| Cross-station operator access and forged station ownership | Denied in candidate Rules and callable integration tests. |
| Missing, revoked, malformed, unknown, unauthenticated role | Denied in local Rules/Functions test scenarios. |
| Admin station creation/listing and Operator creation/assignment | Role-management Functions tests passed locally; Admin station/Operator provisioning was also exercised in the isolated browser emulator. |
| Operator assigned station display and navigation | Browser verified the canonical assigned-station name; Admin Panel navigation is hidden for the Operator and direct access remains denied. Candidate Rules allow only assigned-station `get` for Operators and deny station listing. |
| FIR Master/identity claim writes | Direct client writes denied. Active role, existing station ownership, duplicate, and approved Admin/Operator correction checks are enforced in the callable. |
| Deployed-target Rules and Functions | **Not verified**; no approved deployment mapping or production access was provided. |

## 6. Multi-proceeding data integrity

- The per-proceeding form helper regression confirms separate officer, accused, witness, and highlight values are retained for two proceeding drafts.
- The identity failure test confirms a linked proceeding and hearing history remain unchanged after a rejected identity correction.
- Existing legacy IDs/hearing history normalization tests remain in the root unit suite.
- New proceeding drafts preallocate and retain their Firestore document ID and creation timestamp for retry. Transfer successor creation and predecessor update use one atomic Firestore batch, and a candidate Rules regression verifies both commit together or neither does.
- The isolated Operator browser created a synthetic FIR Master and linked proceeding. It then transferred a synthetic lower-court proceeding to Sessions Court; Admin SDK inspection confirmed both predecessor/successor IDs, the predecessor `Committed` status, the shared FIR Master ID, and the successor `Session Court` type.
- The All Cases layout was checked at 390px and 320px widths without document-level horizontal overflow. The mobile sidebar opened and closed by backdrop/Escape.
- Editing saved hearing history, forced network-failure recovery, all Admin/Operator responsive workflows, and live legacy migration remain unverified.

## 7. Browser and automated verification

### Browser

- Browser checks used a dedicated local emulator project and Vite server, separate from the pre-existing demo emulator. Only synthetic test identities, a synthetic station, and synthetic FIR/proceeding records were created; no production Firebase target was contacted.
- Verified Admin login/Panel rendering and Operator provisioning; Operator login/dashboard, All Cases empty state, Add Case modal, canonical assigned-station name, hidden Admin navigation, and denied direct Admin Panel access.
- Successfully submitted a synthetic FIR Master and linked proceeding. A synthetic transfer saved a matching predecessor/successor relationship atomically; the predecessor appeared as `Committed`, and the new Sessions Court record linked back to it.
- The cases page had no document-level horizontal overflow at 390px and 320px. The mobile sidebar opened and closed with both backdrop and Escape. Broader responsive Admin workflow and browser-level network-failure/retry checks remain pending.

### Automated results

Only commands actually executed are reported. Tests use disposable emulators with demo project IDs and dedicated ports; no unknown emulator data was cleared.

| Suite/check | Command / environment | Result |
|---|---|---|
| Root unit tests | `npm test` | **24 passed, 0 failed** (FIR status/identity/legacy, hearing-date boundaries, and per-proceeding fields). |
| FIR identity Functions integration | From `security-prototypes/role-management`: `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,functions --config ../../firebase.phase2.test.json --project demo-casetrack-phase2-integrity "node --test --test-concurrency=1 ../../test/fir-master-integrity.integration.test.mjs"` | **15 passed, 0 failed** on Node.js 22. Covers direct claim denial, assigned-station Operator correction, cross-station/transfer denial, Admin correction at another station, duplicate/concurrent claims, failed commit rollback/retry, and same-ID create retry. |
| Candidate station/admin Rules | From `security-prototypes/role-management`: `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --config ../../firebase.admin-panel.test.json --project demo-casetrack-admin-panel-rules "node --test --test-concurrency=1 tests/case-data.rules.test.js"` | **11 passed, 0 failed** against `firestore.admin-panel.rules` in a dedicated emulator, including assigned-station station reads and atomic transfer success/rollback. Candidate only. |
| Role-management Functions | From `security-prototypes/role-management`, set `$env:CASETRACK_ROLE_TEST_FIRESTORE_PORT='8187'`, `$env:CASETRACK_ROLE_TEST_AUTH_PORT='9198'`, `$env:CASETRACK_ROLE_TEST_FUNCTIONS_PORT='5003'`; run `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,functions --config ../../firebase.role-management.isolated.test.json --project demo-casetrack-role-prototype "node --test --test-concurrency=1 functions/tests/users-list.test.js functions/tests/police-stations.test.js functions/tests/operator-creation.test.js functions/tests/role-transitions.test.js"` | **47 passed, 0 failed**. Role/station provisioning, authorization, role transitions, and failure/retry suites passed on Node.js 22. Production dependency audit is clean. |
| Baseline role/station Rules | From `security-prototypes/role-management`: `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --config ../../firebase.baseline.test.json --project demo-casetrack-role-rules "node --test --test-concurrency=1 tests/role-management.rules.test.js tests/station-isolation.rules.test.js"` | **2 passed, 0 failed** in the isolated default-deny emulator. The package script wrapper was not used because its `npx --package=node@22` dependency was unavailable from the local cache/network. |
| Production frontend build | `npm run build` | **Passed**. The prior `__dirname` config warning is fixed; a generated >500 kB chunk warning remains. |
| JavaScript/config syntax | `node --check functions/index.js; node --check functions/save-fir-master.js; node --check test/fir-master-integrity.integration.test.mjs; node --check test/proceeding-fields.test.mjs; node -e "for (const f of ['package.json','firebase.phase2.test.json','firebase.role-management.isolated.test.json','functions/package.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON parse passed')"` | **Passed.** |
| Root frontend dependency audit | `npm audit --omit=dev` (run twice on 2026-10-20) | **0 vulnerabilities** on both runs. `npm ls @grpc/grpc-js --all` confirmed the installed transitive path/version in Section 3. |
| New Functions dependency audit | `npm audit --omit=dev` from `functions/` | **0 vulnerabilities.** |
| Production Firebase verification | No production access attempted | **Not run.** |

The candidate Rules suite initially failed because its new test expected a return value from `withSecurityRulesDisabled()`, which does not return the callback result. The assertion was moved inside the callback and the full suite passed. Emulator suites used demo project IDs and loopback emulator ports only.

## 8. Production Rules/configuration verification status

- **Verified locally:** Candidate Rules deny direct Master/claim mutations; isolated Rules and callable tests pass.
- **Verified live read-only:** Project ID and IAM grants; current deployed Rules release; Firestore database location/protection settings; composite index inventory; backup schedules and Storage bucket inventory; Auth email/password setting and authorized domains; GitHub Pages route status. Exact results are in §15.
- **Not verified:** Deployed Functions inventory (Cloud Functions API is disabled), SendGrid delivery/sender, user role assignments, case-record ownership/legacy field completeness, restore, or live Admin Panel workflows. No production user/case records were queried or modified.

## 9. Backup, rollback, and migration requirements

- Live inspection found no Firestore backup schedules and no Cloud Storage buckets. The database has PITR disabled, delete protection disabled, and a 3,600-second version-retention period. No production backup, export, restore, or rollback drill was run.
- The GitHub Pages workflow publishes `dist` on pushes to `main`, but no release artifact retention or rollback procedure is documented. No hosting, Functions, Rules, or backup artifact was created or changed.
- Before any production write, establish an owner-approved, access-controlled recoverable backup and retention policy; complete a restore rehearsal; and document rollback for Functions and Rules. Cost, target bucket/location, and retention must be approved because the current project is on the Spark plan and has no bucket.
- Inventory existing Masters, claim documents, duplicate identities, legacy cases, missing station IDs, and malformed station ownership in a separately authorized read-only process.
- Do not backfill claims, rewrite IDs, merge/reassign records, delete records, or repair inconsistent claims until an explicit migration/reconciliation plan is approved.
- The first deployment of the trusted Function and deny-client-write Rules must be coordinated; otherwise the UI may be unable to save FIR Masters or existing clients may retain an unsafe write path.

## 10. Remaining risks, dependencies, and release blockers

1. **Platform billing/APIs:** The signed-in CLI account has the tested IAM grants, but Cloud Functions API is disabled and Secret Manager cannot be enabled on the Spark plan. The project owner must approve Blaze billing and the required APIs before Functions/secrets can be provisioned.
2. **Email delivery configuration:** Confirm a verified SendGrid sender and provision `SENDGRID_API_KEY` through Secret Manager. Do not send the key in chat. The custom setup-token flow does not require Firebase Auth's native reset-action handler; Auth email/password is enabled and the GitHub Pages domain is authorized.
3. **Dependency audit:** Current production audits are clean. Re-run audits against release lockfiles in CI; investigate if advisory data or locked dependencies change. No forced downgrade or override is pending.
4. **Rules/data compatibility:** The live Rules allow any authenticated user to read/write every collection. The strict candidate Rules could alter access to current roles or legacy cases. Review role/station assignments and legacy record ownership against a recoverable copy; do not deploy an unverified cutover or run an unapproved migration.
5. **Hosting release:** GitHub Pages currently serves login only; Admin Panel/setup routes return 404. The local frontend update is not published. Publish through an explicitly approved GitHub Pages release path.
6. **Indexes:** Live composite index inventory is empty; source query review found no required new composite index. Keep the deployed inventory intact and add only any index demanded by a verified query.
7. **Backup/rollback:** Approve and establish backup destination, retention, restore rehearsal, and Functions/Rules rollback before any production write. No migration/backfill is included.
8. **Node runtime parity:** Run the Functions suite on declared Node.js 22 in CI; this host had Node.js 24.22.0 only.
8. **Proceeding partial failures:** Transfer linkage is atomic and new proceeding drafts retain retry IDs. Fault-injection/browser tests are still needed for ambiguous acknowledgements, partial multi-record saves, and status-refresh failure.

## 11. Controlled release gate

1. Project `casetrack-97a4e` and production release are owner-approved. The current CLI account has the tested deployment IAM grants.
2. Establish an approved recoverable Firestore backup and restore rehearsal before any production write.
3. Enable billing/APIs through the project owner, then verify and inventory existing Functions before choosing exact deploy names.
4. Confirm a verified SendGrid sender and set `SENDGRID_API_KEY` through Secret Manager; do not place the key in source control or chat.
5. Resolve Rules compatibility against a recoverable existing-data inventory. Preserve user roles, station ownership, FIRs and proceedings; no migration or Rules cutover is authorized by this report.
6. Publish the current frontend through an authorized GitHub Pages release path; the published Admin Panel/setup routes currently return 404.
7. Run the Functions suite on Node.js 22 and perform production verification only after all gates above pass.
8. Once safe, use an explicitly scoped deployment to `casetrack-97a4e`, avoid deleting unrelated Functions/indexes, and follow the rehearsed rollback plan.

## 12. Files changed and safety confirmation

This policy-resolution task updated `functions/save-fir-master.js`, `test/fir-master-integrity.integration.test.mjs`, `security-prototypes/role-management/tests/case-data.rules.test.js`, the Role Management ADR, the Phase 2 implementation plan, and this report. Other staged, unstaged, and untracked work was preserved. No deployment, production data mutation, migration, staging, commit, reset, stash, or discard occurred. This report does not authorize deployment.

**Final gate: NOT READY.**\
**No production deployment, production data mutation, staging, or commit occurred.**

## 13. Admin Panel real-Firebase follow-up (2026-10-20)

This section records the initial follow-up inspection. Its implementation and status findings are superseded by the later update in §14. The approved target was not confirmed, so no live Firebase sign-in, read, write, or deployment was attempted. The pre-existing local emulator/browser evidence remains prototype-only and does not establish live-service behavior.

### Follow-up verification actually run

| Check | Exact command | Result |
|---|---|---|
| Root unit tests | `npm test` (sandbox attempt), then approved elevated rerun of `npm test` | Sandbox attempt failed to spawn child processes (`spawn EPERM`). Elevated rerun **passed: 24 passed, 0 failed**. |
| Production build | `npm run build` | **Passed.** Vite emitted the existing large chunk warning (`local-role-admin-endpoints` bundle 554.69 kB, above 500 kB). |
| Root production dependency audit | `npm audit --omit=dev` | **Passed: 0 vulnerabilities.** |
| Syntax/config and whitespace | `node --check functions/index.js; node --check functions/save-fir-master.js; node -e "for (const f of ['package.json','functions/package.json','firebase.phase2.test.json','firebase.role-management.isolated.test.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON parse passed')"; git diff --check` | Syntax and JSON checks passed; `git diff --check` passed with existing LF-to-CRLF working-copy warnings. |
| Live Firebase workflow | Not run | **Blocked:** approved project ID, credentials/access authorization, deployed Functions and Rules are not established. No production resource was contacted. |

### Remaining Admin Panel release blockers

1. Obtain written confirmation of the exact approved Firebase project and authorize the intended live-service verification separately from any deployment.
2. Complete emulator verification of the newly integrated root Functions and frontend workflows, then independently review the copied trusted handlers and candidate Rules before release.
3. Confirm the deployed Hosting origin, configure `ADMIN_PANEL_ALLOWED_ORIGINS`, configure the Firebase Auth password-reset template to use `pages/password-setup.html`, set the verified sender and continue URL, and populate the `SENDGRID_API_KEY` Functions secret through Secret Manager.
4. Confirm required composite indexes and backup/rollback procedures. The repository contains no approved index inventory or production backup evidence.
5. Obtain explicit approval for live verification and separate deployment authorization. The expired Firebase CLI session must be reauthenticated by an authorized operator before project metadata can be listed.

**Initial follow-up result:** NOT READY at inspection time. The implementation update and current gate are recorded in §14.

## 14. Root Admin Panel integration and email onboarding update (2026-10-20)

### Implementation completed locally

- Root Functions now exports Admin-authenticated station/user/role operations, `getMyAccess`, Operator provisioning, invitation resend, public password recovery, and setup-code validation. Caller ID tokens are verified with revocation checking; privileged operations read authoritative active roles from Firestore. Role transition history/governance and FIR uniqueness/ownership transactions remain in place.
- Operator accounts are created without passwords. Firebase Auth generates password-reset action links; Functions deliver them through SendGrid using the Secret Manager-bound `SENDGRID_API_KEY`. Admins can resend invitations. Recovery is non-enumerating and rate-limited per active Operator. Only a SHA-256 fingerprint of the current code is stored; a resend replaces it, and code validation also requires an active, enabled Operator. Firebase action codes enforce expiry and one-time use. The password setup page verifies the code, checks the server registry, confirms the password through Firebase Auth, removes the code from browser history, and displays expired/invalid/used/revoked/account-disabled errors without logging secrets.
- A test-only email transport can be configured only for the fixed demo Functions emulator and loopback host. Production always uses the SendGrid API endpoint. The Admin Panel no longer asks for an Operator password.
- `vite.config.js` includes `pages/password-setup.html` as a production multi-page entry; the final build emitted `dist/pages/password-setup.html` and its bundled module.
- `.firebaserc` defaults to owner-approved project `casetrack-97a4e`; the frontend rejects non-approved project IDs in normal mode. Functions and Admin Panel endpoints use `us-central1`. Root `firebase.json` selects `functions/`, `firestore.admin-panel.rules`, Node.js 22 and predeploy project guards. No production index file was created because actual query/index requirements have not been verified.
- Firebase Auth's custom password-reset action handler, continue URL allowlist, SendGrid verified sender, project secret, production CORS origin and hosting remain to be configured/verified. The static workflow identifies GitHub Pages; the production hosting origin itself still needs owner verification. Local Admin Panel emulator mode remains explicit and uses a separate demo project/loopback ports.

### Verification and current deployment boundary

Automated verification actually run against isolated demo emulators and local assets:

- `npm test`: **24 passed, 0 failed** (root Node test suite). It required elevated execution after the sandboxed Node runner failed to spawn workers (`EPERM`).
- Root Functions integration suite before the email flow change: **47 passed, 0 failed** across user listing, station management, prior provisioning and role transitions. The current browser E2E below executes the new root Functions onboarding endpoints. The host runtime was Node 24; Firebase CLI warned the Functions package declares Node 22.
- `firebase emulators:exec --only firestore --config ../../firebase.admin-panel.test.json --project demo-casetrack-admin-panel-rules "node --test --test-concurrency=1 tests/case-data.rules.test.js"`: **11 passed, 0 failed**.
- `firebase emulators:exec --only auth,firestore,functions --config ../../firebase.phase2.test.json --project demo-casetrack-phase2-integrity "node --test --test-concurrency=1 ../../test/fir-master-integrity.integration.test.mjs"`: **15 passed, 0 failed**, including direct client claim-write denial, authorized server-derived claims, cross-station denial, duplicates, concurrent identity claims, rollback and retry.
- `firebase emulators:exec --only auth,firestore,functions --config firebase.admin-panel.local.json --project demo-casetrack-role-prototype "node e2e/admin-panel.browser.test.cjs"`, with the Vite `role-admin-local` mode pointed to Auth 9198/Firestore 8187/Functions 5003 and a loopback-only SendGrid capture on 7077: **passed** for Admin login, station create/list, unauthenticated rejection, Operator email provisioning, resend and old-link revocation, duplicate rejection, failed-delivery recovery, recovery anti-enumeration/rate behavior, one-time password setup, used/invalid link rejection, a simulated `EXPIRED_OOB_CODE` UI response, role promotion/demotion, and Operator Admin Panel denial. The E2E cleaned disposable accounts/records. A non-fatal Node metadata DNS warning appeared. Expiration was simulated; a real time-expired Firebase code was not generated.
- `node --test functions/tests/operator-email.test.cjs`: **5 passed, 0 failed** for password-free validation, Firebase reset-link delivery, provider failure, code replacement/disabled/revoked account validation, and continue URL checks.
- `npm run build`: **passed**, with no chunk-size warning in the final build.
- `npm audit --omit=dev`: **0 vulnerabilities**; `npm audit --prefix functions --omit=dev`: **0 vulnerabilities**. `npm install --prefix e2e` also reported 0 vulnerabilities for the E2E package.
- `node --check` on root Functions, onboarding, Admin Panel JS, browser E2E and Firebase project guard scripts, plus JSON parsing for Firebase configs: **passed**.
- `git diff --check`: **passed**; Git emitted only line-ending normalization warnings.

The owner has approved `casetrack-97a4e`; that is now the Firebase CLI default alias and the only project ID accepted by normal frontend endpoint resolution. The website's Firebase configuration already used this project. Read-only live metadata verification still has not run because CLI credentials require reauthentication and network access was unavailable. No live Firebase verification or deployment was attempted. No production data was accessed or changed.

Unverified release requirements include: reauthenticated Firebase CLI and IAM permissions; review of exact Functions/Rules/index deployment impact; required production indexes; approved production Hosting origin and corresponding CORS allowlist; Firebase Auth custom action-handler/continue-URL configuration; verified SendGrid sender/domain; Functions `SENDGRID_API_KEY` Secret Manager binding/value; live security and browser verification; and approved backup/rollback evidence. No production backup was created or modified. Production deployment and Auth configuration changes still require explicit owner authorization.

**Current gate: NOT READY.** The source now implements the approved email-based onboarding and is verified in isolated local emulators. Live SendGrid/Firebase Auth configuration, CLI/IAM access, production Rules/index/deployment impact, backup/rollback and live verification remain open. Production deployment was not performed.

## 15. Production release inspection and current gate (2026-10-20)

### Live read-only findings

- Firebase CLI authentication was available. `firebase projects:list --json --project casetrack-97a4e` confirmed the active approved project. Resource Manager `testIamPermissions` confirmed the signed-in account has the checked Cloud Functions, Cloud Run, Firestore/index/export/backup, Firestore Rules, Secret Manager, and `iam.serviceAccounts.actAs` permissions. Hosting site listing succeeded with read access; Hosting write permission was not separately tested. IAM is not the current Functions/Rules blocker.
- The Cloud Functions API is disabled: the live Cloud Functions list API returned **403** stating the API has not been used or is disabled. Deployed Functions could not be inventoried. No Functions deploy was attempted.
- Firebase CLI Secret Manager metadata lookup reported the project must be on the **Blaze** plan before `secretmanager.googleapis.com` can be enabled. The attempted API enable was rejected; no API/secret setting changed. The live database also reports `freeTier: true`. No SendGrid API key value was accessed, and the sender's SendGrid verification status remains unknown.
- Live Firestore Rules release `projects/casetrack-97a4e/releases/cloud.firestore` points to Rules granting `read, write` for every document whenever `request.auth != null`. This exposes all collections to any signed-in user and permits direct role/station/case mutations. The candidate station/role Rules were not deployed because current user roles and legacy document ownership could not be checked safely without a recoverable backup. Deploying the candidate could also change existing case access.
- Live database `(default)` is Firestore Native, Standard edition, region `asia-south2`; PITR and delete protection are disabled, version retention is 3,600 seconds. The backup-schedule API returned no schedules and Cloud Storage returned no buckets. No backup or export was created.
- Live composite indexes and field overrides are empty; only Firestore default automatic indexes are configured. The inspected queries use equality filters and default document-ID ordering; no new composite index was identified. No index file is present, so no index deploy was run.
- Firebase Auth has email/password sign-in enabled and lists `sknarwal03.github.io` among authorized domains. The custom setup token does not use Firebase's native reset-action handler or continue URL. A public GET returned **200** for `https://sknarwal03.github.io/CaseTrack/pages/login.html`, but **404** for both `/CaseTrack/pages/admin-panel.html` and `/CaseTrack/pages/password-setup.html`. The project also has a Firebase Hosting site at `https://casetrack-97a4e.web.app`, but the repository has no Firebase Hosting deploy target; it was not substituted or deployed.

### Security issue resolved locally

The prior local onboarding implementation generated native Firebase Auth password-reset links. That code could be submitted directly to Firebase's native `accounts:resetPassword` endpoint, bypassing the server-side resend-revocation registry. The flow now uses a cryptographically random 32-byte custom token, stores only its SHA-256 hash, expires it after 24 hours, and carries it in the URL fragment. A trusted Function validates the current active/enabled Operator, transactionally claims the token, and sets the password through Firebase Admin SDK. Resend replaces the hash; invalid, expired, used, disabled, and revoked links fail closed. A browser/emulator test confirmed the custom token is rejected by the native Firebase password-reset endpoint. The custom flow is local only until Functions, SendGrid, and the website are released.

### Verification run for this release update

| Check | Command | Result |
|---|---|---|
| Root regression suite | `node --test --test-isolation=none test/fir-status.test.mjs test/hearing-date.test.mjs test/proceeding-fields.test.mjs` | **24 passed, 0 failed.** |
| Functions onboarding tests | From `functions/`: `node --test --test-isolation=none tests/*.test.cjs` | **5 passed, 0 failed.** A `node --test functions/tests/operator-email.test.cjs` attempt first hit sandbox `spawn EPERM`; the direct runner completed successfully. |
| Candidate Security Rules | From `security-prototypes/role-management/`: `$env:CASETRACK_ROLE_TEST_FIRESTORE_PORT='8187'; $env:CASETRACK_ROLE_TEST_AUTH_PORT='9198'; $env:CASETRACK_ROLE_TEST_FUNCTIONS_PORT='5003'; node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --config ../../firebase.admin-panel.test.json --project demo-casetrack-admin-panel-rules "node --test --test-concurrency=1 tests/case-data.rules.test.js"` | **11 passed, 0 failed.** Isolated Firestore emulator only. |
| FIR identity integrity | From `security-prototypes/role-management/`: with `DEBUG=''`, `FIREBASE_DEBUG_MODE=''` and the same three role-test ports as above: `node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,functions --config ../../firebase.phase2.test.json --project demo-casetrack-phase2-integrity "node --test --test-concurrency=1 ../../test/fir-master-integrity.integration.test.mjs"` | **15 passed, 0 failed.** Includes Admin cross-station correction, assigned-station Operator correction, cross-station denial, duplicates, concurrent claims, rollback/retry, and direct client claim-write denial. |
| Admin Panel browser/E2E | Started Vite with `$env:VITE_ROLE_ADMIN_AUTH_PORT='9198'; $env:VITE_ROLE_ADMIN_FIRESTORE_PORT='8187'; $env:VITE_ROLE_ADMIN_FUNCTIONS_PORT='5003'; npm run dev -- --host 127.0.0.1 --port 5174 --mode role-admin-local`. Then set `DEBUG=''`, `FIREBASE_DEBUG_MODE=''`, test-only `SENDGRID_API_KEY='emulator-only-test-value'`, `OPERATOR_EMAIL_FROM='verified@example.test'`, `OPERATOR_SETUP_URL='http://127.0.0.1:5174/CaseTrack/pages/password-setup.html'`, and `OPERATOR_EMAIL_API_URL='http://127.0.0.1:7077'` before `node security-prototypes/role-management/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,firestore,functions --config firebase.admin-panel.local.json --project demo-casetrack-role-prototype "node e2e/admin-panel.browser.test.cjs"` | **Passed.** Admin login, station creation/list, unauthenticated rejection, provisioning, resend/old-token revocation, native endpoint bypass rejection, duplicate rejection, failed delivery/recovery, recovery anti-enumeration/rate limiting, one-time password set, expired/invalid/used rejection, role transitions, and Operator Admin Panel denial. Test data was disposable and cleaned. No real email was sent. |
| Production build | `npm run build` | **Passed.** `dist/pages/password-setup.html` emitted; no chunk-size warning. |
| Normal Vite endpoint resolution | `npm run dev -- --host 127.0.0.1 --port 5189`; headless browser opened `/CaseTrack/pages/password-setup.html` without a token and imported `functionsEndpoint("getMyAccess")` | **Passed for routing only:** HTTP 200, endpoint resolved to `https://us-central1-casetrack-97a4e.cloudfunctions.net/getMyAccess`, no emulator requests, no page errors. A separate normal-mode Admin Panel load returned HTTP 200 but timed out waiting for its access status while Firestore logged `unavailable`; live Admin Panel use is **not verified**. |
| Dependency audits | `npm audit --omit=dev` from root and from `functions/` | **0 vulnerabilities** in each. |
| Syntax/config/project guard | `node --check` on Functions, browser/setup, E2E and guard scripts; JSON parse; `node scripts/assert-firebase-project.cjs` | **Passed.** |
| Whitespace | `git diff --check` | **Passed**, with existing LF-to-CRLF working-copy warnings. |

### Warnings and boundaries

- Host Node.js is **24.22.0**; Node.js 22 is declared by the Functions package and Firebase manifest but is not installed. The Functions emulator explicitly warned it used Node 24. Node 22 runtime verification remains open.
- Emulator runs emitted a non-fatal metadata DNS warning (`ETIMEDOUT`, `ENOTFOUND`); all assertions passed. The Rules emulator also logged expected denied writes and a non-fatal missing VS Code notification endpoint.
- In normal development mode, the Admin Panel HTML loaded but its status check did not finish; Firestore logged an `unavailable` connection error. The isolated setup-page routing check passed without emulator requests, but the production Firebase backend is not functioning/verified from this network session.
- Local E2E used only fixed demo project IDs, loopback emulators, disposable identities/data, a fake SendGrid test value, and local email capture. Production Admin login, real SendGrid email, live Rules access, and live case workflows were not run.
- Live inspection read project/configuration metadata and Rules text only. No production user, FIR, proceeding, hearing, role, or station-assignment document was read or changed. No production backup, API enablement, Auth change, Functions deploy, Rules deploy, index deploy, migration, staging, or commit occurred.

**Final status: NOT READY.** Release is blocked by the Spark-plan/API gate, absent recoverable backup and rollback rehearsal, permissive live Rules plus unverified legacy-data compatibility, unconfigured/unverified SendGrid delivery, and unpublished Admin/setup pages. The owner has authorized release to `casetrack-97a4e`; that authorization does not remove these safeguards. Do not deploy Functions or replace Rules until they are resolved.
