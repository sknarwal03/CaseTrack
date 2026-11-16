const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const SETUP_URL_ENV = "OPERATOR_SETUP_URL";
const SETUP_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SETUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SETUP_TOKEN_PURPOSES = Object.freeze(["initial_setup", "password_recovery"]);

function isSetupPurpose(value) {
    return SETUP_TOKEN_PURPOSES.includes(value);
}

function isUnexpiredSetupToken(data, currentTime) {
    return Number.isFinite(data.issuedAt)
        && Number.isFinite(data.expiresAt)
        && data.expiresAt > currentTime
        && data.expiresAt > data.issuedAt
        && data.expiresAt - data.issuedAt <= SETUP_TOKEN_LIFETIME_MS;
}

function setupPageUrl() {
    const value = process.env[SETUP_URL_ENV];
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("Operator setup page URL is not configured."); }

    const localEmulatorUrl = process.env.FUNCTIONS_EMULATOR === "true"
        && process.env.GCLOUD_PROJECT === "demo-casetrack-role-prototype"
        && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (!(parsed.protocol === "https:" || localEmulatorUrl)
        || parsed.username || parsed.password
        || !parsed.pathname.endsWith("/pages/password-setup.html")) {
        throw new Error("Operator setup page URL must be a secure password-setup page URL.");
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
}

