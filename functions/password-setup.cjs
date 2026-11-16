const { createHash } = require("node:crypto");
const { isIP } = require("node:net");
const { FieldValue } = require("firebase-admin/firestore");
const { isSetupPurpose, isSetupToken } = require("./operator-email.cjs");

const RATE_LIMIT_COLLECTION = "operatorSetupRateLimits";
const VALIDATION_WINDOW_MS = 15 * 60 * 1000;
const VALIDATION_MAX_ATTEMPTS = 30;
const RATE_LIMIT_CLEANUP_BATCH_SIZE = 10;
const MAX_REQUEST_BYTES = 4 * 1024;
const PASSWORD_MIN_CODE_POINTS = 12;
const PASSWORD_MAX_CODE_POINTS = 128;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function expandIpv6(address) {
    let input = address.toLowerCase();
    if (input.includes(".")) {
        const splitAt = input.lastIndexOf(":");
        const ipv4 = input.slice(splitAt + 1);
        if (splitAt < 0 || isIP(ipv4) !== 4) return null;
        const octets = ipv4.split(".").map(Number);
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        input = `${input.slice(0, splitAt)}:${high}:${low}`;
    }

    const halves = input.split("::");
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
    if ((halves.length === 1 && left.length !== 8) || zeroCount < 0
        || (halves.length === 2 && zeroCount < 1)) return null;
    const groups = [...left, ...Array(zeroCount).fill("0"), ...right];
    if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map(group => Number.parseInt(group, 16));
}

function limiterNetworkPrefix(clientIp) {
    if (typeof clientIp !== "string") return null;
    let address = clientIp.trim().replace(/^\[|\]$/g, "");
    const zoneIndex = address.indexOf("%");
    if (zoneIndex >= 0) address = address.slice(0, zoneIndex);
    const family = isIP(address);
    if (family === 4) {
        const octets = address.split(".");
        return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    if (family !== 6) return null;

    const groups = expandIpv6(address);
    if (!groups) return null;
    if (groups.slice(0, 5).every(value => value === 0) && groups[5] === 0xffff) {
        const mapped = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
        return `${mapped[0]}.${mapped[1]}.${mapped[2]}.0/24`;
    }
    const fourthGroup = (groups[3] & 0xff00).toString(16).padStart(4, "0");
    return `${groups[0].toString(16)}:${groups[1].toString(16)}:${groups[2].toString(16)}:${fourthGroup}::/56`;
}

function rateLimitDocumentId(clientIp) {
    const prefix = limiterNetworkPrefix(clientIp);
    if (!prefix) return null;
    return createHash("sha256")
        .update(`casetrack:operator-setup-validation:v1:${prefix}`, "utf8")
        .digest("hex");
}

function createPersistentSetupRateLimiter({
    db,
    now = Date.now,
    maxAttempts = VALIDATION_MAX_ATTEMPTS,
    windowMs = VALIDATION_WINDOW_MS,
    cleanupBatchSize = RATE_LIMIT_CLEANUP_BATCH_SIZE,
    fieldValue = FieldValue
}) {
    if (!db || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1
        || !Number.isSafeInteger(windowMs) || windowMs < 1
        || !Number.isSafeInteger(cleanupBatchSize) || cleanupBatchSize < 0) {
        throw new Error("Invalid Password Setup rate limiter configuration.");
    }

    const collection = db.collection(RATE_LIMIT_COLLECTION);

    async function cleanupExpired(currentTime) {
        if (cleanupBatchSize === 0) return;
        const expired = await collection.where("expiresAt", "<=", currentTime)
            .limit(cleanupBatchSize).get();
        if (!expired.docs.length) return;

        await db.runTransaction(async transaction => {
            const currentRecords = await Promise.all(expired.docs.map(document => transaction.get(document.ref)));
            currentRecords.forEach((record, index) => {
                if (record.exists && Number.isFinite(record.data().expiresAt)
                    && record.data().expiresAt <= currentTime) {
                    transaction.delete(expired.docs[index].ref);
                }
            });
        });
    }

    async function consume(clientIp) {
        const documentId = rateLimitDocumentId(clientIp);
        if (!documentId) return { allowed: false, unavailable: true };
        const reference = collection.doc(documentId);
        const currentTime = now();
        const result = await db.runTransaction(async transaction => {
            const current = await transaction.get(reference);

            const currentData = current.exists ? current.data() : null;
            const hasActiveWindow = currentData
                && Number.isSafeInteger(currentData.count) && currentData.count >= 0
                && Number.isFinite(currentData.expiresAt) && currentData.expiresAt > currentTime
                && Number.isFinite(currentData.windowStartedAt);

            if (hasActiveWindow && currentData.count >= maxAttempts) {
                return {
                    allowed: false,
                    retryAfterSeconds: Math.max(1, Math.ceil((currentData.expiresAt - currentTime) / 1000))
                };
            }

            if (!hasActiveWindow) {
                transaction.set(reference, {
                    count: 1,
                    windowStartedAt: currentTime,
                    expiresAt: currentTime + windowMs,
                    updatedAt: fieldValue.serverTimestamp()
                });
                return { allowed: true, remaining: maxAttempts - 1 };
            }

            const nextCount = currentData.count + 1;
            transaction.update(reference, {
                count: nextCount,
                updatedAt: fieldValue.serverTimestamp()
            });
            return { allowed: true, remaining: Math.max(0, maxAttempts - nextCount) };
        });

        // Cleanup is best-effort and outside the counter transaction. Each
        // candidate is re-read transactionally so cleanup cannot delete a
        // limiter record another request has just renewed.
        try { await cleanupExpired(currentTime); } catch { /* limiter correctness does not depend on cleanup */ }
        return result;
    }

    return { consume };
}

function setCorsHeaders(req, res, allowedOrigins) {
    const origin = req.headers?.origin;
    if (origin && !allowedOrigins.has(origin)) {
        res.status(403).json({ error: "forbidden" });
        return false;
    }
    if (origin) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Max-Age", "300");
    }

    if (req.method === "OPTIONS") {
        const requestedMethod = req.headers?.["access-control-request-method"];
        const requestedHeaders = String(req.headers?.["access-control-request-headers"] || "")
            .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
        if (!origin || requestedMethod !== "POST"
            || requestedHeaders.some(header => header !== "content-type")) {
            res.status(403).json({ error: "forbidden" });
            return false;
        }
        res.status(204).end();
        return false;
    }
    return true;
}

