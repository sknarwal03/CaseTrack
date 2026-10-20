import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
import { createListUserRolesHandler, createPoliceStationsHandler } from "../index.cjs";

const PROJECT_ID = "demo-casetrack-role-prototype";
const AUTH_EMULATOR = AUTH_EMULATOR_URL;
const FUNCTIONS_ENDPOINT = `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/us-central1/policeStations`;
const LOCAL_APP_ORIGIN = "http://127.0.0.1:5173";
const TEST_RUN_ID = randomUUID();

assertIsolatedEmulatorEnvironment();

const clientApp = initializeApp({
    apiKey: "emulator-only-key",
    authDomain: "127.0.0.1",
    projectId: PROJECT_ID,
    appId: "1:000000000000:web:police-station-tests"
}, "police-stations-test-client");
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, AUTH_EMULATOR, { disableWarnings: true });

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, "police-stations-test-admin");
const adminAuth = getAdminAuth(adminApp);
const db = getAdminFirestore(adminApp);
let emailSequence = 0;
const createdStationIds = [];
const createdUserIds = [];

before(async () => {
    assertIsolatedEmulatorEnvironment();
});

beforeEach(async () => {
    createdStationIds.length = 0;
    createdUserIds.length = 0;
    await clientAuth.signOut();
});

afterEach(async () => {
    await Promise.all(createdStationIds.map(id => db.collection("policeStations").doc(id).delete()));
    await Promise.all(createdUserIds.map(async uid => {
        await db.collection("userRoles").doc(uid).delete();
        await adminAuth.deleteUser(uid);
    }));
});

after(async () => {
    await deleteApp(clientApp);
    await adminApp.delete();
});

async function createCaller(roleData) {
    emailSequence += 1;
    const credential = await createUserWithEmailAndPassword(
        clientAuth,
        `station-admin-${TEST_RUN_ID}-${emailSequence}@example.test`,
        "local-emulator-password"
    );
    if (roleData) {
        await db.collection("userRoles").doc(credential.user.uid).set(roleData);
    }
    createdUserIds.push(credential.user.uid);
    return { uid: credential.user.uid, token: await getIdToken(credential.user) };
}

async function postStation(token, name) {
    const response = await callEndpoint(token, { method: "POST", body: { name } });
    if (response.status === 201) {
        const { station } = await response.clone().json();
        createdStationIds.push(station.id);
    }
    return response;
}

async function callEndpoint(token, { method = "GET", body, origin } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (origin) headers.Origin = origin;
    return fetch(FUNCTIONS_ENDPOINT, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
}

test("only an active admin can create or list stations", async () => {
    assert.equal((await callEndpoint(null)).status, 401);

    const operator = await createCaller({ role: "operator", status: "active" });
    assert.equal((await callEndpoint(operator.token, {
        method: "POST",
        body: { name: "Central Police Station" }
    })).status, 403);

    const admin = await createCaller({ role: "admin", status: "active" });
    assert.equal((await callEndpoint(admin.token)).status, 200);
    await db.collection("userRoles").doc(admin.uid).update({ status: "revoked" });
    assert.equal((await callEndpoint(admin.token)).status, 403);
});

test("station creation rejects empty, invalid, overlong, and extra-field input", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const existing = await db.collection("policeStations").get();
    const existingIds = new Set(existing.docs.map(document => document.id));
    const invalidBodies = [
        {},
        { name: "   " },
        { name: 12 },
        { name: "x".repeat(121) },
        { name: "Central\u0000Station" },
        { name: "Central Station", id: "client-chosen-id" }
    ];

    for (const body of invalidBodies) {
        const response = await callEndpoint(caller.token, { method: "POST", body });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: "Invalid police station name." });
    }
    const after = await db.collection("policeStations").get();
    assert.deepEqual(after.docs.map(document => document.id).filter(id => !existingIds.has(id)), []);
});

test("creation canonicalizes the name and uses a backend-generated stable ID", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const response = await postStation(caller.token, "  Central   Police Station  ");

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.station.name, "Central Police Station");
    assert.equal(typeof payload.station.id, "string");
    assert.notEqual(payload.station.id, payload.station.name);
    assert.equal(typeof payload.station.createdAt, "string");

    const saved = await db.collection("policeStations").doc(payload.station.id).get();
    assert.equal(saved.exists, true);
    assert.deepEqual(Object.keys(saved.data()).sort(), ["createdAt", "name"]);
    assert.equal(saved.data().name, "Central Police Station");
    assert.equal(typeof saved.data().createdAt.toDate, "function");
});

test("listing returns saved stations with the same stable IDs", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const created = [];
    for (const name of [`North Police Station ${TEST_RUN_ID}`, `South Police Station ${TEST_RUN_ID}`]) {
        const response = await postStation(caller.token, name);
        assert.equal(response.status, 201);
        created.push((await response.json()).station);
    }

    const response = await callEndpoint(caller.token);
    assert.equal(response.status, 200);
    const { stations } = await response.json();
    for (const station of created) {
        const listed = stations.find(item => item.name === station.name);
        assert.ok(listed);
        assert.equal(listed.id, station.id);
        assert.equal(listed.createdAt, station.createdAt);
    }
});

test("station endpoint CORS allows the local app origin and JSON requests only", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const preflight = await fetch(FUNCTIONS_ENDPOINT, {
        method: "OPTIONS",
        headers: {
            Origin: LOCAL_APP_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"
        }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), LOCAL_APP_ORIGIN);
    assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "Authorization, Content-Type");

    const blocked = await callEndpoint(caller.token, {
        method: "POST",
        body: { name: "Central Police Station" },
        origin: "https://example.com"
    });
    assert.equal(blocked.status, 403);
});

test("handler maps trusted listing and creation failures to generic errors", async () => {
    const response = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        set() {},
        removeHeader() {},
        end() {}
    };
    const handler = createPoliceStationsHandler({
        verifyIdToken: async () => ({ uid: "active-admin" }),
        getRole: async () => ({ role: "admin", status: "active" }),
        listStations: async () => { throw new Error("private read failure"); },
        createStation: async () => { throw new Error("private write failure"); }
    });

    await handler({ method: "GET", headers: { authorization: "Bearer token" } }, response);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Unable to list police stations." });

    response.statusCode = 200;
    response.body = null;
    await handler({
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: { name: "Central Police Station" }
    }, response);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Unable to create police station." });
});

test("shared request guard preserves Users endpoint authorization and CORS behavior", async () => {
    const makeResponse = () => ({
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        removeHeader(name) {
            delete this.headers[name];
        },
        json(body) {
            this.body = body;
            return this;
        },
        end() {}
    });
    const handler = createListUserRolesHandler({
        verifyIdToken: async () => ({ uid: "active-admin" }),
        getRole: async () => ({ role: "admin", status: "active" }),
        listRolePage: async () => ({ documents: [], nextCursor: null })
    });

    const unauthorized = makeResponse();
    await handler({ method: "GET", headers: {}, query: {} }, unauthorized);
    assert.equal(unauthorized.statusCode, 401);

    const allowed = makeResponse();
    await handler({
        method: "GET",
        headers: { origin: LOCAL_APP_ORIGIN, authorization: "Bearer test-token" },
        query: {}
    }, allowed);
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
    assert.deepEqual(allowed.body, { users: [], nextPageToken: null });
});
