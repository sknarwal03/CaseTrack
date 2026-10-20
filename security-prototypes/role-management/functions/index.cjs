const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const { createHmac, randomUUID, timingSafeEqual } = require("node:crypto");

const PROJECT_ID = "demo-casetrack-role-prototype";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ALLOWED_BROWSER_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://127.0.0.1:5174"
];
const ALLOWED_BROWSER_ORIGIN_SET = new Set(ALLOWED_BROWSER_ORIGINS);
const INVALID_TOKEN_CODES = new Set([
    "auth/argument-error",
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/invalid-id-token",
    "auth/tenant-id-mismatch",
    "auth/user-disabled",
    "auth/user-not-found"
]);

if (process.env.FUNCTIONS_EMULATOR === "true" && process.env.FIREBASE_DEBUG_MODE === "true") {
    let debugFeatures;
    try {
        debugFeatures = JSON.parse(process.env.FIREBASE_DEBUG_FEATURES || "{}");
    } catch {
        throw new Error("Refusing to start because emulator debug features are invalid.");
    }
    process.env.FIREBASE_DEBUG_FEATURES = JSON.stringify({
        ...debugFeatures,
        enableCors: false
    });
}

const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");

function assertLocalEmulatorsOnly() {
    if (process.env.GCLOUD_PROJECT !== PROJECT_ID) {
        throw new Error(`Refusing to start unless GCLOUD_PROJECT is ${PROJECT_ID}.`);
    }
    const isLoopbackEmulatorHost = value => {
        const match = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/.exec(value || "");
        return Boolean(match && Number(match[1]) > 0 && Number(match[1]) <= 65535);
    };
    if (!isLoopbackEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST)) {
        throw new Error("Refusing to start unless Firestore Emulator uses a loopback endpoint.");
    }
    if (!isLoopbackEmulatorHost(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
        throw new Error("Refusing to start unless Auth Emulator uses a loopback endpoint.");
    }

    if (process.env.FIREBASE_CONFIG) {
        let firebaseConfig;
        try {
            firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
        } catch {
            throw new Error("Refusing to start because FIREBASE_CONFIG is invalid.");
        }
        if (firebaseConfig.projectId !== PROJECT_ID) {
            throw new Error(`Refusing to start unless FIREBASE_CONFIG.projectId is ${PROJECT_ID}.`);
        }
    }
}

assertLocalEmulatorsOnly();

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const { createSaveFirMasterHandler } = require("../../../functions/save-fir-master");

function parsePageRequest(query) {
    const rawLimit = query.limit;
    let limit = DEFAULT_PAGE_SIZE;

    if (rawLimit !== undefined) {
        if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) return null;
        limit = Number(rawLimit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) return null;
    }

    const rawPageToken = query.pageToken;
    if (rawPageToken === undefined) return { limit, cursor: null };
    if (typeof rawPageToken !== "string" || rawPageToken.length > 2000
        || !/^[A-Za-z0-9_-]+$/.test(rawPageToken)) {
        return null;
    }

    let cursor;
    try {
        cursor = Buffer.from(rawPageToken, "base64url").toString("utf8");
    } catch {
        return null;
    }
    if (!cursor || cursor.includes("/") || Buffer.byteLength(cursor, "utf8") > 1500
        || Buffer.from(cursor, "utf8").toString("base64url") !== rawPageToken) {
        return null;
    }

    return { limit, cursor };
}

function approvedRoleRecord(snapshot) {
    const data = snapshot.data();
    return {
        uid: snapshot.id,
        role: typeof data.role === "string" ? data.role : null,
        status: typeof data.status === "string" ? data.status : null,
        policeStationId: typeof data.policeStationId === "string" ? data.policeStationId : null
    };
}

