# Password Setup Security Review

**Review type:** source-based design review for future implementation. No application code, credentials, Firebase resources, schema or Rules were changed. Scope is the root `functions/` package and the custom Password Setup path. Production behavior is not claimed.

## Findings

| Risk | Current evidence | Assessment | Required protection |
|---|---|---|---|
| Public handler implementation | Historical pre-B2 review observed both names missing. Current local source exports `validateOperatorSetupCode` and `completeOperatorPasswordSetup`; no production deployment was performed. | The capability endpoints now exist in source, but the deployed service remains unverified. | Verify deployment/export config only in an approved release increment; keep capability, rate limit, state and failure controls intact. |
| Setup helper disconnected from provisioning | `createSetupCodeRegistry` is called by unit tests and the E2E fixture (for direct test seeding); `sendOperatorSetupEmail` is referenced only by unit tests. Neither is wired into production `createOperator`, which returns a temporary password to the Admin UI. The E2E suite expects resend/recovery/setup handlers that are absent from current root exports. | Architecture mismatch: two onboarding models coexist in docs/client expectations. | Decide whether invitation email replaces temporary credentials. Keep Admin authorization for issuance and do not add a public token-issuing route. |
| Cross-service partial completion | B3 claims transactionally, updates Firebase Auth, then transactionally finalizes the token and initial-setup role flag. Auth and Firestore cannot share an atomic transaction. | An Auth failure, timeout or finalization error can leave `consuming`; Auth may or may not have changed. A fixed safe failure stage is recorded when possible. | Keep all post-claim failures consuming; no automatic release/retry. Reconcile through an authorized process and issue a fresh token only after review. |
| Brute-force / resource abuse | B2 uses an atomic persistent 30-attempt/15-minute shared source-prefix bucket for validation and completion. | Basic friction only; distributed source rotation can evade it and shared networks share capacity. Emulator contention warnings mean capacity was not established. | Retain the limiter and generic 429; evaluate production edge/App Check controls and source-IP provenance before release. |
| User/account enumeration | Both endpoints now exist in source. Validation returns `{valid:false}` for invalid token/account/role; completion returns a generic invalid-link response. | Validity is disclosed only to a holder of the high-entropy token; no email/role/account predicate is returned. | Preserve uniform failures, avoid account detail, and maintain rate limiting. CORS is not auth. |
| Role/state authorization | At initial review, helper checked active Operator but not `mustChangePassword`. B1 now binds purpose and requires `mustChangePassword:true` for initial setup and `false` for recovery in token validation/claim. | A token should not authorize arbitrary account changes or bypass revoked role. | Future endpoint code must derive purpose from the stored token record, recheck role on claim/finalization, and preserve role/status/station. |
| Password policy | B3 completion enforces 12–128 Unicode code points server-side, matching the frontend and authenticated first-password endpoint. | Firebase Auth may add configured constraints; production console policy was not checked. | Preserve server-side length enforcement; never trim, transform, echo or log password. Verify actual Firebase Auth password policy in an approved release review. |
| Token storage/entropy | Helper generates `randomBytes(32).toString("base64url")`, stores SHA-256 hex digest, compares with `timingSafeEqual`; lifetime is 24h. | Strong token construction for a random 256-bit secret; fast SHA-256 is appropriate for high-entropy tokens (unlike human passwords). Keep raw token out of DB. | Preserve 32 random bytes, exact validation, digest-only at rest and constant-time compare. Bind document to UID; expire and consume once. Never put token in query string. |
| Token transport/caching | Token is put in URL fragment; frontend removes fragment immediately, sends token in HTTPS JSON body, sets `cache:no-store` and `referrerPolicy:no-referrer`; page has `meta referrer=no-referrer`. | Better than query string, but browser history, extensions, clipboard, screenshots, analytics or injected scripts can still expose the fragment before JS strips it. | Keep fragment and strip immediately; no analytics/third-party scripts on setup page; strict CSP and no-store response; HTTPS only in production; never log full URL or request body. Consider browser/session threat disclosures. |
| CORS / endpoint access | B2/B3 HTTP handlers use the exact `ADMIN_PANEL_ALLOWED_ORIGINS` allowlist, POST/OPTIONS handling and explicit response headers. | CORS controls browsers, not authorization. Public capability endpoints still depend on bearer-token checks and abuse controls. | Preserve exact HTTPS origin allowlist, `Vary: Origin`, no wildcard; reject unapproved Origin. Do not use CORS as auth. |
| Secret management | `sendOperatorSetupEmail` accepts `apiKey`; root code does not bind/call it. Example env shows sender and URL but no API key. Current root Functions package uses Firebase Functions v2. | Secret source/binding and service-account permissions are not evidenced for this workflow. | Store SendGrid API key in Secret Manager and bind only to sending function using Firebase secret parameters; local test uses ignored emulator-only secret. Never commit/log/render secret. See [Firebase Functions secrets](https://firebase.google.com/docs/functions/config-env). |
| Logging / audit | Current operator-management catch blocks generally log stage/error code, not body/password. Setup helper emits generic error codes. No setup endpoint audit exists. | Request-body logging or raw exception serialization would leak bearer token/password. Lack of safe success/failure events reduces incident response. | Structured logs with event, result category, generated correlation ID, duration and nonreversible/pseudonymous subject reference. Exclude token, digest, password, email, full UID where not required, Authorization header, URL fragment and request body. No secret-bearing exception objects. |
| Email issuance / delivery | SendGrid helper registers token before sending. On delivery failure it throws generic provider status but leaves registered token current. No production caller/revoke path found. Click/open tracking disabled. | Undelivered link can remain valid; retry/issuance coordination and secret availability are unresolved. | On definite delivery failure revoke the issued token or ensure immediate replacement before any retry; never return link/token in API; use idempotent issuance and safe admin resend. Avoid provider content logging/tracking. |
| IAM / Rules | Admin SDK will bypass Firestore Rules; `operatorSetupActionCodes` is not explicitly named in current Rules and final catch-all denies client access. | Strong client denial is expected, but Functions service identity is privileged. | Explicitly keep client access denied; use least-privilege runtime IAM where feasible, separate sender secret access; inspect deployed Rules/IAM only in separately approved read-only security review. |

## Security controls required before release

### Token and state

- Generate exactly 32 cryptographically random bytes; base64url token is 43 chars. Treat token as a bearer credential.
- Store only SHA-256 digest of that random token; compare decoded fixed-length hashes with constant-time comparison. Do not store raw token in Firestore, logs, analytics, email delivery logs or test artifacts.
- Preserve 24-hour expiry unless product approves another duration. Check expiry server-side on both validation and completion using server clock.
- Use transaction claim `issued → consuming` with unguessable server attempt ID; same UID/document and active role checked in transaction. `consuming` and `used` reject all replays. Mark digest deleted on success.
- Avoid time-based unlock after ambiguous Auth writes. Require documented recovery for stuck `consuming` state.
- Do not store passwords, password hashes, or request bodies. Firebase Auth owns password storage.

### Rate limiting and abuse

- Enforce bounded body size and request time; one POST method only, fixed names/paths, per-IP source limits, per-UID/token attempt limits, and function concurrency/instance caps appropriate to service.
- Edge/API-gateway rate limits are the preferred route without adding Firestore fields, but require infrastructure availability and approval. If using Firestore counters, it is a schema/data change and is outside this task. App Check verification can add cost-abuse resistance but is not a substitute for a limiter or token proof.
- Never count only by UID (attacker can vary UID or maliciously lock a victim out); never trust a client-supplied `X-Forwarded-For`; and never rely only on in-process memory in serverless Functions.
- Return 429 with `Retry-After`; do not make rate exhaustion identify whether UID is real.

### Enumeration and authentication

These two endpoints should not require a Firebase ID token: the emailed 256-bit link capability is the authenticator, because the new user may not yet be signed in. Require strict token + UID match, active Operator role, enabled Auth user and approved initial-setup state. Require no auth bypass and do not accept Admin-supplied UID without matching bearer link. CORS does not provide authentication.

Return the same invalid outcome for invalid token, unknown UID, expired/used/revoked token, disabled/missing account, role mismatch and no longer eligible state. Do not reveal email or which check failed. Successful `valid:true` is intentionally disclosed only to a holder of an unguessable matching link; rate-limit even that endpoint.

### Password handling

- Enforce 12–128 Unicode code points on server, matching current client behavior and `completeOperatorFirstPasswordChange`; also let Firebase Auth reject values that violate project policy.
- Reject missing/extra fields; do not trim or normalize passwords. Do not echo password in response, logs, telemetry, exception messages, Firestore, idempotency state or support tickets.
- Use HTTPS; set `Cache-Control: no-store`; disable body/request tracing for these endpoints; redact headers and URL.

### Audit and secret operations

- Emit safe events: `setup.validate` / `setup.complete` with coarse result (`valid`, `invalid`, `rate_limited`, `completed`, `auth_rejected`, `ambiguous`), function name, attempt correlation ID and elapsed time. A pseudonymous UID HMAC is optional only if a separately managed audit key is approved. No raw UID is needed to answer ordinary metrics.
- Do not log SendGrid request/response payloads, tokenized link, password, bearer auth token, Authorization header, recipient email, token hash or full exception object.
- Use Secret Manager via a secret parameter bound only to the email-sending function; avoid plain `.env` in production. Secret rotation/revocation procedure and least-privilege service account must be documented. No secret was read in this review. See [Firebase Functions config and secrets](https://firebase.google.com/docs/functions/config-env).

## Residual risks / decisions

1. Product scope now approves separate initial-setup and password-recovery purposes. B1 enforces purpose binding and distinct `mustChangePassword` eligibility; authorized issuance/reissue and endpoint behavior remain unimplemented.
2. Current Admin provisioning reveals a temporary password to Admin; integrating invitation email changes that user flow and requires separate approval.
3. Rate limiter technology/thresholds and any associated infra/data changes need explicit approval.
4. A crash between Firebase Auth password update and Firestore consume has no cross-service atomic transaction. The fail-closed recovery procedure must be accepted before release.
5. Whether setup should verify email identity or change `emailVerified` is not established. Do not mark email verified or change account metadata as part of this design without approval.
6. Current deployed Auth password policy, production Functions config, SendGrid secret/sender and IAM were not verified in this task.

## Increment 1B-B1 implementation note (15 November 2026)

B1 adds the approved `purpose` document field to new tokens and fails closed for legacy records without it. Token states remain `issued`, `consuming`, and `used`, with explicit `revoked`; expiry is enforced using timestamps and a 24-hour maximum. No rate limiter exists in the repository, and this increment added none because persistent counters require additional approved storage/schema or an external edge service. See the [implementation log](PASSWORD-SETUP-IMPLEMENTATION-LOG.md). UX-001 remains Open.

## External technical references

- [Firebase HTTP Functions and CORS](https://firebase.google.com/docs/functions/http-events)
- [Firebase Admin Auth user management](https://firebase.google.com/docs/auth/admin/manage-users)
- [Firebase Functions Secret Manager configuration](https://firebase.google.com/docs/functions/config-env)
- [Firebase App Check with a custom backend](https://firebase.google.com/docs/app-check/custom-resource)
- [Verify App Check tokens](https://firebase.google.com/docs/app-check/custom-resource-backend)

## Increment 1B-B2 implementation review — 15 November 2026

The previously missing `validateOperatorSetupCode` handler is now exported from root `functions/index.js`. It is an unauthenticated HTTP capability endpoint, as required for a not-yet-signed-in recipient; the matching high-entropy token and UID are the credential. It accepts only the existing `{uid, token}` request, derives purpose from server-side token state, checks the existing Auth/role/token eligibility, and never consumes the token. Missing-purpose legacy tokens and invalid/ineligible states fail closed with the same `200 {valid:false}` response. CORS is explicit but is not treated as authentication. No completion handler or password update exists.

B2 adds basic persistent rate limiting in `operatorSetupRateLimits`: one atomic Firestore fixed-window counter per hashed IPv4 /24 or IPv6 /56 source prefix, 30 attempts per 15 minutes. Stored identifiers are SHA-256 digests; records omit raw addresses, UID, token and password. The limiter fails closed if it cannot obtain a usable source address or Firestore is unavailable. There is no production-grade protection against distributed sources or source rotation; source-IP provenance behind the deployed Functions frontend and real-world cardinality/cost need operational validation. The emulator showed transaction-lock-timeout warnings during concurrency despite the expected threshold assertions passing; do not infer production capacity from this test.

Expired limiter records are cleaned opportunistically (up to 10 per request, with transaction rechecks). No TTL policy is configured; dormant records can accumulate. The query uses the existing single-field index. Existing server Admin access is sufficient and client Rules deny access via the catch-all, so this increment needed no Rules/index/IAM/external-service changes. Normal counter use incurs a Firestore transaction read/write per request, plus occasional bounded cleanup costs.

**Residual release risks:** completion is implemented locally but not deployed. Recovery issuance/reissue, email delivery, lifecycle integration, administrative reconciliation and production limiter hardening remain unimplemented. No deployed URL behavior or production Firebase configuration was tested. B2/B3 do not claim production-grade abuse protection. UX-001 remains Critical · Open.

## Increment 1B-B3 implementation review — 15 November 2026

`completeOperatorPasswordSetup` is now exported from `functions/index.js`. It accepts exactly `{uid, token, password}`, does not require a sign-in session, derives purpose only from the token registry, and confirms the matching Auth UID is present and enabled plus active Operator eligibility before changing Auth. The registry transaction binds UID, digest, expiry, purpose, `issued` state and active role at claim time. Finalization rechecks the attempt and role.

The server enforces 12–128 Unicode code points, matching the browser and existing authenticated first-password handler. It passes the string to Firebase Auth without trimming or normalization. Passwords and hashes are not written to Firestore. Responses are generic; request bodies and Auth exception contents are not logged.

The completion transition is `issued → consuming → used`; `revoked` remains terminal for issued tokens and expiry remains timestamp-based. After confirmed Auth success, a Firestore transaction marks the token used, deletes its digest and clears only `mustChangePassword` for `initial_setup`; `password_recovery` preserves the false flag. Role, status, station and unrelated role fields are preserved.

There is no atomic transaction across Auth and Firestore. B3 treats **every** post-claim Auth error as potentially ambiguous, retains `consuming`, and records only a fixed failure stage/time in the existing token document when possible. It never calls `releaseAfterRejectedPassword`, even for a known policy rejection. If finalization returns false or throws, the endpoint returns 503 and does not claim success. The token remains `consuming` or, if Firestore committed before a transport error, `used`; neither state can be replayed. This can strand an operator until authorized reconciliation/fresh issuance is available.

The shared B2 limiter is reused at 30 attempts per 15 minutes per normalized source prefix. Changing UID does not create another bucket, but users behind one network share the quota and source rotation can evade it. This remains basic abuse friction, not production-grade protection. No Rules, IAM, index, dependency, production config or deployment changed.

Local Auth/Firestore Emulator coverage confirmed both purposes, password sign-in, replay rejection, role-field preservation, one winning concurrent completion/Auth write, failed Auth outcome, simulated Auth-committed timeout, simulated finalization failure, password validation and rate limiting. These results do not prove production latency, failure semantics or deployment configuration.



## B4 security gate — issuance not approved by current architecture

Source review found that `authorizeActiveAdmin` verifies a Firebase ID token and reads the caller's active Admin role from trusted server-side state. This establishes the caller's application role, but not the requesting Operator's identity or consent. Operator role records do not define an independently verified recovery contact or identity procedure. Existing nested history is for role assignment/transition, not recovery issuance or rejected recovery requests. No recovery endpoint/audit path exists. `sendOperatorSetupEmail` is disconnected from provisioning, requires a supplied API key, and has no approved production delivery configuration; SendGrid is deferred. Therefore the required identity proof, token transfer, and audit controls cannot be established from current approved architecture.

**Decision:** do not implement recovery issuance, reissue, token handoff, or `consuming` reconciliation until the owner approves the procedure and delivery channel. Existing B2 source-prefix limiting does not cap Admin issuance frequency. Any persistent issuance/audit limits may require additional schema or infrastructure and need approval. Proposed steps and decisions are in `PASSWORD-SETUP-RECOVERY-PROCEDURE.md`.

No B4 runtime changes were made. UX-001 remains Critical · Open. This review makes no claim about deployed Admin roles, production configuration, or delivery.

## B4.1 design update — owner policy decisions recorded

The newer B4 authorization supersedes the preceding gate's statement that identity verification and delivery policies were unapproved. Product policy now requires in-person Operator verification by an authenticated Admin, explicit attestation recorded as `in_person`, and one-time Admin-controlled manual handoff. It also approves dedicated audit events, reviewed revoke-and-reissue for `consuming`, and target issuance limits of three per rolling 24 hours with a 15-minute minimum interval.

Those policies are **not yet implemented**. B4.1 design review found current code has no recovery UI or audit schema; current Admin User rows show UID/role/status/station but no Auth email summary; the existing token registry cannot administratively revoke `consuming`; existing source-prefix limiter does not enforce issuance quotas. The B4 design proposes new operation, audit, and issuance-limit storage, an optional token operation link, and Admin UI changes. These remain behind explicit approval. Recommended Admin limit is 10 successful issues per rolling 24 hours; owner confirmation is pending. Current Admin token verification checks revocation and active role but not recent authentication/MFA; step-up protection is a recommended decision, not an implemented control.

See `PASSWORD-SETUP-B4-SECURITY-DESIGN.md` for exact schemas, contracts, atomic accounting, failure handling, and approval gates. B4.1 changed documentation only; no B4.2 or later implementation began.

## B4.2 compatibility decision

The latest owner instruction approves an Admin issuance cap of 20 per rolling 24 hours, 365-day audit retention, global active-Admin scope, same-Admin consuming review after fresh in-person verification, and a five-minute recent-reauthentication policy. These supersede earlier B4.1 recommendations/open decisions. Exact Firestore schema and target confirmation/re-authentication UI remain unapproved. Current `authorizeActiveAdmin` verifies revoked status and active role but does not inspect verified `auth_time`; Admin UI has no genuine Firebase reauthentication prompt. `getIdToken(true)` is not a substitute. B4.2 therefore stopped before code changes; no storage-free handler can satisfy durable attestation/audit requirements. The detailed source compatibility matrix and required approvals are in the B4 design.

## B4.2A exact approval review

The source-backed field-level schema/API/UI proposal and numbered owner approval requests are in `PASSWORD-SETUP-B4-EXACT-APPROVAL-MATRIX.md`. The Admin cap of 20/rolling 24h replaces the older recommendation of 10. Audit duration is approved at 365 days, but TTL/deletion mechanics, legal holds, access controls, operation retention and exact schemas remain unresolved. Documentation only; no security tests or code were changed/run. UX-001 remains Critical · Open.
