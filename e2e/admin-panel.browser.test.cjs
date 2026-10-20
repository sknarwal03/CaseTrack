const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const http = require("node:http");

const PROJECT_ID = "demo-casetrack-role-prototype";
const EXPECTED_AUTH_EMULATOR = "127.0.0.1:9198";
const EXPECTED_FIRESTORE_EMULATOR = "127.0.0.1:8187";
const VITE_ORIGIN = "http://127.0.0.1:5174";
const FUNCTIONS_ORIGIN = "http://127.0.0.1:5003";
const EMAIL_CAPTURE_ORIGIN = "http://127.0.0.1:7077";
const TEST_PASSWORD = `E2E-${randomUUID()}-Password!`;
const emailSuffix = randomUUID();
const adminEmail = `admin-${emailSuffix}@example.test`;
const operatorEmail = `operator-${emailSuffix}@example.test`;
const stationName = `E2E Station ${emailSuffix.slice(0, 8)}`;
const functionsRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const { initializeApp } = functionsRequire("firebase-admin/app");
const { getAuth } = functionsRequire("firebase-admin/auth");
const { getFirestore, FieldValue } = functionsRequire("firebase-admin/firestore");

function assertIsolatedEnvironment() {
    if (process.env.GCLOUD_PROJECT !== PROJECT_ID
        || process.env.FIREBASE_AUTH_EMULATOR_HOST !== EXPECTED_AUTH_EMULATOR
        || process.env.FIRESTORE_EMULATOR_HOST !== EXPECTED_FIRESTORE_EMULATOR) {
        throw new Error("Refusing browser E2E outside the fixed local demo emulators.");
    }
    if (!existsSync(process.env.CHROME_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe")) {
        throw new Error("Set CHROME_EXECUTABLE to an installed Chrome browser executable.");
    }
}

async function main() {
    assertIsolatedEnvironment();
    const app = initializeApp({ projectId: PROJECT_ID }, `admin-panel-e2e-${emailSuffix}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let adminUid = null;
    let operatorUid = null;
    let stationId = null;
    let browser = null;
    const deliveredEmails = [];
    let failNextEmailDelivery = false;
    let recoveryUid = null;
    const mailServer = http.createServer((request, response) => {
        const chunks = [];
        request.on("data", chunk => chunks.push(chunk));
        request.on("end", () => {
            if (failNextEmailDelivery) {
                failNextEmailDelivery = false;
                response.writeHead(503).end();
                return;
            }
            deliveredEmails.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            response.writeHead(202).end();
        });
    });

    try {
        await new Promise((resolve, reject) => mailServer.once("error", reject).listen(7077, "127.0.0.1", resolve));
        const admin = await auth.createUser({ email: adminEmail, password: TEST_PASSWORD });
        adminUid = admin.uid;
        await db.collection("userRoles").doc(adminUid).set({
            role: "admin",
            status: "active",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: adminUid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: adminUid
        });
        await db.collection("systemControl").doc("adminGovernance").set({
            schemaVersion: 1,
            activeAdminCount: 1,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: adminUid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: adminUid
        });

        browser = await chromium.launch({
            headless: true,
            executablePath: process.env.CHROME_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe"
        });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/login.html`);
        await page.locator("#email").fill(adminEmail);
        await page.locator("#password").fill(TEST_PASSWORD);
        await page.locator("#loginForm button[type=submit]").click();
        try {
            await page.waitForURL("**/admin-panel.html", { timeout: 20_000 });
        } catch {
            throw new Error(`Admin login did not route to the panel. URL=${page.url()} status=${await page.locator("#loginError").textContent()}`);
        }
        await page.locator("#adminPanelContent:not([hidden])").waitFor({ timeout: 20_000 });

        const unauthenticated = await page.evaluate(async url => {
            const response = await fetch(url);
            return response.status;
        }, `${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/policeStations`);
        assert.equal(unauthenticated, 401, "unauthenticated station requests must be rejected");

        await page.locator("#policeStationName").fill(stationName);
        await page.locator("#policeStationSave").click();
        await page.locator("#policeStationStatus").getByText(new RegExp(`Created ${stationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).waitFor({ timeout: 15_000 });
        const stationRow = page.locator("#policeStationTableBody tr").filter({ hasText: stationName });
        await stationRow.waitFor({ timeout: 15_000 });
        stationId = (await stationRow.locator("td").first().textContent()).trim();

        await page.locator("#operatorEmail").fill(operatorEmail);
        await page.locator("#operatorPoliceStation").selectOption(stationId);
        await page.locator("#operatorCreate").click();
        const operatorStatus = page.locator("#operatorStatus");
        await operatorStatus.getByText(/sent the password setup email/).waitFor({ timeout: 20_000 });
        operatorUid = /Created Operator ([^,\s]+)/.exec(await operatorStatus.textContent())?.[1];
        assert.ok(operatorUid, "the Admin Panel should confirm the created Operator UID");
        const createdOperator = await db.collection("userRoles").doc(operatorUid).get();
        assert.equal(createdOperator.data().role, "operator");
        assert.equal(createdOperator.data().policeStationId, stationId);

        assert.equal(deliveredEmails.length, 1, "provisioning should deliver exactly one setup email");
        const firstSetupLink = deliveredEmails[0].content[0].value.match(/https?:\/\/[^\s]+/)[0];

        const customToken = await auth.createCustomToken(adminUid);
        const signInResponse = await fetch("http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-only-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
        });
        assert.equal(signInResponse.status, 200);
        const adminToken = (await signInResponse.json()).idToken;
        const resendResponse = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/resendOperatorInvitation`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ uid: operatorUid })
        });
        assert.equal(resendResponse.status, 200);
        assert.equal(deliveredEmails.length, 2, "resend should deliver another setup email");
        const firstLinkParams = new URLSearchParams(new URL(firstSetupLink).hash.slice(1));
        const firstSetupPage = `${VITE_ORIGIN}/CaseTrack/pages/password-setup.html#${firstLinkParams.toString()}`;
        await page.goto(firstSetupPage);
        await page.locator("#setupMessage").getByText(/expired, invalid, already used/i).waitFor({ timeout: 15_000 });
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/admin-panel.html`);
        await page.locator("#adminPanelContent:not([hidden])").waitFor({ timeout: 15_000 });

        const duplicateRequestId = randomUUID();
        const duplicateResponse = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/createOperator`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json", "Idempotency-Key": duplicateRequestId },
            body: JSON.stringify({ email: operatorEmail, policeStationId: stationId, requestId: duplicateRequestId })
        });
        assert.equal(duplicateResponse.status, 409, "duplicate Operator emails must be rejected");

        const failedEmail = `delivery-failure-${emailSuffix}@example.test`;
        const failedProvisionId = randomUUID();
        failNextEmailDelivery = true;
        const failedProvisionResponse = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/createOperator`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json", "Idempotency-Key": failedProvisionId },
            body: JSON.stringify({ email: failedEmail, policeStationId: stationId, requestId: failedProvisionId })
        });
        assert.equal(failedProvisionResponse.status, 503, "failed email delivery must not report provisioning success");
        const failedProvisionUser = await auth.getUserByEmail(failedEmail);
        recoveryUid = failedProvisionUser.uid;
        assert.equal(failedProvisionUser.disabled, true, "undelivered accounts must remain disabled");
        assert.equal((await db.collection("userRoles").doc(recoveryUid).get()).data().role, "operator");
        const recoveryResend = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/resendOperatorInvitation`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ uid: recoveryUid })
        });
        assert.equal(recoveryResend.status, 200, "failed invitation can recover by resend");
        assert.equal((await auth.getUser(recoveryUid)).disabled, false, "resend should enable the provisioned Operator");

        const recoveryResponse = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/requestPasswordRecovery`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: operatorEmail })
        });
        assert.equal(recoveryResponse.status, 200);
        const recoveryRetry = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/requestPasswordRecovery`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: operatorEmail })
        });
        assert.equal(recoveryRetry.status, 200);
        const unknownRecoveryResponse = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/requestPasswordRecovery`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "unknown@example.test" })
        });
        assert.equal(unknownRecoveryResponse.status, 200, "recovery response must not enumerate accounts");
        assert.equal(deliveredEmails.length, 4, "active recovery sends one rate-limited email; unknown address does not");

        const setupLink = deliveredEmails[3].content[0].value.match(/https?:\/\/[^\s]+/)[0];
        assert.notEqual(setupLink, firstSetupLink, "resend and recovery should create a fresh setup token");
        const setupLinkParams = new URLSearchParams(new URL(setupLink).hash.slice(1));
        const setupToken = setupLinkParams.get("token");
        const setupUid = setupLinkParams.get("uid");
        assert.ok(setupToken, "email should contain a random custom setup token");
        assert.equal(setupUid, operatorUid);
        assert.equal(new URL(setupLink).search, "", "the token must stay out of HTTP request logs");

        const nativeResetBypass = await fetch("http://127.0.0.1:9198/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator-only-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oobCode: setupToken, newPassword: `Bypass-${randomUUID()}!` })
        });
        assert.equal(nativeResetBypass.ok, false, "the custom link must not work through Firebase's native password-reset endpoint");

        const newOperatorPassword = `Operator-${randomUUID()}!`;
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/password-setup.html#${setupLinkParams.toString()}`);
        await page.locator("#setupForm").waitFor({ state: "visible", timeout: 15_000 });
        await page.locator("#newPassword").fill(newOperatorPassword);
        await page.locator("#confirmPassword").fill(newOperatorPassword);
        await page.locator("#setupForm button[type=submit]").click();
        await page.locator("#setupMessage").getByText(/password is set/i).waitFor({ timeout: 15_000 });
        assert.ok((await auth.getUser(operatorUid)).passwordHash, "the trusted backend should set the Auth password");

        const usedAgain = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/completeOperatorPasswordSetup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: setupUid, token: setupToken, password: `Replay-${randomUUID()}!` })
        });
        assert.equal(usedAgain.status, 400, "used setup links must be rejected by the trusted backend");
        const recoveryLink = deliveredEmails[2].content[0].value.match(/https?:\/\/[^\s]+/)[0];
        const recoveryLinkParams = new URLSearchParams(new URL(recoveryLink).hash.slice(1));
        await db.collection("operatorSetupActionCodes").doc(recoveryUid).update({ expiresAt: Date.now() - 1 });
        const expiredValidation = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/us-central1/validateOperatorSetupCode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: recoveryUid, token: recoveryLinkParams.get("token") })
        });
        assert.equal(expiredValidation.status, 200);
        assert.deepEqual(await expiredValidation.json(), { valid: false }, "expired setup tokens must fail server validation");
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/login.html`);
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/password-setup.html#${recoveryLinkParams.toString()}`);
        await page.waitForFunction(() => !document.querySelector("#setupMessage")?.textContent.includes("Checking your secure link"), { timeout: 15_000 });
        assert.match(await page.locator("#setupMessage").textContent(), /expired, invalid, already used/i);
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/login.html`);
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/password-setup.html#uid=unknown-user&token=${"x".repeat(43)}`);
        await page.locator("#setupMessage").getByText(/expired, invalid, already used/i).waitFor({ timeout: 15_000 });

        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/admin-panel.html`);
        await page.locator("#adminPanelContent:not([hidden])").waitFor({ timeout: 15_000 });
        await page.locator("#adminUsersRefresh").click();
        await page.locator("#adminUsersTableBody tr").filter({ hasText: operatorUid }).waitFor({ timeout: 15_000 });

        async function applyRoleChange(action, reason) {
            const row = page.locator("#adminUsersTableBody tr").filter({ hasText: operatorUid });
            await row.waitFor({ timeout: 15_000 });
            await row.getByRole("button", { name: `Manage account ${operatorUid}` }).click();
            await page.locator("#roleManagementAction").selectOption(action);
            if (action === "demote") await page.locator("#roleManagementStation").selectOption(stationId);
            await page.locator("#roleManagementReason").fill(reason);
            await page.locator("#roleManagementSubmit").click();
            await page.locator("#roleManagementDialog").waitFor({ state: "hidden", timeout: 15_000 });
        }

        await applyRoleChange("promote", "Browser E2E promotion");
        let operatorRole = await db.collection("userRoles").doc(operatorUid).get();
        assert.equal(operatorRole.data().role, "admin");
        await applyRoleChange("demote", "Browser E2E demotion");
        operatorRole = await db.collection("userRoles").doc(operatorUid).get();
        assert.equal(operatorRole.data().role, "operator");
        assert.equal(operatorRole.data().policeStationId, stationId);

        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/login.html`);
        await page.locator("#email").fill(operatorEmail);
        await page.locator("#password").fill(newOperatorPassword);
        await page.locator("#loginForm button[type=submit]").click();
        await page.waitForURL("**/pages/dashboard.html", { timeout: 20_000 });
        await page.goto(`${VITE_ORIGIN}/CaseTrack/pages/admin-panel.html`);
        await page.locator("#adminPanelAccessStatus").getByText(/Access denied|active admin/i).waitFor({ timeout: 15_000 });
        assert.equal(await page.locator("#adminPanelContent").isHidden(), true,
            "Operator direct navigation must not render Admin content");
        assert.deepEqual(pageErrors, [], "browser should not report uncaught page errors");

        console.log(JSON.stringify({
            result: "passed",
            workflows: ["Admin login", "unauthenticated request denied", "station create/list", "Operator provisioning and custom setup email", "invitation resend and old-token revocation", "Firebase native password-reset endpoint bypass rejected", "duplicate prevention", "failed email delivery recovery", "password recovery without account enumeration and rate limit", "server-side one-time password setup", "used, invalid, and expired token rejection", "Admin promotion/demotion", "Operator Admin Panel denial"],
            createdStationId: stationId,
            createdOperatorUid: operatorUid
        }));
    } finally {
        await browser?.close().catch(() => {});
        await new Promise(resolve => mailServer.close(resolve));
        if (operatorUid) await db.recursiveDelete(db.collection("userRoles").doc(operatorUid)).catch(() => {});
        if (recoveryUid) await db.recursiveDelete(db.collection("userRoles").doc(recoveryUid)).catch(() => {});
        if (adminUid) {
            await db.recursiveDelete(db.collection("operatorCreationRequests").doc(adminUid)).catch(() => {});
            await db.recursiveDelete(db.collection("roleManagementRequests").doc(adminUid)).catch(() => {});
            await db.recursiveDelete(db.collection("userRoles").doc(adminUid)).catch(() => {});
        }
        if (stationId) await db.collection("policeStations").doc(stationId).delete().catch(() => {});
        await db.collection("systemControl").doc("adminGovernance").delete().catch(() => {});
        for (const uid of [operatorUid, recoveryUid, adminUid].filter(Boolean)) {
            await auth.deleteUser(uid).catch(() => {});
        }
        await app.delete();
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
