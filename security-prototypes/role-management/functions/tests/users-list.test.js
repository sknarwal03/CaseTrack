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
import {
    ALLOWED_BROWSER_ORIGINS,
    createListUserRolesHandler
} from "../index.cjs";

const PROJECT_ID = "demo-casetrack-role-prototype";
const AUTH_EMULATOR = AUTH_EMULATOR_URL;
const FUNCTIONS_ENDPOINT = `${FUNCTIONS_EMULATOR_URL}/${PROJECT_ID}/us-central1/listUserRoles`;
const LOCAL_APP_ORIGIN = "http://127.0.0.1:5173";
const TEST_RUN_ID = randomUUID();

assertIsolatedEmulatorEnvironment();

const clientApp = initializeApp({
    apiKey: "emulator-only-key",
    authDomain: "127.0.0.1",
    projectId: PROJECT_ID,
    appId: "1:000000000000:web:casetrack-role-endpoint-tests"
}, "role-list-test-client");
const clientAuth = getClientAuth(clientApp);
connectAuthEmulator(clientAuth, AUTH_EMULATOR, { disableWarnings: true });

const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, "role-list-test-admin");
const adminAuth = getAdminAuth(adminApp);
const db = getAdminFirestore(adminApp);
let emailSequence = 0;
const createdUserIds = [];
const createdRoleIds = [];

before(async () => {
    assertIsolatedEmulatorEnvironment();
});

beforeEach(async () => {
    createdUserIds.length = 0;
    createdRoleIds.length = 0;
    await clientAuth.signOut();
});

afterEach(async () => {
    await Promise.all([...new Set(createdRoleIds)].map(uid =>
        db.recursiveDelete(db.collection("userRoles").doc(uid))
    ));
    await Promise.all(createdUserIds.map(async uid => {
        await adminAuth.deleteUser(uid).catch(error => {
            if (error?.code !== "auth/user-not-found") throw error;
        });
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
        `role-list-${TEST_RUN_ID}-${emailSequence}@example.test`,
        "local-emulator-password"
    );
    createdUserIds.push(credential.user.uid);
    if (roleData) {
        createdRoleIds.push(credential.user.uid);
        await db.collection("userRoles").doc(credential.user.uid).set(roleData);
    }
    return {
        uid: credential.user.uid,
        token: await getIdToken(credential.user)
    };
}

async function createTestRole(uid, data) {
    createdRoleIds.push(uid);
    await db.collection("userRoles").doc(uid).set(data);
}

async function callEndpoint(token, params = {}, origin) {
    const url = new URL(FUNCTIONS_ENDPOINT);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (origin) headers.Origin = origin;
    return fetch(url, { headers });
}

test("active admin can list role records without a station assignment", async () => {
    const initialRoleCount = (await db.collection("userRoles").get()).size;
    const caller = await createCaller({ role: "admin", status: "active" });
    const operatorUid = `role-list-${TEST_RUN_ID}-operator-a`;
    await createTestRole(operatorUid, {
        role: "operator",
        status: "active",
        policeStationId: "station-a"
    });

    const response = await callEndpoint(caller.token);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.users.some(record => record.uid === caller.uid), true);
    assert.equal(payload.users.some(record => record.uid === operatorUid), true);
    if (initialRoleCount + 2 > 50) {
        assert.equal(typeof payload.nextPageToken, "string");
    } else {
        assert.equal(payload.nextPageToken, null);
    }
});

test("authorization is checked again on each request", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const allowedResponse = await callEndpoint(caller.token);
    assert.equal(allowedResponse.status, 200);

    await db.collection("userRoles").doc(caller.uid).update({ status: "revoked" });
    const deniedResponse = await callEndpoint(caller.token);
    assert.equal(deniedResponse.status, 403);
});

test("operator and inactive admin callers are forbidden", async () => {
    const operator = await createCaller({ role: "operator", status: "active" });
    const operatorResponse = await callEndpoint(operator.token);
    assert.equal(operatorResponse.status, 403);
    assert.deepEqual(await operatorResponse.json(), { error: "Forbidden." });

    const inactiveAdmin = await createCaller({ role: "admin", status: "revoked" });
    const inactiveResponse = await callEndpoint(inactiveAdmin.token);
    assert.equal(inactiveResponse.status, 403);
    assert.deepEqual(await inactiveResponse.json(), { error: "Forbidden." });
});

test("malformed Admin role records are forbidden by the server authorization check", async () => {
    for (const roleData of [
        { role: "Admin", status: "active" },
        { role: "admin", status: 1 },
        { role: ["admin"], status: "active" },
        { role: "admin", status: "active", policeStationId: { id: "station-a" } }
    ]) {
        const caller = await createCaller(roleData);
        const response = await callEndpoint(caller.token);
        assert.equal(response.status, 403, `Unexpectedly authorized role record: ${JSON.stringify(roleData)}`);
        assert.deepEqual(await response.json(), { error: "Forbidden." });
    }
});

test("unauthenticated and invalid-token callers are unauthorized", async () => {
    const missingResponse = await callEndpoint(null);
    assert.equal(missingResponse.status, 401);

    const invalidResponse = await callEndpoint("not-a-valid-token");
    assert.equal(invalidResponse.status, 401);
});

test("caller without a role record is forbidden", async () => {
    const caller = await createCaller(null);
    const response = await callEndpoint(caller.token);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden." });
});

test("response allowlists role record fields and uses document ID as UID", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const listedOperatorUid = `role-list-${TEST_RUN_ID}-listed-operator`;
    await createTestRole(listedOperatorUid, {
        role: "operator",
        status: "active",
        policeStationId: "station-a",
        policeStationName: "Private station label",
        createdAt: "private metadata",
        createdBy: "private-actor"
    });

    const response = await callEndpoint(caller.token);
    assert.equal(response.status, 200);
    const payload = await response.json();
    const record = payload.users.find(item => item.uid === listedOperatorUid);
    assert.deepEqual(Object.keys(record).sort(), ["policeStationId", "role", "status", "uid"]);
    assert.deepEqual(record, {
        uid: listedOperatorUid,
        role: "operator",
        status: "active",
        policeStationId: "station-a"
    });
});

