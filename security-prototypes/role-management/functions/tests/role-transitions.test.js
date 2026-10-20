import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { assertIsolatedEmulatorEnvironment } from "../../tests/fixtures.js";
import {
    createManageUserRoleHandler,
    createRoleTransitionStore,
    validateRoleTransitionRequest
} from "../index.cjs";

assertIsolatedEmulatorEnvironment();

const PROJECT_ID = "demo-casetrack-role-prototype";
const app = initializeApp({ projectId: PROJECT_ID }, "role-transition-tests");
const auth = getAuth(app);
let sequence = 0;

function responseRecorder() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) { this.statusCode = code; return this; },
        set(name, value) { this.headers[name] = value; return this; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; }
    };
}

async function withScenario({
    targetRole = "operator",
    targetStatus = "active",
    stationValid = true,
    authAdapter = auth
} = {}, run) {
    sequence += 1;
    const testId = randomUUID();
    const databaseId = `role-test-${sequence}-${randomUUID().slice(0, 8)}`;
    const db = getFirestore(app, databaseId);
    const actorUid = `actor-${testId}`;
    const targetUid = `target-${testId}`;
    const stationId = `station-${testId}`;
    const createdUsers = [];
    const actorEmail = `transition-actor-${testId}@example.test`;
    const targetEmail = `transition-target-${testId}@example.test`;
    try {
        await auth.createUser({ uid: actorUid, email: actorEmail, password: "local-transition-password-123" });
        createdUsers.push(actorUid);
        await auth.createUser({
            uid: targetUid,
            email: targetEmail,
            password: "local-transition-password-123",
            disabled: targetStatus === "revoked"
        });
        createdUsers.push(targetUid);
        await db.collection("userRoles").doc(actorUid).set({ role: "admin", status: "active" });
        await db.collection("userRoles").doc(targetUid).set({
            role: targetRole,
            status: targetStatus,
            ...(targetRole === "operator" ? { policeStationId: stationId } : {})
        });
        if (stationValid) {
            await db.collection("policeStations").doc(stationId).set({
                name: "Transition Test Station",
                createdAt: new Date()
            });
        }
        await db.collection("systemControl").doc("adminGovernance").set({
            schemaVersion: 1,
            activeAdminCount: targetRole === "admin" && targetStatus === "active" ? 2 : 1,
            createdAt: new Date(),
            createdBy: actorUid,
            updatedAt: new Date(),
            updatedBy: actorUid
        });

        const store = createRoleTransitionStore({ db, auth: authAdapter });
        const handler = createManageUserRoleHandler({
            verifyIdToken: async token => token === "test-token" ? { uid: actorUid } : Promise.reject(
                Object.assign(new Error("invalid token"), { code: "auth/invalid-id-token" })
            ),
            getRole: async uid => {
                const role = await db.collection("userRoles").doc(uid).get();
                return role.exists ? role.data() : null;
            },
            transitionStore: store
        });
        const request = async (body, { token = "test-token", origin } = {}) => {
            const response = responseRecorder();
            await handler({
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "idempotency-key": body.requestId,
                    ...(origin ? { origin } : {})
                },
                body
            }, response);
            return response;
        };

        await run({ db, actorUid, targetUid, stationId, request, store, targetRole });
    } finally {
        await db.recursiveDelete(db.collection("userRoles"));
        await db.recursiveDelete(db.collection("policeStations"));
        await db.recursiveDelete(db.collection("roleManagementRequests"));
        await db.collection("systemControl").doc("adminGovernance").delete();
        await Promise.all(createdUsers.map(uid => auth.deleteUser(uid).catch(error => {
            if (error?.code !== "auth/user-not-found") throw error;
        })));
    }
}

function transitionBody(action, targetUid, extra = {}) {
    return {
        action,
        targetUid,
        reason: "Approved local role administration test",
        requestId: randomUUID(),
        ...extra
    };
}

