# Local Operator Creation Prototype Notes

## Scope and decision record

This implementation is restricted to `demo-casetrack-role-prototype` and the local Auth, Firestore, and Functions Emulators. The approved role-management and police-station ADRs remain unchanged. These notes record the separately approved prototype decisions; they do not validate production authorization or authorize deployment.

## One-time local Admin bootstrap

The local Admin bootstrap is a manual, one-time operation against the existing `demo-casetrack-role-prototype` Auth and Firestore Emulators. It is not an Admin-creation endpoint and must never target a production project.

Before any write, confirm the project and loopback emulator endpoints, read the Auth Emulator identities and `userRoles` with the local Admin SDK, verify the target Auth UID/email, and confirm the target role document is absent. The bootstrap actor must be a different enabled Auth user with an active Admin role record and must be explicitly designated as trusted. An active role or generated test identity alone does not establish trust. If a separate trusted actor cannot be verified, stop without writing.

For the recorded local bootstrap, `admin@example.test` (`B7iFjbLhzeFidr6tYxRClGznC8Un`) had no role document. The verified and explicitly approved actor was `yBusGg0DAv5qZSGc5WpXxUZHAv8Y` (`role-list-12a1cb19-c468-42ff-b255-e503e4558960-11@example.test`), a generated Users-list test account. This approval is specific to that local emulator identity and bootstrap; a fresh/reset emulator requires new verification and explicit trust designation.

Validate every active Admin role record against a present, enabled Auth Emulator user. Then atomically create the target role, initial history event, and governance document in one Firestore transaction:

- `userRoles/{targetUid}`: `role: "admin"`, `status: "active"`, `createdAt` and `updatedAt` as Firestore server timestamps, and `createdBy` / `updatedBy` set to the verified actor UID. No station assignment is used for an Admin.
- `userRoles/{targetUid}/history/{eventId}`: `action: "assigned"`, `previousRole: null`, `newRole: "admin"`, `actorUid` set to the verified actor UID, and `occurredAt` as a Firestore server timestamp. The local event ID is a UUID; this does not establish a general history-ID policy.
- `systemControl/adminGovernance`: ADR schema version 1 with `activeAdminCount` recomputed from the validated active Admin role records, `createdBy` / `updatedBy` set to the verified actor UID, and server timestamps. Do not accept a caller-provided count.

Read the role, event, and governance documents back and verify their fields, timestamps, actor UIDs, and that the count equals the validated role-record count. For the recorded bootstrap, the transaction created event `558ae586-0743-42e4-9d85-ea2c7ffd0f39` and reconciled the count to 2. Both active Admin UIDs corresponded to enabled Auth Emulator accounts. The target Auth account was not changed, and no other role record was changed by the bootstrap.

- The initial assignment event is `action: "assigned"`, `previousRole: null`, `newRole: "operator"`, verified Admin `actorUid`, and server `occurredAt`. The backend generates its UUID event ID.
- Creating an active Operator has zero `activeAdminCount` delta. This endpoint neither requires nor modifies `systemControl/adminGovernance`.
- The Admin form collects email, initial password (12–128 Unicode code points), and one existing station selected by stable document ID. Role and status are fixed by the backend to `operator` and `active`; no display name is collected.
- Auth provisioning is staged: create the account disabled, atomically write role plus history, enable Auth, and mark the operation complete. Firestore Rules remain default-deny; the trusted endpoint performs all privileged writes through Admin SDK.

## Local endpoint and operation record

`POST /demo-casetrack-role-prototype/us-central1/createOperator` requires an active Admin ID token and an `Idempotency-Key` matching the UUID `requestId` in the body. The request accepts only `email`, `password`, `policeStationId`, and `requestId`. The backend validates email/password/station, ignores no extra authority fields (it rejects them), and derives the actor UID from the verified token.

The durable journal is scoped by actor UID:

```text
operatorCreationRequests/{adminUid}/requests/{requestId}
```

