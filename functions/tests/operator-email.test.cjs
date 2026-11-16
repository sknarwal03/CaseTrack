const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SETUP_TOKEN_LIFETIME_MS,
    SETUP_TOKEN_PURPOSES,
    createSetupCodeRegistry,
    hashSetupToken,
    sendOperatorSetupEmail,
    setupPageUrl
} = require("../operator-email.cjs");
const { validateOperatorRequest } = require("../admin-role-management.cjs");

const EMAIL = "operator@example.test";
const UID = "operator-uid";
const SETUP_URL = "https://casetrack.example/CaseTrack/pages/password-setup.html";
const TOKEN_ONE = "a".repeat(43);
const TOKEN_TWO = "b".repeat(43);

function restoreEnv(name, oldValue) {
    if (oldValue === undefined) delete process.env[name];
    else process.env[name] = oldValue;
}

function createMemoryDb(initialDocuments = {}) {
    const documents = new Map(Object.entries(initialDocuments));
    const deleteValue = Symbol("delete field");
    const fieldValue = { serverTimestamp: () => "server-timestamp", delete: () => deleteValue };
    let transactionQueue = Promise.resolve();
    const makeReference = key => ({
        async get() {
            const data = documents.get(key);
            return { exists: documents.has(key), data: () => data };
        },
        async set(data) { documents.set(key, { ...data }); },
        async update(fields) {
            const current = { ...(documents.get(key) || {}) };
            for (const [name, value] of Object.entries(fields)) {
                if (value === deleteValue) delete current[name];
                else current[name] = value;
            }
            documents.set(key, current);
        }
    });
    const db = {
        collection: collection => ({ doc: uid => makeReference(`${collection}/${uid}`) }),
        runTransaction(callback) {
            const result = transactionQueue.then(() => callback({
                get: reference => reference.get(),
                set: (reference, fields) => reference.set(fields),
                update: (reference, fields) => reference.update(fields)
            }));
            transactionQueue = result.catch(() => {});
            return result;
        }
    };
    return { db, documents, fieldValue };
}

test("Operator create accepts no password and rejects password-bearing requests", () => {
    const valid = {
        email: EMAIL,
        policeStationId: "station_1",
        requestId: "5bf01aa2-4f17-4d2b-8f3d-4377ae1179ee"
    };
    assert.deepEqual(validateOperatorRequest(valid), valid);
    assert.equal(validateOperatorRequest({ ...valid, password: "no-passwords-in-admin" }), null);
});

test("setup email uses a random custom token without creating a Firebase Auth reset action code", async () => {
    const originalUrl = process.env.OPERATOR_SETUP_URL;
    const originalEndpoint = process.env.OPERATOR_EMAIL_API_URL;
    const originalEmulator = process.env.FUNCTIONS_EMULATOR;
    const originalProject = process.env.GCLOUD_PROJECT;
    process.env.OPERATOR_SETUP_URL = `${SETUP_URL}?discard=yes#discard`;
    delete process.env.OPERATOR_EMAIL_API_URL;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.GCLOUD_PROJECT;
    try {
        let sentRequest;
        let registered;
        await sendOperatorSetupEmail({
            email: EMAIL,
            uid: UID,
            purpose: "initial_setup",
            apiKey: "provider-test-key",
            from: "verified@example.test",
            registerSetupToken: async (uid, token, purpose) => { registered = { uid, token, purpose }; },
            tokenFactory: () => TOKEN_ONE,
            fetchImpl: async (url, options) => {
                sentRequest = { url, options };
                return { ok: true, status: 202 };
            }
        });

        assert.deepEqual(registered, { uid: UID, token: TOKEN_ONE, purpose: "initial_setup" });
        assert.equal(sentRequest.url, "https://api.sendgrid.com/v3/mail/send");
        const payload = JSON.parse(sentRequest.options.body);
        const setupLink = payload.content[0].value.match(/https:\/\/[^\s]+/)[0];
        const url = new URL(setupLink);
        assert.equal(url.origin + url.pathname, SETUP_URL);
        assert.equal(url.search, "", "the bearer token is kept out of HTTP request logs");
        assert.deepEqual(new URLSearchParams(url.hash.slice(1)).get("uid"), UID);
        assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), TOKEN_ONE);
        assert.match(payload.content[0].value, /set up your CaseTrack password/);
        assert.match(payload.content[0].value, /expires in 24 hours and can be used once/);
        assert.equal(payload.tracking_settings.click_tracking.enable, false);
        assert.equal(payload.tracking_settings.open_tracking.enable, false);
        assert.equal(sentRequest.options.headers.Authorization, "Bearer provider-test-key");
    } finally {
        restoreEnv("OPERATOR_SETUP_URL", originalUrl);
        restoreEnv("OPERATOR_EMAIL_API_URL", originalEndpoint);
        restoreEnv("FUNCTIONS_EMULATOR", originalEmulator);
        restoreEnv("GCLOUD_PROJECT", originalProject);
    }
});