test("transition validation rejects malformed fields, reasons, target IDs, and request IDs", () => {
    const valid = transitionBody("promote", "operator-uid");
    assert.deepEqual(validateRoleTransitionRequest(valid), valid);
    assert.equal(validateRoleTransitionRequest({ ...valid, actorUid: "forged" }), null);
    assert.equal(validateRoleTransitionRequest({ ...valid, reason: "  " }), null);
    assert.equal(validateRoleTransitionRequest({ ...valid, reason: "r".repeat(501) }), null);
    assert.equal(validateRoleTransitionRequest({ ...valid, targetUid: "bad/uid" }), null);
    assert.equal(validateRoleTransitionRequest({ ...valid, requestId: "not-a-uuid" }), null);
    assert.equal(validateRoleTransitionRequest({
        ...valid,
        action: "demote",
        policeStationId: "station-a"
    }).policeStationId, "station-a");
    assert.equal(validateRoleTransitionRequest({
        ...valid,
        action: "demote",
        policeStationId: "invalid/station"
    }), null);
    assert.equal(validateRoleTransitionRequest({ ...valid, action: "revoke", policeStationId: "extra" }), null);
});

test("active Operator promotion and Admin demotion atomically update role, history, and governance", async () => {
    await withScenario({}, async ({ db, actorUid, targetUid, stationId, request }) => {
        const promotion = transitionBody("promote", targetUid);
        const promoted = await request(promotion);
        assert.equal(promoted.statusCode, 201);
        assert.deepEqual(promoted.body.user, {
            uid: targetUid,
            role: "admin",
            status: "active",
            policeStationId: null
        });
        const promotedRole = await db.collection("userRoles").doc(targetUid).get();
        assert.equal(promotedRole.data().policeStationId, undefined);
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 2);
        let history = await promotedRole.ref.collection("history").get();
        assert.equal(history.size, 1);
        assert.deepEqual({
            action: history.docs[0].data().action,
            previousRole: history.docs[0].data().previousRole,
            newRole: history.docs[0].data().newRole,
            previousStation: history.docs[0].data().previousPoliceStationId,
            newStation: history.docs[0].data().newPoliceStationId,
            actorUid: history.docs[0].data().actorUid
        }, {
            action: "role_changed",
            previousRole: "operator",
            newRole: "admin",
            previousStation: stationId,
            newStation: null,
            actorUid
        });

        const retry = await request(promotion);
        assert.equal(retry.statusCode, 200);
        assert.deepEqual(retry.body.user, promoted.body.user);
        assert.equal((await promotedRole.ref.collection("history").get()).size, 1);
        const mismatch = await request({ ...promotion, reason: "Changed reason" });
        assert.equal(mismatch.statusCode, 409);

        const demotion = transitionBody("demote", targetUid, { policeStationId: stationId });
        const demoted = await request(demotion);
        assert.equal(demoted.statusCode, 201);
        assert.deepEqual(demoted.body.user, {
            uid: targetUid,
            role: "operator",
            status: "active",
            policeStationId: stationId
        });
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 1);
        history = await promotedRole.ref.collection("history").orderBy("occurredAt").get();
        assert.equal(history.size, 2);
        assert.equal(history.docs[1].data().action, "role_changed");
        assert.equal(history.docs[1].data().previousPoliceStationId, null);
        assert.equal(history.docs[1].data().newPoliceStationId, stationId);
    });
});

test("Operator revocation and reactivation retain the role and assignment while synchronizing Auth", async () => {
    await withScenario({}, async ({ db, targetUid, stationId, request }) => {
        const revoked = await request(transitionBody("revoke", targetUid));
        assert.equal(revoked.statusCode, 201);
        assert.equal(revoked.body.user.status, "revoked");
        assert.equal((await auth.getUser(targetUid)).disabled, true);
        let role = await db.collection("userRoles").doc(targetUid).get();
        assert.equal(role.data().role, "operator");
        assert.equal(role.data().policeStationId, stationId);
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 1);

        const reactivated = await request(transitionBody("reactivate", targetUid));
        assert.equal(reactivated.statusCode, 201);
        assert.equal(reactivated.body.user.status, "active");
        assert.equal((await auth.getUser(targetUid)).disabled, false);
        role = await db.collection("userRoles").doc(targetUid).get();
        assert.equal(role.data().policeStationId, stationId);
        const history = await role.ref.collection("history").orderBy("occurredAt").get();
        assert.deepEqual(history.docs.map(item => item.data().action), ["revoked", "reactivated"]);
        assert.equal(history.docs[0].data().newRole, null);
        assert.equal(history.docs[1].data().newRole, "operator");
    });
});

