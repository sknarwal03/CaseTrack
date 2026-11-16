# Password Setup B4 — Exact Approval Matrix

**Status:** Review/design only. No application code, Firebase schema, Rules, indexes, configuration, or deployment changed for B4.2A. UX-001 remains **Critical · Open**.

**Source of truth:** Current repository source and the proposed field/API structures in [B4 security design](PASSWORD-SETUP-B4-SECURITY-DESIGN.md), [API contract](PASSWORD-SETUP-API-CONTRACT.md), [security review](PASSWORD-SETUP-SECURITY-REVIEW.md), and [recovery procedure](PASSWORD-SETUP-RECOVERY-PROCEDURE.md). Structures below are proposals for explicit review, not implemented/approved schemas. Where the design does not settle a field or behavior, it is marked unresolved.

## 1. Exact Proposed Firestore Schemas

### 1.1 Recovery operation

**Path:** `operatorRecoveryOperations/{operationId}`  
**Document ID:** server-generated random UUID. It is a correlation identifier, not a secret.  
**Access:** Admin SDK only. No client SDK access; current Firestore catch-all denies client access.  
**Creator/updater:** verified active Admin is recorded in `actorAdminUid`; Functions service writes and updates the document. Exact service-account/IAM split is not defined.  
**Retention:** operation retention/deletion schedule is unresolved; 365-day audit retention is a separate approved policy and must not be inferred to define operation-document retention.  
**Transaction:** attestation plus initial audit event must be atomic; issuance must atomically update operation, token record, target and Admin counters, and issuance audit event. Other transitions must atomically update operation and append their event. Auth state cannot join Firestore transactions and must be checked immediately before/after relevant commits.

| Field | Type | Required/default | Allowed value / semantics | Writer |
|---|---|---|---|---|
| `operationId` | string | Required; equals document ID | Server UUID | Functions |
| `actionType` | string enum | Required | `recovery_issuance`, `consuming_reissue` | Functions from validated workflow |
| `state` | string enum | Required | `attested`, `issued`, `presented`, `handoff_acknowledged`, `handoff_unconfirmed`, `revoked`, `rejected`, `failed` | Functions |
| `actorAdminUid` | string | Required | UID from verified Firebase ID token | Functions |
| `targetOperatorUid` | string | Required | Server-validated eligible Operator UID | Functions |
| `reasonCode` | string enum | Required | `operator_lost_access`, `consuming_completion_review` | Validated request, persisted by Functions |
| `verificationMethod` | string enum | Required | Fixed server-side value `in_person` | Functions |
| `verificationAcknowledged` | boolean | Required; true | Must reflect explicit Admin acknowledgement; not independent proof of meeting | Functions after request validation |
| `verificationAt` | Firestore Timestamp | Required | Trusted server time | Functions |
| `attestationExpiresAt` | Firestore Timestamp | Proposed required | Verification time plus proposed 10 minutes; **10-minute value awaits owner approval** | Functions |
| `createdAt` | Firestore server timestamp | Required | Creation time | Functions |
| `updatedAt` | Firestore server timestamp | Required | Last transition time | Functions |
| `tokenIssuedAt` | Firestore Timestamp | Optional; absent until issued | Trusted server time | Functions |
| `tokenExpiresAt` | Firestore Timestamp | Optional; absent until issued | At most 24 hours after issuance under B1 token policy | Functions |
| `handoffPresentedAt` | Firestore Timestamp | Optional; absent until presented | Trusted server time | Functions |
| `handoffAcknowledgedAt` | Firestore Timestamp | Optional; absent until acknowledged | Trusted server time | Functions |
| `revokedAt` | Firestore Timestamp | Optional; absent until revoked | Trusted server time | Functions |
| `safeFailureCode` | allowlisted string enum | Optional; absent absent failure | Non-sensitive fixed code; exact enum is unresolved | Functions |
| `relatedOperationId` | string | Optional | Correlation to a prior operation; allowed relationship rules unresolved | Functions |
| Idempotency key | Not currently settled | Proposed as HTTP `Idempotency-Key`, UUID | If persisted, must be bound to verified actor and target; storage field, uniqueness/retention and exact replay response are unresolved | Requires approval |

