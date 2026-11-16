# Password Setup Emulator Test Plan

**Forward test plan for B3 onward; B2 execution evidence is appended below.** Tests use an isolated demo project, synthetic identities and random synthetic passwords/tokens. Never use real users, real credentials, production endpoints, live SendGrid, production police records or production Firebase configuration. B1 added token-infrastructure tests; B2 added validation unit and Auth/Firestore Emulator tests. Completed checks are recorded in the [implementation log](PASSWORD-SETUP-IMPLEMENTATION-LOG.md).

## Test environment and controls

- Use only the explicit local profile (`firebase.admin-panel.local.json` or another separately reviewed demo config), fixed `demo-casetrack-role-prototype` project ID, and loopback Auth / Firestore / Functions ports. Root Functions source must be the code under test. Do not use the production `.firebaserc` alias for emulators.
- Browser imports local Firebase config. Server Admin SDK must be connected to Auth and Firestore emulators. Verify `GCLOUD_PROJECT`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, Functions endpoint and test profile before every run. Fail closed on mismatch.
- Use `@example.test` identities and synthetic `userRoles/{uid}`, station and `operatorSetupActionCodes/{uid}` documents. Generate unpredictable per-test token with Node crypto; never print it in test output or screenshots. Store raw token in test process memory only.
- Stub/redirect mail to the already supported fixed loopback email test endpoint (`OPERATOR_EMAIL_API_URL`) or inject a test sender. Assert no real SendGrid request; never set a real SendGrid key.
- Block remote Firebase network calls in the browser. Capture only safe endpoint status/result categories; redact bodies and auth headers from network artifacts.
- Run serially for shared emulator state. Tests should clean up synthetic Auth/Firestore records and confirm deletion. Use a fresh isolated project/prefix per suite where possible.

## Unit and handler tests

| Scenario | Setup/action | Expected result and invariants |
|---|---|---|
| Valid validation | Active enabled synthetic Operator, `mustChangePassword:true`, issued unexpired digest matching token | HTTP 200 `{valid:true}`; token remains `issued`, digest retained; no password mutation. |
| Wrong token | Same UID and stored token, submit different well-formed token | Generic HTTP 200 `{valid:false}`; no state or Auth change. |
| Unknown UID / no registry | Submit valid-shape random UID and token | Same generic invalid result as wrong token; no account-existence detail. |
| Malformed UID/token | Empty, overlong, wrong alphabet or wrong token length | Uniform invalid/malformed response; no Firestore path traversal or Auth call. |
| Expired token | Set expiry before injected clock | Validation false; completion rejects; no Auth update. |
| Already used / revoked | `status:used` or revoked state | Generic invalid; digest not accepted; no Auth update. |
| Disabled or missing Auth user | Disable/delete synthetic user with otherwise matching token | Generic invalid; no Auth update. |
| Wrong role/status/purpose | Admin role, revoked Operator, missing/inactive role, mismatched/missing token purpose, or initial/recovery purpose inconsistent with `mustChangePassword` | Generic invalid; never changes role or password. |
| Valid completion | Active eligible synthetic user, matching token, valid password and persisted purpose | HTTP 200 `{completed:true}`; Admin Auth password changes; token becomes `used`; digest removed; initial setup clears `mustChangePassword`, recovery leaves it false; role/status/station unchanged. Sign in with new password succeeds in Auth Emulator. |
| Invalid password format | 11 code points, 129 code points, missing, non-string, or mismatch only at client | 422 or 400 as contract; Auth not called; known rejection releases only same attempt to `issued`; token can retry. Do not echo password. |
| Firebase password-policy rejection | Use a synthetic value rejected by configured emulator/project policy if reproducible | 422 generic password error; confirm Auth did not change, then release claim. Do not assume Auth Emulator implements production policy identically. |
| Extra/missing fields / invalid JSON / wrong content type | Include email/role, omit token, array body, malformed JSON or text/plain | 400/415; reject strictly; no data access beyond safe bounded parse. |
| Wrong method / CORS | GET/PUT; allowed and disallowed Origin; OPTIONS with expected/unexpected headers | 405 for non-POST; valid preflight 204; unapproved origin rejected; no wildcard; CORS does not imply authorization. |
| Request size | Body >4 KiB | 413/400 bounded response; function does not parse/store unbounded payload. |
| Unauthorized/no bearer | Omit UID/token, try Firebase Authorization alone, or send forged user ID token with no link capability | Cannot validate or complete; link capability remains required. Endpoint must not accidentally switch to privileged caller identity. |
| Rate limit / brute-force | Inject deterministic limiter or approved edge test fixture; burst wrong links across one UID and many UIDs from same synthetic source | 429 + Retry-After; no account-specific messages; success path works after window. Test serverless multi-instance shared limit, not only in-memory counter. |
| Replayed completion | Complete once, submit same request again | Second request rejected as used; no second Auth update; no `mustChangePassword`/role change on replay. |
| Concurrent completion | `Promise.all` two valid completion requests for same token | Exactly one claim succeeds and at most one Auth update occurs; other gets in-progress/invalid; final token used; no double-write. |
| Failed Auth update (known rejection) | Inject `auth/invalid-password` before write | Same attempt is released safely to `issued`; no password change; retry with valid password succeeds. |
| Auth write ambiguous | Inject timeout after mocked Auth write may have committed; fail final Firestore update | Registry remains `consuming`; no automatic unlock or second Auth call; safe audit event; recovery procedure required. |
| Firestore finalize failure after Auth success | Auth update succeeds, `markUsed` throws | Remains `consuming`, never reported as completed; retry blocked; test manual reconciliation/reissue only through separate support procedure. |
| Role changes during request | Revoke/deactivate role between initial check and claim/finalization | Claim transaction rejects if changed before claim; final app authorization remains blocked if role changes after claim; role fields never reactivated/rewritten. |
| Logging redaction | Force malformed token, invalid password, SendGrid failure and thrown Auth error while capturing logs | No token, token hash, password, email, Authorization header, body, URL fragment or serialized secret-bearing error appears. |
| Secret unavailable/rotation | Mail sender secret absent/rotated in local secret mock | Safe issuance failure, no secret output; redemption endpoints do not need SendGrid secret. |

