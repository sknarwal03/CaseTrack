# Password Setup Backend Architecture

**Purpose:** implementation design for Increment 1B-A investigation. No application code, Firebase configuration, schema, or Rules were changed for this review. Production Functions and valid-link setup remain unverified; use the current root `functions/` source and latest Phase 2B verification as runtime evidence.

## Executive finding

The handlers are **missing from the current production Functions implementation**, not merely misspelled or pointed at the wrong HTTP route.

- `functions/index.js` currently exports eight functions. It does not require the setup registry helper or export `validateOperatorSetupCode` / `completeOperatorPasswordSetup`.
- `functions/admin-role-management.cjs` contains `createOperator`, `getMyAccess`, and `completeOperatorFirstPasswordChange`, but no token-validation or custom-token password-completion handlers.
- `functions/operator-email.cjs` contains `createSetupCodeRegistry()` and `sendOperatorSetupEmail()`. The registry is called by unit tests and the E2E fixture (which directly seeds token records); the email helper is only referenced by unit tests. Neither is wired into the root production Functions path or exported as an HTTP endpoint. Registry helpers are not deployed HTTP endpoints.
- The frontend calls `functionsEndpoint("validateOperatorSetupCode")` and `functionsEndpoint("completeOperatorPasswordSetup")`. In normal mode these resolve to `https://us-central1-casetrack-97a4e.cloudfunctions.net/<name>`. Latest emulator evidence got 404 for both names.

There are therefore two distinct issues: missing implementation/export (and deployment) of handlers, and missing integration of the existing email/token helpers into operator provisioning. The E2E suite contains expectations for `resendOperatorInvitation`, `requestPasswordRecovery` and the two setup endpoints that are absent from the root Functions exports; the suite and checked implementation are out of sync. No evidence supports a CORS-only or route-name-only fix.

## Evidence and current system

### Firebase Authentication configuration

- The normal web app config in `firebase/firebase-config.js` targets project `casetrack-97a4e`, Firebase Auth domain `casetrack-97a4e.firebaseapp.com`, and calls `getAuth(app)`; the app uses email/password sign-in in `assets/js/login.js`.
- Root Functions declares Node.js 22 and initializes Admin SDK Auth through `getAuth(app)`. Existing privileged endpoints verify Firebase ID tokens with revocation checking and then read authoritative `userRoles/{uid}` records.
- Emulator config in root `firebase.json` uses Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, Functions `127.0.0.1:5001`; `firebase.admin-panel.local.json` uses 9198/8187/5003 for isolated local UI verification.
- Repository source establishes a 12–128 Unicode-code-point rule in the existing client and authenticated first-password handler, but does not establish the current Firebase Console password policy. No Firebase Auth config/action-code handler setting was modified or inspected against production in this task.
### Current operator provisioning and sign-in

1. Admin signs in with Firebase email/password. `assets/js/login.js` obtains a Firebase ID token and calls `getMyAccess`.
2. Admin Panel calls the signed-in Admin-authorized `createOperator` endpoint.
3. `createOperator` uses Admin SDK Auth to create/enable an account with a randomly generated temporary password, commits an active `operator` record in `userRoles/{uid}` with `mustChangePassword: true`, then returns the temporary password once to the Admin UI.
4. `assets/js/operator-management.js` displays that temporary password in a credentials dialog. Admin privately shares it.
5. Operator signs in; login sees `mustChangePassword` and directs them to the authenticated `pages/password-change.html` flow.
6. `completeOperatorFirstPasswordChange` requires an Authorization Bearer Firebase ID token, verifies it with revocation checking, verifies the active role and `mustChangePassword`, updates Auth password, clears the existing role flag, then the client signs out.

This is distinct from custom Password Setup, which would be an unauthenticated link-capability flow. The two flows should not be mixed implicitly.

### Existing setup-link helper (not currently in request path)

