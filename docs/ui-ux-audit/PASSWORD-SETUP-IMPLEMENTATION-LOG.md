# Password Setup Implementation Log

## Increment 1B-B1 — Token infrastructure

**Status:** Complete within approved B1 scope. UX-001 remains **Open**. No endpoint work was started.

### Changes

- `functions/operator-email.cjs`: allowlisted `initial_setup` and `password_recovery`; requires an explicit purpose when registering a token and when sending through the existing email helper. Newly written `operatorSetupActionCodes/{uid}` documents now include `purpose`. Added internal `getCurrentPurpose(uid, token)` for trusted server-side lookup; it returns a purpose only for a matching, unexpired, issued token with an allowlisted purpose. Validation and transaction transitions require that expected purpose and compare it to the stored field. Legacy records with no purpose fail closed.
- Token states remain `issued`, `consuming`, and `used`; added `revoked` with digest deletion. Claims remain Firestore transactions. Replacement invalidates the previous token digest; a `consuming` token cannot be replaced. Expiry remains based on `issuedAt`/`expiresAt`; malformed, expired, reversed, or longer-than-24-hour windows fail closed.
- The email helper now requires purpose and uses purpose-specific setup/reset copy. It remains disconnected from production provisioning; no SendGrid secrets, delivery configuration, or production wiring were added.
- `functions/tests/operator-email.test.cjs`: added coverage for required/allowlisted purpose, recovery versus initial-setup role state, wrong/missing purpose, legacy documents, digest storage, token replacement, expiration, revocation, one-time use/replay, concurrent claims and generated token shape.
- `functions/tests/operator-email.firestore-emulator.test.cjs`: added opt-in local emulator coverage. It uses a unique synthetic UID and cleans up its own token and role documents.
- `e2e/admin-panel.browser.test.cjs`: updated its existing concurrency fixture to use explicit initial-setup purpose and role state. The full browser E2E was not run.
- The master issue register, implementation checklist, backend architecture, security review, API contract, and emulator test plan now reflect the approved purpose/state decisions and B1 evidence. UX-001 remains Open and B2 remains gated on separate approval.

### Compatibility and boundaries

- Frontend payloads remain `{uid, token}` and `{uid, token, password}`; no client-controlled purpose field was introduced.
- Current registry helper callers must supply the purpose as trusted internal context. Future endpoints must obtain it from `getCurrentPurpose`/the token record, never from request JSON, then pass that expected purpose into validation or claim.
- Existing purpose-less records are rejected, not inferred. No production migration was performed.
- Existing temporary-password provisioning, roles, Firebase Authentication configuration, Firestore Rules, UI, and deployment were not changed.
- No persistent rate limiter exists in the repository. A shared persistent limiter needs additional counter storage/schema fields or an approved external edge service; it is outside the purpose-only schema approval. B1 does not claim rate limiting is implemented.

### Verification

- `npm test` in `functions/`: **8 passed, 0 failed, 1 skipped**. The skip is the opt-in Firestore Emulator test when no emulator host is set.
- Root `npm test`: **42 passed, 0 failed**.
- `firebase emulators:exec --only firestore --project demo-casetrack-password-token-tests "node --test functions/tests/operator-email.firestore-emulator.test.cjs"`: **1 passed, 0 failed**. Verified transaction concurrency and that a fresh registry instance reads the persisted Firestore state. It did not test persistence across an emulator process restart.
- `node --check` passed for the changed helper, unit test, emulator test, and E2E fixture. `git diff --check` passed.
- Browser E2E, endpoint behavior, Auth password update, actual recovery delivery, and production behavior were not verified in B1.

### Remaining risks / next increment

- The setup validation and completion handlers are still absent; the frontend workflow remains unavailable.
- No rate limiting, issuance authorization, recovery issuance/reissue workflow, or reconciliation process for ambiguous Auth writes is implemented.
- The token helper is not integrated into operator provisioning. B1 does not establish that any user can receive a token.
- Proceed to B2 only after separate explicit approval. B2 must keep purpose server-derived, match the existing frontend contract, and use approved rate-limit infrastructure or remain blocked from endpoint exposure.

### Rollback

No production state or deployed configuration changed. On this branch, revert only the B1 edits to `functions/operator-email.cjs`, `functions/tests/operator-email.test.cjs`, `functions/tests/operator-email.firestore-emulator.test.cjs`, `e2e/admin-panel.browser.test.cjs`, and the B1 sections/addenda in the audit documents; remove this log if rolling back the full increment. Do not reset the workspace or restore the entire untracked audit directory, because it contains unrelated work. Existing purpose-less Firestore records need no rollback or migration; the helper change is reversible in source.