## Emulator restart and persistence tests

**B1 completed emulator check:** Firestore-only Emulator was started with demo project `demo-casetrack-password-token-tests`; the isolated synthetic-record test passed. It verified transactional competing claims and record visibility through a fresh registry instance. It did not test an emulator process restart, Auth, Functions, or endpoint behavior.

1. **Functions-only restart:** issue a valid token, stop/restart Functions while Auth and Firestore emulators remain alive. Validation still succeeds; state remains in Firestore; no in-memory-only token state.
2. **Restart after claim:** cause process interruption after `issued → consuming`, restart Functions with Firestore retained. Replay must remain rejected/locked and never cause a second Auth update. Verify documented manual recovery path.
3. **Whole emulator shutdown without export:** do not assume data survives. The Emulator Suite keeps Auth/Firestore state in emulator data; use explicit `--export-on-exit` and `--import` to preserve a deterministic dataset. Firebase documents these export/import switches at [Emulator Suite configuration](https://firebase.google.com/docs/emulator-suite/install_and_configure).
4. **Whole emulator restart with export/import:** export synthetic Auth and Firestore state, restart with import, then verify issued/consuming/used/expired token behavior and Auth password state match the expected snapshot. Keep export outside source control and delete after test.
5. **Emulator limitations:** Firebase notes Auth Emulator does not reproduce production rate limiting/anti-abuse. Exercise app limiter deterministically and schedule separate approved production-like abuse testing; do not infer production throttling from emulator behavior ([Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth)).

## Role and provisioning integration tests

Because current `createOperator` returns temporary credentials and the custom mail helper is not wired into production, test integration only after scope approval:

- Active Admin can initiate approved operator onboarding for a valid station; unauthenticated, Operator, revoked Admin, disabled Admin and invalid station cannot issue a setup link.
- Exactly one active eligible `userRoles/{uid}` is preserved; correct station, role, status, history and existing governance remain unchanged except approved `mustChangePassword` transition.
- No raw token/password is returned in Admin API response; no temporary password leaks through Admin UI, logs or test output when the email-based flow is selected.
- Delivery failure revokes or supersedes the undelivered token safely; idempotent retry does not create duplicate accounts or leak link. Resend invalidates previous issued token; resend cannot overwrite a token in `consuming` state.
- Email recipient is existing Admin-selected address; no endpoint accepts an arbitrary UID/email without Admin authorization. No enumeration response is returned to public client.

## Browser workflow coverage

Against local built app and emulators only:

1. Admin-created synthetic Operator gets link through loopback email sink.
2. Open link; confirm fragment is removed from history before network call, validation POST uses expected endpoint/body, and form appears only for valid active token.
3. Exercise invalid, expired, used, revoked, missing account and non-Operator links; user-facing response remains generic.
4. Submit invalid length and mismatched confirmation; no completion call/password change.
5. Complete a valid setup; assert one-time state, sign in with new password, correct first-login route, and no repeated must-change step if the approved initial-setup contract clears the flag.
6. Replay link, double-submit, throttle, network timeout and retry states. Verify no secret in browser console or stored URL history.
7. Test CORS preflight from approved local origin and rejection from a different origin; also confirm a non-browser request still requires valid token (CORS is not auth).

## Exit criteria

The B3 unit and emulator cases below are complete. Remaining release criteria are: Admin-to-email issuance decision, secret/IAM review, authorized reconciliation process, live HTTP/browser valid-link verification and an approved deployment. No deployment is part of B3.

## B2 execution record — 15 November 2026

- Root `npm test`: **42 passed, 0 failed, 0 skipped**.
- Functions `npm test`: **15 passed, 0 failed, 2 skipped**; opt-in B1 and B2 emulator cases skipped because the ordinary run had no emulator hosts.
- Dedicated Auth + Firestore Emulator (`demo-casetrack-password-b2`): **1 passed, 0 failed, 0 skipped**. It covered valid initial/recovery tokens; invalid, expired, revoked, used, and missing-purpose tokens; no-consumption validation; limiter threshold/concurrency and limiter reconstruction persistence. It did not test process restart or an HTTP Functions emulator.
- The emulator emitted transaction lock timeout warnings during the concurrent limiter stress, although the assertions completed with 3 allowed and 3 rejected attempts. Concurrency/capacity should be retested in an approved production-like environment before release.
- Unit tests cover bad method/content type/body size/extra fields, CORS preflight and rejected Origin, generic invalid responses, 429/Retry-After, 503 fail-closed handling, and token exclusion from captured application logs. No request/password tracing instrumentation was added.
- Production build passed (`npm run build -- --emptyOutDir`); output included the password setup page and hashed JS asset. Syntax and diff checks passed.
- Emulator restart/export-import, end-to-end browser validation, deployment, and all completion/password-update cases remain untested or unimplemented; they belong to later approved work.

## B3 execution record — 15 November 2026

- Root `npm test`: **42 passed, 0 failed, 0 skipped**.
- Functions `npm test`: **22 passed, 0 failed, 3 skipped**; B1/B2/B3 emulator suites are opt-in and skipped in the ordinary invocation without emulator hosts.
- B1 Firestore Emulator (`demo-casetrack-password-token-tests`): **1 passed, 0 failed, 0 skipped**.
- B2 Auth + Firestore Emulator (`demo-casetrack-password-b2`): **1 passed, 0 failed, 0 skipped**.
- B3 Auth + Firestore Emulator (`demo-casetrack-password-b3`): **1 passed, 0 failed, 0 skipped**. It covered initial and recovery completion; Auth sign-in with the changed password; used-token replay; role field preservation; concurrent claim with one Auth update; invalid/expired/revoked/used/missing-purpose/wrong-purpose records; password bounds/missing input; simulated Auth rejection; Auth update committed then timed out; finalization failure; and rate limiting.
- Emulator concurrency logged Firestore transaction-lock-timeout warnings, despite passing concurrency assertions. Production capacity and failure behavior remain unverified.
- Unit tests cover exact method/type/body and CORS checks, strict fields, generic errors, no credential logging, 429 behavior, claim failures, Auth/finalization failure and no claim release.
- `node --check`, `git diff --check`, and `npm run build -- --emptyOutDir` passed. No live Functions emulator or browser end-to-end test was run.
- Emulator “interruption” is simulated by applying the Auth password update and throwing a synthetic timeout; no actual process kill/restart was performed.

## B4 gate result

B4 recovery/reissue/reconciliation implementation and its emulator tests were not started. The security gate is unresolved: there is no approved target-Operator identity verification procedure, no approved token delivery channel, and no recovery-specific administrative audit mechanism. Running issuance tests before those decisions would validate an unapproved flow. Once approved, the B4 test suite must use synthetic Admin/Operator accounts and cover Admin authorization, target eligibility, approved identity-verification outcome, atomic replacement/revocation, consuming-state review, audit redaction, delivery failure, concurrency, role preservation, and temporary-password regression. No B4 tests are claimed.

## B4.2 gate result

The latest owner instruction approves the product policies for recent reauthentication, global Admin scope, 20 Admin issues per rolling 24 hours, and 365-day audit retention, while exact schemas remain gated. B4.2 stopped before code changes because the durable attestation/audit needs an exact approved schema and the current Admin UI has no genuine reauthentication prompt or target-attestation flow. The prescribed 5-minute `auth_time` check cannot be reached safely by the existing UI; `getIdToken(true)` alone is not a reauthentication event. No B4.2 tests were run. After approval, test Firebase Auth Emulator sign-in/reauthentication claims, stale and forged `auth_time`, revoked/disabled Admin, current server-side role checks, target enabled/eligible state, attestation fields, replay/concurrency behavior, no token issuance/password mutation, and temporary-password regression.