function applyCorsAndPreflight(req, res, { methods, allowedHeaders = ["authorization"] }) {
    const origin = req.headers?.origin;
    if (origin) {
        if (!ALLOWED_BROWSER_ORIGIN_SET.has(origin)) {
            res.removeHeader?.("Access-Control-Allow-Origin");
            res.status(403).json({ error: "Forbidden." });
            return false;
        }

        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
        res.set("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
        res.set("Access-Control-Allow-Headers", allowedHeaders
            .map(header => ({
                authorization: "Authorization",
                "content-type": "Content-Type",
                "idempotency-key": "Idempotency-Key"
            })[header])
            .join(", "));
        res.set("Access-Control-Max-Age", "300");
    }

    if (req.method === "OPTIONS") {
        const requestedMethod = req.headers?.["access-control-request-method"];
        const requestedHeaders = String(req.headers?.["access-control-request-headers"] || "")
            .split(",")
            .map(header => header.trim().toLowerCase())
            .filter(Boolean);
        if (!origin || !methods.includes(requestedMethod)
            || requestedHeaders.some(header => !allowedHeaders.includes(header))) {
            res.status(403).json({ error: "Forbidden." });
            return false;
        }
        res.status(204).end();
        return false;
    }

    return true;
}

async function authorizeActiveAdmin(req, res, { verifyIdToken, getRole, roleErrorMessage }) {
    const authHeader = req.headers?.authorization;
    const bearerMatch = typeof authHeader === "string"
        ? /^Bearer ([^\s]+)$/i.exec(authHeader)
        : null;
    if (!bearerMatch) {
        res.status(401).json({ error: "Unauthorized." });
        return null;
    }

    let tokenClaims;
    try {
        tokenClaims = await verifyIdToken(bearerMatch[1]);
    } catch (error) {
        if (INVALID_TOKEN_CODES.has(error?.code)) {
            res.status(401).json({ error: "Unauthorized." });
            return null;
        }
        console.error("ID token verification failed.", error?.code || "unknown");
        res.status(500).json({ error: "Unable to verify authentication." });
        return null;
    }
    if (typeof tokenClaims?.uid !== "string" || !tokenClaims.uid) {
        res.status(401).json({ error: "Unauthorized." });
        return null;
    }

    let callerRole;
    try {
        callerRole = await getRole(tokenClaims.uid);
    } catch (error) {
        console.error("Admin role verification failed.", error?.code || "unknown");
        res.status(500).json({ error: roleErrorMessage });
        return null;
    }
    if (!isActiveAdminRole(callerRole)) {
        res.status(403).json({ error: "Forbidden." });
        return null;
    }

    return tokenClaims.uid;
}

function isActiveAdminRole(role) {
    return role?.role === "admin"
        && role.status === "active"
        && (role.policeStationId === undefined || role.policeStationId === null);
}

function createListUserRolesHandler({ verifyIdToken, getRole, listRolePage }) {
    return async (req, res) => {
        if (!applyCorsAndPreflight(req, res, { methods: ["GET"] })) return;

        if (req.method !== "GET") {
            res.status(405).json({ error: "Method not allowed." });
            return;
        }

        const uid = await authorizeActiveAdmin(req, res, {
            verifyIdToken,
            getRole,
            roleErrorMessage: "Unable to list user roles."
        });
        if (!uid) return;

        const pageRequest = parsePageRequest(req.query || {});
        if (!pageRequest) {
            res.status(400).json({ error: "Invalid pagination parameters." });
            return;
        }

        try {
            const page = await listRolePage(pageRequest);
            res.status(200).json({
                users: page.documents.map(approvedRoleRecord),
                nextPageToken: page.nextCursor
                    ? Buffer.from(page.nextCursor, "utf8").toString("base64url")
                    : null
            });
        } catch (error) {
            console.error("User role listing failed.", error?.code || "unknown");
            res.status(500).json({ error: "Unable to list user roles." });
        }
    };
}

function canonicalPoliceStationName(value) {
    if (typeof value !== "string") return null;
    const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
    if (!name || Array.from(name).length > 120 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
        return null;
    }
    return name;
}

function policeStationRecord(snapshot) {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        name: data.name,
        createdAt: data.createdAt?.toDate?.().toISOString() || null
    };
}

function createPoliceStationsHandler({ verifyIdToken, getRole, listStations, createStation }) {
    return async (req, res) => {
        if (!applyCorsAndPreflight(req, res, {
            methods: ["GET", "POST"],
            allowedHeaders: ["authorization", "content-type"]
        })) return;

        if (req.method !== "GET" && req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed." });
            return;
        }

        const uid = await authorizeActiveAdmin(req, res, {
            verifyIdToken,
            getRole,
            roleErrorMessage: "Unable to access police stations."
        });
        if (!uid) return;

        if (req.method === "GET") {
            try {
                const stations = await listStations();
                res.status(200).json({ stations: stations.map(policeStationRecord) });
            } catch (error) {
                console.error("Police station listing failed.", error?.code || "unknown");
                res.status(500).json({ error: "Unable to list police stations." });
            }
            return;
        }

        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)
            || Object.keys(body).some(key => key !== "name")) {
            res.status(400).json({ error: "Invalid police station name." });
            return;
        }
        const name = canonicalPoliceStationName(body.name);
        if (!name) {
            res.status(400).json({ error: "Invalid police station name." });
            return;
        }

        try {
            const snapshot = await createStation(name);
            res.status(201).json({ station: policeStationRecord(snapshot) });
        } catch (error) {
            console.error("Police station creation failed.", error?.code || "unknown");
            res.status(500).json({ error: "Unable to create police station." });
        }
    };
}