test("Admin revocation decrements governance and disables the Auth account", async () => {
    await withScenario({ targetRole: "admin" }, async ({ db, actorUid, targetUid, request }) => {
        const revokeTarget = transitionBody("revoke", targetUid);
        const revokeActor = transitionBody("revoke", actorUid);
        const [targetResult, actorResult] = await Promise.all([
            request(revokeTarget),
            request(revokeActor, { token: "invalid-token" })
        ]);
        assert.equal(actorResult.statusCode, 401);
        assert.equal(targetResult.statusCode, 201);
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 1);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "revoked");
        assert.equal((await db.collection("userRoles").doc(actorUid).get()).data().status, "active");
        assert.equal((await auth.getUser(targetUid)).disabled, true);
    });
});

test("competing active Admins cannot revoke one another and leave zero active Admins", async () => {
    await withScenario({ targetRole: "admin" }, async ({ db, actorUid, targetUid }) => {
        const targetStore = createRoleTransitionStore({ db, auth });
        const targetHandler = createManageUserRoleHandler({
            verifyIdToken: async () => ({ uid: targetUid }),
            getRole: async uid => (await db.collection("userRoles").doc(uid).get()).data() || null,
            transitionStore: targetStore
        });
        const actorStore = createRoleTransitionStore({ db, auth });
        const actorHandler = createManageUserRoleHandler({
            verifyIdToken: async () => ({ uid: actorUid }),
            getRole: async uid => (await db.collection("userRoles").doc(uid).get()).data() || null,
            transitionStore: actorStore
        });
        const issue = async (handler, body) => {
            const response = responseRecorder();
            await handler({
                method: "POST",
                headers: {
                    authorization: "Bearer test",
                    "idempotency-key": body.requestId
                },
                body
            }, response);
            return response;
        };
        const actions = [
            { handler: actorHandler, body: transitionBody("revoke", targetUid) },
            { handler: targetHandler, body: transitionBody("revoke", actorUid) }
        ];
        let results = await Promise.all(actions.map(action => issue(action.handler, action.body)));
        for (let attempt = 0; attempt < 3 && results.some(result => result.statusCode === 503); attempt += 1) {
            for (let index = 0; index < results.length; index += 1) {
                if (results[index].statusCode === 503) {
                    results[index] = await issue(actions[index].handler, actions[index].body);
                }
            }
        }
        const successCount = results.filter(result => [200, 201].includes(result.statusCode)).length;
        assert.equal(
            successCount,
            1,
            JSON.stringify(results.map(result => ({ status: result.statusCode, body: result.body })))
        );
        assert.equal(
            results.filter(result => [403, 409].includes(result.statusCode)).length,
            1,
            JSON.stringify(results.map(result => ({ status: result.statusCode, body: result.body })))
        );
        const roles = await db.collection("userRoles").get();
        assert.equal(roles.docs.filter(item => item.data().role === "admin" && item.data().status === "active").length, 1);
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 1);
    });
});

test("demotion requires an existing station and governance inconsistencies fail closed", async () => {
    await withScenario({ targetRole: "admin", stationValid: false }, async ({ db, targetUid, request }) => {
        const demotion = await request(transitionBody("demote", targetUid, { policeStationId: "missing-station" }));
        assert.equal(demotion.statusCode, 400);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().role, "admin");
        assert.equal((await db.collection("systemControl").doc("adminGovernance").get()).data().activeAdminCount, 2);

        await db.collection("systemControl").doc("adminGovernance").delete();
        const revoke = await request(transitionBody("revoke", targetUid));
        assert.equal(revoke.statusCode, 503);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().role, "admin");
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "active");
    });
});

test("a governance count that would remove the last Admin blocks revocation", async () => {
    await withScenario({ targetRole: "admin" }, async ({ db, targetUid, request }) => {
        await db.collection("systemControl").doc("adminGovernance").update({ activeAdminCount: 1 });
        const response = await request(transitionBody("revoke", targetUid));

        assert.equal(response.statusCode, 409);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "active");
        assert.equal((await auth.getUser(targetUid)).disabled, false);
        assert.equal((await db.collection("userRoles").doc(targetUid).collection("history").get()).size, 0);
    });
});