Never store token, token digest, full recovery URL, password, email, request body, bearer token, or clipboard content in this document.

### 1.2 Append-only recovery audit event

**Path:** `operatorRecoveryOperations/{operationId}/events/{eventId}`  
**Document ID:** server-generated unique event ID (UUID proposed; format is not otherwise fixed).  
**Access:** Admin SDK writes only; clients denied by existing Rules. Application code must create events and never update/delete them. Operational IAM can still mutate data, so true immutability is not guaranteed by Firestore or current Rules.  
**Writer:** Functions only; actor identity fields come from verified token context, never request body.  
**Retention:** Owner approved 365 days. Exact deletion/TTL mechanism, legal hold behavior, and whether operation docs share that retention remain unspecified. No TTL/index is proposed or authorized here.  
**Transaction:** Event for a successful state-changing action must commit atomically with the state/quota/token changes it describes. Rejection events may be best effort unless required to authorize a state change (they never authorize one).

| Field | Type | Required/default | Allowed value / semantics | Writer |
|---|---|---|---|---|
| `eventId` | string | Required; equals document ID | Server-generated identifier | Functions |
| `actorAdminUid` | string or null | Required | Verified active Admin UID; null if not established | Functions |
| `verifiedActorUid` | string or null | Required | UID only from successfully verified Firebase token; null otherwise | Functions |
| `targetOperatorUid` | string or null | Required | Set only after syntactic validation; server-validated target for accepted operation | Functions |
| `actionType` | string enum | Required | Allowlisted action; exact complete enum is unresolved. Includes the operation action values and event types for verification, issue, presentation, acknowledgement, status/review/revocation, rejection/failure | Functions |
| `verificationMethod` | string enum or null | Required | `in_person` or null | Functions |
| `verificationAt` | Firestore Timestamp or null | Required | Trusted server time or null | Functions |
| `eventAt` | Firestore server timestamp | Required | Server event time | Functions |
| `outcome` | string enum | Required | `accepted`, `rejected`, `failed`, `ambiguous` | Functions |
| `reasonCode` | string enum | Required | Allowlisted, non-sensitive code; exact set unresolved | Functions after request validation |
| `relatedOperationId` | string | Required | Corresponding operation ID; how to represent pre-operation denied attempts is unresolved | Functions |

Never include token/hash/link/password, Auth headers, raw request data, or secrets from exception objects. Invalid/anonymous callers must not cause attacker-provided target/body fields to be stored.

### 1.3 Target and Admin issuance limit records

**Path:** `operatorRecoveryIssuanceLimits/{principalHash}`  
**Document IDs:**

- Target: `sha256("casetrack:operator-recovery-target:v1:" + targetUid)`
- Admin: `sha256("casetrack:operator-recovery-admin:v1:" + verifiedAdminUid)`

These are two documents with the same field structure and distinct `scope`. Raw UID is not stored. Admin SDK only. Functions writes under Firestore transactions. Successful issue count is target maximum 3 per rolling 24 hours with at least 15 minutes between commits; Admin maximum 20 per rolling 24 hours. Those policy thresholds are approved. **The list-based representation and exact boundary semantics still require approval.** No automatic cleanup/deletion/TTL policy is specified; old timestamps are pruned on successful limiter reads/writes, while dormant documents may remain indefinitely. Retention and cleanup need decision.