const OPERATOR_PASSWORD_MIN_LENGTH = 12;
const OPERATOR_PASSWORD_MAX_LENGTH = 128;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateOperatorRequest(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)
        || Object.keys(body).sort().join(",") !== "email,password,policeStationId,requestId") {
        return null;
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const passwordLength = typeof body.password === "string" ? Array.from(body.password).length : 0;
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || passwordLength < OPERATOR_PASSWORD_MIN_LENGTH
        || passwordLength > OPERATOR_PASSWORD_MAX_LENGTH
        || typeof body.policeStationId !== "string"
        || !/^[A-Za-z0-9_-]{1,1500}$/.test(body.policeStationId)
        || typeof body.requestId !== "string" || !UUID_PATTERN.test(body.requestId)) {
        return null;
    }
    return {
        email,
        password: body.password,
        policeStationId: body.policeStationId,
        requestId: body.requestId.toLowerCase()
    };
}

function makePasswordFingerprint(password, context, key) {
    if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32) {
        throw new Error("The local operator request fingerprint key is unavailable.");
    }
    const contextText = [context.actorUid, context.requestId, context.email, context.policeStationId].join("\0");
    return createHmac("sha256", key).update(contextText, "utf8").update("\0", "utf8")
        .update(password, "utf8").digest("hex");
}