test("delivery failure is surfaced without logging or returning the setup token", async () => {
    const originalUrl = process.env.OPERATOR_SETUP_URL;
    process.env.OPERATOR_SETUP_URL = SETUP_URL;
    try {
        await assert.rejects(sendOperatorSetupEmail({
            email: EMAIL,
            uid: UID,
            purpose: "initial_setup",
            apiKey: "provider-test-key",
            from: "verified@example.test",
            registerSetupToken: async () => {},
            tokenFactory: () => TOKEN_ONE,
            fetchImpl: async () => ({ ok: false, status: 401 })
        }), error => error.code === "sendgrid/401" && !error.message.includes(TOKEN_ONE));
    } finally {
        restoreEnv("OPERATOR_SETUP_URL", originalUrl);
    }
});

test("setup token purpose is required, allowlisted, and included in every newly issued record", async () => {
    const { db, documents } = createMemoryDb();
    const registry = createSetupCodeRegistry({ db, auth: { getUser: async () => ({ disabled: false }) } });
    await assert.rejects(registry.register(UID, TOKEN_ONE), /Invalid password setup token/);
    await assert.rejects(registry.register(UID, TOKEN_ONE, "unknown"), /Invalid password setup token/);
    await registry.register(UID, TOKEN_ONE, "initial_setup");
    assert.deepEqual(SETUP_TOKEN_PURPOSES, ["initial_setup", "password_recovery"]);
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).purpose, "initial_setup");
    assert.match(documents.get(`operatorSetupActionCodes/${UID}`).tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).tokenHash, hashSetupToken(TOKEN_ONE));
    assert.equal(await registry.getCurrentPurpose(UID, TOKEN_ONE), "initial_setup");
    assert.equal(await registry.getCurrentPurpose(UID, TOKEN_TWO), null);
});

test("token replacement binds a new purpose and legacy purpose-less tokens fail closed", async () => {
    let now = 1_800_000_000_000;
    const { db, documents, fieldValue } = createMemoryDb({
        [`userRoles/${UID}`]: { role: "operator", status: "active", mustChangePassword: true }
    });
    const user = { uid: UID, disabled: false };
    const registry = createSetupCodeRegistry({
        db,
        auth: { getUser: async () => user },
        now: () => now,
        fieldValue
    });

    await registry.register(UID, TOKEN_ONE, "initial_setup");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), true);
    await registry.register(UID, TOKEN_TWO, "password_recovery");
    assert.equal(await registry.getCurrentPurpose(UID, TOKEN_TWO), "password_recovery");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), false, "replacement invalidates the old token");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO, "initial_setup"), false, "wrong-purpose validation fails");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO, "password_recovery"), false, "recovery cannot bypass the initial-setup role state");
    documents.set(`userRoles/${UID}`, { role: "operator", status: "active", mustChangePassword: false });
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO, "password_recovery"), true);
    assert.equal(await registry.claim(UID, TOKEN_TWO, "wrong-purpose-attempt", "initial_setup"), false);
    assert.equal(await registry.claim(UID, TOKEN_TWO, "attempt-1", "password_recovery"), true);
    assert.equal(await registry.markUsed(UID, "attempt-1", "initial_setup"), false);
    assert.equal(await registry.releaseAfterRejectedPassword(UID, "attempt-1", "initial_setup"), false);
    assert.equal(await registry.releaseAfterRejectedPassword(UID, "attempt-1", "password_recovery"), true);

    documents.set(`operatorSetupActionCodes/${UID}`, {
        tokenHash: require("../operator-email.cjs").hashSetupToken(TOKEN_ONE),
        status: "issued",
        expiresAt: now + SETUP_TOKEN_LIFETIME_MS
    });
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), false,
        "legacy documents without purpose are never inferred as either purpose");
    assert.equal(await registry.getCurrentPurpose(UID, TOKEN_ONE), null);
    assert.equal(await registry.claim(UID, TOKEN_ONE, "legacy-attempt", "initial_setup"), false);

    await registry.register(UID, TOKEN_ONE, "initial_setup");
    documents.set(`userRoles/${UID}`, { role: "operator", status: "active", mustChangePassword: true });

    assert.equal(await registry.claim(UID, TOKEN_ONE, "attempt-2", "initial_setup"), true);
    await assert.rejects(registry.register(UID, TOKEN_TWO, "initial_setup"), { code: "setup/in-progress" });
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).attemptId, "attempt-2",
        "resend cannot replace an in-flight password write");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), false, "a claimed token cannot be submitted twice");
    assert.equal(await registry.releaseAfterRejectedPassword(UID, "attempt-2", "initial_setup"), true);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), true, "a rejected password can be retried");

    assert.equal(await registry.claim(UID, TOKEN_ONE, "attempt-3", "initial_setup"), true);
    assert.equal(await registry.markUsed(UID, "attempt-3", "initial_setup"), true);
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).status, "used");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "initial_setup"), false, "a successfully used token cannot be replayed");
    assert.equal(await registry.claim(UID, TOKEN_ONE, "replay-attempt", "initial_setup"), false);
    assert.equal("tokenHash" in documents.get(`operatorSetupActionCodes/${UID}`), false);

    await registry.register(UID, TOKEN_TWO, "password_recovery");
    assert.equal(await registry.revoke(UID), true);
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).status, "revoked");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO, "password_recovery"), false);

    documents.set(`userRoles/${UID}`, { role: "operator", status: "active", mustChangePassword: false });
    await registry.register(UID, TOKEN_ONE, "password_recovery");
    const overlong = documents.get(`operatorSetupActionCodes/${UID}`);
    documents.set(`operatorSetupActionCodes/${UID}`, {
        ...overlong,
        issuedAt: now - SETUP_TOKEN_LIFETIME_MS - 1,
        expiresAt: now + 1
    });
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "password_recovery"), false,
        "an unexpired token with a lifetime beyond 24 hours is rejected");
    assert.equal(await registry.claim(UID, TOKEN_ONE, "overlong-attempt", "password_recovery"), false);

    await registry.register(UID, TOKEN_TWO, "password_recovery");
    now += SETUP_TOKEN_LIFETIME_MS + 1;
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO, "password_recovery"), false, "expired tokens are rejected");
    user.disabled = true;
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "password_recovery"), false, "disabled accounts are rejected");
    user.disabled = false;
    documents.set(`userRoles/${UID}`, { role: "operator", status: "revoked" });
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE, "password_recovery"), false, "revoked roles are rejected");
});