| Field | Type | Required/default | Allowed value / semantics | Writer |
|---|---|---|---|---|
| `scope` | string enum | Required | `target` or `admin`; must agree with document-ID derivation | Functions |
| `successfulIssuanceTimesMs` | number array | Required; proposed default `[]` | Trusted server epoch milliseconds in rolling 24h; bounded to policy window (max 3 target, max 20 Admin); ordering/duplicate handling and exact cut-off inclusivity unresolved | Functions transaction |
| `lastSuccessfulIssuanceAtMs` | number or null | Required; proposed default `null` | Trusted server epoch milliseconds; used to enforce 15-minute target interval; Admin value may be set to latest Admin issue, but its necessity/meaning should be confirmed | Functions transaction |
| `updatedAt` | Firestore server timestamp | Required on write | Last update time | Functions |

No raw IP, raw UID, token, password, or email belongs in these records. Transaction reads both target and Admin records before writes. Rejected/pre-commit attempts do not change successful-issuance counters. A committed issue counts even if the response is lost or later revoked.

### 1.4 Existing token registry change

**Path:** `operatorSetupActionCodes/{uid}`. Existing B1/B3 document stores token digest/purpose/status/timestamps and safe completion fields.  
**Proposed additive change:** optional `recoveryOperationId: string` on recovery-purpose documents only. It links the digest-only token to the operation; initial-setup documents remain unchanged.  
**Writer:** Functions only.  
**Transaction:** recovery issuance writes the new token record and matching operation/counters/audit atomically. Reviewed `consuming → revoked` must also update token and operation/audit atomically. Existing helper supports `issued → revoked` only; do not claim consuming reissue is supported.  
**Retention:** existing token lifetime/state behavior applies; no new retention policy field proposed.

The B4.1 design leaves `revokedAt`, `revokedByAdminUid`, and `revocationReasonCode` in this record unresolved and recommends keeping revocation facts in operation/audit documents to avoid expanding the token schema. Explicit decision required; do not add these fields by inference.

## 2. API Contract Proposals

Common proposed requirements for Admin endpoints: HTTPS v2 HTTP Function in `us-central1`; Bearer Firebase ID token; verify token with revocation check; active Admin role re-read from `userRoles/{uid}` on every call; exact CORS origin allowlist (CORS is not auth); JSON and exact request keys; maximum 4 KiB; no-store; no body/header tracing; generic target-unavailable response; rate and audit behavior described per endpoint. No endpoint below currently exists.

### B4.2 — `POST /recordOperatorRecoveryVerification`

Request: `{"targetUid":"<uid>","verificationAcknowledged":true,"reasonCode":"operator_lost_access"}`. `Idempotency-Key: <UUID>` header proposed; not included in body. No actor UID, role, method, timestamp, email, token, or password from client.

Checks: valid non-revoked ID token; active global Admin role; verified token `auth_time` age 0–300 seconds against server time; exact acknowledgement true; reason enum; target Auth account exists and is enabled; target role is active Operator with `mustChangePassword:false`; no target data is trusted from client beyond UID selection. Server sets actor, method `in_person`, and verification timestamp.

Proposed success: `201 {"operationId":"<uuid>","verificationExpiresAt":"<ISO-8601>"}`. Does not issue or return a token. Proposed errors: `400 verification-required` (and malformed input); `401 unauthorized`; `403 forbidden`; generic `404 operator-unavailable`; `409 operation-unavailable` for idempotency collision/state conflict; `429 verification-limited` only if a separate request-attempt limiter is approved/defined; `503 temporarily-unavailable` on audit/storage failure. Exact rate limit for verification calls, key retention/replay response, whether duplicate identical requests return prior response, and idempotency mismatch semantics are unresolved. Audit event must be written with operation atomically; no successful attestation without durable audit.

**Step-up:** `auth_time` must come from verified Firebase claims, not client timestamp or `iat`; check `0 <= serverNow - auth_time <= 300 seconds`. Reject absent, future, stale, revoked, disabled, or unauthorized Admin. `getIdToken(true)` refreshes the token but does not reauthenticate.

### B4.3/B4.4 — future issue and one-time handoff (not B4.2)