function sameFingerprint(left, right) {
    if (typeof left !== "string" || typeof right !== "string"
        || !/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function createOperatorProvisioningStore({ db, auth, hashPassword, now = Date.now, uuid = randomUUID }) {
    const requestReference = (actorUid, requestId) => db.collection("operatorCreationRequests")
        .doc(actorUid).collection("requests").doc(requestId);

    async function reserve({ actorUid, email, password, policeStationId, requestId }) {
        const reference = requestReference(actorUid, requestId);
        const passwordFingerprint = hashPassword(password, { actorUid, requestId, email, policeStationId });
        const leaseToken = uuid();
        const currentTime = now();
        return db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (snapshot.exists) {
                const existing = snapshot.data();
                if (existing.email !== email || existing.policeStationId !== policeStationId
                    || !sameFingerprint(existing.passwordFingerprint, passwordFingerprint)) {
                    return { kind: "mismatch" };
                }
                if (existing.phase === "completed") return { kind: "completed", operation: existing };
                if (existing.phase === "duplicate_email") return { kind: "duplicate" };
                if (existing.leaseUntil > currentTime) return { kind: "busy" };
                transaction.update(reference, {
                    leaseToken,
                    leaseUntil: currentTime + 60_000,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { kind: "reserved", operation: existing, leaseToken, reference };
            }

            const operation = {
                email,
                policeStationId,
                passwordFingerprint,
                targetUid: uuid(),
                historyEventId: uuid(),
                phase: "reserved",
                leaseToken,
                leaseUntil: currentTime + 60_000,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };
            transaction.create(reference, operation);
            return { kind: "reserved", operation, leaseToken, reference };
        });
    }

    async function updateOperation(reference, leaseToken, fields) {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists || snapshot.data().leaseToken !== leaseToken) {
                throw new Error("Operator provisioning lease was lost.");
            }
            transaction.update(reference, {
                ...fields,
                leaseUntil: now() + 60_000,
                updatedAt: FieldValue.serverTimestamp()
            });
        });
    }

    async function commitRoleAndHistory(reference, leaseToken, operation, actorUid) {
        const roleReference = db.collection("userRoles").doc(operation.targetUid);
        const historyReference = roleReference.collection("history").doc(operation.historyEventId);
        await db.runTransaction(async transaction => {
            const [roleSnapshot, historySnapshot, operationSnapshot] = await Promise.all([
                transaction.get(roleReference),
                transaction.get(historyReference),
                transaction.get(reference)
            ]);
            if (!operationSnapshot.exists || operationSnapshot.data().leaseToken !== leaseToken) {
                throw new Error("Operator provisioning lease was lost.");
            }
            if (roleSnapshot.exists || historySnapshot.exists) {
                const role = roleSnapshot.data();
                const history = historySnapshot.data();
                if (roleSnapshot.exists && historySnapshot.exists
                    && role.role === "operator" && role.status === "active"
                    && role.policeStationId === operation.policeStationId
                    && role.createdBy === actorUid
                    && history.action === "assigned" && history.previousRole === null
                    && history.newRole === "operator" && history.actorUid === actorUid) {
                    return;
                }
                throw new Error("Conflicting operator role or history state.");
            }

            const timestamp = FieldValue.serverTimestamp();
            transaction.create(roleReference, {
                role: "operator",
                status: "active",
                policeStationId: operation.policeStationId,
                createdAt: timestamp,
                createdBy: actorUid,
                updatedAt: timestamp,
                updatedBy: actorUid
            });
            transaction.create(historyReference, {
                action: "assigned",
                previousRole: null,
                newRole: "operator",
                actorUid,
                occurredAt: FieldValue.serverTimestamp()
            });
            transaction.update(reference, {
                phase: "role_committed",
                leaseUntil: now() + 60_000,
                updatedAt: FieldValue.serverTimestamp()
            });
        });
    }

    async function release(reference, leaseToken, fields = {}) {
        try {
            await db.runTransaction(async transaction => {
                const snapshot = await transaction.get(reference);
                if (snapshot.exists && snapshot.data().leaseToken === leaseToken) {
                    transaction.update(reference, {
                        ...fields,
                        leaseUntil: 0,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            });
        } catch (error) {
            console.error("Operator provisioning journal update failed.", error?.code || "unknown");
        }
    }

    async function ownsLease(reference, leaseToken) {
        const snapshot = await reference.get();
        return snapshot.exists && snapshot.data().leaseToken === leaseToken;
    }

    return { reserve, updateOperation, commitRoleAndHistory, release, ownsLease, auth, db };
}

function createOperatorHandler({ verifyIdToken, getRole, stationExists, store, auth }) {
    return async (req, res) => {
        if (!applyCorsAndPreflight(req, res, {
            methods: ["POST"],
            allowedHeaders: ["authorization", "content-type", "idempotency-key"]
        })) return;
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed." });
            return;
        }

        const actorUid = await authorizeActiveAdmin(req, res, {
            verifyIdToken,
            getRole,
            roleErrorMessage: "Unable to create operator."
        });
        if (!actorUid) return;

        const input = validateOperatorRequest(req.body);
        const idempotencyKey = req.headers?.["idempotency-key"];
        if (!input || idempotencyKey !== input.requestId) {
            res.status(400).json({ error: "Invalid operator request." });
            return;
        }

        let stationIsValid;
        try {
            stationIsValid = await stationExists(input.policeStationId);
        } catch (error) {
            console.error("Operator station validation failed.", error?.code || "unknown");
            res.status(500).json({ error: "Unable to validate the selected police station." });
            return;
        }
        if (!stationIsValid) {
            res.status(400).json({ error: "The selected police station does not exist." });
            return;
        }

        let reservation;
        try {
            reservation = await store.reserve({ actorUid, ...input });
        } catch (error) {
            console.error("Operator request reservation failed.", error?.code || "unknown");
            res.status(503).json({ error: "Operator creation could not be started. Retry with the same request ID." });
            return;
        }
        if (reservation.kind === "mismatch") {
            res.status(409).json({ error: "This request ID was already used with different inputs." });
            return;
        }
        if (reservation.kind === "busy") {
            res.set("Retry-After", "2");
            res.status(409).json({ error: "This operator request is still processing. Retry shortly with the same request ID." });
            return;
        }
        if (reservation.kind === "duplicate") {
            res.status(409).json({ error: "An account with this email already exists." });
            return;
        }
        if (reservation.kind === "completed") {
            res.status(200).json({ operator: {
                uid: reservation.operation.targetUid,
                role: "operator",
                status: "active",
                policeStationId: reservation.operation.policeStationId
            } });
            return;
        }

        const { operation, leaseToken, reference } = reservation;
        let accountTouched = false;
        let currentPhase = operation.phase;
        let stage = "auth-account";
        try {
            let account;
            accountTouched = true;
            try {
                account = await auth.getUser(operation.targetUid);
            } catch (error) {
                if (error?.code !== "auth/user-not-found") throw error;
                account = null;
            }
            if (account && account.email?.toLowerCase() !== input.email) {
                throw new Error("Conflicting Auth account state.");
            }
            if (!account) {
                accountTouched = true;
                try {
                    account = await auth.createUser({
                        uid: operation.targetUid,
                        email: input.email,
                        password: input.password,
                        disabled: true
                    });
                } catch (error) {
                    if (error?.code === "auth/email-already-exists") {
                        await store.updateOperation(reference, leaseToken, { phase: "duplicate_email" });
                        await store.release(reference, leaseToken);
                        res.status(409).json({ error: "An account with this email already exists." });
                        return;
                    }
                    throw error;
                }
            }
            accountTouched = true;
            if (!account.disabled) await auth.updateUser(operation.targetUid, { disabled: true });
            await store.updateOperation(reference, leaseToken, { phase: "auth_created" });
            currentPhase = "auth_created";

            stage = "role-and-history";
            await store.commitRoleAndHistory(reference, leaseToken, operation, actorUid);
            currentPhase = "role_committed";

            stage = "enable-account";
            await auth.updateUser(operation.targetUid, { disabled: false });

            stage = "complete-journal";
            await store.updateOperation(reference, leaseToken, {
                phase: "completed",
                completedAt: FieldValue.serverTimestamp()
            });
            currentPhase = "completed";
            await store.release(reference, leaseToken);
            res.status(reservation.operation.phase === "reserved" ? 201 : 200).json({ operator: {
                uid: operation.targetUid,
                role: "operator",
                status: "active",
                policeStationId: operation.policeStationId
            } });
        } catch (error) {
            let accountDisabled = !accountTouched;
            let leaseIsOwned = false;
            try {
                leaseIsOwned = await store.ownsLease(reference, leaseToken);
            } catch {
                leaseIsOwned = false;
            }
            if (!leaseIsOwned) {
                console.error("Operator provisioning lease was lost during recovery.", stage);
                res.status(503).json({ error: "This operator request is still processing. Retry shortly with the same request ID." });
                return;
            }
            if (accountTouched && leaseIsOwned) {
                try {
                    await auth.updateUser(operation.targetUid, { disabled: true });
                    accountDisabled = true;
                } catch (disableError) {
                    accountDisabled = disableError?.code === "auth/user-not-found";
                    if (!accountDisabled) {
                        console.error("Operator account disable recovery failed.", disableError?.code || "unknown");
                    }
                }
            }
            if (leaseIsOwned) {
                await store.release(reference, leaseToken, {
                    phase: accountDisabled ? currentPhase : "reconciliation_required",
                    lastFailedStage: stage
                });
            }
            console.error("Operator provisioning stage failed.", stage, error?.code || "unknown");
            res.status(503).json({ error: accountDisabled
                ? "Operator creation is incomplete. Retry with the same request ID."
                : "Operator creation needs local admin reconciliation before retry." });
        }
    };
}

const TRANSITION_ACTIONS = new Set(["promote", "demote", "revoke", "reactivate"]);
const TRANSITION_REASON_MAX_LENGTH = 500;

function validateRoleTransitionRequest(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const action = body.action;
    const expectedKeys = action === "demote"
        ? "action,policeStationId,reason,requestId,targetUid"
        : "action,reason,requestId,targetUid";
    if (Object.keys(body).sort().join(",") !== expectedKeys || !TRANSITION_ACTIONS.has(action)) {
        return null;
    }

    const targetUid = typeof body.targetUid === "string" ? body.targetUid.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.normalize("NFC").trim() : "";
    const requestId = typeof body.requestId === "string" ? body.requestId.toLowerCase() : "";
    if (!targetUid || targetUid.length > 128 || targetUid.includes("/")
        || /[\u0000-\u001f\u007f-\u009f]/u.test(targetUid)
        || !reason || Array.from(reason).length > TRANSITION_REASON_MAX_LENGTH
        || /[\u0000-\u001f\u007f-\u009f]/u.test(reason)
        || !UUID_PATTERN.test(requestId)) {
        return null;
    }

    const input = { action, targetUid, reason, requestId };
    if (action === "demote") {
        const policeStationId = body.policeStationId;
        if (typeof policeStationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(policeStationId)) {
            return null;
        }
        input.policeStationId = policeStationId;
    }
    return input;
}

function createRoleTransitionStore({ db, auth, now = Date.now, uuid = randomUUID }) {
    const governanceReference = db.collection("systemControl").doc("adminGovernance");
    const requestReference = (actorUid, requestId) => db.collection("roleManagementRequests")
        .doc(actorUid).collection("requests").doc(requestId);

    async function release(reference, leaseToken) {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (snapshot.exists && snapshot.data().leaseToken === leaseToken) {
                transaction.update(reference, {
                    leaseUntil: 0,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        });
    }

    async function reserve(actorUid, input) {
        const reference = requestReference(actorUid, input.requestId);
        const leaseToken = uuid();
        const currentTime = now();
        const reservation = await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (snapshot.exists) {
                const existing = snapshot.data();
                if (existing.action !== input.action || existing.targetUid !== input.targetUid
                    || existing.reason !== input.reason
                    || (existing.policeStationId || null) !== (input.policeStationId || null)) {
                    return { kind: "mismatch" };
                }
                if (existing.phase === "completed") return { kind: "completed", operation: existing };
                if (existing.leaseUntil > currentTime) return { kind: "busy" };
                transaction.update(reference, {
                    leaseToken,
                    leaseUntil: currentTime + 60_000,
                    updatedAt: FieldValue.serverTimestamp()
                });
                return { kind: "reserved", operation: existing, leaseToken, reference };
            }

            const operation = {
                action: input.action,
                targetUid: input.targetUid,
                reason: input.reason,
                policeStationId: input.policeStationId || null,
                eventId: uuid(),
                phase: "reserved",
                leaseToken,
                leaseUntil: currentTime + 60_000,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };
            transaction.create(reference, operation);
            return { kind: "reserved", operation, leaseToken, reference };
        });
        return reservation;
    }

    async function commitTransition(reservation, actorUid) {
        const { operation, leaseToken, reference } = reservation;
        const actorReference = db.collection("userRoles").doc(actorUid);
        const targetReference = db.collection("userRoles").doc(operation.targetUid);
        const historyReference = targetReference.collection("history").doc(operation.eventId);
        return db.runTransaction(async transaction => {
            const [operationSnapshot, actorSnapshot, targetSnapshot, governanceSnapshot, historySnapshot] =
                await Promise.all([
                    transaction.get(reference),
                    transaction.get(actorReference),
                    transaction.get(targetReference),
                    transaction.get(governanceReference),
                    transaction.get(historyReference)
                ]);

            if (!operationSnapshot.exists || operationSnapshot.data().leaseToken !== leaseToken) {
                return { kind: "busy" };
            }
            if (!actorSnapshot.exists || !isActiveAdminRole(actorSnapshot.data())) {
                return { kind: "forbidden" };
            }
            if (actorUid === operation.targetUid) return { kind: "self-change" };
            if (!targetSnapshot.exists || historySnapshot.exists) return { kind: "conflict" };

            const previous = targetSnapshot.data();
            if (!["admin", "operator"].includes(previous.role)
                || !["active", "revoked"].includes(previous.status)) {
                return { kind: "conflict" };
            }
            if (previous.role === "admin"
                && previous.policeStationId !== undefined
                && previous.policeStationId !== null) {
                return { kind: "conflict" };
            }
            const previousStationId = typeof previous.policeStationId === "string"
                ? previous.policeStationId
                : null;
            let nextRole = previous.role;
            let nextStatus = previous.status;
            let nextStationId = previousStationId;

            switch (operation.action) {
                case "promote":
                    if (previous.role !== "operator" || previous.status !== "active"
                        || !previousStationId) return { kind: "conflict" };
                    nextRole = "admin";
                    nextStationId = null;
                    break;
                case "demote":
                    if (previous.role !== "admin" || previous.status !== "active") {
                        return { kind: "conflict" };
                    }
                    nextRole = "operator";
                    nextStationId = operation.policeStationId;
                    break;
                case "revoke":
                    if (previous.status !== "active") return { kind: "conflict" };
                    nextStatus = "revoked";
                    break;
                case "reactivate":
                    if (previous.status !== "revoked") return { kind: "conflict" };
                    nextStatus = "active";
                    break;
                default:
                    return { kind: "invalid" };
            }

            if (nextRole === "operator") {
                if (!nextStationId || !/^[A-Za-z0-9_-]{1,128}$/.test(nextStationId)) {
                    return { kind: "invalid-station" };
                }
                const stationSnapshot = await transaction.get(db.collection("policeStations").doc(nextStationId));
                const stationName = stationSnapshot.exists ? stationSnapshot.data()?.name : null;
                if (typeof stationName !== "string" || !stationName.trim()) {
                    return { kind: "invalid-station" };
                }
            }

            if (!governanceSnapshot.exists) return { kind: "governance-unavailable" };
            const governance = governanceSnapshot.data();
            if (governance.schemaVersion !== 1 || !Number.isSafeInteger(governance.activeAdminCount)
                || governance.activeAdminCount < 1) {
                return { kind: "governance-unavailable" };
            }

            const previousActiveAdmin = previous.role === "admin" && previous.status === "active";
            const nextActiveAdmin = nextRole === "admin" && nextStatus === "active";
            const adminCountDelta = Number(nextActiveAdmin) - Number(previousActiveAdmin);
            const nextAdminCount = governance.activeAdminCount + adminCountDelta;
            if (nextAdminCount < 1) return { kind: "last-admin" };

            const timestamp = FieldValue.serverTimestamp();
            const roleUpdate = {
                role: nextRole,
                status: nextStatus,
                updatedAt: timestamp,
                updatedBy: actorUid
            };
            if (nextRole === "operator") roleUpdate.policeStationId = nextStationId;
            else roleUpdate.policeStationId = FieldValue.delete();

            const action = operation.action === "promote" || operation.action === "demote"
                ? "role_changed"
                : operation.action === "revoke" ? "revoked" : "reactivated";
            const result = {
                uid: operation.targetUid,
                role: nextRole,
                status: nextStatus,
                policeStationId: nextStationId
            };
            transaction.update(targetReference, roleUpdate);
            transaction.create(historyReference, {
                action,
                previousRole: previous.role,
                newRole: operation.action === "revoke" ? null : nextRole,
                previousStatus: previous.status,
                newStatus: nextStatus,
                previousPoliceStationId: previousStationId,
                newPoliceStationId: nextStationId,
                actorUid,
                reason: operation.reason,
                occurredAt: timestamp
            });
            transaction.update(governanceReference, {
                activeAdminCount: nextAdminCount,
                updatedAt: timestamp,
                updatedBy: actorUid
            });
            transaction.update(reference, {
                phase: "role_committed",
                result,
                leaseUntil: now() + 60_000,
                updatedAt: timestamp
            });
            return { kind: "committed", result };
        });
    }

    async function complete(reference, leaseToken, result) {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(reference);
            if (!snapshot.exists || snapshot.data().leaseToken !== leaseToken) {
                throw new Error("Role transition lease was lost.");
            }
            transaction.update(reference, {
                phase: "completed",
                result,
                leaseUntil: 0,
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
        });
    }

    async function execute(actorUid, input) {
        const reservation = await reserve(actorUid, input);
        if (reservation.kind === "completed") {
            return {
                kind: "completed",
                result: reservation.operation.result,
                created: false
            };
        }
        if (reservation.kind !== "reserved") return reservation;
        const { operation } = reservation;
        let result = operation.result;
        try {
            const targetAccount = await auth.getUser(operation.targetUid);
            if (operation.phase !== "role_committed") {
                const transition = await commitTransition(reservation, actorUid);
                if (transition.kind !== "committed") {
                    await release(reservation.reference, reservation.leaseToken);
                    return transition;
                }
                result = transition.result;
            }

            if (operation.action === "revoke" && !targetAccount.disabled) {
                await auth.updateUser(operation.targetUid, { disabled: true });
            }
            if (operation.action === "reactivate" && targetAccount.disabled) {
                await auth.updateUser(operation.targetUid, { disabled: false });
            }
            await complete(reservation.reference, reservation.leaseToken, result);
            return { kind: "completed", result, created: operation.phase === "reserved" };
        } catch (error) {
            try {
                await release(reservation.reference, reservation.leaseToken);
            } catch (releaseError) {
                console.error("Role transition journal recovery failed.", releaseError?.code || "unknown");
            }
            throw error;
        }
    }

    return { execute };
}

