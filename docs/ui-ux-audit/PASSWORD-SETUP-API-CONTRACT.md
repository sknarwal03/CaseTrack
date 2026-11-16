# Password Setup API Contract

**Contract status:** validation was implemented in B2 and password completion in B3. Both match the current browser request bodies and success fields. This bearer-link workflow does not require a Firebase Auth ID token because the user may not be signed in. The unguessable one-time link is the credential. Approved purposes are `initial_setup` and `password_recovery`; the client does not send purpose.

## Endpoint addressing

Production `functionsEndpoint(name)` resolves to:

- `POST https://us-central1-casetrack-97a4e.cloudfunctions.net/validateOperatorSetupCode`
- `POST https://us-central1-casetrack-97a4e.cloudfunctions.net/completeOperatorPasswordSetup`

Local `role-admin-local` mode resolves to `http://127.0.0.1:<Functions port>/demo-casetrack-role-prototype/us-central1/<name>` (configured default port 5001; Admin verification profile uses 5003). The endpoint is a Firebase Functions v2 `onRequest` HTTP function, not an `onCall` callable. Firebase documents that HTTP Functions require explicit CORS handling ([HTTP Functions](https://firebase.google.com/docs/functions/http-events)).

## Shared transport and controls

- HTTPS in production; `POST`; `Content-Type: application/json`; request body <= 4 KiB; strict JSON object with exactly the listed keys. Reject arrays, extra fields, unsupported media types and malformed JSON.
- `Cache-Control: no-store, max-age=0`; `X-Content-Type-Options: nosniff`; never enable body/request tracing.
- Exact CORS allowlist for the approved static origin (`https://sknarwal03.github.io`) and explicit emulator loopback origin only in local mode. `OPTIONS` preflight permits only POST and required headers; return `204`, `Vary: Origin`, no wildcard. Origin is not authentication.
- No `Authorization: Bearer` Firebase ID token. A bearer `uid + token` pair is required in body and validated against the server registry. If App Check is separately approved, send `X-Firebase-AppCheck` and verify it server-side; it is supplemental.
- All response bodies are JSON except empty `204` preflight. Never return email, account metadata, role record, token digest, or password.
- Uniform invalid-link treatment must cover wrong token, unknown UID, expiry, used/revoked state, disabled/missing Auth account, inactive/non-Operator role, or wrong setup purpose.

## Common input types

- `uid`: string matching `^[A-Za-z0-9_-]{1,128}$`.
- `token`: string matching `^[A-Za-z0-9_-]{43}$`; 32 random bytes, base64url.
- `password`: unmodified string of 12–128 Unicode code points (same rule as current form and authenticated first-password endpoint). Do not trim or normalize. Firebase Auth may impose its own project password policy; the current deployed console policy has not been verified.

## 1. Validate setup token

`POST /validateOperatorSetupCode`

Request (matches current `assets/js/password-setup.js`):

```json
{
  "uid": "operator-auth-uid",
  "token": "43-character-base64url-secret"
}
```

No password, email, role, purpose or caller-chosen status is accepted. The server obtains purpose only from the matching issued token document, then checks exact shape, enabled Auth account, eligible active Operator role, expiry, and digest. `initial_setup` requires `mustChangePassword === true`; `password_recovery` requires `mustChangePassword === false`. A missing or unknown stored purpose fails closed. Validation is read-only; it does not claim/consume the token.

| Result | HTTP | Response |
|---|---:|---|
| Link valid | 200 | `{"valid":true}` |
| Any invalid/ineligible link | 200 | `{"valid":false}` |
| Malformed JSON/body/fields | 400 | `{"valid":false}` |
| Unsupported method | 405 | `{"error":"method-not-allowed"}` |
| Rate limit | 429 | `{"error":"try-again-later"}` + `Retry-After` |
| Backend dependency unavailable | 503 | `{"error":"temporarily-unavailable"}` |
| Origin rejected | 403 | `{"error":"forbidden"}` (browser may expose only a CORS failure) |

The same 200 status/body shape for all invalid credentials prevents distinct statuses from revealing whether a UID exists. The current frontend accepts only `response.ok && result.valid === true`; `{valid:false}` already produces its generic invalid-link state. It currently presents a validator 429/503 as a generic invalid/unavailable link; optionally improve retry copy, without exposing validity details.

## 2. Complete password setup

`POST /completeOperatorPasswordSetup`

Request (matches current `assets/js/password-setup.js`):

```json
{
  "uid": "operator-auth-uid",
  "token": "43-character-base64url-secret",
  "password": "user-entered-password"
}
```

The server validates all fields and the 12–128 Unicode-code-point password policy before claiming the token. It derives purpose from the matching stored token record, then transactionally changes registry status `issued → consuming` with a server-generated attempt ID while checking expiry, digest, purpose and eligible active Operator role. It rechecks the same Auth UID is present and enabled, updates the password through Firebase Admin Auth, then finalizes only that attempt as `used` and deletes the stored digest. Initial setup clears `mustChangePassword`; password recovery leaves it false. Role/status/station remain unchanged. Finalization rechecks active Operator eligibility.

| Result | HTTP | Response |
|---|---:|---|
| Completed | 200 | `{"completed":true}` |
| Invalid, expired, used, revoked, ineligible link | 400 | `{"error":"invalid-setup-link"}` |
| Missing/extra fields or malformed body | 400 | `{"error":"invalid-setup-link"}` |
| Password length rejected before claim | 422 | `{"error":"invalid-password"}`; token remains `issued` |
| Claim fails, including used/revoked/expired/replayed token | 400 | `{"error":"invalid-setup-link"}` |
| Rate limit | 429 | `{"error":"try-again-later"}` + `Retry-After` |
| Auth update or finalization fails/is ambiguous after claim | 503 | `{"error":"temporarily-unavailable"}`; keep claim `consuming`, record a fixed failure stage when possible, never retry automatically |
| Unsupported method | 405 | `{"error":"method-not-allowed"}` |
| Unsupported media type / oversized request | 415 / 413 | `{"error":"unsupported-media-type"}` / `{"error":"invalid-request"}` |
| Origin rejected | 403 | `{"error":"forbidden"}` |

**Frontend compatibility:** success matches `result.completed === true`. Current frontend maps HTTP 400 to its generic expired/invalid-link message. It ignores 422's body and displays generic retry copy. For a post-claim 503, that retry copy is misleading because the token remains `consuming` and will not be retried automatically; the operator needs support/reconciliation. It also does not distinguish 429 from other failures. Any UI copy change requires a separate frontend increment. Do not return a specific error for an unknown account or role.

## Authentication, replay and idempotency

- Validation and completion do not require Firebase sign-in, but require possession of the link capability plus the linked UID; token remains secret even though UID is public-ish.
- Repeated validation is safe and does not consume a valid link.
- Completion is one-shot, serialized by a Firestore transaction. Concurrent or later replay does not call Auth again. The shared B2 rate limit is 30 well-formed attempts per 15 minutes per IPv4 /24 or IPv6 /56 prefix; completion shares that bucket with validation.
- There is no client idempotency key in the existing request. Do not add one silently. If Auth succeeds and the response is lost, the token remains used; user should try sign-in with their chosen password. A replay returns invalid-link. If Auth result is ambiguous and state is `consuming`, user needs approved support/reissue after reconciliation.
- After claim, every Auth failure or uncertain outcome remains `consuming`; the endpoint never invokes B1's retry-release helper. A fixed enum `completionFailureStage` and timestamp may be recorded in the existing token document. If Auth succeeded but Firestore finalization is uncertain, a later read may show `used` or `consuming`; both reject replay. Authorized administrative reconciliation and fresh issuance are required; there is no automatic retry or background task.
- If a client-generated idempotency key is later desired, it needs a frontend contract change, storage/retention design and replay tests; it must not make used tokens reusable.

## Constraints and dependencies

Increment 1B-B3 implements `completeOperatorPasswordSetup` locally in source. Password mutation is not deployed. B1 added the approved optional purpose field to newly issued token documents; there is no migration, and legacy records without purpose fail closed. No Firestore Rules change or deployment was made. Issuance/provisioning and email delivery remain unimplemented.

### Implemented validation details (B2)

- Export: Firebase Functions v2 `onRequest`, `us-central1`; URL is `https://us-central1-casetrack-97a4e.cloudfunctions.net/validateOperatorSetupCode` when deployed to the configured project. No deployment was performed.
- Request remains exactly `{uid, token}`. No ID token or client purpose is accepted. Stored purpose is obtained from the registry and then checked against token eligibility, expiry, status, Auth enabled state and active Operator role.
- Method: POST only. JSON only; exact fields; 4 KiB maximum. `OPTIONS` supports an explicit allowlisted origin, POST, and Content-Type. Unsupported Origin returns 403. CORS is not authentication.
- Invalid/expired/revoked/used/missing-purpose/ineligible tokens return 200 `{valid:false}`. Valid tokens return only 200 `{valid:true}` and remain issued. Malformed input: 400 `{valid:false}`; wrong method: 405; wrong media type: 415; oversized body: 413 `{valid:false}`; limiter threshold: 429 with `Retry-After`; limiter/dependency failure: 503. Responses are no-store.
- Firestore rate limiter: `operatorSetupRateLimits/{sha256(network-prefix)}`, 30 attempts per 15-minute fixed window per IPv4 /24 or IPv6 /56. Counters are atomic transactions; limiter failure is closed. Raw IP, UID and token are not stored. Cleanup deletes up to 10 expired documents opportunistically per request, transactionally rechecking candidates; no TTL policy or custom index is required. Persistent count transactions incur Firestore reads and writes per attempt, plus occasional query/read/delete cleanup costs. Cleanup is best-effort and storage can accumulate during inactivity or cleanup failures. This is basic abuse friction, not production-grade protection; distributed source rotation and shared NAT impact remain.

### Implemented completion details (B3)

- Exported as a second v2 `onRequest` function in `us-central1`: `POST /completeOperatorPasswordSetup`; exact request `{uid, token, password}` and success `200 {completed:true}`. No Firebase sign-in session is required; possession of the token is the credential.
- Method, JSON content type, exact fields, 4 KiB size bound, CORS allowlist, no-store, generic errors and the B2 persistent shared limiter apply. Invalid/unusable links return 400 `invalid-setup-link`; invalid password length returns 422 `invalid-password` before claim; limiter returns 429; backend/ambiguous outcomes return 503. Request bodies and Auth exception contents are not logged.
- Auth update errors are treated as potentially ambiguous regardless of error code. The token stays `consuming`; the backend records only one of fixed failure stages plus a timestamp in the existing token document when possible. No claim release or automatic retry occurs.
- On confirmed Auth success, `finalizeCompletion` transaction verifies matching attempt/purpose/status and eligible role, marks token `used`, deletes its digest and (only for `initial_setup`) clears `mustChangePassword` in the same Firestore transaction. A failed/uncertain finalization does not return success; replay remains blocked by `consuming` or `used`.

## B4 recovery contract status

No Admin recovery issuance, reissue, status/reconciliation, or one-time handoff API is implemented. The owner has approved in-person Admin attestation and manual Admin-controlled handoff as product policies. Proposed B4 endpoint contracts, auth/error behavior, operation persistence, and one-time response limitations are in `PASSWORD-SETUP-B4-SECURITY-DESIGN.md`; storage and frontend remain unapproved. Do not infer a contract from `resetOperatorPassword`: it changes the Auth password and returns a temporary password to the Admin UI, which is a different workflow. Existing B1-B3 public setup contracts are unchanged.

**B4.2 status:** the proposed verification API was not added. It requires a durable operation/audit schema that still needs exact approval, and the current Admin UI cannot perform recent credential reauthentication or target confirmation. The backend must later validate verified ID-token `auth_time` against server time (maximum age 300 seconds); forcing token refresh alone does not satisfy the policy. No storage-free preflight contract is exposed because it would imply an attestation was recorded when it was not.

**B4.2A review:** proposed field-level schemas, exact request/response/error sketches, idempotency gaps, and owner approval questions are consolidated in `PASSWORD-SETUP-B4-EXACT-APPROVAL-MATRIX.md`. These remain design proposals; no recovery endpoint is implemented and no contract should be treated as authorized until the listed decisions are approved.
