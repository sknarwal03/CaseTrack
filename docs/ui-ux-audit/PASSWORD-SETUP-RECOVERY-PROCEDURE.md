# Password Setup Recovery Procedure

## Status

In-person Admin identity verification and manual Admin-controlled handoff are approved product policies. Their enforcement remains **design only** pending the schema and frontend approvals listed in [PASSWORD-SETUP-B4-SECURITY-DESIGN.md](PASSWORD-SETUP-B4-SECURITY-DESIGN.md). No recovery issuance, handoff, or reconciliation endpoint is implemented. UX-001 remains **Critical · Open**.

## Operator verification and authorization

1. A signed-in Admin verifies the intended Operator in person and confirms the exact target account.
2. The Admin explicitly acknowledges that the in-person verification occurred. The API records `verificationMethod: "in_person"`, the verified Admin UID, and a server timestamp. This is an Admin attestation; the backend cannot independently prove that the meeting occurred.
3. Do not accept public recovery requests, contact details supplied by a requester, client role claims, or Admin login alone as proof of target identity.
4. The server verifies the ID token with revocation checking, reads the current Admin role from trusted `userRoles`, and requires active Admin status. It rechecks authorization on every operation.
5. The backend fetches target Auth and role state. The target must be an enabled Auth user and an active Operator with `mustChangePassword === false`. It must not alter role, station, status, or unrelated account fields.

## Token issuance and handoff

1. After fresh in-person verification, an authorized endpoint issues a cryptographically random `password_recovery` token using the B1 registry: 32 random bytes, SHA-256 digest only at rest, explicit purpose, maximum 24-hour expiry, one-time use.
2. The token is delivered only through a one-time Admin-only response and manual in-person handoff. No SendGrid, SMS, WhatsApp, or other external integration is approved.
3. Never persist the plaintext token or full link in Firestore, local/session storage, logs, audit events, analytics, browser history, or service-worker cache. Use an Admin UI that holds it in memory only, returns no-store responses, and clears the display on close, pagehide/navigation, sign-out/session change, timeout, or acknowledgement.
4. The Admin explicitly acknowledges handoff. That records an Admin claim, not proof of receipt by the Operator. Browser extensions, DevTools, screenshots, shoulder-surfing, and clipboard managers remain risks.
5. If the response is lost, browser refreshes, or handoff is interrupted, never redisplay or regenerate the same token. Treat the result as unknown; review and revoke the prior token, then require fresh in-person verification and a new issue subject to limits.

## Issuance limits

- Maximum three successful issue/reissue commits per target in any rolling 24-hour window.
- At least 15 minutes between successful issue/reissue commits for the same target.
- Admin-wide maximum: 20 successful issue/reissue commits per Admin per rolling 24 hours (owner-approved; supersedes the earlier B4.1 recommendation of ten).
- Counters use trusted server time and persistent atomic transactions. Pre-commit rejection does not spend a successful-issuance allowance. A confirmed token commit consumes the allowance even if the response/handoff is lost or the token is later revoked. A commit with unknown outcome is treated as possibly consumed until operation status is reviewed.

## Consuming-token reconciliation

1. Never automatically return `consuming` to `issued`, replay the Auth password update, or claim the password changed based only on token state or failure stage.
2. An authorized Admin reviews only non-sensitive status/failure-stage metadata and performs fresh in-person identity verification.
3. The server atomically transitions the exact `password_recovery` record from `consuming` to terminal `revoked`, clears the digest, preserves safe failure evidence, and records the review/revocation audit events.
4. A replacement is a separate fresh attestation and issuance, subject to the same rate limits. If issuance fails after revocation, the old token remains unusable; do not re-enable it.

## Audit and storage

Audit events record actor/target UIDs, action, `in_person` method and verification time where applicable, server event time, outcome, safe reason code, and related operation ID. They must never contain raw tokens, digests, passwords, full links, headers, or sensitive request bodies. Audit retention/access policy and the new operation, audit, and issuance-limit schemas require approval before implementation. Current Firestore client Rules deny reads/writes through the catch-all; Admin SDK code must still enforce append-only writes.

## Rollback

No B4 runtime changes were made. After separately approved implementation, source rollback must disable new issuance/reconciliation endpoints and UI, preserve B1–B3, revoke outstanding B4 tokens through an audited operation, and retain audit records according to the approved policy. Do not delete audit evidence or reset counters as a rollback shortcut. No production deployment is authorized by B4.1.

## B4.2 compatibility gate update

The owner has now approved 20 successful issuances per Admin per rolling 24 hours, 365-day audit retention, global active-Admin scope, same-Admin consuming review after fresh in-person verification, and recent reauthentication within five minutes. These policies supersede earlier open decision text. Exact Firestore operation/audit/limit schemas and target-confirmation/re-authentication UI details remain subject to separate approval. The current Admin UI cannot perform genuine reauthentication; forcing `getIdToken(true)` does not constitute reauthentication. B4.2 stopped before application changes. See the compatibility matrix and exact approval request in `PASSWORD-SETUP-B4-SECURITY-DESIGN.md`.