- Generates 32 random bytes and encodes base64url (43 characters), using `randomBytes(32)`.
- Stores only SHA-256 token digest in `operatorSetupActionCodes/{uid}`; digest comparison uses `timingSafeEqual`.
- Sets 24-hour expiry and status `issued`; a resend replaces a prior issued token but refuses to overwrite `consuming`.
- Provides purpose-aware validation/claim/finalization helpers; these check active Operator eligibility, purpose, expiry, digest and state. Validation also checks that the Auth user exists and is enabled.
- Builds the token into the URL fragment (`#uid=...&token=...`), which is not sent in normal HTTP request or Referer headers. The page strips the fragment from browser history before making requests. SendGrid click/open tracking is disabled.
- `sendOperatorSetupEmail()` accepts a caller-supplied API key and sends through SendGrid. No current production function calls it. The example env file shows setup URL/from address but not a configured SendGrid secret binding.
- There is no deployed endpoint that calls these helpers. No rate limiter is present in this helper.

### Source-of-truth conflict

`docs/25-Production-Readiness-and-Security-Report.md` contains earlier implementation claims about exported setup handlers, Secret Manager email wiring and successful end-to-end tests. Those claims conflict with the checked current root source and the later `docs/ui-ux-audit/PHASE-2B-FINAL-VERIFICATION.md`, which lists the actual current export set and records 404 for both handlers. Treat the former as historical/stale unless a separately identified deployed artifact or commit proves otherwise. This review did not inspect or change production.

## Proposed architecture

### Components