function requestBodySize(req) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody.length;
    if (typeof req.rawBody === "string") return Buffer.byteLength(req.rawBody, "utf8");
    try { return Buffer.byteLength(JSON.stringify(req.body ?? null), "utf8"); }
    catch { return MAX_REQUEST_BYTES + 1; }
}

function createValidateOperatorSetupCodeHandler({ registry, rateLimiter, allowedOrigins = [] }) {
    const origins = new Set(allowedOrigins);
    return async (req, res) => {
        res.set("Cache-Control", "no-store, max-age=0");
        res.set("X-Content-Type-Options", "nosniff");
        if (!setCorsHeaders(req, res, origins)) return;

        if (req.method !== "POST") {
            res.set("Allow", "POST, OPTIONS");
            return res.status(405).json({ error: "method-not-allowed" });
        }
        const contentType = req.headers?.["content-type"];
        if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return res.status(415).json({ error: "unsupported-media-type" });
        }
        if (requestBodySize(req) > MAX_REQUEST_BYTES) {
            return res.status(413).json({ valid: false });
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)
            || Object.keys(body).sort().join(",") !== "token,uid"
            || typeof body.uid !== "string" || !UID_PATTERN.test(body.uid)
            || !isSetupToken(body.token)) {
            return res.status(400).json({ valid: false });
        }

        const clientIp = typeof req.ip === "string" && req.ip
            ? req.ip
            : req.socket?.remoteAddress;
        let limit;
        try {
            limit = await rateLimiter.consume(clientIp);
        } catch {
            return res.status(503).json({ error: "temporarily-unavailable" });
        }
        if (limit?.unavailable) return res.status(503).json({ error: "temporarily-unavailable" });
        if (!limit?.allowed) {
            if (Number.isSafeInteger(limit?.retryAfterSeconds)) {
                res.set("Retry-After", String(limit.retryAfterSeconds));
            }
            return res.status(429).json({ error: "try-again-later" });
        }

        try {
            const purpose = await registry.getCurrentPurpose(body.uid, body.token);
            if (!isSetupPurpose(purpose)) return res.status(200).json({ valid: false });
            const valid = await registry.isCurrentActiveToken(body.uid, body.token, purpose);
            return res.status(200).json({ valid: valid === true });
        } catch {
            // Never serialize request data or dependency errors that might
            // contain capability material into application logs.
            console.error("Password setup validation dependency failed.");
            return res.status(503).json({ error: "temporarily-unavailable" });
        }
    };
}

