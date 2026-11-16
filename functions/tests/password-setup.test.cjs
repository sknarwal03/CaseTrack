const test = require("node:test");
const assert = require("node:assert/strict");
const {
    RATE_LIMIT_COLLECTION,
    VALIDATION_MAX_ATTEMPTS,
    VALIDATION_WINDOW_MS,
    MAX_REQUEST_BYTES,
    PASSWORD_MIN_CODE_POINTS,
    PASSWORD_MAX_CODE_POINTS,
    createPersistentSetupRateLimiter,
    createValidateOperatorSetupCodeHandler,
    createCompleteOperatorPasswordSetupHandler,
    isPasswordSetupPassword,
    limiterNetworkPrefix,
    rateLimitDocumentId
} = require("../password-setup.cjs");

const UID = "synthetic-operator-uid";
const TOKEN = "a".repeat(43);
const ORIGIN = "https://casetrack.example";

function createMemoryDb(initialDocuments = {}) {
    const documents = new Map(Object.entries(initialDocuments));
    const deleted = Symbol("delete field");
    const fieldValue = { serverTimestamp: () => "server timestamp", delete: () => deleted };
    let transactionQueue = Promise.resolve();

    function snapshot(path, id, data) {
        return { exists: data !== undefined, id, ref: reference(path), data: () => data };
    }
    function reference(path) {
        const [, id] = path.split("/");
        return {
            id,
            path,
            async get() { return snapshot(path, id, documents.get(path)); },
            async delete() { documents.delete(path); }
        };
    }
    function collection(name) {
        return {
            doc(id) { return reference(`${name}/${id}`); },
            where(field, operator, value) {
                const query = {
                    collection: name,
                    field,
                    operator,
                    value,
                    limit(size) { query.size = size; return query; },
                    async get() {
                        const matches = [...documents.entries()]
                            .filter(([path, data]) => path.startsWith(`${name}/`)
                                && operator === "<=" && data[field] <= value)
                            .slice(0, query.size)
                            .map(([path, data]) => snapshot(path, path.split("/")[1], data));
                        return { docs: matches };
                    }
                };
                return query;
            }
        };
    }
    const db = {
        collection,
        runTransaction(callback) {
            const result = transactionQueue.then(() => callback({
                async get(target) {
                    if (target.collection) {
                        const matches = [...documents.entries()]
                            .filter(([path, data]) => path.startsWith(`${target.collection}/`)
                                && target.operator === "<=" && data[target.field] <= target.value)
                            .slice(0, target.size)
                            .map(([path, data]) => snapshot(path, path.split("/")[1], data));
                        return { docs: matches };
                    }
                    return target.get();
                },
                set(target, data) { documents.set(target.path, { ...data }); },
                update(target, fields) {
                    const current = { ...(documents.get(target.path) || {}) };
                    for (const [name, value] of Object.entries(fields)) {
                        if (value === deleted) delete current[name];
                        else current[name] = value;
                    }
                    documents.set(target.path, current);
                },
                delete(target) { documents.delete(target.path); }
            }));
            transactionQueue = result.catch(() => {});
            return result;
        }
    };
    return { db, documents, fieldValue };
}

function makeRequest({
    method = "POST",
    origin = ORIGIN,
    contentType = "application/json",
    body = { uid: UID, token: TOKEN },
    rawBody = Buffer.from(JSON.stringify(body)),
    ip = "203.0.113.15",
    headers = {}
} = {}) {
    return {
        method,
        ip,
        body,
        rawBody,
        headers: {
            ...(origin ? { origin } : {}),
            ...(contentType ? { "content-type": contentType } : {}),
            ...headers
        }
    };
}

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