`POST /issueOperatorPasswordRecovery`, request `{"operationId":"<attested-operation-id>"}`. Verify operation belongs to current Admin, is fresh/unused, target remains eligible, and both quotas pass. Generate token in memory; persist digest only; atomically write token/operation/counters/audit. Proposed first success: `201 {"operationId":"...","recoveryUrl":"<one-time link>","expiresAt":"<ISO-8601>"}` with no-store. Repeat: `409 handoff-unavailable`; never reconstruct/redisplay token. Proposed failures: `401`, `403`, generic `404 operator-unavailable`, `409 operation-unavailable`, `429 issuance-limited` plus safe `Retry-After` if non-enumerating, `503 temporarily-unavailable` for transaction/commit uncertainty. The issue endpoint must not ship before the secure UI, because the bearer URL is visible to an authorized Admin and browser DevTools. B4.3 issuance and B4.4 one-time handoff are coupled unless an approved transient delivery design is chosen.

`POST /acknowledgeOperatorRecoveryHandoff`, request `{"operationId":"...","handoffAcknowledged":true}`. Same active Admin and actor ownership check; single state transition and audit event. Repeat may be idempotent but never returns URL. Exact response and duplicate semantics are not specified in current design and need approval. This only records Admin attestation, not proof of Operator receipt.

### B4.5 — future status and consuming review (not B4.2)

`GET /getOperatorRecoveryStatus?targetUid=<uid>`: active Admin; no-store; only non-secret status fields proposed: `{targetUid,state,purpose,issuedAt,expiresAt,completionFailureStage,completionFailureAt,operationId}`. Generic unavailable response. Never claim whether Auth password changed from token metadata.

`POST /reviewAndRevokeOperatorRecovery`, request `{"operationId":"...","targetUid":"...","verificationAcknowledged":true,"reasonCode":"consuming_completion_review"}`. Require active Admin, recent reauthentication, fresh in-person acknowledgement, eligible target and matching operation; atomically revoke exact `password_recovery` token only from `consuming`, clear digest, preserve safe failure evidence, and append audit. Never call Auth or infer password outcome. New issue is a separate newly attested operation and subject to quotas. Exact idempotency and response contracts remain unresolved.

### Idempotency and retries (unresolved specifics)

The verification proposal uses an idempotency key but does not define its document field, retention, key-digest policy, or response replay. Issuance is one-shot: a lost/ambiguous response must be reconciled by operation state and never produce a second token or return the same raw link. For handoff/review transitions, duplicate-state response behavior requires explicit contract approval. Never automatically reset `consuming` or retry Firebase Auth password mutation.

## 3. Exact Approval Matrix