function isPasswordSetupPassword(value) {
    if (typeof value !== "string") return false;
    const length = Array.from(value).length;
    return length >= PASSWORD_MIN_CODE_POINTS && length <= PASSWORD_MAX_CODE_POINTS;
}

function createCompleteOperatorPasswordSetupHandler({
    registry,
    rateLimiter,
    auth,
    allowedOrigins = [],
    uuid = require("node:crypto").randomUUID
}) {
    const origins = new Set(allowedOrigins);
    return async (req, res) => {
        res.set("Cache-Control", "no-store, max-age=0");
        res.set("X-Content-Type-Options", "nosniff");
        if (!setCorsHeaders(req, res, origins)) return;

        if (req.method !== "POST") {
            res.set("Allow", "POST, OPTIONS");
            return res.status(405).json({ error: "method-not-allowed" });
        }
        const contentType = req.headers?.["content-type"];
        if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return res.status(415).json({ error: "unsupported-media-type" });
        }
        if (requestBodySize(req) > MAX_REQUEST_BYTES) {
            return res.status(413).json({ error: "invalid-request" });
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)
            || Object.keys(body).sort().join(",") !== "password,token,uid"
            || typeof body.uid !== "string" || !UID_PATTERN.test(body.uid)
            || !isSetupToken(body.token) || typeof body.password !== "string") {
            return res.status(400).json({ error: "invalid-setup-link" });
        }
        if (!isPasswordSetupPassword(body.password)) {
            return res.status(422).json({ error: "invalid-password" });
        }

        // This is the same shared, persistent network-prefix quota used by
        // validation. UID changes cannot create a fresh quota. Its documented
        // shared-network limitation remains; it is basic abuse friction.
        const clientIp = typeof req.ip === "string" && req.ip
            ? req.ip
            : req.socket?.remoteAddress;
        let limit;
        try {
            limit = await rateLimiter.consume(clientIp);
        } catch {
            return res.status(503).json({ error: "temporarily-unavailable" });
        }
        if (limit?.unavailable) return res.status(503).json({ error: "temporarily-unavailable" });
        if (!limit?.allowed) {
            if (Number.isSafeInteger(limit?.retryAfterSeconds)) {
                res.set("Retry-After", String(limit.retryAfterSeconds));
            }
            return res.status(429).json({ error: "try-again-later" });
        }

        let purpose;
        try {
            purpose = await registry.getCurrentPurpose(body.uid, body.token);
            if (!isSetupPurpose(purpose)
                || !await registry.isCurrentActiveToken(body.uid, body.token, purpose)) {
                return res.status(400).json({ error: "invalid-setup-link" });
            }
        } catch {
            return res.status(503).json({ error: "temporarily-unavailable" });
        }

        const attemptId = uuid();
        let claimed;
        try {
            claimed = await registry.claim(body.uid, body.token, attemptId, purpose);
        } catch {
            return res.status(503).json({ error: "temporarily-unavailable" });
        }
        if (!claimed) return res.status(400).json({ error: "invalid-setup-link" });

        const recordFailure = async stage => {
            try { await registry.recordCompletionFailure(body.uid, attemptId, purpose, stage); }
            catch { /* Keep the existing consuming claim even if diagnostics fail. */ }
        };

        try {
            const target = await auth.getUser(body.uid);
            if (target.uid !== body.uid || target.disabled) {
                await recordFailure("auth_account_recheck_failed");
                return res.status(503).json({ error: "temporarily-unavailable" });
            }
        } catch {
            await recordFailure("auth_account_recheck_failed");
            return res.status(503).json({ error: "temporarily-unavailable" });
        }

        try {
            await auth.updateUser(body.uid, { password: body.password });
        } catch {
            // Admin Auth failures can be ambiguous at the network boundary.
            // Never release this claim or automatically retry the password write.
            await recordFailure("auth_update_failed");
            return res.status(503).json({ error: "temporarily-unavailable" });
        }

        try {
            const finalized = await registry.finalizeCompletion(body.uid, attemptId, purpose);
            if (finalized) return res.status(200).json({ completed: true });
        } catch {
            // A commit error may occur after Firestore committed. Do not return
            // success unless the finalize call was positively confirmed.
        }
        await recordFailure("finalization_failed");
        return res.status(503).json({ error: "temporarily-unavailable" });
    };
}

module.exports = {
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
};

