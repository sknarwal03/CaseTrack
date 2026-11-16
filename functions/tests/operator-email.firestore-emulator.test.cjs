const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { createSetupCodeRegistry } = require("../operator-email.cjs");

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "";
const emulatorConfigured = /^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost);

test("Firestore Emulator serializes concurrent token claims and persists token state", {
    skip: !emulatorConfigured
        ? "Set FIRESTORE_EMULATOR_HOST to a localhost Firestore Emulator to run this isolated test."
        : false,
    timeout: 30000
}, async () => {
    const app = initializeApp({ projectId: "demo-casetrack-password-token-tests" }, `password-token-${randomUUID()}`);
    const db = getFirestore(app);
    const uid = `test-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const roleRef = db.collection("userRoles").doc(uid);
    const tokenRef = db.collection("operatorSetupActionCodes").doc(uid);

    try {
        await roleRef.set({ role: "operator", status: "active", mustChangePassword: true });
        const registryA = createSetupCodeRegistry({ db, auth: {} });
        await registryA.register(uid, token, "initial_setup");

        // A fresh registry instance has no process-local token state; it must
        // observe the same Firestore record after being reconstructed.
        const registryAfterRestart = createSetupCodeRegistry({ db, auth: {} });
        assert.equal(await registryAfterRestart.claim(uid, token, "attempt-a", "initial_setup"), true);
        const concurrent = await registryA.claim(uid, token, "attempt-b", "initial_setup");
        assert.equal(concurrent, false);
        assert.equal((await tokenRef.get()).data().status, "consuming");
        assert.equal((await tokenRef.get()).data().purpose, "initial_setup");
    } finally {
        await Promise.all([roleRef.delete(), tokenRef.delete()]);
        await deleteApp(app);
    }
});