test("pagination is bounded and returns distinct ordered pages", async () => {
    const initialRoleCount = (await db.collection("userRoles").get()).size;
    const caller = await createCaller({ role: "admin", status: "active" });
    for (const suffix of ["page-a", "page-b", "page-c", "page-d", "page-e"]) {
        await createTestRole(`role-list-${TEST_RUN_ID}-${suffix}`, { role: "operator", status: "active" });
    }

    const firstResponse = await callEndpoint(caller.token, { limit: "2" });
    assert.equal(firstResponse.status, 200);
    const firstPage = await firstResponse.json();
    assert.equal(firstPage.users.length, 2);
    assert.ok(firstPage.nextPageToken);

    const secondResponse = await callEndpoint(caller.token, {
        limit: "2",
        pageToken: firstPage.nextPageToken
    });
    assert.equal(secondResponse.status, 200);
    const secondPage = await secondResponse.json();

    const allPages = [...firstPage.users, ...secondPage.users];
    let nextPageToken = secondPage.nextPageToken;
    while (nextPageToken) {
        const response = await callEndpoint(caller.token, { limit: "2", pageToken: nextPageToken });
        assert.equal(response.status, 200);
        const page = await response.json();
        assert.ok(page.users.length <= 2);
        allPages.push(...page.users);
        nextPageToken = page.nextPageToken;
    }

    const uids = allPages.map(record => record.uid);
    assert.equal(new Set(uids).size, uids.length);
    assert.equal(uids.length, initialRoleCount + 6);
    assert.deepEqual(uids, [...uids].sort());
});

test("default page size is 50 and maximum page size is 100", async () => {
    const initialRoleCount = (await db.collection("userRoles").get()).size;
    const caller = await createCaller({ role: "admin", status: "active" });
    const batch = db.batch();
    for (let index = 0; index < 55; index += 1) {
        const uid = `role-list-${TEST_RUN_ID}-bounded-${String(index).padStart(2, "0")}`;
        createdRoleIds.push(uid);
        batch.set(db.collection("userRoles").doc(uid), {
            role: "operator",
            status: "active"
        });
    }
    await batch.commit();

    const defaultResponse = await callEndpoint(caller.token);
    assert.equal(defaultResponse.status, 200);
    const defaultPage = await defaultResponse.json();
    assert.equal(defaultPage.users.length, 50);
    assert.ok(defaultPage.nextPageToken);

    const maximumResponse = await callEndpoint(caller.token, { limit: "100" });
    assert.equal(maximumResponse.status, 200);
    const maximumPage = await maximumResponse.json();
    const expectedRoleCount = initialRoleCount + 56;
    assert.equal(maximumPage.users.length, Math.min(100, expectedRoleCount));
    if (expectedRoleCount > 100) {
        assert.equal(typeof maximumPage.nextPageToken, "string");
    } else {
        assert.equal(maximumPage.nextPageToken, null);
    }
});

test("invalid pagination parameters return a generic 400", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    for (const params of [{ limit: "0" }, { limit: "101" }, { limit: "abc" }, { pageToken: "!" }]) {
        const response = await callEndpoint(caller.token, params);
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: "Invalid pagination parameters." });
    }
});