test("rate-limit keys coalesce IPv4 /24, IPv6 /56, and mapped loopback addresses", () => {
    assert.equal(limiterNetworkPrefix("203.0.113.15"), "203.0.113.0/24");
    assert.equal(limiterNetworkPrefix("203.0.113.250"), "203.0.113.0/24");
    assert.equal(limiterNetworkPrefix("2001:db8:abcd:1234:1::1"), "2001:db8:abcd:1200::/56");
    assert.equal(limiterNetworkPrefix("2001:db8:abcd:12ff::9"), "2001:db8:abcd:1200::/56");
    assert.equal(limiterNetworkPrefix("::ffff:127.0.0.1"), "127.0.0.0/24");
    assert.equal(limiterNetworkPrefix("not-an-ip"), null);
    assert.notEqual(rateLimitDocumentId("203.0.113.15"), "203.0.113.0/24");
    assert.equal(rateLimitDocumentId("203.0.113.15"), rateLimitDocumentId("203.0.113.250"));
});

test("persistent limiter enforces a fixed window and survives limiter reconstruction", async () => {
    let currentTime = 1_800_000_000_000;
    const { db, documents, fieldValue } = createMemoryDb();
    const limiter = createPersistentSetupRateLimiter({
        db, now: () => currentTime, maxAttempts: 3, windowMs: 60_000, fieldValue
    });
    assert.deepEqual(await limiter.consume("203.0.113.15"), { allowed: true, remaining: 2 });
    assert.deepEqual(await limiter.consume("203.0.113.250"), { allowed: true, remaining: 1 });
    assert.deepEqual(await limiter.consume("203.0.113.15"), { allowed: true, remaining: 0 });
    assert.deepEqual(await limiter.consume("203.0.113.15"), { allowed: false, retryAfterSeconds: 60 });

    const record = [...documents.entries()].find(([path]) => path.startsWith(`${RATE_LIMIT_COLLECTION}/`));
    assert.ok(record);
    assert.equal(record[1].count, 3);
    assert.equal(record[1].expiresAt - record[1].windowStartedAt, 60_000);
    assert.equal(JSON.stringify(record[1]).includes("203.0.113"), false);
    assert.equal(record[0].split("/")[1].length, 64);

    const reconstructed = createPersistentSetupRateLimiter({
        db, now: () => currentTime, maxAttempts: 3, windowMs: 60_000, fieldValue
    });
    assert.equal((await reconstructed.consume("203.0.113.16")).allowed, false);
    currentTime += 60_001;
    assert.deepEqual(await reconstructed.consume("203.0.113.16"), { allowed: true, remaining: 2 });
    assert.equal(VALIDATION_MAX_ATTEMPTS, 30);
    assert.equal(VALIDATION_WINDOW_MS, 15 * 60 * 1000);
});

test("concurrent limiter attempts cannot exceed the configured threshold", async () => {
    const { db, fieldValue } = createMemoryDb();
    const limiter = createPersistentSetupRateLimiter({
        db, maxAttempts: 5, windowMs: 60_000, fieldValue
    });
    const results = await Promise.all(Array.from({ length: 25 }, () => limiter.consume("198.51.100.18")));
    assert.equal(results.filter(result => result.allowed).length, 5);
    assert.equal(results.filter(result => !result.allowed).length, 20);
});

test("validation uses server-stored purpose and returns only frontend metadata", async () => {
    let checkedPurpose;
    let passedIp;
    const handler = createValidateOperatorSetupCodeHandler({
        registry: {
            async getCurrentPurpose(uid, token) {
                assert.equal(uid, UID);
                assert.equal(token, TOKEN);
                return "password_recovery";
            },
            async isCurrentActiveToken(uid, token, purpose) {
                checkedPurpose = purpose;
                return true;
            }
        },
        rateLimiter: { async consume(ip) { passedIp = ip; return { allowed: true }; } },
        allowedOrigins: [ORIGIN]
    });
    const response = makeResponse();
    await handler(makeRequest(), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { valid: true });
    assert.equal(checkedPurpose, "password_recovery");
    assert.equal(passedIp, "203.0.113.15");
    assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
});