## Increment 1B-B2 — Validation endpoint and persistent limiter

**Status:** Complete within approved B2 scope. UX-001 remains **Critical · Open**. No completion endpoint, password mutation, provisioning integration or deployment was started.

### Changes

- `functions/password-setup.cjs`: added the HTTP validation handler and Firestore-backed persistent limiter. Input is strict JSON with exactly `{uid, token}`, <=4 KiB, POST only. Explicit CORS allowlist and preflight are handled; CORS is not authentication. Purpose is looked up from the stored token and is never client supplied. Validation checks existing registry eligibility and does not consume the token. Valid/invalid responses disclose only `{valid:true|false}`. Invalid-link categories share the same response; dependencies and limiter fail closed.
- `functions/index.js`: exported `validateOperatorSetupCode` using Firebase Functions v2 `onRequest` in `us-central1`, with the current Admin browser origin allowlist. No other handler was added.
- Added `functions/tests/password-setup.test.cjs` and `functions/tests/password-setup.firestore-emulator.test.cjs`.

### Limiter design and limits

- Collection `operatorSetupRateLimits`; ID is SHA-256 of a versioned limiter namespace and normalized source prefix. IPv4 is grouped by /24; IPv6 by /56. No raw IP, UID, token, password or email is stored. Per-prefix identifier choice prevents trivial bypass by varying UID, though source-network rotation can bypass it and shared networks can affect each other.
- Fixed window: **30 attempts per 15 minutes**. A transaction serializes counter updates. `Retry-After` is returned at threshold. Missing/unparseable source address or Firestore failure fails closed with 503.
- Cleanup is opportunistic, bounded to 10 expired documents per request, and candidates are transactionally rechecked before delete. There is no TTL policy. Inactivity or cleanup errors can leave stale records; a scheduled cleanup/TTL policy would require separate authorization/configuration.
- Cost: normally one transactional document read and one write per counted attempt; occasional expired-record query and bounded transaction reads/deletes. This is basic abuse friction, not production-grade protection. It does not resist distributed proxies/botnets and has no independent App Check/edge layer.
- Source inspection found existing Admin SDK database access and a final client-deny Firestore Rules catch-all; the built-in single-field `expiresAt` query needs no custom index. No Rules, index, IAM or external-service changes were needed.

### Verification

- Root `npm test`: **42 passed, 0 failed**.
- `functions/npm test`: **15 passed, 0 failed, 2 skipped** in the ordinary run. Both skips are opt-in emulator tests because no emulator hosts were set for that invocation.
- Dedicated demo-project Auth + Firestore Emulator run: `firebase emulators:exec --only auth,firestore --project demo-casetrack-password-b2 "node --test functions/tests/password-setup.firestore-emulator.test.cjs"` — **1 passed, 0 failed, 0 skipped**. Synthetic Auth/role/token records only; checked both purposes, invalid/expired/revoked/used/missing-purpose tokens, token remains `issued`, limiter threshold/concurrency and persistence across limiter reconstruction. It did not test a whole emulator process restart.
- The emulator logged Firestore transaction-lock-timeout warnings during concurrent stress, while the test ultimately passed with the expected 3 allowed / 3 rejected attempts. Treat this as emulator contention; real production contention/capacity was not verified.
- `npm run build -- --emptyOutDir`: passed; emitted `dist/pages/password-setup.html` and `dist/assets/passwordSetup-DqWiEuDE.js` plus CSS/shared assets.
- `node --check` passed for new handler/tests and `functions/index.js`; `git diff --check` passed. No live HTTP Functions emulator or browser valid-link workflow was exercised.

### Remaining risks / next increment

`completeOperatorPasswordSetup` remains absent. Thus there is no password update or token-consumption endpoint; a successful validation only indicates that the link currently qualifies. Recovery issuance/reissue, sending, production limiter hardening, operational cleanup, and crash reconciliation across Auth/Firestore remain unimplemented. UX-001 stays Open. B3 requires separate approval.

### Rollback

Remove the B2 export and imports/initialization from `functions/index.js`; remove `functions/password-setup.cjs`, its two tests, and B2 documentation sections. Preserve B1 token helper changes and all unrelated work. No production state or configuration changed. Delete only synthetic emulator records if an exported emulator dataset is retained; the executed emulator run used in-memory local emulators.

## Increment 1B-B3 — Password completion and one-time consumption

