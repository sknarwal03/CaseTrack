const test = require("node:test");
const assert = require("node:assert/strict");
const {
    SETUP_TOKEN_LIFETIME_MS,
    createSetupCodeRegistry,
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
        async runTransaction(callback) {
            return callback({
                get: reference => reference.get(),
                update: (reference, fields) => reference.update(fields)
            });
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
            apiKey: "provider-test-key",
            from: "verified@example.test",
            registerSetupToken: async (uid, token) => { registered = { uid, token }; },
            tokenFactory: () => TOKEN_ONE,
            fetchImpl: async (url, options) => {
                sentRequest = { url, options };
                return { ok: true, status: 202 };
            }
        });

        assert.deepEqual(registered, { uid: UID, token: TOKEN_ONE });
        assert.equal(sentRequest.url, "https://api.sendgrid.com/v3/mail/send");
        const payload = JSON.parse(sentRequest.options.body);
        const setupLink = payload.content[0].value.match(/https:\/\/[^\s]+/)[0];
        const url = new URL(setupLink);
        assert.equal(url.origin + url.pathname, SETUP_URL);
        assert.equal(url.search, "", "the bearer token is kept out of HTTP request logs");
        assert.deepEqual(new URLSearchParams(url.hash.slice(1)).get("uid"), UID);
        assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), TOKEN_ONE);
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

test("custom setup token is replaced on resend, expires, cannot be replayed, and supports password retry", async () => {
    let now = 1_800_000_000_000;
    const { db, documents, fieldValue } = createMemoryDb({
        [`userRoles/${UID}`]: { role: "operator", status: "active" }
    });
    const user = { uid: UID, disabled: false };
    const registry = createSetupCodeRegistry({
        db,
        auth: { getUser: async () => user },
        now: () => now,
        fieldValue
    });

    await registry.register(UID, TOKEN_ONE);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE), true);
    await registry.register(UID, TOKEN_TWO);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE), false, "resend revokes the previous token");
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO), true);

    assert.equal(await registry.claim(UID, TOKEN_TWO, "attempt-1"), true);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO), false, "a claimed token cannot be submitted twice");
    assert.equal(await registry.releaseAfterRejectedPassword(UID, "attempt-1"), true);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO), true, "a rejected password can be retried");

    assert.equal(await registry.claim(UID, TOKEN_TWO, "attempt-2"), true);
    assert.equal(await registry.markUsed(UID, "attempt-2"), true);
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_TWO), false, "a successfully used token cannot be replayed");
    assert.equal("tokenHash" in documents.get(`operatorSetupActionCodes/${UID}`), false);

    await registry.register(UID, TOKEN_ONE);
    now += SETUP_TOKEN_LIFETIME_MS + 1;
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE), false, "expired tokens are rejected");
    user.disabled = true;
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE), false, "disabled accounts are rejected");
    user.disabled = false;
    documents.set(`userRoles/${UID}`, { role: "operator", status: "revoked" });
    assert.equal(await registry.isCurrentActiveToken(UID, TOKEN_ONE), false, "revoked roles are rejected");
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