test("validation fails generically for invalid or purpose-less tokens and rejects client purpose", async () => {
    const handler = createValidateOperatorSetupCodeHandler({
        registry: {
            async getCurrentPurpose() { return null; },
            async isCurrentActiveToken() { assert.fail("invalid token must not be checked as active"); }
        },
        rateLimiter: { async consume() { return { allowed: true }; } },
        allowedOrigins: [ORIGIN]
    });
    const validResponse = makeResponse();
    await handler(makeRequest(), validResponse);
    assert.equal(validResponse.statusCode, 200);
    assert.deepEqual(validResponse.body, { valid: false });

    const extraPurpose = makeResponse();
    await handler(makeRequest({ body: { uid: UID, token: TOKEN, purpose: "initial_setup" } }), extraPurpose);
    assert.equal(extraPurpose.statusCode, 400);
    assert.deepEqual(extraPurpose.body, { valid: false });
});

test("method, content type, payload size, CORS preflight, and origin are checked", async () => {
    const handler = createValidateOperatorSetupCodeHandler({
        registry: { async getCurrentPurpose() { return null; }, async isCurrentActiveToken() { return false; } },
        rateLimiter: { async consume() { return { allowed: true }; } },
        allowedOrigins: [ORIGIN]
    });

    const wrongMethod = makeResponse();
    await handler(makeRequest({ method: "GET" }), wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);

    const badType = makeResponse();
    await handler(makeRequest({ contentType: "text/plain" }), badType);
    assert.equal(badType.statusCode, 415);

    const oversized = makeResponse();
    await handler(makeRequest({ rawBody: Buffer.alloc(MAX_REQUEST_BYTES + 1) }), oversized);
    assert.equal(oversized.statusCode, 413);

    const preflight = makeResponse();
    await handler(makeRequest({
        method: "OPTIONS",
        body: undefined,
        rawBody: undefined,
        headers: {
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type"
        }
    }), preflight);
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers["Access-Control-Allow-Origin"], ORIGIN);

    const rejectedOrigin = makeResponse();
    await handler(makeRequest({ origin: "https://attacker.example" }), rejectedOrigin);
    assert.equal(rejectedOrigin.statusCode, 403);
});

test("limiter failures fail closed and validation logs never include token material", async () => {
    const secretBearingToken = "z".repeat(43);
    const emitted = [];
    const oldError = console.error;
    console.error = (...args) => emitted.push(args.join(" "));
    try {
        const limitedHandler = createValidateOperatorSetupCodeHandler({
            registry: {},
            rateLimiter: { async consume() { return { allowed: false, retryAfterSeconds: 42 }; } },
            allowedOrigins: [ORIGIN]
        });
        const limited = makeResponse();
        await limitedHandler(makeRequest({ body: { uid: UID, token: secretBearingToken } }), limited);
        assert.equal(limited.statusCode, 429);
        assert.deepEqual(limited.body, { error: "try-again-later" });
        assert.equal(limited.headers["Retry-After"], "42");

        const unavailableHandler = createValidateOperatorSetupCodeHandler({
            registry: {
                async getCurrentPurpose() { throw new Error(`secret ${secretBearingToken}`); }
            },
            rateLimiter: { async consume() { return { allowed: true }; } },
            allowedOrigins: [ORIGIN]
        });
        const unavailable = makeResponse();
        await unavailableHandler(makeRequest({ body: { uid: UID, token: secretBearingToken } }), unavailable);
        assert.equal(unavailable.statusCode, 503);
        assert.equal(emitted.join(" ").includes(secretBearingToken), false);

        const limiterUnavailable = createValidateOperatorSetupCodeHandler({
            registry: {},
            rateLimiter: { async consume() { throw new Error("database unavailable"); } },
            allowedOrigins: [ORIGIN]
        });
        const failClosed = makeResponse();
        await limiterUnavailable(makeRequest(), failClosed);
        assert.equal(failClosed.statusCode, 503);
    } finally {
        console.error = oldError;
    }
});

function completionRequest(body, options = {}) {
    return makeRequest({ body, ...options });
}

function completionResponse() { return makeResponse(); }