test("role transitions reject missing, inactive, self, and unsupported callers", async () => {
    await withScenario({}, async ({ actorUid, targetUid, request }) => {
        assert.equal((await request(transitionBody("revoke", targetUid), { token: "invalid-token" })).statusCode, 401);
        assert.equal((await request(transitionBody("revoke", targetUid), { token: "" })).statusCode, 401);
        assert.equal((await request(transitionBody("revoke", actorUid))).statusCode, 403);
    });
});

test("malformed Admin station assignments are rejected for actors and transition targets", async () => {
    await withScenario({ targetRole: "admin" }, async ({ db, actorUid, targetUid, stationId, request }) => {
        await db.collection("userRoles").doc(targetUid).update({ policeStationId: { id: stationId } });
        const targetResponse = await request(transitionBody("demote", targetUid, { policeStationId: stationId }));
        assert.equal(targetResponse.statusCode, 409);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().role, "admin");

        await db.collection("userRoles").doc(targetUid).update({ policeStationId: null });
        await db.collection("userRoles").doc(actorUid).update({ policeStationId: { id: stationId } });
        assert.equal((await request(transitionBody("revoke", targetUid))).statusCode, 403);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "active");
    });
});

test("failed Auth reactivation leaves the role active but disabled and safely retries", async () => {
    let failEnable = true;
    const failingAuth = {
        getUser: auth.getUser.bind(auth),
        updateUser: async (uid, properties) => {
            if (properties.disabled === false && failEnable) {
                failEnable = false;
                throw Object.assign(new Error("injected Auth failure"), { code: "auth/internal-error" });
            }
            return auth.updateUser(uid, properties);
        }
    };
    await withScenario({ targetStatus: "revoked", authAdapter: failingAuth }, async ({ db, targetUid, request }) => {
        const body = transitionBody("reactivate", targetUid);
        const failedEnable = await request(body);
        assert.equal(failedEnable.statusCode, 503, JSON.stringify(failedEnable.body));
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "active");
        assert.equal((await auth.getUser(targetUid)).disabled, true);
        assert.equal((await db.collection("userRoles").doc(targetUid).collection("history").get()).size, 1);
        assert.equal((await request(body)).statusCode, 200);
        assert.equal((await auth.getUser(targetUid)).disabled, false);
        assert.equal((await db.collection("userRoles").doc(targetUid).collection("history").get()).size, 1);
    });
});

test("failed Auth disablement is retryable without duplicating role history", async () => {
    await withScenario({}, async ({ db, actorUid, targetUid, request }) => {
        let failDisable = true;
        const failingAuth = {
            getUser: auth.getUser.bind(auth),
            updateUser: async (uid, properties) => {
                if (properties.disabled === true && failDisable) {
                    failDisable = false;
                    throw Object.assign(new Error("injected Auth failure"), { code: "auth/internal-error" });
                }
                return auth.updateUser(uid, properties);
            }
        };
        const store = createRoleTransitionStore({ db, auth: failingAuth });
        const handler = createManageUserRoleHandler({
            verifyIdToken: async () => ({ uid: actorUid }),
            getRole: async uid => (await db.collection("userRoles").doc(uid).get()).data() || null,
            transitionStore: store
        });
        const body = transitionBody("revoke", targetUid);
        const call = async () => {
            const response = responseRecorder();
            await handler({
                method: "POST",
                headers: { authorization: "Bearer test", "idempotency-key": body.requestId },
                body
            }, response);
            return response;
        };

        assert.equal((await call()).statusCode, 503);
        assert.equal((await db.collection("userRoles").doc(targetUid).get()).data().status, "revoked");
        assert.equal((await auth.getUser(targetUid)).disabled, false);
        assert.equal((await call()).statusCode, 200);
        assert.equal((await auth.getUser(targetUid)).disabled, true);
        assert.equal((await db.collection("userRoles").doc(targetUid).collection("history").get()).size, 1);
    });
});