function createManageUserRoleHandler({ verifyIdToken, getRole, transitionStore }) {
    return async (req, res) => {
        if (!applyCorsAndPreflight(req, res, {
            methods: ["POST"],
            allowedHeaders: ["authorization", "content-type", "idempotency-key"]
        })) return;
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed." });
            return;
        }

        const actorUid = await authorizeActiveAdmin(req, res, {
            verifyIdToken,
            getRole,
            roleErrorMessage: "Unable to manage user roles."
        });
        if (!actorUid) return;

        const input = validateRoleTransitionRequest(req.body);
        if (!input || req.headers?.["idempotency-key"] !== input.requestId) {
            res.status(400).json({ error: "Invalid role transition request." });
            return;
        }
        if (actorUid === input.targetUid) {
            res.status(403).json({ error: "Admins cannot change their own role or status." });
            return;
        }

        let transition;
        try {
            transition = await transitionStore.execute(actorUid, input);
        } catch (error) {
            console.error("Role transition failed.", error?.code || "unknown");
            res.status(503).json({ error: "The role transition could not be completed. Retry with the same request ID." });
            return;
        }

        if (transition.kind === "completed") {
            res.status(transition.created ? 201 : 200).json({ user: transition.result });
            return;
        }
        if (transition.kind === "mismatch") {
            res.status(409).json({ error: "This request ID was already used with different inputs." });
            return;
        }
        if (transition.kind === "busy") {
            res.set("Retry-After", "2");
            res.status(409).json({ error: "This role transition is still processing. Retry shortly with the same request ID." });
            return;
        }
        if (transition.kind === "forbidden") {
            res.status(403).json({ error: "An active Admin account is required." });
            return;
        }
        if (transition.kind === "last-admin") {
            res.status(409).json({ error: "The last active Admin cannot be demoted or revoked." });
            return;
        }
        if (transition.kind === "governance-unavailable") {
            res.status(503).json({ error: "Admin governance state is unavailable. Contact the trusted local owner for reconciliation." });
            return;
        }
        if (transition.kind === "invalid-station") {
            res.status(400).json({ error: "An existing valid police station is required for an active Operator." });
            return;
        }
        if (transition.kind === "self-change") {
            res.status(403).json({ error: "Admins cannot change their own role or status." });
            return;
        }
        if (transition.kind === "conflict") {
            res.status(409).json({ error: "The account no longer has the state required for this transition." });
            return;
        }
        res.status(400).json({ error: "Invalid role transition." });
    };
}