function completionHarness({
    purpose = "initial_setup",
    active = true,
    claim = async () => true,
    finalize = async () => true,
    recordFailure = async () => true,
    auth = { async getUser(uid) { return { uid, disabled: false }; }, async updateUser() {} },
    limit = async () => ({ allowed: true }),
    rateLimiter = { consume: limit },
    allowedOrigins = [ORIGIN]
} = {}) {
    const calls = [];
    const registry = {
        async getCurrentPurpose(uid, token) { calls.push(["purpose", uid, token]); return purpose; },
        async isCurrentActiveToken(uid, token, storedPurpose) {
            calls.push(["active", uid, token, storedPurpose]); return active;
        },
        async claim(uid, token, attemptId, storedPurpose) {
            calls.push(["claim", uid, token, attemptId, storedPurpose]); return claim(uid, token, attemptId, storedPurpose);
        },
        async finalizeCompletion(uid, attemptId, storedPurpose) {
            calls.push(["finalize", uid, attemptId, storedPurpose]); return finalize(uid, attemptId, storedPurpose);
        },
        async recordCompletionFailure(uid, attemptId, storedPurpose, stage) {
            calls.push(["failure", uid, attemptId, storedPurpose, stage]); return recordFailure(uid, attemptId, storedPurpose, stage);
        },
        async releaseAfterRejectedPassword() { calls.push(["release"]); return true; }
    };
    return {
        calls,
        handler: createCompleteOperatorPasswordSetupHandler({ registry, rateLimiter, auth, allowedOrigins, uuid: () => "attempt-test" })
    };
}

test("server password rule matches the documented 12–128 Unicode code-point policy", () => {
    assert.equal(PASSWORD_MIN_CODE_POINTS, 12);
    assert.equal(PASSWORD_MAX_CODE_POINTS, 128);
    assert.equal(isPasswordSetupPassword("🙂".repeat(12)), true);
    assert.equal(isPasswordSetupPassword("a".repeat(11)), false);
    assert.equal(isPasswordSetupPassword("a".repeat(129)), false);
    assert.equal(isPasswordSetupPassword(123456789012), false);
});

test("completion succeeds for both stored purposes and performs claim, Auth update, then finalization", async () => {
    for (const purpose of ["initial_setup", "password_recovery"]) {
        const events = [];
        const harness = completionHarness({
            purpose,
            auth: {
                async getUser(uid) { events.push(["getUser", uid]); return { uid, disabled: false }; },
                async updateUser(uid, fields) { events.push(["updateUser", uid, fields]); }
            },
            claim: async (...args) => { events.push(["claim", ...args]); return true; },
            finalize: async (...args) => { events.push(["finalize", ...args]); return true; }
        });
        const body = { uid: UID, token: TOKEN, password: "correct horse battery" };
        const response = completionResponse();
        await harness.handler(completionRequest(body), response);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, { completed: true });
        assert.equal(events.findIndex(event => event[0] === "claim") < events.findIndex(event => event[0] === "updateUser"), true);
        assert.equal(events.findIndex(event => event[0] === "updateUser") < events.findIndex(event => event[0] === "finalize"), true);
        assert.deepEqual(events.find(event => event[0] === "updateUser")[2], { password: body.password });
        assert.equal(events.find(event => event[0] === "claim")[4], purpose);
        assert.equal(events.find(event => event[0] === "finalize")[3], purpose);
        assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
    }
});

test("completion rejects invalid, missing-purpose, wrong-purpose, and ineligible tokens generically", async () => {
    for (const config of [
        { purpose: null, active: false },
        { purpose: "initial_setup", active: false },
        { purpose: "password_recovery", active: false }
    ]) {
        const harness = completionHarness(config);
        const response = completionResponse();
        await harness.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }), response);
        assert.equal(response.statusCode, 400);
        assert.deepEqual(response.body, { error: "invalid-setup-link" });
        assert.equal(harness.calls.some(call => call[0] === "claim"), false);
    }
});

test("completion validates all required fields and password length before rate limiting", async () => {
    const inputs = [
        { uid: UID, token: TOKEN },
        { uid: UID, token: TOKEN, password: "" },
        { uid: UID, token: TOKEN, password: "a".repeat(11) },
        { uid: UID, token: TOKEN, password: "a".repeat(129) },
        { uid: UID, token: TOKEN, password: 123456789012 },
        { uid: UID, token: TOKEN, password: "correct horse battery", purpose: "initial_setup" }
    ];
    for (const body of inputs) {
        let rateCalls = 0;
        const harness = completionHarness({ limit: async () => { rateCalls += 1; return { allowed: true }; } });
        const response = completionResponse();
        await harness.handler(completionRequest(body), response);
        assert.ok([400, 422].includes(response.statusCode));
        assert.equal(rateCalls, 0);
        assert.equal(harness.calls.some(call => call[0] === "claim"), false);
    }
});

