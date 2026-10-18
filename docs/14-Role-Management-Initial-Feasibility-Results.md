# Role Management — Initial Feasibility Results

## Status

Initial emulator findings only. This document is not production approval.

## Test environment

- Firebase project ID: `demo-casetrack-role-prototype`
- Environment: Local Firestore Emulator
- Rules under test: `firestore.role-transition.rules`
- Tests: `tests/role-transition-feasibility.test.js`

## Observed results

### 1. Valid promotion batch

The emulator allowed an atomic batch containing:
- Promotion of an active operator to active admin.
- Creation of a matching role-change history event.
- Increment of `activeAdminCount` by one.

Result: Allowed as expected for this scenario.

### 2. Promotion without history

The emulator allowed promotion and governance-counter increment when the batch omitted the history event.

Result: Security gap. The experimental Rules do not enforce the required audit-event coupling.

### 3. Direct governance counter increment

The emulator allowed an active admin to increment `activeAdminCount` without a corresponding role transition.

Result: Security gap. The experimental Rules do not prevent standalone counter manipulation.

## Interpretation

The experimental Rules are not suitable for production.

The observed results do not prove that every possible Rules-only design is infeasible. Further design and adversarial tests are required.

The proposed role schema does not store a reference to the corresponding history event ID. Investigate whether a deterministic history document-path convention can be enforced safely without changing the approved schema. Compare this option against a trusted backend that performs authorization, validation, atomic writes, and audit logging.

## Not yet tested

- All transition types and derived counter deltas.
- Self-role changes and self-promotion.
- Last-active-admin protection.
- History edit/delete and standalone-history bypasses.
- Concurrency and stale-state behavior.
- Rules document-access-call limits.
- Bootstrap and recovery reconciliation.

## Safety boundary

- Keep `firestore.rules` as deny-all.
- Do not deploy the experimental Rules.
- Do not use production Firebase data or credentials in this prototype.

## History-path coupling constraint

### Observed evidence

The emulator allowed promotion and governance-counter increment without a history write. This demonstrates that the current experimental Rules do not enforce audit-event coupling.

### Proposed-schema constraint

The ADR defines history documents at `userRoles/{uid}/history/{eventId}`, but the proposed role document has no field referencing the corresponding event ID.

Firestore `getAfter()` evaluates the resulting state at a specified document path. It does not provide a way to enumerate arbitrary history document IDs and discover which one was newly created.

Official references:
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/firestore/manage-data/transactions

### Next validation

Evaluate whether a deterministic history document-ID convention can be derived from data available to both the Rules and the client. Test that convention for repeat transitions, append-only history, collisions, and concurrent operations.

If reliable coupling cannot be enforced, evaluate the ADR's trusted-backend alternative. Do not declare all Rules-only designs infeasible solely from the current experimental implementation.

### Safety status

These findings concern the prototype only. The production `firestore.rules` file must remain deny-all, and no experimental Rules may be deployed.