**Status:** Complete within approved B3 source/test scope. UX-001 remains **Critical · Open**. No B4/B5, issuance integration, frontend change or deployment was started.

### Changes

- `functions/password-setup.cjs`: added `createCompleteOperatorPasswordSetupHandler` and server password validation. It accepts exactly `{uid, token, password}`, enforces JSON/4 KiB/POST/CORS controls, uses the shared B2 rate limiter, derives purpose from the stored record, performs eligibility checks, claims the token, updates Auth, then finalizes. Success is returned only after finalization is confirmed.
- `functions/operator-email.cjs`: added transactional `finalizeCompletion`, which verifies the same attempt/purpose and eligible role, marks the token `used`, deletes its digest, and clears `mustChangePassword` only for `initial_setup`; and `recordCompletionFailure`, restricted to fixed safe stage values. Existing state vocabulary and release helper remain; B3 never invokes the release helper.
- `functions/index.js`: exports `completeOperatorPasswordSetup` as v2 HTTP `onRequest` in `us-central1`, reusing the existing origin list and shared rate limiter.
- `functions/tests/password-setup.test.cjs`: added policy, purpose, malformed input, concurrency, rate limit, generic errors, claim/Auth/finalization failure and log-redaction coverage.
- Added `functions/tests/password-setup-completion.firestore-emulator.test.cjs` for synthetic Auth/Firestore records and real Auth Emulator sign-in checks.

### Password policy and API

- Passwords must be strings of **12–128 Unicode code points**, matching the existing frontend and authenticated first-password endpoint. The code does not trim, normalize, echo, or persist a password. Firebase Auth remains the credential store and can impose additional configured policy; production policy was not inspected.
- Request stays `{uid, token, password}`; no client-controlled purpose and no sign-in session. Invalid/unusable token is generic 400 `{error:"invalid-setup-link"}`; malformed fields use the same generic link error. Length failure is 422 `{error:"invalid-password"}` before token claim; method 405, media 415, oversized 413, limiter 429 + `Retry-After`, dependency/ambiguous error 503. Confirmed completion is 200 `{completed:true}`.

### Token state and cross-service failure behavior

1. Validate request/password and consume the B2 network-prefix quota.
2. Derive purpose from the matching server-side token document; validate digest, expiry, `issued` state, enabled Auth UID, active Operator role and purpose-specific `mustChangePassword` eligibility.
3. Transactionally claim `issued → consuming` with a server-generated attempt ID. A concurrent loser does not call Auth.
4. Recheck the same Auth UID exists and is enabled, then call Admin Auth `updateUser(uid,{password})` once.
5. On confirmed Auth success, transactionally verify the same attempt/purpose and current eligible role; change `consuming → used`, delete the digest, and clear only the initial-setup must-change flag. Recovery leaves it false; all unrelated role fields are preserved.
6. Return success only after this finalization returns true.

- Claim failure: no Auth call; generic invalid-link or temporary dependency response.
- Any Auth update error (including a known Firebase policy rejection): treat as potentially ambiguous, do not release `consuming`, do not retry, and attempt to record only `completionFailureStage:"auth_update_failed"` plus timestamp. This may require authorized reconciliation before a fresh token can be issued.
- Auth account recheck failure after claim: remain `consuming`, record a fixed account-recheck stage if possible, return 503.
- Firestore finalization false/throw after Auth update: do not claim success; leave token `consuming` or `used` if Firestore committed before response loss. Attempt fixed `finalization_failed` metadata only if still consuming. Either state rejects replay.
- Process interruption/timeout: no automatic retry, claim release, unlock, or background retry. This may strand the operator until an authorized administrative reconciliation and separately authorized issuance workflow exist.
- The B2 limiter remains 30 attempts per 15 minutes per hashed IPv4 /24 or IPv6 /56 source prefix. Completion and validation share quota: UID changes do not bypass it, but users behind a shared network share capacity and source rotation remains a limitation.

### Verification