async function verifyIdToken(token) {
    return getAuth(app).verifyIdToken(token, true);
}

async function getCallerRole(uid) {
    const snapshot = await db.collection("userRoles").doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
}

async function listRolePage({ limit, cursor }) {
    let query = db.collection("userRoles")
        .select("role", "status", "policeStationId")
        .orderBy(FieldPath.documentId());
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const documents = snapshot.docs.slice(0, limit);

    return {
        documents,
        nextCursor: hasMore ? documents[documents.length - 1].id : null
    };
}

async function listPoliceStations() {
    const snapshot = await db.collection("policeStations")
        .orderBy("name")
        .orderBy(FieldPath.documentId())
        .get();
    return snapshot.docs;
}

async function createPoliceStation(name) {
    const reference = db.collection("policeStations").doc();
    await reference.set({ name, createdAt: FieldValue.serverTimestamp() });
    return reference.get();
}

async function policeStationExists(stationId) {
    const snapshot = await db.collection("policeStations").doc(stationId).get();
    const name = snapshot.exists ? snapshot.data()?.name : null;
    return typeof name === "string" && name.trim().length > 0;
}

const operatorAuth = getAuth(app);
const operatorRequestHmacKey = process.env.OPERATOR_REQUEST_HMAC_KEY;
const operatorStore = createOperatorProvisioningStore({
    db,
    auth: operatorAuth,
    hashPassword: (password, context) => makePasswordFingerprint(password, context, operatorRequestHmacKey)
});