| ID | Component | Exact Proposed Change | Source Reference | Required Increment | Risk | Approval Required |
|---|---|---|---|---|---|---|
| S1 | Operation schema | Create `operatorRecoveryOperations/{operationId}` with fields/table in §1.1; random UUID ID; Admin SDK only | `PASSWORD-SETUP-B4-SECURITY-DESIGN.md` §3A; no existing equivalent | B4.2 required for durable attestation; later states B4.3–B4.5 | Durable sensitive account-action metadata; ambiguous retention/idempotency | **Yes:** field-level schema, allowed enums, operation retention, idempotency field/behavior, attestation window |
| S2 | Audit schema | Create `operatorRecoveryOperations/{operationId}/events/{eventId}` with fields in §1.2; append-only application behavior; 365-day retention | B4 design §3B; current `userRoles/{uid}/history/{eventId}` is role-change history only | B4.2 required for attestation; all later transitions | Audit integrity, privileged IAM mutation, retention/deletion obligations | **Yes:** exact enums, pre-operation rejected-event path, retention implementation/holds, IAM/audit access |
| S3 | Target issuance limits | Create target doc at hashed ID with fields in §1.3; 3 successful issues/rolling 24h and >=15 minutes apart; transaction | B4 design §3C and §5; existing `operatorSetupRateLimits` is network-prefix limiter, not target limiter | B4.3 issue/reissue | Quota bypass, clock skew, transaction contention, lingering docs | **Yes:** exact array representation/cutoff rules, cleanup, clock assumptions |
| S4 | Admin issuance limits | Create Admin doc at hashed ID with same fields and `scope=admin`; maximum 20 successful issues/rolling 24h | B4.2 owner policy; B4 design older §5 recommendation of 10 is superseded | B4.3 issue/reissue | Admin lockout/abuse; shared hot document per Admin | **Yes:** exact document representation and boundary semantics; threshold 20 is policy-approved |
| S5 | Token registry link | Add optional `recoveryOperationId` to `operatorSetupActionCodes/{uid}` recovery records; do not add optional revocation fields unless separately selected | B4 design §3D; B1/B3 helper has no operation link | B4.3 and B4.5 | Existing token state/reissue compatibility | **Yes:** additive field; explicit choice on revocation facts; initial setup must remain unaffected |
| A1 | Attestation API | Add `POST /recordOperatorRecoveryVerification`, exact proposed request/success/errors in §2; no token issuance | B4 design §4; no existing endpoint | B4.2 required | False attestation if not in-person; replay or duplicate operations if key handling unspecified | **Yes:** API schema/status codes/idempotency/retry policy; storage schema approval first |
| A2 | Verified step-up | Check signed ID token `auth_time` with revocation check and active role; age 0–300 sec; no client timestamp | `functions/admin-role-management.cjs`: `authorizeActiveAdmin`, `verifyIdToken(token, true)`; no current age check | B4.2 required | Stolen session otherwise remains usable; provider reauth compatibility | **Policy approved;** approve/confirm exact 300-second enforcement and absent/future timestamp behavior |
| A3 | Target confirmation data | Server-fetched target summary bound to UID; eligible active Operator only; no client email/role authority | `listUserRoles` returns role/status/station, not Auth email; current Users table shows UID, role, status, station | B4.2 required | Wrong account selection / PII exposure | **Yes:** summary fields and disclosure surface; backend rechecks independently |
| U1 | Admin selection/confirmation UI | Add recovery action on eligible Operator row; confirmation panel displays verified target UID and approved summary; unavailable/error states | `pages/admin-panel.html`, `assets/js/admin-panel.js`; no recovery action exists | B4.2 required | Wrong-recipient action, UI/account mismatch | **Yes:** UI surface/copy/fields and interaction |
| U2 | Genuine reauthentication UI | Provider-aware Firebase reauthentication, then fresh ID token; password/credential only sent to Firebase Auth SDK, never Functions; stale/revoked errors require sign-in | Admin JS imports `getIdToken`, `onAuthStateChanged`; current flow calls `getIdToken(activeUser)` only; no reauth method | B4.2 required | Credential exposure, provider incompatibility, session confusion | **Yes:** supported Admin providers and exact reauth UX; no client-controlled timestamp |
| U3 | Attestation acknowledgement UI | Explicit in-person checkbox/affirmation plus reason code; UI states this is Admin attestation; submit once; don't claim backend persisted unless success response confirms | No current UI; B4 design §6 proposed | B4.2 required | Forged/misleading attestation; duplicate submission | **Yes:** exact wording/reasons and presentation; backend sets method/time/actor |
| L1 | Secure one-time handoff UI | In-memory link reveal/copy, no storage/history/cache/logs, clear on close/pagehide/session change/timeout; explicit handoff acknowledgement | Existing temporary-password dialog is separate; no recovery UI | B4.4 required, coupled operationally to B4.3 | Bearer URL leakage through browser/clipboard/DevTools | **Yes, separately:** display/copy policy and proposed 5-minute window; do not add to B4.2 |
| A4 | Issue endpoint | Add `POST /issueOperatorPasswordRecovery` with one-time raw URL response after atomic commit | No existing recovery issuer; B1 helper not connected | B4.3 required | Link exposure and ambiguous commit | **Yes, separately:** schema, exact response/error/idempotency; ship only with handoff UI |
| A5 | Handoff acknowledgement API | Add `POST /acknowledgeOperatorRecoveryHandoff`; state/audit only; never return URL | No existing endpoint | B4.4 required | False assertion of receipt; replay | **Yes, separately:** response and duplicate behavior |
| A6 | Status/review API | Add status GET and explicit consuming-token revoke POST; no Auth mutation; preserve failure stage | Existing registry supports revoke only from `issued`, not `consuming` | B4.5 required | Incorrect password-outcome inference; destructive revoke | **Yes, separately:** exact output/replay behavior and consuming transition semantics |
| R1 | Rules | No Rules change proposed; existing catch-all denies client access; Functions Admin SDK access only | `firebase.json`, `firestore.admin-panel.rules` | B4.2–B4.5 | Client exposure if rules change accidentally | No change requested; any Rules change needs separate approval |
| I1 | Indexes | Direct document gets/sets and per-operation subcollection event access; no composite index currently indicated | B4 design §3; no query plan for global audit search | B4.2–B4.5 | Query needs may arise later | No index proposed; future query/index requires separate review/approval |
| T1 | Temporary-password workflow | Preserve existing `resetOperatorPassword`, provisioning and role assignment; recovery is distinct | `functions/admin-role-management.cjs`; `operator-credentials.js` | Regression requirement throughout B4 | Regression/accidental auth mutation | No behavior change authorized; test as regression |
| D1 | Function configuration | Export new narrowly scoped Admin functions in `functions/index.js`, `us-central1`; no production config/deploy in this approval | `functions/index.js`; current recovery handlers absent | By each separately authorized API increment | Unreviewed exposure/config | **Yes per increment**; no deployment authorized |

