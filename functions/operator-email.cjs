const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

const SETUP_URL_ENV = "OPERATOR_SETUP_URL";
const SETUP_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SETUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
    if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
    return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function isSetupToken(value) {
    return typeof value === "string" && SETUP_TOKEN_PATTERN.test(value);
}

function createSetupCodeRegistry({ db, auth, now = Date.now, hashToken = hashSetupToken, fieldValue = FieldValue }) {
    const tokenReference = uid => db.collection("operatorSetupActionCodes").doc(uid);
    const roleReference = uid => db.collection("userRoles").doc(uid);

    async function register(uid, token) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)) {
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
                status: "issued",
                issuedAt,
                expiresAt: issuedAt + SETUP_TOKEN_LIFETIME_MS,
                updatedAt: fieldValue.serverTimestamp()
            });
        });
    }

    async function isCurrentActiveToken(uid, token) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)) return false;
        try {
            const [user, role, current] = await Promise.all([
                auth.getUser(uid),
                roleReference(uid).get(),
                tokenReference(uid).get()
            ]);
            if (user.disabled || !role.exists
                || role.data().role !== "operator" || role.data().status !== "active"
                || !current.exists) return false;
            const data = current.data();
            return data.status === "issued"
                && data.expiresAt > now()
                && equalHashes(data.tokenHash, hashToken(token));
        } catch {
            return false;
        }
    }

    async function claim(uid, token, attemptId) {
        if (typeof uid !== "string" || !uid || !isSetupToken(token)
            || typeof attemptId !== "string" || !attemptId) return false;

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
            if (code.status !== "issued" || code.expiresAt <= now()
                || !equalHashes(code.tokenHash, hashToken(token))
                || roleData.role !== "operator" || roleData.status !== "active") return false;

            transaction.update(codeRef, {
                status: "consuming",
                attemptId,
                consumingAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    async function markUsed(uid, attemptId) {
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "consuming"
                || current.data().attemptId !== attemptId) return false;
            transaction.update(codeRef, {
                status: "used",
                tokenHash: fieldValue.delete(),
                usedAt: now(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    async function releaseAfterRejectedPassword(uid, attemptId) {
        const codeRef = tokenReference(uid);
        return db.runTransaction(async transaction => {
            const current = await transaction.get(codeRef);
            if (!current.exists || current.data().status !== "consuming"
                || current.data().attemptId !== attemptId) return false;
            transaction.update(codeRef, {
                status: "issued",
                attemptId: fieldValue.delete(),
                consumingAt: fieldValue.delete(),
                updatedAt: fieldValue.serverTimestamp()
            });
            return true;
        });
    }

    return { register, isCurrentActiveToken, claim, markUsed, releaseAfterRejectedPassword };
}

async function sendOperatorSetupEmail({
    email,
    uid,
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
    if (typeof email !== "string" || !email || typeof uid !== "string" || !uid) {
        throw new Error("Operator setup recipient is invalid.");
    }

    const token = tokenFactory();
    if (!isSetupToken(token)) throw new Error("Could not create a valid password setup token.");
    await registerSetupToken(uid, token);

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
            subject: "Set up your CaseTrack password",
            content: [{
                type: "text/plain",
                value: `Use this secure one-time link to set or reset your CaseTrack password. It expires in 24 hours and can be used once. If you did not request this, ignore this email.\n\n${setupLink}`
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
    createSetupCodeRegistry,
    hashSetupToken,
    isSetupToken,
    sendOperatorSetupEmail,
    setupPageUrl
};