test("concurrent setup token claims have one winner", async () => {
    const { db, documents, fieldValue } = createMemoryDb({
        [`userRoles/${UID}`]: { role: "operator", status: "active", mustChangePassword: true }
    });
    const registry = createSetupCodeRegistry({ db, auth: { getUser: async () => ({ disabled: false }) }, fieldValue });
    await registry.register(UID, TOKEN_ONE, "initial_setup");
    const claims = await Promise.all([
        registry.claim(UID, TOKEN_ONE, "parallel-a", "initial_setup"),
        registry.claim(UID, TOKEN_ONE, "parallel-b", "initial_setup")
    ]);
    assert.deepEqual(claims.sort(), [false, true]);
    assert.equal(documents.get(`operatorSetupActionCodes/${UID}`).status, "consuming");
});

test("setup email generates an unpredictable-format token when no test token factory is supplied", async () => {
    const originalUrl = process.env.OPERATOR_SETUP_URL;
    process.env.OPERATOR_SETUP_URL = SETUP_URL;
    try {
        let issued;
        await sendOperatorSetupEmail({
            email: EMAIL,
            uid: UID,
            purpose: "password_recovery",
            apiKey: "provider-test-key",
            from: "verified@example.test",
            registerSetupToken: async (uid, token, purpose) => { issued = { uid, token, purpose }; },
            fetchImpl: async () => ({ ok: true, status: 202 })
        });
        assert.equal(issued.uid, UID);
        assert.equal(issued.purpose, "password_recovery");
        assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
        assert.notEqual(issued.token, TOKEN_ONE);
    } finally {
        restoreEnv("OPERATOR_SETUP_URL", originalUrl);
    }
});

test("password setup URL rejects untrusted schemes, credentials, and non-handler paths", () => {
    const original = process.env.OPERATOR_SETUP_URL;
    const originalEmulator = process.env.FUNCTIONS_EMULATOR;
    const originalProject = process.env.GCLOUD_PROJECT;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.GCLOUD_PROJECT;
    try {
        delete process.env.OPERATOR_SETUP_URL;
        assert.throws(setupPageUrl);
        process.env.OPERATOR_SETUP_URL = "http://casetrack.example/pages/password-setup.html";
        assert.throws(setupPageUrl);
        process.env.OPERATOR_SETUP_URL = "https://user:pass@casetrack.example/pages/password-setup.html";
        assert.throws(setupPageUrl);
        process.env.OPERATOR_SETUP_URL = "https://casetrack.example/pages/login.html";
        assert.throws(setupPageUrl);
        process.env.OPERATOR_SETUP_URL = `${SETUP_URL}?discard=yes#discard`;
        assert.equal(setupPageUrl(), SETUP_URL);
    } finally {
        restoreEnv("OPERATOR_SETUP_URL", original);
        restoreEnv("FUNCTIONS_EMULATOR", originalEmulator);
        restoreEnv("GCLOUD_PROJECT", originalProject);
    }
});