1. **HTTPS Functions (v2 `onRequest`)** in the root `functions/` package, region `us-central1`, with exact CORS allowlist and request-size/method checks.
2. **Setup registry service** reusing `createSetupCodeRegistry()` after code review/hardening; no client Firestore access. Admin SDK reads/writes `operatorSetupActionCodes/{uid}` and authoritative `userRoles/{uid}`. Current Rules deny client reads/writes to role records and should continue to deny setup-token records.
3. **Firebase Admin Auth** verifies that the target user exists and is enabled, and performs the password update. Do not ask the browser to sign in or use a native password-reset handler for this custom token.
4. **Email issuance integration** is separate from redemption. Only an active Admin-authorized provisioning/resend flow may issue a token and email it. The current helper’s presence alone does not prove an authorized issuance endpoint exists.
5. **Abuse controls and audit**: edge/service rate limits plus structured secret-free event logs. App Check can be considered as a supplementary signal only; it is not authorization or a substitute for rate limiting. Firebase describes the custom-backend model as client sends App Check token and backend verifies it ([Firebase App Check custom backend](https://firebase.google.com/docs/app-check/web/custom-resource), [verification](https://firebase.google.com/docs/app-check/custom-resource-backend)).

### Redemption sequence

**Validation (read-only):** parse strict `{uid, token}` body → enforce request/origin/rate limits → validate UID/token shapes → query Auth account, role and registry → constant-time compare digest and verify `issued`, unexpired, active Operator, enabled account → return only `{valid:true}` or uniform `{valid:false}`. Do not disclose email, role, account existence, or which predicate failed.

**Completion (stateful):** parse exact `{uid, token, password}` body → apply same public request controls → enforce password length server-side → confirm active Operator / enabled account → Firestore transaction atomically claims an `issued` unexpired matching code and active role as `consuming` with server-generated `attemptId` → call Admin Auth `updateUser(uid,{password})` → on confirmed success, transaction marks the same attempt `used`, removes the stored digest, and clears the existing `mustChangePassword` flag **only for the approved initial-setup purpose** → return `{completed:true}`. The flag update must preserve role, status, station and unrelated role fields.

Approved scope includes **initial setup** and **password recovery** as distinct purposes. `initial_setup` requires an active Operator with `mustChangePassword === true`; `password_recovery` requires an active Operator with `mustChangePassword === false`. Purpose is read from the matching issued token record and never accepted from client JSON. B1 implements the additive optional `purpose` field for newly issued records; records without purpose fail closed. Recovery issuance and delivery authorization remain unimplemented.

### Failure handling and cross-service atomicity

Firestore and Firebase Auth do not share a transaction. A Firestore `consuming` claim serializes requests but cannot atomically commit with Admin Auth:

- Definite Auth password-policy rejection: release only the same `attemptId` back to `issued` so the user can correct the password and retry.
- Confirmed Auth success: finalize token as used. Never return it to issued.
- Timeout, process crash, or ambiguous Auth result: retain `consuming` and fail closed. Do not time-based unlock; the Auth write may have succeeded. Require a documented Admin reconciliation/reissue procedure. This is an operational release gate, not a safe place for automatic retries.
- Concurrent claims: one transaction wins; the other is rejected without calling Auth.

The helper already contains the `issued → consuming → used` skeleton and a known-password-rejection retry helper. Add tests for real transaction concurrency and ambiguous failures; the current in-memory unit DB is not a substitute for emulator transaction tests.

### Data and IAM boundaries

The existing `operatorSetupActionCodes/{uid}` collection can hold token state; no token or password is written to application logs or client-readable collections. Firestore Admin SDK bypasses client Rules, so only reviewed server code should touch the registry. A rate-limit implementation that adds fields/documents is a Firestore data-model change and needs separate approval; alternatively choose an approved edge/gateway control. Least-privilege service-account/IAM review is required for Auth user lookup/update and Firestore access.

## Required implementation files (future scope, not changed here)

- `functions/index.js`: export both endpoint names from reviewed setup module.
- `functions/operator-email.cjs`: reuse/harden registry and issuance helper; handle delivery failure/revocation and attempt-state reconciliation.
- New `functions/password-setup.cjs` (recommended) or narrowly scoped additions to `admin-role-management.cjs`: testable handlers, validation, CORS, rate limiter integration and safe logging.
- `functions/admin-role-management.cjs`: integrate issuance only after deciding whether link email replaces temporary-password response; preserve active-Admin authorization, idempotent provisioning and station/role semantics.
- `functions/tests/`: pure handler/registry unit tests plus emulator integration tests.
- `assets/js/password-setup.js`: likely small compatibility improvement to distinguish 429 retry feedback; current main request/response shape can remain.
- `functions` secret/runtime config and deployment manifest: bind SendGrid key only to mail-sending function, after plan/IAM approval. Do not alter Firestore Rules or production configuration in the implementation without separate approval.

## Approval gates and open decisions

1. Is link setup for initial onboarding only, or also password recovery? Recommended initial onboarding only for these handler names.
2. Should operator creation stop returning a temporary password and instead send the setup email? Current deployed-source flow returns the password to Admin; helper email flow is disconnected.
3. How should `mustChangePassword` and Auth enabled state transition across provisioning, link completion, and resend?
4. Which rate limiter and thresholds are approved? Edge/gateway has infrastructure implications; Firestore rate counters would be a data-model change.
5. What is the operator-support process for an ambiguous Auth write that leaves a token `consuming`?
6. Which verified SendGrid sender, secret storage/binding, IAM service account and production origin are approved? Do not read or provide secrets in chat.
7. Are API response distinctions and 429 retry messaging (see API Contract) acceptable frontend compatibility changes?

## Current source status — after B3 (15 November 2026)

The investigation above records the pre-implementation state and decisions as of Increment 1B-A. Current root Functions source exports both `validateOperatorSetupCode` and `completeOperatorPasswordSetup`; B2 implements validation and the shared persistent limiter, and B3 implements password completion. This is source/local emulator status only; no deployment or production inspection was performed.

Completion uses exact `{uid, token, password}` input and the 12–128 Unicode-code-point password rule. The registry derives token purpose, validates and atomically claims the token as `consuming`, then the handler updates only the matching enabled Auth UID. A Firestore finalization transaction changes the same attempt to `used`, deletes the digest, and clears `mustChangePassword` only for initial setup while preserving other role fields. Recovery leaves that flag false.

Unlike the older proposal above, B3 does **not** release a claimed token after any Auth failure. An Auth exception may be ambiguous; the token stays `consuming` with a fixed, secret-free failure stage if that write succeeds. Finalization uncertainty never returns success. Both `consuming` and `used` reject replay. No automatic retry, unlock or background reconciler exists. Authorized reconciliation/fresh issuance is still required, and provisioning/email issuance remains disconnected.

This design document grants no authorization beyond separately approved increment scopes.

## Increment 1B-B1 implementation note (15 November 2026)

The setup registry now requires an explicit allowlisted purpose at registration, exposes only an internal stored-purpose lookup for a matching live token, enforces purpose in validation/claim/finalization, rejects legacy purpose-less records, and supports explicit revocation. Expiry remains timestamp-based and rejects malformed or greater-than-24-hour lifetimes. The existing temporary-password provisioning is not connected to the token helper. No HTTP handler, Firebase Rules, production config/data, or rate limiter was changed. See [implementation log](PASSWORD-SETUP-IMPLEMENTATION-LOG.md) for tests and limits.