exports.ALLOWED_BROWSER_ORIGINS = ALLOWED_BROWSER_ORIGINS;
exports.createListUserRolesHandler = createListUserRolesHandler;
exports.createPoliceStationsHandler = createPoliceStationsHandler;
exports.createOperatorHandler = createOperatorHandler;
exports.createOperatorProvisioningStore = createOperatorProvisioningStore;
exports.createManageUserRoleHandler = createManageUserRoleHandler;
exports.createRoleTransitionStore = createRoleTransitionStore;
exports.policeStationExists = policeStationExists;
exports.validateOperatorRequest = validateOperatorRequest;
exports.validateRoleTransitionRequest = validateRoleTransitionRequest;
exports.saveFirMaster = onCall(
    { region: "us-central1" },
    createSaveFirMasterHandler({ db, FieldValue, HttpsError })
);
exports.manageUserRole = onRequest(
    { region: "us-central1" },
    createManageUserRoleHandler({
        verifyIdToken,
        getRole: getCallerRole,
        transitionStore: createRoleTransitionStore({ db, auth: operatorAuth })
    })
);
exports.listUserRoles = onRequest(
    { region: "us-central1" },
    createListUserRolesHandler({
        verifyIdToken,
        getRole: getCallerRole,
        listRolePage
    })
);
exports.policeStations = onRequest(
    { region: "us-central1" },
    createPoliceStationsHandler({
        verifyIdToken,
        getRole: getCallerRole,
        listStations: listPoliceStations,
        createStation: createPoliceStation
    })
);
exports.createOperator = onRequest(
    { region: "us-central1" },
    createOperatorHandler({
        verifyIdToken,
        getRole: getCallerRole,
        stationExists: policeStationExists,
        store: operatorStore,
        auth: operatorAuth,
        hashPassword: (password, context) => makePasswordFingerprint(password, context, operatorRequestHmacKey)
    })
);