function hashSetupToken(token) {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

function equalHashes(storedHash, expectedHash) {
    if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/.test(storedHash)
        || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
    return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function isSetupToken(value) {
    return typeof value === "string" && SETUP_TOKEN_PATTERN.test(value);
}

function createSetupCodeRegistry({ db, auth, now = Date.now, hashToken = hashSetupToken, fieldValue = FieldValue }) {
    const tokenReference = uid => db.collection("operatorSetupActionCodes").doc(uid);
    const roleReference = uid => db.collection("userRoles").doc(uid);

    async function register(uid, token, purpose) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token) || !isSetupPurpose(purpose)) {
            throw new Error("Invalid password setup token registration.");
        }
        const issuedAt = now();
        const reference = tokenReference(uid);
        await db.runTransaction(async transaction => {
            const current = await transaction.get(reference);
            if (current.exists && current.data().status === "consuming") {
                const error = new Error("Password setup is in progress. Retry after completion; contact support if it remains unavailable.");
                error.code = "setup/in-progress";
                throw error;
            }
            transaction.set(reference, {
                tokenHash: hashToken(token),
                purpose,
                status: "issued",
                issuedAt,
                expiresAt: issuedAt + SETUP_TOKEN_LIFETIME_MS,
                updatedAt: fieldValue.serverTimestamp()
            });
        });
    }

    // Internal server-side lookup only. Callers must never accept purpose from
    // an HTTP request as a substitute for this persisted binding.
    async function getCurrentPurpose(uid, token) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)) return null;
        try {
            const current = await tokenReference(uid).get();
            if (!current.exists) return null;
            const data = current.data();
            if (data.status !== "issued" || !isSetupPurpose(data.purpose)
                || !isUnexpiredSetupToken(data, now())
                || !equalHashes(data.tokenHash, hashToken(token))) return null;
            return data.purpose;
        } catch {
            return null;
        }
    }

    async function isCurrentActiveToken(uid, token, expectedPurpose) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)
            || !isSetupPurpose(expectedPurpose)) return false;
        try {
            const [user, role, current] = await Promise.all([
                auth.getUser(uid),
                roleReference(uid).get(),
                tokenReference(uid).get()
            ]);
            if (user.disabled || !role.exists
                || !isRoleEligible(role.data(), expectedPurpose)
                || !current.exists) return false;
            const data = current.data();
            return data.purpose === expectedPurpose
                && data.status === "issued"
                && isUnexpiredSetupToken(data, now())
                && equalHashes(data.tokenHash, hashToken(token));
        } catch {
            return false;
        }
    }

    async function claim(uid, token, attemptId, expectedPurpose) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)
            || typeof attemptId !== "string" || !attemptId
            || !isSetupPurpose(expectedPurpose)) return false;

        const codeRef = tokenReference(uid);
        const roleRef = roleReference(uid);
        return db.runTransaction(async transaction => {
            const [current, role] = await Promise.all([
                transaction.get(codeRef),
                transaction.get(roleRef)
            ]);
            if (!current.exists || !role.exists) return false;
            const code = current.data();
            const roleData = role.data();
            if (code.status !== "issued" || !isUnexpiredSetupToken(code, now())
                || !equalHashes(code.tokenHash, hashToken(token))
                || code.purpose !== expectedPurpose
                || !isRoleEligible(roleData, expectedPurpose)) return false;

            transaction.update(codeRef, {
                status: "consuming",
                attemptId,
                consumingAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    async function markUsed(uid, attemptId, expectedPurpose) {
        if (!isSetupPurpose(expectedPurpose)) return false;
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "consuming"
                || current.data().attemptId !== attemptId
                || current.data().purpose !== expectedPurpose) return false;
            transaction.update(codeRef, {
                status: "used",
                tokenHash: fieldValue.delete(),
                usedAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    // Password setup completion finalizes the token and the initial-setup role
    // flag in one Firestore transaction after Firebase Auth has confirmed the
    // password write. The cross-service boundary is deliberately fail-closed:
    // callers never release a claim if Auth or finalization is uncertain.
    async function finalizeCompletion(uid, attemptId, expectedPurpose) {
        if (typeof uid !== "string" || !uid || typeof attemptId !== "string"
            || !attemptId || !isSetupPurpose(expectedPurpose)) return false;
        const codeRef = tokenReference(uid);
        const roleRef = roleReference(uid);
        return db.runTransaction(async transaction => {
            const [current, role] = await Promise.all([
                transaction.get(codeRef),
                transaction.get(roleRef)
            ]);
            if (!current.exists || !role.exists) return false;
            const code = current.data();
            const roleData = role.data();
            if (code.status !== "consuming" || code.attemptId !== attemptId
                || code.purpose !== expectedPurpose
                || !isRoleEligible(roleData, expectedPurpose)) return false;

            transaction.update(codeRef, {
                status: "used",
                tokenHash: fieldValue.delete(),
                usedAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            if (expectedPurpose === "initial_setup") {
                transaction.update(roleRef, {
                    mustChangePassword: false,
                    updatedAt: fieldValue.serverTimestamp()
                });
            }
            return true;
        });
    }

    async function recordCompletionFailure(uid, attemptId, expectedPurpose, stage) {
        const safeStages = new Set([
            "auth_account_recheck_failed",
            "auth_update_failed",
            "finalization_failed"
        ]);
        if (typeof uid !== "string" || !uid || typeof attemptId !== "string"
            || !attemptId || !isSetupPurpose(expectedPurpose) || !safeStages.has(stage)) return false;
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "consuming"
                || current.data().attemptId !== attemptId
                || current.data().purpose !== expectedPurpose) return false;
            transaction.update(codeRef, {
                completionFailureStage: stage,
                completionFailureAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    async function releaseAfterRejectedPassword(uid, attemptId, expectedPurpose) {
        if (!isSetupPurpose(expectedPurpose)) return false;
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "consuming"
                || current.data().attemptId !== attemptId
                || current.data().purpose !== expectedPurpose) return false;
            transaction.update(codeRef, {
                status: "issued",
                attemptId: fieldValue.delete(),
                consumingAt: fieldValue.delete(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    async function revoke(uid) {
        if (typeof uid !== "string" || !uid) return false;
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "issued") return false;
            transaction.update(codeRef, {
                status: "revoked",
                tokenHash: fieldValue.delete(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    return {
        register,
        getCurrentPurpose,
        isCurrentActiveToken,
        claim,
        markUsed,
        finalizeCompletion,
        recordCompletionFailure,
        releaseAfterRejectedPassword,
        revoke
    };
}

function isRoleEligible(role, purpose) {
    if (role.role !== "operator" || role.status !== "active") return false;
    if (purpose === "initial_setup") return role.mustChangePassword === true;
    if (purpose === "password_recovery") return role.mustChangePassword === false;
    return false;
}

async function sendOperatorSetupEmail({
    email,
    uid,
    purpose,
    apiKey,
    from,
    registerSetupToken,
    fetchImpl = fetch,
    tokenFactory = () => randomBytes(32).toString("base64url")
}) {
    if (typeof apiKey !== "string" || !apiKey.trim() || typeof from !== "string"
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
        throw new Error("Operator email delivery is not configured.");
    }
    if (typeof email !== "string" || !email || typeof uid !== "string" || !uid
        || !isSetupPurpose(purpose)) {
        throw new Error("Operator setup recipient is invalid.");
    }

    const token = tokenFactory();
    if (!isSetupToken(token)) throw new Error("Could not create a valid password setup token.");
    await registerSetupToken(uid, token, purpose);

    const setupUrl = new URL(setupPageUrl());
    setupUrl.hash = new URLSearchParams({ uid, token }).toString();
    const setupLink = setupUrl.toString();

    let endpoint = "https://api.sendgrid.com/v3/mail/send";
    const testEndpoint = process.env.OPERATOR_EMAIL_API_URL;
    if (testEndpoint) {
        let parsed;
        try { parsed = new URL(testEndpoint); } catch { throw new Error("Invalid local email test endpoint."); }
        if (process.env.FUNCTIONS_EMULATOR !== "true"
            || process.env.GCLOUD_PROJECT !== "demo-casetrack-role-prototype"
            || parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) {
            throw new Error("Local email test delivery is only available in the fixed demo emulator.");
        }
        endpoint = parsed.toString();
    }
    const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: from, name: "CaseTrack" },
            subject: purpose === "initial_setup"
                ? "Set up your CaseTrack password"
                : "Reset your CaseTrack password",
            content: [{
                type: "text/plain",
                value: `Use this secure one-time link to ${purpose === "initial_setup" ? "set up" : "reset"} your CaseTrack password. It expires in 24 hours and can be used once. If you did not request this, ignore this email.\n\n${setupLink}`
            }],
            tracking_settings: {
                click_tracking: { enable: false, enable_text: false },
                open_tracking: { enable: false }
            }
        })
    });
    if (!response.ok) {
        const error = new Error("Operator setup email delivery failed.");
        error.code = `sendgrid/${response.status}`;
        throw error;
    }
}

module.exports = {
    SETUP_TOKEN_LIFETIME_MS,
    SETUP_TOKEN_PURPOSES,
    createSetupCodeRegistry,
    hashSetupToken,
    isSetupPurpose,
    isSetupToken,
    sendOperatorSetupEmail,
    setupPageUrl
};