- Root `npm test`: **42 passed, 0 failed, 0 skipped**.
- Functions `npm test`: **22 passed, 0 failed, 3 skipped**. The skips are the opt-in B1, B2 and B3 emulator suites in the normal invocation without emulator hosts.
- Dedicated B1 Firestore Emulator run (`demo-casetrack-password-token-tests`): **1 passed, 0 failed, 0 skipped**.
- Dedicated B2 Auth + Firestore Emulator run (`demo-casetrack-password-b2`): **1 passed, 0 failed, 0 skipped**.
- Dedicated B3 Auth + Firestore Emulator run (`demo-casetrack-password-b3`): **1 passed, 0 failed, 0 skipped**. Verified initial setup and recovery, sign-in with each new password, replay rejection, synthetic role preservation, concurrent single-winner claim/Auth update, invalid/expired/revoked/used/missing-purpose/wrong-purpose states, password policy, Auth rejection, Auth-committed simulated timeout, finalization failure simulation and rate limiting.
- B2/B3 emulator concurrency emitted Firestore transaction-lock-timeout warnings although assertions passed. Treat as emulator contention; production transaction capacity/latency is unverified.
- `node --check` passed for changed Functions source/tests. `git diff --check` passed. `npm run build -- --emptyOutDir` passed; output retained the Password Setup page and assets. No live Functions HTTP emulator, browser E2E or production verification occurred.

### Remaining risks and rollback

No recovery issuance/reissue or email/provisioning integration exists. No operational reconciler exists for `consuming` claims. Any post-claim failure intentionally can block reuse until authorized review; current source does not provide a fresh-token escape path. Firebase Auth production password policy, production IP provenance, capacity, monitoring, IAM and deployed URLs were not inspected. No deployment was authorized or performed.

Rollback only B3: remove the completion export from `functions/index.js`; remove B3 handler logic from `functions/password-setup.cjs`; remove `finalizeCompletion` and `recordCompletionFailure` from `functions/operator-email.cjs`; remove the B3 emulator test and B3 unit cases; revert only B3 documentation addenda. Preserve B1/B2 and unrelated workspace changes. No production data/configuration rollback is required; emulator test cleanup deletes synthetic records.

## Increment 1B-B4 design gate — 15 November 2026

**Status: issuance, distribution, and reconciliation implementation stopped pending owner decisions.** Review confirmed existing Admin handlers validate Firebase ID tokens and query active Admin role state from trusted `userRoles`. The repository has no documented way to verify that the target Operator requested recovery, no approved token delivery channel, and no recovery-specific audit trail. The email helper is disconnected and SendGrid is deferred. B3 `consuming` is intentionally ambiguous across Auth and Firestore.

No application code, tests, Firebase configuration/data, Rules, or deployment changed for B4. Created `PASSWORD-SETUP-RECOVERY-PROCEDURE.md` with the proposed workflow, invariants, missing controls, approval questions, and rollback. No B4 implementation or emulator tests were run because the request's security design gate requires approval before issuance/distribution. Existing B1-B3 test evidence remains historical and is not B4 verification.

**Next:** obtain explicit approval for (1) Operator identity verification, (2) token delivery, (3) administrative audit/second-review policy, (4) `consuming` reconciliation authority/evidence, and (5) any additional storage needed for issuance limits/audit. Then authorize a scoped implementation increment. UX-001 remains **Critical · Open**.

**Rollback:** documentation-only. Remove the B4 addenda and the new recovery procedure if reverting this gate review; preserve B1-B3 records and unrelated workspace changes. No runtime rollback is needed.

## Increment 1B-B4.1 — Security architecture and storage approval gate (15 November 2026)

**Status: design delivered; stop pending approval.** Reviewed actual B1-B3 Functions source/tests, Admin authorization and Admin Panel, Firebase config/Rules, and the listed Password Setup documents. Created `PASSWORD-SETUP-B4-SECURITY-DESIGN.md` with proposed Firestore structures, API contracts, authorization model, token/operation state machines, atomic target/Admin issuance limits, manual handoff controls, failure matrix, security threats, later test matrix, rollback, and exact approval list. Updated the recovery procedure, API contract, security review, checklist, and this log to supersede the older B4 gate text. UX-001 remains **Critical · Open**.

The current source verifies Admin ID tokens with revocation checking and reads active Admin role from `userRoles`; eligibility requires enabled Auth account plus active Operator and `mustChangePassword:false`. Current Admin UI has no recovery attestation or one-time link interface. Existing recovery token registry cannot transition a `consuming` token to `revoked`; existing limiter is network-prefix validation/completion rate limiting, not issuance accounting. Existing Firestore rules have a deny-all catch-all. New operation/audit/issuance-limit storage and Admin UI changes are required; both are outside B4.1 authorization.

Owner-approved policy now specifies in-person attestation, manual Admin-controlled handoff, secret-free audit content, reviewed revoke/reissue, and target limits (3 per rolling 24 hours, 15-minute minimum interval). The proposed Admin-wide limit of 10 per rolling 24 hours, new Firestore schemas, optional token-registry operation ID, Admin UI, step-up reauthentication/MFA, audit retention, and B4.3+B4.4 sequencing still require explicit approval.