## 4. Admin UI and Authentication Plan

### B4.2 only

1. Select an eligible Operator from the Admin Users list.
2. Fetch target summary from trusted backend by UID; display only fields approved in A3/U1 and bind confirmation to that UID. The backend independently re-fetches Auth and role state.
3. Genuine Firebase Auth reauthentication for the signed-in Admin using the credential provider already attached to that account. Use Firebase's provider-appropriate reauthentication API (for password providers, `reauthenticateWithCredential`); do not send password to a Function or invent a timestamp. Then obtain a current ID token. If provider is unsupported or reauth fails, stop with a safe retry/sign-in state.
4. Show explicit in-person verification acknowledgement and approved reason. Submit the exact attestation request once with an idempotency key. Disable repeat submission while pending. On network ambiguity, reconcile using the same approved idempotency contract; do not create a fresh key blindly.
5. Display success only after durable operation+audit success; show generic unavailable, unauthorized/stale-session, target-ineligible, duplicate/conflict and service-unavailable states. No token/link appears in B4.2.

### Later increments

- B4.3 issuance requires B4.4 UI at the same release boundary unless an approved transient one-time delivery design exists.
- B4.4 adds one-time in-memory link reveal and acknowledgement; no browser persistence, restoration or link replay.
- B4.5 adds safe status and separately confirmed `consuming` revocation; must not infer or mutate Auth password state.

## 5. Security and Consistency Findings

