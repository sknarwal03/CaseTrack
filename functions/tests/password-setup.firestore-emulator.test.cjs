const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const {
    createSetupCodeRegistry,
    hashSetupToken
} = require("../operator-email.cjs");
const {
    RATE_LIMIT_COLLECTION,
    createPersistentSetupRateLimiter,
    createValidateOperatorSetupCodeHandler,
    rateLimitDocumentId
} = require("../password-setup.cjs");

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const emulatorsConfigured = /^(127\.0\.0\.1|localhost):\d+$/.test(firestoreHost)
    && /^(127\.0\.0\.1|localhost):\d+$/.test(authHost);

function makeResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: undefined,
        set(name, value) { this.headers[name] = String(value); return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; }
    };
}

async function postValidation(handler, body, ip = "127.0.0.1") {
    const req = {
        method: "POST",
        ip,
        headers: { origin: "http://127.0.0.1:5174", "content-type": "application/json" },
        body,
        rawBody: Buffer.from(JSON.stringify(body))
    };
    const res = makeResponse();
    await handler(req, res);
    return res;
}

test("Password Setup validation uses real Auth/Firestore emulators and rate limits persist", {
    skip: !emulatorsConfigured
        ? "Set both Auth and Firestore emulator hosts to localhost to run this isolated test."
        : false,
    timeout: 60000
}, async () => {
    const projectId = "demo-casetrack-password-b2";
    const app = initializeApp({ projectId }, `password-validation-${randomUUID()}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const uid = `operator-${randomUUID()}`;
    const email = `b2-${randomUUID()}@example.test`;
    const password = `Synthetic-${randomUUID()}-Password!`;
    const user = await auth.createUser({ uid, email, password, disabled: false });
    const roleRef = db.collection("userRoles").doc(uid);
    const tokenRef = db.collection("operatorSetupActionCodes").doc(uid);
    const rateLimitId = rateLimitDocumentId("198.51.100.73");
    const rateLimitRef = db.collection(RATE_LIMIT_COLLECTION).doc(rateLimitId);
    const registry = createSetupCodeRegistry({ db, auth, fieldValue: FieldValue });
    const limiter = createPersistentSetupRateLimiter({ db, maxAttempts: 30, fieldValue: FieldValue });
    const handler = createValidateOperatorSetupCodeHandler({
        registry,
        rateLimiter: limiter,
        allowedOrigins: ["http://127.0.0.1:5174"]
    });

    try {
        const initialToken = randomBytes(32).toString("base64url");
        await roleRef.set({ role: "operator", status: "active", mustChangePassword: true });
        await registry.register(uid, initialToken, "initial_setup");
        const initial = await postValidation(handler, { uid, token: initialToken });
        assert.equal(initial.statusCode, 200);
        assert.deepEqual(initial.body, { valid: true });
        assert.equal((await tokenRef.get()).data().status, "issued", "validation never consumes a token");

        const recoveryToken = randomBytes(32).toString("base64url");
        await roleRef.update({ mustChangePassword: false });
        await registry.register(uid, recoveryToken, "password_recovery");
        assert.deepEqual((await postValidation(handler, { uid, token: recoveryToken })).body, { valid: true });
        assert.deepEqual((await postValidation(handler, { uid, token: randomBytes(32).toString("base64url") })).body,
            { valid: false }, "wrong token gets a generic response");

        const expiredToken = randomBytes(32).toString("base64url");
        await registry.register(uid, expiredToken, "password_recovery");
        await tokenRef.update({ expiresAt: Date.now() - 1 });
        assert.deepEqual((await postValidation(handler, { uid, token: expiredToken })).body, { valid: false });

        const revokedToken = randomBytes(32).toString("base64url");
        await registry.register(uid, revokedToken, "password_recovery");
        assert.equal(await registry.revoke(uid), true);
        assert.deepEqual((await postValidation(handler, { uid, token: revokedToken })).body, { valid: false });

        const usedToken = randomBytes(32).toString("base64url");
        await registry.register(uid, usedToken, "password_recovery");
        assert.equal(await registry.claim(uid, usedToken, "used-attempt", "password_recovery"), true);
        assert.equal(await registry.markUsed(uid, "used-attempt", "password_recovery"), true);
        assert.deepEqual((await postValidation(handler, { uid, token: usedToken })).body, { valid: false });

        const legacyToken = randomBytes(32).toString("base64url");
        await tokenRef.set({
            tokenHash: hashSetupToken(legacyToken),
            status: "issued",
            issuedAt: Date.now(),
            expiresAt: Date.now() + 60_000
        });
        assert.deepEqual((await postValidation(handler, { uid, token: legacyToken })).body, { valid: false });

        const syntheticIp = "198.51.100.73";
        const tightLimiter = createPersistentSetupRateLimiter({
            db, now: Date.now, maxAttempts: 3, windowMs: 60_000, fieldValue: FieldValue
        });
        const results = await Promise.all(Array.from({ length: 6 }, () => tightLimiter.consume(syntheticIp)));
        assert.equal(results.filter(result => result.allowed).length, 3);
        assert.equal(results.filter(result => !result.allowed).length, 3);
        const afterReconstruction = createPersistentSetupRateLimiter({
            db, now: Date.now, maxAttempts: 3, windowMs: 60_000, fieldValue: FieldValue
        });
        assert.equal((await afterReconstruction.consume(syntheticIp)).allowed, false,
            "rate limit survives limiter reconstruction because state is in Firestore");
        const limiterRecord = (await rateLimitRef.get()).data();
        assert.equal(limiterRecord.count, 3);
        assert.equal(JSON.stringify(limiterRecord).includes(uid), false);
        assert.equal(JSON.stringify(limiterRecord).includes(initialToken), false);
    } finally {
        await Promise.all([
            auth.deleteUser(user.uid),
            roleRef.delete(),
            tokenRef.delete(),
            rateLimitRef.delete()
        ]);
        await deleteApp(app);
    }
});