It records normalized email, station ID, backend-generated target UID, backend-generated history event ID, phase, timestamps, and a keyed HMAC fingerprint of the password for retry-input comparison. It never stores the plaintext password. The HMAC key lives in the ignored Functions emulator env file; it must be locally generated and must not be reused outside this prototype. Role and initial history documents are committed in one Firestore transaction; governance is untouched.

Retries with the same Admin UID, request ID, email, station, and password resume the reserved Auth UID and event ID. Reuse with any changed input is rejected. Concurrent requests for the same ID receive a retryable conflict while the 60-second lease is held. Completed requests return the same UID without creating another account.

## Partial failure and reconciliation

The endpoint keeps potentially incomplete accounts disabled. It does not automatically delete Auth users: deletion after a lost response could remove an account whose role/history transaction already committed. The preallocated backend UID lets retries find an account even if Auth creation succeeded just before the function lost its response.

- If Auth creation fails before an account exists, retry with the same request ID and exact inputs.
- If the role/history transaction fails, the Auth account remains disabled and the same request can retry the transaction.
- If enabling Auth or final journal completion fails, the handler attempts to disable the account. Retry the same request ID and exact inputs to finish. If the record says `reconciliation_required`, verify the Auth account is disabled before doing anything else.
- For manual cleanup, inspect the request record, Auth user, role document, and history event in the local Emulator. If no role or history exists, an Admin may delete the disabled Auth user in the Auth Emulator and retain the journal as an audit record. If both role and event exist, retry the original request to finish enablement. If only one exists or values disagree, do not delete role/history; stop and reconcile the local emulator state manually.
- Never copy emulator credentials, tokens, or data into a production project. The endpoint does not emit passwords or ID tokens in responses or log messages.

The HMAC fingerprint is sensitive derived credential material even though it is not the password. Keep the journal and key local. Losing the ignored key makes password comparison for old operation IDs unavailable; do not silently rotate it while outstanding operations need recovery.

## Tests and known limits

The local Admin bootstrap completed in `demo-casetrack-role-prototype`. The target Admin role, initial assignment history, and governance documents were read back; `activeAdminCount` was 2 and matched the two active Admin role records validated against enabled Auth Emulator users.

Authenticated browser verification confirmed the following specific flows:

- Police Station Master created a station and listed it.
- Operator creation assigned the selected Police Station.
- The new Operator appeared in the existing Users table with `active` status and the expected station assignment.

These browser results are limited to the flows above; they do not establish that other Admin Panel actions, role transitions, or authorization scenarios passed.

Against the local emulators, the following direct Node test runs completed successfully:

- `node --test functions/tests/operator-creation.test.js`: 12 passed, 0 failed. This covers authorization, validation, station existence, successful account/role/history creation, duplicate email, idempotent replay, changed-input rejection, injected provisioning-stage failures, Users listing, and CORS.
- `node --test functions/tests/users-list.test.js`: 14 passed, 0 failed.
- `node --test functions/tests/police-stations.test.js`: 7 passed, 0 failed.

The Users-list tests now delete only their own role records and Auth accounts instead of recursively clearing all of `userRoles`, preserving pre-existing local roles. The Operator Creation regression checks that the existing governance document remains unchanged; it does not require the document to be absent.

Firestore Rules and station-isolation suites were not run in this verification pass. To test without restarting existing emulators, set the fixed local project/emulator environment variables and run `node --test` directly; the package `test:*` scripts use `firebase emulators:exec`.

The shared Admin Panel navigation check now queries the existing `listUserRoles` endpoint, whose active-Admin check is enforced server-side. It does not attempt a client Firestore role read, which remains denied by the prototype Rules.

This prototype does not implement Operator rename, station reassignment, revocation, password reset, invitation email, role transitions, a last-admin algorithm, or production Rules. The browser-verified Operator appeared in the existing Users table with its active status and selected station assignment. Other browser scenarios remain unverified. The Admin SDK bypasses Firestore Rules, so endpoint authorization must be independently verified before any future deployment; this prototype has no production deployment path and must not be deployed. If the ignored local HMAC key is lost while operations need recovery, password comparison for those operation IDs is unavailable; retain the key locally and do not silently rotate it while outstanding operations remain.
