const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { createSetupCodeRegistry } = require("../operator-email.cjs");
const {
    createPersistentSetupRateLimiter,
    createCompleteOperatorPasswordSetupHandler
} = require("../password-setup.cjs");

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const emulatorsConfigured = /^(127\.0\.0\.1|localhost):\d+$/.test(firestoreHost)
    && /^(127\.0\.0\.1|localhost):\d+$/.test(authHost);
const ALLOWED_ORIGIN = "http://127.0.0.1:5174";

function makeResponse() {
    return {
        headers: {}, statusCode: 200, body: undefined,
        set(name, value) { this.headers[name] = String(value); return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; }
    };
}

async function post(handler, body, ip = "203.0.113.42") {
    const response = makeResponse();
    await handler({
        method: "POST",
        ip,
        headers: { origin: ALLOWED_ORIGIN, "content-type": "application/json" },
        body,
        rawBody: Buffer.from(JSON.stringify(body))
    }, response);
    return response;
}

async function signIn(authHost, email, password) {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    return { status: response.status, body: await response.json() };
}

test("Password Setup completion is one-time and fail-closed with Auth/Firestore emulators", {
    skip: !emulatorsConfigured
        ? "Set both Auth and Firestore emulator hosts to localhost to run this isolated test."
        : false,
    timeout: 90000
}, async () => {
    const projectId = "demo-casetrack-password-b3";
    const app = initializeApp({ projectId }, `password-completion-${randomUUID()}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const registry = createSetupCodeRegistry({ db, auth, fieldValue: FieldValue });
    const limiter = createPersistentSetupRateLimiter({ db, maxAttempts: 30, cleanupBatchSize: 0, fieldValue: FieldValue });
    const fixtures = [];

    async function fixture(purpose, roleState = purpose === "initial_setup") {
        const uid = `operator-${randomUUID()}`;
        const email = `b3-${randomUUID()}@example.test`;
        const initialPassword = `Synthetic-${randomUUID()}-Initial!`;
        await auth.createUser({ uid, email, password: initialPassword, disabled: false });
        const roleRef = db.collection("userRoles").doc(uid);
        const tokenRef = db.collection("operatorSetupActionCodes").doc(uid);
        await roleRef.set({
            role: "operator", status: "active", mustChangePassword: roleState,
            policeStationId: "synthetic_station_b3", unrelatedField: "preserve-me"
        });
        const token = randomBytes(32).toString("base64url");
        await registry.register(uid, token, purpose);
        const created = { uid, email, initialPassword, token, roleRef, tokenRef, purpose };
        fixtures.push(created);
        return created;
    }

    function handler(options = {}) {
        return createCompleteOperatorPasswordSetupHandler({
            registry: options.registry || registry,
            rateLimiter: options.rateLimiter || limiter,
            auth: options.auth || auth,
            allowedOrigins: [ALLOWED_ORIGIN],
            uuid: randomUUID
        });
    }

    try {
        // Successful initial setup changes Auth once and clears only the
        // already-approved mustChangePassword flag while preserving role data.
        const initial = await fixture("initial_setup", true);
        const initialPassword = `Synthetic-${randomUUID()}-Changed!`;
        const first = await post(handler(), { uid: initial.uid, token: initial.token, password: initialPassword });
        assert.equal(first.statusCode, 200);
        assert.deepEqual(first.body, { completed: true });
        const initialRole = (await initial.roleRef.get()).data();
        assert.equal(initialRole.role, "operator");
        assert.equal(initialRole.status, "active");
        assert.equal(initialRole.mustChangePassword, false);
        assert.equal(initialRole.policeStationId, "synthetic_station_b3");
        assert.equal(initialRole.unrelatedField, "preserve-me");
        assert.equal((await initial.tokenRef.get()).data().status, "used");
        assert.equal((await initial.tokenRef.get()).data().tokenHash, undefined);
        assert.equal((await signIn(authHost, initial.email, initialPassword)).status, 200,
            "successful completion password authenticates in Auth Emulator");
        const initialReplay = await post(handler(), { uid: initial.uid, token: initial.token, password: `Replay-${randomUUID()}!` });
        assert.equal(initialReplay.statusCode, 400);
        assert.equal((await signIn(authHost, initial.email, initialPassword)).status, 200,
            "replay does not replace the successful password");

        // Recovery remains a distinct stored purpose and preserves the false flag.
        const recovery = await fixture("password_recovery", false);
        const recoveryPassword = `Synthetic-${randomUUID()}-Recovery!`;
        const recovered = await post(handler(), { uid: recovery.uid, token: recovery.token, password: recoveryPassword });
        assert.equal(recovered.statusCode, 200);
        assert.equal((await recovery.roleRef.get()).data().mustChangePassword, false);
        assert.equal((await signIn(authHost, recovery.email, recoveryPassword)).status, 200);

        // Invalid, expired, revoked, used, legacy and wrong-purpose records do
        // not reach Auth.updateUser.
        const unusable = await fixture("password_recovery", false);
        const invalid = await post(handler(), { uid: unusable.uid, token: randomBytes(32).toString("base64url"), password: `Synthetic-${randomUUID()}!` });
        assert.equal(invalid.statusCode, 400);
        await unusable.tokenRef.update({ expiresAt: Date.now() - 1 });
        assert.deepEqual((await post(handler(), { uid: unusable.uid, token: unusable.token, password: `Synthetic-${randomUUID()}!` })).body,
            { error: "invalid-setup-link" });

        const revoked = await fixture("password_recovery", false);
        assert.equal(await registry.revoke(revoked.uid), true);
        assert.equal((await post(handler(), { uid: revoked.uid, token: revoked.token, password: `Synthetic-${randomUUID()}!` })).statusCode, 400);

        const used = await fixture("password_recovery", false);
        assert.equal(await registry.claim(used.uid, used.token, "already-used", "password_recovery"), true);
        assert.equal(await registry.markUsed(used.uid, "already-used", "password_recovery"), true);
        assert.equal((await post(handler(), { uid: used.uid, token: used.token, password: `Synthetic-${randomUUID()}!` })).statusCode, 400);

        const legacy = await fixture("initial_setup", true);
        await legacy.tokenRef.set({
            status: "issued", tokenHash: require("../operator-email.cjs").hashSetupToken(legacy.token),
            issuedAt: Date.now(), expiresAt: Date.now() + 60_000
        });
        assert.equal((await post(handler(), { uid: legacy.uid, token: legacy.token, password: `Synthetic-${randomUUID()}!` })).statusCode, 400);

        const wrongPurpose = await fixture("initial_setup", false);
        assert.equal((await post(handler(), { uid: wrongPurpose.uid, token: wrongPurpose.token, password: `Synthetic-${randomUUID()}!` })).statusCode, 400);
        assert.equal((await wrongPurpose.tokenRef.get()).data().status, "issued");

        const disabled = await fixture("password_recovery", false);
        await auth.updateUser(disabled.uid, { disabled: true });
        assert.equal((await post(handler(), { uid: disabled.uid, token: disabled.token, password: `Synthetic-${randomUUID()}!` })).statusCode, 400);
        assert.equal((await disabled.tokenRef.get()).data().status, "issued",
            "disabled Auth account is rejected before token claim");

        // Password policy and required fields are enforced before token claim.
        const policy = await fixture("initial_setup", true);
        assert.equal((await post(handler(), { uid: policy.uid, token: policy.token, password: "" })).statusCode, 422);
        assert.equal((await post(handler(), { uid: policy.uid, token: policy.token, password: "a".repeat(11) })).statusCode, 422);
        assert.equal((await post(handler(), { uid: policy.uid, token: policy.token, password: "a".repeat(129) })).statusCode, 422);
        assert.equal((await post(handler(), { uid: policy.uid, token: policy.token, password: 123456789012 })).statusCode, 400);
        assert.equal((await post(handler(), { uid: policy.uid, token: policy.token })).statusCode, 400);
        assert.equal((await policy.tokenRef.get()).data().status, "issued");

        // Concurrent completion requests have one Firestore claim winner and
        // exactly one Auth password update.
        const concurrent = await fixture("initial_setup", true);
        let concurrentUpdates = 0;
        const concurrentAuth = {
            getUser: uid => auth.getUser(uid),
            async updateUser(uid, fields) {
                concurrentUpdates += 1;
                return auth.updateUser(uid, fields);
            }
        };
        const concurrentHandler = handler({ auth: concurrentAuth });
        const concurrentPassword = `Synthetic-${randomUUID()}-Concurrent!`;
        const concurrentResponses = await Promise.all([
            post(concurrentHandler, { uid: concurrent.uid, token: concurrent.token, password: concurrentPassword }),
            post(concurrentHandler, { uid: concurrent.uid, token: concurrent.token, password: `Synthetic-${randomUUID()}-Loser!` })
        ]);
        assert.deepEqual(concurrentResponses.map(response => response.statusCode).sort(), [200, 400]);
        assert.equal(concurrentUpdates, 1);
        assert.equal((await concurrent.tokenRef.get()).data().status, "used");
        assert.equal((await signIn(authHost, concurrent.email, concurrentPassword)).status, 200);

        // A transport exception after Auth has committed models an ambiguous
        // timeout/restart: preserve consuming, mark a safe stage, and never retry.
        const interrupted = await fixture("password_recovery", false);
        const interruptedPassword = `Synthetic-${randomUUID()}-Interrupted!`;
        let interruptedUpdates = 0;
        const ambiguousAuth = {
            getUser: uid => auth.getUser(uid),
            async updateUser(uid, fields) {
                interruptedUpdates += 1;
                await auth.updateUser(uid, fields);
                throw new Error(`synthetic timeout ${interrupted.token} ${interruptedPassword}`);
            }
        };
        const ambiguousHandler = handler({ auth: ambiguousAuth });
        const ambiguous = await post(ambiguousHandler, { uid: interrupted.uid, token: interrupted.token, password: interruptedPassword });
        assert.equal(ambiguous.statusCode, 503);
        let interruptedCode = (await interrupted.tokenRef.get()).data();
        assert.equal(interruptedCode.status, "consuming");
        assert.equal(interruptedCode.completionFailureStage, "auth_update_failed");
        assert.equal(JSON.stringify(interruptedCode).includes(interruptedPassword), false);
        assert.equal((await post(ambiguousHandler, { uid: interrupted.uid, token: interrupted.token, password: `Synthetic-${randomUUID()}-Replay!` })).statusCode, 400);
        assert.equal(interruptedUpdates, 1);
        assert.equal((await signIn(authHost, interrupted.email, interruptedPassword)).status, 200,
            "Auth may have committed before the simulated timeout");

        // Definite Auth rejection also remains consuming; no automatic release.
        const rejected = await fixture("initial_setup", true);
        const rejectingAuth = {
            getUser: uid => auth.getUser(uid),
            async updateUser() { throw new Error("synthetic Auth rejection"); }
        };
        const rejectedResponse = await post(handler({ auth: rejectingAuth }), {
            uid: rejected.uid, token: rejected.token, password: `Synthetic-${randomUUID()}-Rejected!`
        });
        assert.equal(rejectedResponse.statusCode, 503);
        const rejectedCode = (await rejected.tokenRef.get()).data();
        assert.equal(rejectedCode.status, "consuming");
        assert.equal(rejectedCode.completionFailureStage, "auth_update_failed");

        // Firestore finalize failure after a confirmed Auth write is never
        // reported as success and cannot replay the password update.
        const finalizeFailure = await fixture("password_recovery", false);
        const finalizePassword = `Synthetic-${randomUUID()}-Finalize!`;
        let finalizeUpdates = 0;
        const finalizeAuth = {
            getUser: uid => auth.getUser(uid),
            async updateUser(uid, fields) { finalizeUpdates += 1; return auth.updateUser(uid, fields); }
        };
        const finalizer = {
            ...registry,
            async finalizeCompletion() { throw new Error(`synthetic Firestore timeout ${finalizeFailure.token}`); }
        };
        // Spread does not copy registry methods from its closure object only
        // if enumerable; rebind the needed public methods explicitly.
        Object.assign(finalizer, {
            getCurrentPurpose: (...args) => registry.getCurrentPurpose(...args),
            isCurrentActiveToken: (...args) => registry.isCurrentActiveToken(...args),
            claim: (...args) => registry.claim(...args),
            recordCompletionFailure: (...args) => registry.recordCompletionFailure(...args)
        });
        const finalizeResponse = await post(handler({ auth: finalizeAuth, registry: finalizer }), {
            uid: finalizeFailure.uid, token: finalizeFailure.token, password: finalizePassword
        });
        assert.equal(finalizeResponse.statusCode, 503);
        assert.equal((await finalizeFailure.tokenRef.get()).data().status, "consuming");
        assert.equal((await finalizeFailure.tokenRef.get()).data().completionFailureStage, "finalization_failed");
        assert.equal((await post(handler({ auth: finalizeAuth, registry: finalizer }), {
            uid: finalizeFailure.uid, token: finalizeFailure.token, password: `Synthetic-${randomUUID()}-Replay!`
        })).statusCode, 400);
        assert.equal(finalizeUpdates, 1);
        assert.equal((await signIn(authHost, finalizeFailure.email, finalizePassword)).status, 200);

        // Rate-limit completion with the B2 shared limiter: varying UID does
        // not bypass a tightly configured source-prefix bucket.
        const throttled = await fixture("initial_setup", true);
        const tightLimiter = createPersistentSetupRateLimiter({ db, maxAttempts: 1, cleanupBatchSize: 0, fieldValue: FieldValue });
        const limitedHandler = handler({ rateLimiter: tightLimiter });
        const rejectedFirst = await post(limitedHandler, { uid: `other-${randomUUID()}`, token: randomBytes(32).toString("base64url"), password: `Synthetic-${randomUUID()}-First!` }, "198.51.100.92");
        assert.equal(rejectedFirst.statusCode, 400);
        const rejectedSecond = await post(limitedHandler, { uid: throttled.uid, token: throttled.token, password: `Synthetic-${randomUUID()}-Second!` }, "198.51.100.92");
        assert.equal(rejectedSecond.statusCode, 429);
        assert.equal((await throttled.tokenRef.get()).data().status, "issued");
    } finally {
        await Promise.all(fixtures.map(async item => {
            await Promise.allSettled([item.roleRef.delete(), item.tokenRef.delete(), auth.deleteUser(item.uid)]);
        }));
        await deleteApp(app);
    }
});