test("role and listing read failures return a generic 500", async () => {
    const responses = [];
    const makeResponse = () => {
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
            }
        };
        responses.push(response);
        return response;
    };

    const token = "test-token";
    const roleReadFailureHandler = createListUserRolesHandler({
        verifyIdToken: async () => ({ uid: "admin-uid" }),
        getRole: async () => {
            throw new Error("private Firestore failure");
        },
        listRolePage: async () => ({ documents: [], nextCursor: null })
    });
    await roleReadFailureHandler(
        { method: "GET", headers: { authorization: `Bearer ${token}` }, query: {} },
        makeResponse()
    );

    const listingFailureHandler = createListUserRolesHandler({
        verifyIdToken: async () => ({ uid: "admin-uid" }),
        getRole: async () => ({ role: "admin", status: "active" }),
        listRolePage: async () => {
            throw new Error("private query failure");
        }
    });
    const tokenVerificationFailureHandler = createListUserRolesHandler({
        verifyIdToken: async () => {
            throw new Error("private authentication-service failure");
        },
        getRole: async () => ({ role: "admin", status: "active" }),
        listRolePage: async () => ({ documents: [], nextCursor: null })
    });
    await listingFailureHandler(
        { method: "GET", headers: { authorization: `Bearer ${token}` }, query: {} },
        makeResponse()
    );
    await tokenVerificationFailureHandler(
        { method: "GET", headers: { authorization: `Bearer ${token}` }, query: {} },
        makeResponse()
    );

    assert.equal(responses[0].statusCode, 500);
    assert.equal(responses[1].statusCode, 500);
    assert.equal(responses[2].statusCode, 500);
    assert.deepEqual(responses[0].body, { error: "Unable to list user roles." });
    assert.deepEqual(responses[1].body, { error: "Unable to list user roles." });
    assert.deepEqual(responses[2].body, { error: "Unable to verify authentication." });
});

test("request rejects unsupported methods", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const response = await fetch(FUNCTIONS_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${caller.token}` }
    });
    assert.equal(response.status, 405);
});

test("CORS uses the explicit local-origin allowlist and rejects other origins", async () => {
    assert.deepEqual(ALLOWED_BROWSER_ORIGINS, [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:5174"
    ]);

    const response = {
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
    };
    const handler = createListUserRolesHandler({
        verifyIdToken: async () => ({ uid: "active-admin" }),
        getRole: async () => ({ role: "admin", status: "active" }),
        listRolePage: async () => ({ documents: [], nextCursor: null })
    });

    await handler({
        method: "GET",
        headers: { origin: LOCAL_APP_ORIGIN, authorization: "Bearer test-token" },
        query: {}
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Access-Control-Allow-Origin"], LOCAL_APP_ORIGIN);
    assert.equal(response.headers["Access-Control-Allow-Headers"], "Authorization");

    response.statusCode = 200;
    response.headers = {};
    await handler({
        method: "GET",
        headers: { origin: "http://127.0.0.1:5174", authorization: "Bearer local-test-token" },
        query: {}
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5174");

    response.statusCode = 200;
    response.headers = { "Access-Control-Allow-Origin": "https://example.com" };
    await handler({
        method: "GET",
        headers: { origin: "https://example.com", authorization: "Bearer test-token" },
        query: {}
    }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers["Access-Control-Allow-Origin"], undefined);
});

test("CORS preflight allows only GET and Authorization from configured local origins", async () => {
    const response = {
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
        json(body) {
            this.body = body;
            return this;
        },
        end() {
            this.ended = true;
        }
    };
    const handler = createListUserRolesHandler({
        verifyIdToken: async () => ({ uid: "active-admin" }),
        getRole: async () => ({ role: "admin", status: "active" }),
        listRolePage: async () => ({ documents: [], nextCursor: null })
    });

    await handler({
        method: "OPTIONS",
        headers: {
            origin: LOCAL_APP_ORIGIN,
            "access-control-request-method": "GET",
            "access-control-request-headers": "authorization"
        },
        query: {}
    }, response);
    assert.equal(response.statusCode, 204);
    assert.equal(response.ended, true);
    assert.equal(response.headers["Access-Control-Allow-Origin"], LOCAL_APP_ORIGIN);

    response.statusCode = 200;
    response.ended = false;
    await handler({
        method: "OPTIONS",
        headers: {
            origin: LOCAL_APP_ORIGIN,
            "access-control-request-method": "POST",
            "access-control-request-headers": "authorization"
        },
        query: {}
    }, response);
    assert.equal(response.statusCode, 403);
});

test("Functions Emulator CORS allows configured browser origin and rejects others", async () => {
    const caller = await createCaller({ role: "admin", status: "active" });
    const allowedPreflight = await fetch(FUNCTIONS_ENDPOINT, {
        method: "OPTIONS",
        headers: {
            Origin: LOCAL_APP_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization"
        }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get("access-control-allow-origin"), LOCAL_APP_ORIGIN);
    assert.equal(allowedPreflight.headers.get("access-control-allow-methods"), "GET, OPTIONS");
    assert.equal(allowedPreflight.headers.get("access-control-allow-headers"), "Authorization");

    const blockedPreflight = await fetch(FUNCTIONS_ENDPOINT, {
        method: "OPTIONS",
        headers: {
            Origin: "https://example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization"
        }
    });
    assert.equal(blockedPreflight.status, 403);
    assert.equal(blockedPreflight.headers.get("access-control-allow-origin"), null);
    assert.equal(await blockedPreflight.json().then(payload => payload.error), "Forbidden.");

    const blockedGet = await callEndpoint(caller.token, {}, "https://example.com");
    assert.equal(blockedGet.status, 403);
    assert.equal(blockedGet.headers.get("access-control-allow-origin"), null);
});