test("claim failure never calls Auth; concurrent completions make exactly one claim and password update", async () => {
    let updates = 0;
    const denied = completionHarness({ claim: async () => false });
    const deniedResponse = completionResponse();
    await denied.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }), deniedResponse);
    assert.equal(deniedResponse.statusCode, 400);
    assert.equal(denied.calls.some(call => call[0] === "release"), false);

    let claimed = false;
    const concurrent = completionHarness({
        claim: async () => {
            if (claimed) return false;
            claimed = true;
            return true;
        },
        auth: {
            async getUser(uid) { return { uid, disabled: false }; },
            async updateUser() { updates += 1; }
        }
    });
    const body = { uid: UID, token: TOKEN, password: "correct horse battery" };
    const responses = [completionResponse(), completionResponse()];
    await Promise.all(responses.map(response => concurrent.handler(completionRequest(body), response)));
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 400]);
    assert.equal(updates, 1);
    assert.equal(concurrent.calls.filter(call => call[0] === "claim").length, 2);
    assert.equal(concurrent.calls.filter(call => call[0] === "finalize").length, 1);
});

test("Auth and Firestore failures retain consuming claims and never release or retry", async () => {
    for (const failure of ["auth", "finalize"]) {
        const harness = completionHarness({
            auth: {
                async getUser(uid) { return { uid, disabled: false }; },
                async updateUser() { if (failure === "auth") throw new Error(`sensitive ${TOKEN}`); }
            },
            finalize: async () => {
                if (failure === "finalize") throw new Error(`sensitive ${TOKEN}`);
                return true;
            }
        });
        const response = completionResponse();
        await harness.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }), response);
        assert.equal(response.statusCode, 503);
        assert.deepEqual(response.body, { error: "temporarily-unavailable" });
        assert.equal(harness.calls.some(call => call[0] === "release"), false);
        assert.equal(harness.calls.some(call => call[0] === "failure"), true);
    }
});

test("completion limiter and HTTP controls fail closed without exposing credential details", async () => {
    const limited = completionHarness({ limit: async () => ({ allowed: false, retryAfterSeconds: 25 }) });
    const response = completionResponse();
    await limited.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }), response);
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers["Retry-After"], "25");
    assert.equal(limited.calls.some(call => call[0] === "claim"), false);

    const wrongMethod = completionResponse();
    await limited.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }, { method: "GET" }), wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);

    const wrongOrigin = completionResponse();
    await limited.handler(completionRequest({ uid: UID, token: TOKEN, password: "correct horse battery" }, { origin: "https://attacker.example" }), wrongOrigin);
    assert.equal(wrongOrigin.statusCode, 403);

    const secretPassword = "Synthetic-secret-password-value";
    const emitted = [];
    const oldLog = console.log;
    const oldError = console.error;
    console.log = (...args) => emitted.push(args.join(" "));
    console.error = (...args) => emitted.push(args.join(" "));
    try {
        const failing = completionHarness({
            auth: {
                async getUser(uid) { return { uid, disabled: false }; },
                async updateUser() { throw new Error(`${secretPassword} ${TOKEN}`); }
            }
        });
        const privateResponse = completionResponse();
        await failing.handler(completionRequest({ uid: UID, token: TOKEN, password: secretPassword }), privateResponse);
        assert.equal(JSON.stringify(privateResponse.body).includes(secretPassword), false);
        assert.equal(JSON.stringify(privateResponse.body).includes(TOKEN), false);
        assert.equal(emitted.join(" ").includes(secretPassword), false);
        assert.equal(emitted.join(" ").includes(TOKEN), false);
    } finally {
        console.log = oldLog;
        console.error = oldError;
    }
});

