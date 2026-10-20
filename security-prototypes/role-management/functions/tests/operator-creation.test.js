import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp } from "firebase/app";
import {
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    getAuth as getClientAuth,
    getIdToken
} from "firebase/auth";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import {
    assertIsolatedEmulatorEnvironment,
    AUTH_EMULATOR_URL,
    FUNCTIONS_EMULATOR_URL
} from "../../tests/fixtures.js";

const localFunctionsEnv = readFileSync(new URL("../.env.demo-casetrack-role-prototype", import.meta.url), "utf8");
const localHmacKey = /^OPERATOR_REQUEST_HMAC_KEY=(.+)$/m.exec(localFunctionsEnv)?.[1];
if (!localHmacKey || Buffer.byteLength(localHmacKey, "utf8") < 32) {
    throw new Error("Generate the ignored local Functions environment file before running operator tests.");
}
process.env.OPERATOR_REQUEST_HMAC_KEY = localHmacKey;
const {
    createOperatorHandler,
    createOperatorProvisioningStore,
    policeStationExists
} = await import("../index.cjs");

const PROJECT_ID = "demo-casetrack-role-prototype";
const AUTH_EMULATOR = AUTH_EMULATOR_URL;
const STATIONS_ENDPOINT = `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/us-central1/policeStations`;
const OPERATOR_ENDPOINT = `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/us-central1/createOperator`;
const USERS_ENDPOINT = `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/us-central1/listUserRoles`;
const LOCAL_APP_ORIGIN = "http://127.0.0.1:5173";
const TEST_RUN_ID = randomUUID();

assertIsolatedEmulatorEnvironment();

const clientApp = initializeApp({
    apiKey: "emulator-only-key",
    authDomain: "127.0.0.1",
    projectId: PROJECT_ID,
    appId: "1:000000000000:web:operator-creation-tests"
}, "operator-creation-test-client");
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, AUTH_EMULATOR, { disableWarnings: true });
const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, "operator-creation-test-admin");
const adminAuth = getAdminAuth(adminApp);
const db = getAdminFirestore(adminApp);
let sequence = 0;
const testAdmins = [];
const stationIds = [];

before(async () => assertIsolatedEmulatorEnvironment());

beforeEach(async () => {
    await clientAuth.signOut();
});

afterEach(async () => {
    await Promise.all(testAdmins.map(async uid => {
        const requestCollection = db.collection("operatorCreationRequests").doc(uid).collection("requests");
        const requests = await requestCollection.get();
        await Promise.all(requests.docs.map(async request => {
            const targetUid = request.data().targetUid;
            if (targetUid) {
                await db.recursiveDelete(db.collection("userRoles").doc(targetUid));
                await adminAuth.deleteUser(targetUid).catch(error => {
                    if (error?.code !== "auth/user-not-found") throw error;
                });
            }
        }));
        await db.recursiveDelete(db.collection("operatorCreationRequests").doc(uid));
        await db.recursiveDelete(db.collection("userRoles").doc(uid));
        await adminAuth.deleteUser(uid).catch(error => {
            if (error?.code !== "auth/user-not-found") throw error;
        });
    }));
    testAdmins.length = 0;
    await Promise.all(stationIds.splice(0).map(id => db.collection("policeStations").doc(id).delete()));
});

after(async () => {
    await deleteApp(clientApp);
    await adminApp.delete();
});

async function createAdmin(role = { role: "admin", status: "active" }) {
    sequence += 1;
    const credential = await createUserWithEmailAndPassword(
        clientAuth,
        `operator-admin-${TEST_RUN_ID}-${sequence}@example.test`,
        "local-admin-password-123"
    );
    const uid = credential.user.uid;
    testAdmins.push(uid);
    if (role) await db.collection("userRoles").doc(uid).set(role);
    return { uid, token: await getIdToken(credential.user) };
}