**Files changed:** new `PASSWORD-SETUP-B4-SECURITY-DESIGN.md`; updated `PASSWORD-SETUP-RECOVERY-PROCEDURE.md`, `PASSWORD-SETUP-API-CONTRACT.md`, `PASSWORD-SETUP-SECURITY-REVIEW.md`, `UI-UX-IMPLEMENTATION-CHECKLIST.md`, and `MASTER-UI-UX-ISSUE-REGISTER.md`. No application code, tests, schema, Rules, index, dependency, Firebase resource, or deployment changed. No tests/build run because this increment is documentation/design only.

**Rollback:** revert only the B4.1 documentation updates listed above. Preserve B1-B3 records and all unrelated working-tree changes. No data/runtime rollback is required. Do not proceed to B4.2 until the B4.1 approvals are recorded.

## Increment 1B-B4.2 — Compatibility gate stop (15 November 2026)

**Status: stopped before application implementation.** The owner approved the Admin cap of 20 per rolling 24 hours, 365-day audit retention, global active-Admin scope, same-Admin review after fresh in-person verification, and recent reauthentication. B4.2 compatibility review found exact operation/audit schemas are still unapproved, so no attestation can safely be persisted. The current Admin UI has no provider-aware genuine reauthentication flow; `getIdToken(true)` only refreshes a token and does not establish a recent credential event. The existing UI also lacks the approved target-confirmation and attestation screen. A storage-free preflight would not durably record the declaration or bind it to a subsequent operation; it was not implemented.

The compatibility matrix and exact boundary/approval request are in `PASSWORD-SETUP-B4-SECURITY-DESIGN.md`. No source code, tests, schema, Rules, index, Firebase resource, or deployment changed. No tests/build were run because the implementation gate stopped before code changes, as required by the request. UX-001 remains **Critical · Open**.

**Files changed for this gate:** `PASSWORD-SETUP-B4-SECURITY-DESIGN.md`, `PASSWORD-SETUP-RECOVERY-PROCEDURE.md`, this implementation log, `PASSWORD-SETUP-SECURITY-REVIEW.md`, `PASSWORD-SETUP-API-CONTRACT.md`, `PASSWORD-SETUP-TEST-PLAN.md`, `UI-UX-IMPLEMENTATION-CHECKLIST.md`, and `MASTER-UI-UX-ISSUE-REGISTER.md`.

**Rollback:** revert only B4.2 documentation addenda. Preserve B4.1 design, B1–B3, and unrelated workspace changes. No runtime/data rollback is required. Resume only after exact schema and frontend reauthentication/target-confirmation approvals; no B4.3+ work is authorized here.

## Increment 1B-B4.2A — exact approval review (15 November 2026)

Created `PASSWORD-SETUP-B4-EXACT-APPROVAL-MATRIX.md` with proposed Firestore fields/types/defaults/writers/access/retention/transaction boundaries, endpoint contracts, Admin UI and reauthentication plan, security dependencies, increment classification, risks and numbered approvals. Updated the B4 design with source-based findings. Confirmed the approved Admin issuance policy is 20 successful commits per rolling 24 hours (superseding the historic recommendation of 10) and audit duration is 365 days; retention mechanics remain open. No application code, test, schema, Rules, index, dependency, Firebase config, or deployment changed. No tests/build run; this was a documentation-only review. UX-001 remains Critical · Open.

**Rollback:** revert only the B4.2A matrix and its documentation addendum. Preserve B1–B3, previous B4 design, and unrelated workspace changes. No runtime/data rollback is needed.

## Increment 1B-B4.2 final approval package — 15 November 2026

Created `PASSWORD-SETUP-B4.2-FINAL-APPROVAL-PACKAGE.md` with the B4.2-only operation/audit/idempotency schemas, endpoint contract, provider-compatible reauthentication, Admin UI scope, audit and logging decision, security invariants, owner checklist, emulator requirements, and rollback boundaries. The proposal uses 24-hour replay with expired keys retained as non-reusable tombstones; this creates indefinite metadata retention and is explicitly presented for owner approval. Accepted events are durable and atomic; rejected/pre-operation events use minimal structured operational logs only, with no unauthenticated Firestore write mechanism. No application code, tests, schema, Rules, indexes, config, or deployment changed. No tests/build run. UX-001 remains Critical · Open.

**Rollback:** remove only this B4.2 approval-package document and its documentation references. Preserve prior increments and unrelated workspace changes.