- Existing `verifyIdToken(token, true)` does revocation-aware token verification; existing `authorizeActiveAdmin` re-reads the trusted role and checks active Admin requirements. It does **not** check `auth_time`. Disabled/revoked authentication is rejected by Firebase Admin verification; active role is independently required.
- Current frontend obtains ID tokens with `getIdToken(activeUser)` (and force-refresh in other flows). Refresh is not credential reauthentication and does not establish a fresh `auth_time`.
- `operatorRecoveryOperations`, audit events, and issuance counters are new proposed Firestore paths. Current client Rules deny them through catch-all. Admin SDK bypasses Rules; service IAM and server code remain the trust boundary.
- Proposed direct reads/writes need no composite index. Any future cross-operation search/filter query may require an index and a separate approval. No Rules/index change is necessary for the proposed Admin SDK-only access.
- Successful issuance must transactionally pair token digest/purpose/status/expiry/operation link, operation state, both quota records and audit event. Firestore transactions cannot atomically include Firebase Auth enabled state; check Auth immediately before/after and keep token validation/completion as final eligibility enforcement.
- `resetOperatorPassword` is a distinct temporary-password workflow: keep it unchanged. Recovery must not change password, role, status, station or `mustChangePassword` at issuance.
- Never log tokens, hashes, full URLs, passwords, credentials, bearer headers or request bodies. Audit stores only allowlisted actor/target/action/time/outcome/reason metadata.
- No production-grade abuse protection or concurrency/clock-skew guarantee is implied by a proposed Firestore counter. Production load, source provenance, transaction contention and cleanup costs need separate operational validation.

## 6. Unresolved Decisions and Numbered Approval Requests

1. **Approve operation schema:** exact fields/enums in §1.1; operation retention; optional related-operation and idempotency fields; approve or reject the proposed 10-minute attestation lifetime.
2. **Approve audit schema/retention implementation:** exact event schema/enums in §1.2; representation of verified-but-pre-operation denials; exact 365-day deletion/TTL mechanism, legal holds, access policy and IAM controls. The 365-day duration is approved; these mechanics are not specified.
3. **Approve issuance-limit schema:** exact hash derivation, list representation, server-time source, cutoff inclusivity, Admin `lastSuccessfulIssuanceAtMs` semantics, cleanup and dormant-record behavior in §1.3. Policy thresholds (target 3/24h + 15-minute interval; Admin 20/24h) are approved.
4. **Approve token registry extension:** optional `recoveryOperationId` on recovery records. Confirm no revocation metadata fields are added to token docs (recommended) or specify exact fields.
5. **Approve B4.2 API contract:** endpoint name/method and request/response/error schemas in §2; `Idempotency-Key` binding, stored representation, retention, identical replay response and actor/target mismatch behavior; verification-attempt throttle (no threshold currently designed).
6. **Approve reauthentication integration details:** provider support in this Admin deployment, exact UX, 300-second age bound, and handling for missing/future `auth_time`. Policy of recent reauth within five minutes is approved. No password may go to Functions; no client timestamp accepted.
7. **Approve target summary and UI:** exact identity fields shown, target confirmation wording, attestation language/reason codes, safe error/retry states and whether email is shown. Email currently is not in the Users list; don't add it without approval.
8. **Separately approve B4.3/B4.4 coupling:** one-time URL response contract, link display/copy behavior, five-minute display-window proposal, clipboard risk, handoff acknowledgement response and ambiguous result handling. These are outside B4.2A and do not authorize code now.
9. **Separately approve B4.5:** status output and reviewed `consuming → revoked` semantics, reason codes, replay behavior, event rules and UI. Never claim Auth/Firestore atomicity or password outcome.

## 7. Safe Sequence

1. Resolve approvals 1–7. Keep this increment documentation-only until explicit approval is recorded.
2. Implement B4.2 operation/audit schema, reauthentication, target summary/confirmation, attestation endpoint and focused tests together; no token issuance or password mutation.
3. Separately authorize and implement B4.3+B4.4 together (or approve a reviewed alternative transient handoff design); add transactional quota/token issuance and one-time handoff UI/tests.
4. Separately authorize B4.5 status and reviewed consuming-token revocation, with failure/concurrency tests.
5. Run synthetic emulator tests, temporary-password regression, existing unit suites, syntax/build checks and security review under the specific increment authorization. Do not deploy without separate release authorization.

**B4.2A disposition:** exact approval matrix prepared; no code or tests changed/run. Stop and request explicit decisions for items 1–7 before B4.2 implementation. B4.3–B4.5 remain separate gates. UX-001 remains **Critical · Open**.