async function createStation() {
    const reference = db.collection("policeStations").doc();
    await reference.set({ name: `Test Station ${TEST_RUN_ID}-${sequence}`, createdAt: new Date() });
    stationIds.push(reference.id);
    return reference.id;
}

async function makeRequest(admin, body, { endpoint = OPERATOR_ENDPOINT, method = "POST" } = {}) {
    return fetch(endpoint, {
        method,
        headers: {
            Authorization: `Bearer ${admin?.token || ""}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(body?.requestId ? { "Idempotency-Key": body.requestId } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
}

async function setupRequest() {
    const admin = await createAdmin();
    const policeStationId = await createStation();
    const requestId = randomUUID();
    const body = {
        email: `operator-${TEST_RUN_ID}-${sequence}@example.test`,
        password: "local-operator-password-123",
        policeStationId,
        requestId
    };
    return { admin, policeStationId, body };
}

function hashPassword(password, context) {
    const contextText = [context.actorUid, context.requestId, context.email, context.policeStationId].join("\0");
    return createHmac("sha256", localHmacKey).update(contextText).update("\0").update(password).digest("hex");
}

function responseRecorder() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        removeHeader(name) { delete this.headers[name]; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; }
    };
}

function buildInjectedHandler(admin, policeStationId, { auth = adminAuth, store = null } = {}) {
    const actualStore = store || createOperatorProvisioningStore({ db, auth: adminAuth, hashPassword });
    return createOperatorHandler({
        verifyIdToken: async () => ({ uid: admin.uid }),
        getRole: async uid => (await db.collection("userRoles").doc(uid).get()).data() || null,
        stationExists: async id => id === policeStationId
            && (await db.collection("policeStations").doc(id).get()).exists,
        store: actualStore,
        auth,
        hashPassword
    });
}

test("only a signed-in active admin can create operators", async () => {
    const stationId = await createStation();
    assert.equal((await makeRequest(null, {
        email: "unauth@example.test", password: "local-operator-password-123",
        policeStationId: stationId, requestId: randomUUID()
    })).status, 401);

    const operator = await createAdmin({ role: "operator", status: "active" });
    assert.equal((await makeRequest(operator, {
        email: "operator@example.test", password: "local-operator-password-123",
        policeStationId: stationId, requestId: randomUUID()
    })).status, 403);

    const revokedAdmin = await createAdmin({ role: "admin", status: "revoked" });
    assert.equal((await makeRequest(revokedAdmin, {
        email: "revoked@example.test", password: "local-operator-password-123",
        policeStationId: stationId, requestId: randomUUID()
    })).status, 403);
});

test("server validation rejects malformed input, weak passwords, unknown stations, and client authority fields", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const invalidBodies = [
        { ...body, email: "not-an-email" },
        { ...body, password: "short" },
        { ...body, password: "p".repeat(129) },
        { ...body, policeStationId: "missing-station" },
        { ...body, policeStationId: "" },
        { ...body, uid: "client-selected-uid" },
        { ...body, role: "admin" },
        { ...body, status: "revoked" },
        { ...body, actorUid: admin.uid },
        { ...body, eventId: randomUUID() }
    ];
    for (const invalid of invalidBodies) {
        const response = await makeRequest(admin, invalid);
        assert.equal(response.status, 400);
    }
    assert.equal((await db.collection("policeStations").doc(policeStationId).get()).exists, true);
});

test("operator assignment rejects a station record with an empty or whitespace-only name", async () => {
    const emptyStationId = `malformed-empty-${TEST_RUN_ID}`;
    const blankStationId = `malformed-blank-${TEST_RUN_ID}`;
    stationIds.push(emptyStationId, blankStationId);
    await db.collection("policeStations").doc(emptyStationId).set({ name: "" });
    await db.collection("policeStations").doc(blankStationId).set({ name: "   " });

    assert.equal(await policeStationExists(emptyStationId), false);
    assert.equal(await policeStationExists(blankStationId), false);

    const { admin, body } = await setupRequest();
    for (const stationId of [emptyStationId, blankStationId]) {
        const response = await makeRequest(admin, { ...body, policeStationId: stationId });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: "The selected police station does not exist." });
    }
});

test("password limits accept both 12 and 128 characters", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    for (const length of [12, 128]) {
        const response = await makeRequest(admin, {
            ...body,
            email: `operator-password-${length}-${TEST_RUN_ID}-${sequence}@example.test`,
            password: "p".repeat(length),
            requestId: randomUUID()
        });
        assert.equal(response.status, 201);
    }
});

test("creation writes an active operator, UUID assignment event, and enabled emulator Auth account without governance writes", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const governanceBefore = await db.collection("systemControl").doc("adminGovernance").get();
    const response = await makeRequest(admin, body);
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload), ["operator"]);
    const { uid } = payload.operator;
    assert.deepEqual(payload.operator, {
        uid,
        role: "operator",
        status: "active",
        policeStationId
    });

    const role = await db.collection("userRoles").doc(uid).get();
    assert.deepEqual(Object.keys(role.data()).sort(), [
        "createdAt", "createdBy", "policeStationId", "role", "status", "updatedAt", "updatedBy"
    ]);
    assert.equal(role.data().role, "operator");
    assert.equal(role.data().status, "active");
    assert.equal(role.data().policeStationId, policeStationId);
    assert.equal(role.data().createdBy, admin.uid);
    assert.equal(role.data().updatedBy, admin.uid);
    const history = await role.ref.collection("history").get();
    assert.equal(history.size, 1);
    assert.match(history.docs[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.deepEqual({
        action: history.docs[0].data().action,
        previousRole: history.docs[0].data().previousRole,
        newRole: history.docs[0].data().newRole,
        actorUid: history.docs[0].data().actorUid
    }, { action: "assigned", previousRole: null, newRole: "operator", actorUid: admin.uid });
    assert.equal(typeof history.docs[0].data().occurredAt.toDate, "function");
    const governanceAfter = await db.collection("systemControl").doc("adminGovernance").get();
    assert.equal(governanceAfter.exists, governanceBefore.exists);
    assert.deepEqual(governanceAfter.data(), governanceBefore.data());
    assert.equal((await adminAuth.getUser(uid)).disabled, false);

    const usersResponse = await makeRequest(admin, null, { endpoint: USERS_ENDPOINT, method: "GET" });
    const users = await usersResponse.json();
    assert.equal(users.users.some(user => user.uid === uid && user.policeStationId === policeStationId), true);
});

test("station creation, listing, and Operator assignment work end to end", async () => {
    const admin = await createAdmin();
    const stationResponse = await makeRequest(admin, {
        name: `End-to-end Station ${TEST_RUN_ID}`
    }, { endpoint: STATIONS_ENDPOINT });
    assert.equal(stationResponse.status, 201);
    const { station } = await stationResponse.json();
    stationIds.push(station.id);

    const listedStationsResponse = await makeRequest(admin, null, {
        endpoint: STATIONS_ENDPOINT,
        method: "GET"
    });
    assert.equal(listedStationsResponse.status, 200);
    const { stations } = await listedStationsResponse.json();
    assert.equal(stations.some(item => item.id === station.id && item.name === station.name), true);

    const body = {
        email: `operator-e2e-${TEST_RUN_ID}@example.test`,
        password: "local-operator-e2e-password-123",
        policeStationId: station.id,
        requestId: randomUUID()
    };
    const response = await makeRequest(admin, body);
    assert.equal(response.status, 201);
    const { operator } = await response.json();
    assert.equal(typeof operator.uid, "string");
    assert.deepEqual(operator, {
        uid: operator.uid,
        role: "operator",
        status: "active",
        policeStationId: station.id
    });

    const authUser = await adminAuth.getUser(operator.uid);
    assert.equal(authUser.disabled, false);
    const role = await db.collection("userRoles").doc(operator.uid).get();
    assert.equal(role.data().policeStationId, station.id);
    const history = await role.ref.collection("history").get();
    assert.equal(history.size, 1);
    assert.equal(history.docs[0].data().newRole, "operator");
    assert.equal(history.docs[0].data().actorUid, admin.uid);
});

test("duplicate email is rejected without attaching a role to the existing account", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const existing = await adminAuth.createUser({ email: body.email, password: body.password });
    const response = await makeRequest(admin, body);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "An account with this email already exists." });
    assert.equal((await db.collection("userRoles").doc(existing.uid).get()).exists, false);
});

test("same request ID is idempotent and reuse with changed email, station, or password is rejected", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const firstResponse = await makeRequest(admin, body);
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 201);
    const retry = await makeRequest(admin, body);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).operator.uid, first.operator.uid);

    const differentStation = await createStation();
    for (const changed of [
        { ...body, email: `different-${body.email}` },
        { ...body, policeStationId: differentStation },
        { ...body, password: "different-operator-password-123" }
    ]) {
        const mismatch = await makeRequest(admin, changed);
        assert.equal(mismatch.status, 409);
        assert.match((await mismatch.json()).error, /different inputs/);
    }
    const requests = await db.collection("operatorCreationRequests").doc(admin.uid).collection("requests").get();
    assert.equal(requests.size, 1);
});

test("injected auth creation failure is safe to retry", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const failingAuth = {
        ...adminAuth,
        getUser: adminAuth.getUser.bind(adminAuth),
        updateUser: adminAuth.updateUser.bind(adminAuth),
        createUser: async () => { const error = new Error("injected"); error.code = "auth/internal-error"; throw error; }
    };
    const handler = buildInjectedHandler(admin, policeStationId, { auth: failingAuth });
    const response = responseRecorder();
    await handler({
        method: "POST",
        headers: { authorization: "Bearer test-token", "idempotency-key": body.requestId },
        body
    }, response);
    assert.equal(response.statusCode, 503);
    const request = await db.collection("operatorCreationRequests").doc(admin.uid)
        .collection("requests").doc(body.requestId).get();
    assert.equal((await adminAuth.getUser(request.data().targetUid).catch(() => null)), null);

    const retry = await makeRequest(admin, body);
    assert.equal(retry.status, 201);
});

test("injected role/history write failure leaves the created account disabled and retryable", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const store = createOperatorProvisioningStore({ db, auth: adminAuth, hashPassword });
    const failingStore = {
        ...store,
        commitRoleAndHistory: async () => { throw new Error("injected role write failure"); }
    };
    const handler = buildInjectedHandler(admin, policeStationId, { store: failingStore });
    const response = responseRecorder();
    await handler({
        method: "POST",
        headers: { authorization: "Bearer test-token", "idempotency-key": body.requestId },
        body
    }, response);
    assert.equal(response.statusCode, 503);
    const request = await db.collection("operatorCreationRequests").doc(admin.uid)
        .collection("requests").doc(body.requestId).get();
    assert.equal((await adminAuth.getUser(request.data().targetUid)).disabled, true);
    assert.equal((await db.collection("userRoles").doc(request.data().targetUid).get()).exists, false);
    assert.equal([200, 201].includes((await makeRequest(admin, body)).status), true);
});

test("injected auth enablement failure disables the account and retry completes provisioning", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    let failEnable = true;
    const failingAuth = {
        getUser: adminAuth.getUser.bind(adminAuth),
        createUser: adminAuth.createUser.bind(adminAuth),
        updateUser: async (uid, properties) => {
            if (properties.disabled === false && failEnable) {
                failEnable = false;
                const error = new Error("injected enable failure"); error.code = "auth/internal-error"; throw error;
            }
            return adminAuth.updateUser(uid, properties);
        }
    };
    const handler = buildInjectedHandler(admin, policeStationId, { auth: failingAuth });
    const response = responseRecorder();
    await handler({
        method: "POST",
        headers: { authorization: "Bearer test-token", "idempotency-key": body.requestId },
        body
    }, response);
    assert.equal(response.statusCode, 503);
    const request = await db.collection("operatorCreationRequests").doc(admin.uid)
        .collection("requests").doc(body.requestId).get();
    assert.equal((await adminAuth.getUser(request.data().targetUid)).disabled, true);
    assert.equal((await db.collection("userRoles").doc(request.data().targetUid).get()).exists, true);
    assert.equal([200, 201].includes((await makeRequest(admin, body)).status), true);
    assert.equal((await adminAuth.getUser(request.data().targetUid)).disabled, false);
});

test("failed disable recovery records reconciliation required while the account remains disabled", async () => {
    const { admin, policeStationId, body } = await setupRequest();
    const failingAuth = {
        getUser: adminAuth.getUser.bind(adminAuth),
        createUser: adminAuth.createUser.bind(adminAuth),
        updateUser: async (uid, properties) => {
            const error = new Error("injected Auth update failure");
            error.code = "auth/internal-error";
            throw error;
        }
    };
    const handler = buildInjectedHandler(admin, policeStationId, { auth: failingAuth });
    const response = responseRecorder();
    await handler({
        method: "POST",
        headers: { authorization: "Bearer test-token", "idempotency-key": body.requestId },
        body
    }, response);
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /reconciliation/);
    const request = await db.collection("operatorCreationRequests").doc(admin.uid)
        .collection("requests").doc(body.requestId).get();
    assert.equal(request.data().phase, "reconciliation_required");
    assert.equal((await adminAuth.getUser(request.data().targetUid)).disabled, true);
    assert.equal((await makeRequest(admin, body)).status, 200);
});

test("journal failures after Auth creation and after enablement preserve a safe retry path", async () => {
    for (const failPhase of ["auth_created", "completed"]) {
        const { admin, policeStationId, body } = await setupRequest();
        const store = createOperatorProvisioningStore({ db, auth: adminAuth, hashPassword });
        let failed = false;
        const failingStore = {
            ...store,
            updateOperation: async (reference, leaseToken, fields) => {
                if (!failed && fields.phase === failPhase) {
                    failed = true;
                    throw new Error("injected journal failure");
                }
                return store.updateOperation(reference, leaseToken, fields);
            }
        };
        const handler = buildInjectedHandler(admin, policeStationId, { store: failingStore });
        const response = responseRecorder();
        await handler({
            method: "POST",
            headers: { authorization: "Bearer test-token", "idempotency-key": body.requestId },
            body
        }, response);
        assert.equal(response.statusCode, 503);
        const request = await db.collection("operatorCreationRequests").doc(admin.uid)
            .collection("requests").doc(body.requestId).get();
        assert.equal((await adminAuth.getUser(request.data().targetUid)).disabled, true);
        assert.equal([200, 201].includes((await makeRequest(admin, body)).status), true);
    }
});

test("CORS permits the idempotency header only from the configured local origin", async () => {
    const { admin, body } = await setupRequest();
    const allowed = await fetch(OPERATOR_ENDPOINT, {
        method: "OPTIONS",
        headers: {
            Origin: LOCAL_APP_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type,idempotency-key"
        }
    });
    assert.equal(allowed.status, 204);
    assert.match(allowed.headers.get("access-control-allow-headers"), /Idempotency-Key/);
    const blocked = await fetch(OPERATOR_ENDPOINT, {
        method: "POST",
        headers: { Origin: "https://example.com", Authorization: `Bearer ${admin.token}`,
            "Content-Type": "application/json", "Idempotency-Key": body.requestId },
        body: JSON.stringify(body)
    });
    assert.equal(blocked.status, 403);
});
