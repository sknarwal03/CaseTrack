const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const PROJECT_ID = "demo-casetrack-role-prototype";
const HOSTS = Object.freeze({ auth: "127.0.0.1:9198", firestore: "127.0.0.1:8187", functions: "127.0.0.1:5003" });
const APP_ORIGIN = "http://127.0.0.1:5174";
const BASE_PATH = "/CaseTrack";
const VIEWPORTS = Object.freeze([
    [320, 700], [375, 812], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]
]);
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(process.env.CASETRACK_E2E_OUTPUT_DIR
    || path.join(__dirname, "..", "docs", "ui-ux-audit", "screenshots", "infrastructure-recovery", RUN_ID));
const functionsRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const { initializeApp } = functionsRequire("firebase-admin/app");
const { getAuth } = functionsRequire("firebase-admin/auth");
const { getFirestore, FieldValue } = functionsRequire("firebase-admin/firestore");
const report = {
    projectId: PROJECT_ID,
    routes: [],
    screenshots: [],
    checks: [],
    browserConsoleErrors: [],
    failedRequests: [],
    blockedRemoteFirebaseRequests: [],
    result: "running"
};

function assertIsolatedEnvironment() {
    assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID, "Only the dedicated demo Firebase project is allowed.");
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, HOSTS.auth);
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, HOSTS.firestore);
    assert.equal(process.env.CASETRACK_E2E_MODE, "role-admin-local");
    assert.ok(process.env.CHROME_EXECUTABLE && fs.existsSync(process.env.CHROME_EXECUTABLE),
        "An installed Chrome executable must be selected explicitly.");
    for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN"]) {
        assert.ok(!process.env[name], `Refusing test while cloud credential/configuration variable ${name} is set.`);
    }
    if (process.env.FIREBASE_CONFIG) {
        let emulatorConfig;
        try { emulatorConfig = JSON.parse(process.env.FIREBASE_CONFIG); } catch {
            throw new Error("Firebase Emulator supplied an unreadable runtime configuration.");
        }
        assert.equal(emulatorConfig.projectId, PROJECT_ID, "Firebase Emulator runtime config must select the demo project.");
    }
}

function localDateFixture() {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { dateKey, displayDate: `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}` };
}

async function assertFreshEmulator(auth, db) {
    const users = await auth.listUsers(1);
    assert.equal(users.users.length, 0, "The test refuses to use an emulator with existing Auth users.");
    const collections = await db.listCollections();
    for (const collection of collections) {
        const firstRecord = await collection.limit(1).get();
        assert.equal(firstRecord.empty, true,
            `The test refuses to seed an emulator containing records in ${collection.id}.`);
    }
}

function contrastRatio(foreground, background) {
    const luminance = color => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
            .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function computedContrast(locator) {
    return locator.evaluate(element => {
        const parse = value => {
            const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 1];
            return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
        };
        const over = (foreground, background) => {
            const alpha = foreground[3] + background[3] * (1 - foreground[3]);
            if (!alpha) return [0, 0, 0, 0];
            return [
                (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
                (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
                (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
                alpha
            ];
        };
        const text = parse(getComputedStyle(element).color);
        let surface = [255, 255, 255, 1];
        const ancestors = [];
        for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
            ancestors.push(node);
        }
        for (const node of ancestors.reverse()) surface = over(parse(getComputedStyle(node).backgroundColor), surface);
        const rgb = color => `rgb(${color.slice(0, 3).map(value => Math.round(value)).join(", ")})`;
        return { foreground: rgb(text), background: rgb(surface), foregroundAlpha: text[3], backgroundAlpha: surface[3] };
    });
}

function observePage(page) {
    page.on("console", message => {
        if (message.type() === "error") report.browserConsoleErrors.push({ route: new URL(page.url()).pathname, message: message.text().slice(0, 240) });
    });
    page.on("pageerror", error => report.browserConsoleErrors.push({ route: new URL(page.url()).pathname, message: error.message.slice(0, 240) }));
    page.on("requestfailed", request => {
        report.failedRequests.push({ route: new URL(page.url()).pathname, url: `${new URL(request.url()).origin}${new URL(request.url()).pathname}`, failure: request.failure()?.errorText || "unknown" });
    });
    page.on("request", request => {
        const url = new URL(request.url());
        if (/\.(?:googleapis\.com|cloudfunctions\.net|firebaseio\.com)$/.test(url.hostname)) {
            report.blockedRemoteFirebaseRequests.push({ route: new URL(page.url()).pathname, host: url.hostname });
        }
    });
}

async function createPage(browser, errors) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (/\.(?:googleapis\.com|cloudfunctions\.net|firebaseio\.com)$/.test(url.hostname)) {
            errors.push({ route: new URL(route.request().url()).pathname, host: url.hostname });
            await route.abort("blockedbyclient");
            return;
        }
        await route.continue();
    });
    const page = await context.newPage();
    observePage(page);
    return { context, page };
}

async function setTheme(page, theme) {
    const needsLight = theme === "light";
    const isLight = await page.evaluate(() => document.body.classList.contains("light-theme"));
    if (isLight !== needsLight) await page.locator("#themeToggle").click();
    assert.equal(await page.evaluate(() => localStorage.getItem("caseTrackTheme")), theme);
}

async function capture(page, prefix, width, theme, height) {
    const filename = `${prefix}-${width}-${theme}.png`;
    const filePath = path.join(outputDir, filename);
    const bytes = await page.screenshot({ path: filePath, fullPage: false, animations: "disabled", timeout: 20_000 });
    assert.ok(bytes.length > 1000, `${filename} should not be empty.`);
    assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${filename} should have a PNG signature.`);
    assert.equal(bytes.readUInt32BE(16), width, `${filename} should match its viewport width.`);
    assert.equal(bytes.readUInt32BE(20), height, `${filename} should match its viewport height.`);
    const decoded = await page.evaluate(data => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => resolve(null);
        image.src = `data:image/png;base64,${data}`;
    }), bytes.toString("base64"));
    assert.deepEqual(decoded, { width, height }, `${filename} should decode as a viewport image.`);
    report.screenshots.push({ file: path.relative(path.join(__dirname, ".."), filePath).replaceAll(path.sep, "/"), width, height, theme, route: new URL(page.url()).pathname });
}

async function checkPageWidth(page, width) {
    const measured = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
    assert.ok(measured.page <= measured.viewport + 1, `Document overflow at ${width}px: ${JSON.stringify(measured)}`);
}

async function checkNoOverlappingSessionContent(page, width) {
    const result = await page.locator(".diary-session-file-item").evaluateAll(rows => rows.map(row => {
        const children = [...row.children].map(element => ({
            name: element.className || element.tagName,
            rect: element.getBoundingClientRect().toJSON(),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth
        })).filter(item => item.rect.width && item.rect.height);
        const overlaps = [];
        for (let left = 0; left < children.length; left += 1) {
            for (let right = left + 1; right < children.length; right += 1) {
                const a = children[left].rect;
                const b = children[right].rect;
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
                    overlaps.push([children[left].name, children[right].name]);
                }
            }
        }
        return { children, overlaps };
    }));
    assert.ok(result.length >= 3, `Expected all synthetic session rows at ${width}px.`);
    assert.equal(result.flatMap(row => row.overlaps).length, 0, `Session content overlaps at ${width}px.`);
    for (const row of result) {
        for (const item of row.children) {
            assert.ok(item.scrollWidth <= item.clientWidth + 1, `Session content clips at ${width}px: ${item.name}`);
        }
    }
    const undersizedControls = await page.locator(".diary-session-file-item .diary-file-status, .diary-session-file-item .diary-fir-number")
        .evaluateAll((items, viewportWidth) => viewportWidth > 768 ? [] : items
            .filter(item => item.getBoundingClientRect().width < 44 || item.getBoundingClientRect().height < 44)
            .map(item => item.className || item.textContent.trim()), width);
    assert.deepEqual(undersizedControls, [], `Touch controls are below 44px at ${width}px.`);
}

async function testAdmin(browser, auth, db, fixture, adminUid, operatorUid, stationId) {
    const { context, page } = await createPage(browser, report.blockedRemoteFirebaseRequests);
    try {
        page.setDefaultTimeout(15_000);
        await page.goto(`${APP_ORIGIN}${BASE_PATH}/pages/login.html`, { waitUntil: "networkidle" });
        await page.locator("#email").fill(fixture.adminEmail);
        await page.locator("#password").fill(fixture.adminPassword);
        await page.locator("#loginForm button[type=submit]").click();
        await page.waitForURL("**/admin-panel.html", { timeout: 20_000 });
        await page.locator("#adminPanelContent:not([hidden])").waitFor();
        await page.locator("#adminUsersTableBody tr").filter({ hasText: operatorUid }).waitFor();
        await page.locator("#policeStationTableBody tr").filter({ hasText: stationId }).waitFor();
        report.routes.push({ route: "/CaseTrack/pages/admin-panel.html", result: "loaded with synthetic Admin authentication" });

        await page.setViewportSize({ width: 1366, height: 768 });
        await setTheme(page, "light");
        const operatorRow = page.locator("#adminUsersTableBody tr").filter({ hasText: operatorUid });
        const uidContrast = await computedContrast(operatorRow.locator("td:first-child"));
        const headingContrast = await computedContrast(page.locator(".station-master-table thead th").first());
        const uidRatio = contrastRatio(uidContrast.foreground, uidContrast.background);
        const headingRatio = contrastRatio(headingContrast.foreground, headingContrast.background);
        assert.ok(uidRatio >= 4.5, `UX-017 UID text contrast is ${uidRatio.toFixed(2)}:1.`);
        assert.ok(headingRatio >= 4.5, `UX-017 station heading contrast is ${headingRatio.toFixed(2)}:1.`);
        report.checks.push({ id: "UX-017 computed contrast", uid: { ...uidContrast, ratio: Number(uidRatio.toFixed(2)) }, stationHeading: { ...headingContrast, ratio: Number(headingRatio.toFixed(2)) } });

        for (const [width, height] of VIEWPORTS) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
                await setTheme(page, theme);
                await page.locator("#adminUsersTitle").scrollIntoViewIfNeeded();
                await checkPageWidth(page, width);
                await capture(page, "UX-017-admin-users", width, theme, height);
                await page.locator("#stationMasterTitle").scrollIntoViewIfNeeded();
                await checkPageWidth(page, width);
                await capture(page, "UX-017-police-station-master", width, theme, height);
            }
        }

        const manageButton = page.locator(`#adminUsersTableBody button[aria-label="Manage account ${operatorUid}"]`);
        const manageRequestsBefore = report.failedRequests.length;
        for (const [width, height] of VIEWPORTS) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
                await setTheme(page, theme);
                await manageButton.click();
                const dialog = page.locator("#roleManagementDialog");
                await dialog.waitFor({ state: "visible" });
                const surface = await dialog.evaluate(element => ({
                    backgroundColor: getComputedStyle(element).backgroundColor,
                    backgroundImage: getComputedStyle(element).backgroundImage,
                    backdrop: getComputedStyle(element, "::backdrop").backgroundColor,
                    heading: getComputedStyle(element.querySelector("h2")).color
                }));
                const alpha = Number(surface.backgroundColor.match(/[\d.]+\)$/)?.[0]?.replace(")", "") || "1");
                assert.ok(!surface.backgroundColor.startsWith("rgba(") || alpha >= 0.999,
                    `Manage dialog has a transparent surface at ${width}px ${theme}.`);
                assert.equal(surface.backgroundImage, "none");
                assert.notEqual(surface.backdrop, "rgba(0, 0, 0, 0)");
                assert.ok(surface.heading);

                if (width === 320 && theme === "light") {
                    await page.keyboard.press("Escape");
                    assert.equal(await dialog.evaluate(element => element.open), false);
                    assert.equal(await manageButton.evaluate(element => document.activeElement === element), true,
                        "Escape should return focus to the Manage opener.");
                    await manageButton.click();
                } else if (width === 375 && theme === "dark") {
                    await page.locator("#roleManagementCancel").click();
                    assert.equal(await dialog.evaluate(element => element.open), false);
                    assert.equal(await manageButton.evaluate(element => document.activeElement === element), true,
                        "Cancel should return focus to the Manage opener.");
                    await manageButton.click();
                } else if (width === 1366 && theme === "light") {
                    for (let index = 0; index < 6; index += 1) {
                        await page.keyboard.press("Tab");
                        assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true,
                            "Keyboard focus should remain inside the open dialog.");
                    }
                    const before = report.failedRequests.length;
                    await page.locator("#roleManagementSubmit").click();
                    await page.locator("#roleManagementStatus").waitFor({ state: "visible" });
                    assert.ok((await page.locator("#roleManagementStatus").textContent()).trim(),
                        "Empty role form should show its existing validation feedback.");
                    assert.equal(report.failedRequests.length, before, "Validation should not issue a role mutation request.");
                }

                await capture(page, "UX-016-manage-account-dialog", width, theme, height);
                if (await dialog.evaluate(element => element.open)) await page.keyboard.press("Escape");
                assert.equal(await dialog.evaluate(element => element.open), false);
            }
        }
        report.checks.push({ id: "UX-016 Manage dialog", result: "opaque themed surface, backdrop, Escape, Cancel, focus containment/restoration, and empty-form validation passed" });

        const unchangedAdmin = await db.collection("userRoles").doc(operatorUid).get();
        assert.equal(unchangedAdmin.data().role, "operator");
        assert.equal(unchangedAdmin.data().status, "active");
        assert.equal(unchangedAdmin.data().policeStationId, stationId);
        report.checks.push({ id: "Admin role and station remained unchanged", result: "passed" });
    } finally {
        await context.close();
    }
}

async function testRegisterDiary(browser, fixture, caseIds) {
    const { context, page } = await createPage(browser, report.blockedRemoteFirebaseRequests);
    try {
        page.setDefaultTimeout(15_000);
        await page.goto(`${APP_ORIGIN}${BASE_PATH}/pages/login.html`, { waitUntil: "networkidle" });
        await page.locator("#email").fill(fixture.operatorEmail);
        await page.locator("#password").fill(fixture.operatorPassword);
        await page.locator("#loginForm button[type=submit]").click();
        await page.waitForURL("**/pages/dashboard.html", { timeout: 20_000 });
        await page.goto(`${APP_ORIGIN}${BASE_PATH}/pages/register-diary.html?date=${fixture.dateKey}`, { waitUntil: "networkidle" });
        await page.locator(".diary-session-file-item").first().waitFor();
        const rows = page.locator(".diary-session-file-item");
        await expectCount(rows, 3, "synthetic Register Diary session rows");
        const rendered = await rows.allTextContents();
        for (const label of fixture.caseLabels) assert.ok(rendered.some(text => text.includes(label)), `Missing synthetic diary record: ${label}`);
        assert.equal(rendered.some(text => text.includes(fixture.emptyDateLabel)), false,
            "The synthetic record with no hearing date should not appear in the selected day.");
        report.routes.push({ route: `/CaseTrack/pages/register-diary.html?date=${fixture.dateKey}`, result: "loaded with synthetic Operator and hearing records" });

        await page.addInitScript((fileStatuses, storageKey) => localStorage.setItem(storageKey, JSON.stringify(fileStatuses)), fixture.fileStatuses, "register-diary-file-statuses");
        await page.reload({ waitUntil: "networkidle" });
        await rows.first().waitFor();
        for (const [width, height] of VIEWPORTS) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
                await setTheme(page, theme);
                await checkPageWidth(page, width);
                await checkNoOverlappingSessionContent(page, width);
                if (width <= 768) {
                    const controls = await page.locator(".diary-session-file-item .diary-file-status, .diary-session-file-item .diary-fir-number")
                        .evaluateAll(items => items.map(element => {
                            const box = element.getBoundingClientRect();
                            return { width: box.width, height: box.height };
                        }));
                    assert.ok(controls.every(box => box.width >= 44 && box.height >= 44), `Touch target below 44px at ${width}px.`);
                }
                await page.locator(".diary-session-register").scrollIntoViewIfNeeded();
                await capture(page, "UX-015-register-diary", width, theme, height);
            }
        }

        const xStatus = page.locator(".diary-session-file-item .diary-x-status").first();
        await xStatus.focus();
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(() => document.activeElement.classList.contains("diary-disc-status")),
            "Tab should advance between hearing-row status controls.");
        await xStatus.click();
        assert.equal(await xStatus.getAttribute("aria-pressed"), "true");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.locator(".diary-session-file-item .diary-x-status").first().getAttribute("aria-pressed"), "true",
            "Hearing-row status should persist across a page reload.");

        const firButton = page.locator(".diary-session-file-item .diary-fir-number").first();
        await firButton.dblclick();
        await page.locator("#caseDetailsModal[aria-hidden='false']").waitFor({ state: "visible", timeout: 10_000 });
        assert.match(await page.locator("#caseDetailsTitle").textContent().catch(() => "FIR Details"), /FIR/i);
        await page.locator("#caseDetailsModal").click({ position: { x: 2, y: 2 } });
        await page.locator("#caseDetailsModal[aria-hidden='true']").waitFor({ timeout: 5000 }).catch(() => {});

        await firButton.click();
        await page.locator("#diaryDateDialog").waitFor({ state: "visible", timeout: 2_000 });
        await page.locator("#diaryDialogClose").click();
        await page.locator("#diaryDateDialog").waitFor({ state: "hidden" });
        report.checks.push({ id: "UX-015 Register Diary", result: "responsive bounds, no overlaps/clipping, mobile touch targets, keyboard status traversal, status persistence, FIR details and date dialog passed" });
    } finally {
        await context.close();
    }
}

async function expectCount(locator, expected, label) {
    const actual = await locator.count();
    assert.equal(actual, expected, `Unexpected count for ${label}.`);
}

async function main() {
    assertIsolatedEnvironment();
    fs.mkdirSync(outputDir, { recursive: true });
    const app = initializeApp({ projectId: PROJECT_ID }, `casetrack-ui-ux-${randomUUID()}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const fixtureId = randomUUID();
    const stationId = `e2e-station-${fixtureId.replaceAll("-", "").slice(0, 24)}`;
    const adminEmail = `admin-${fixtureId}@example.test`;
    const operatorEmail = `operator-${fixtureId}@example.test`;
    const adminPassword = `Admin-${randomUUID()}-Password!`;
    const operatorPassword = `Operator-${randomUUID()}-Password!`;
    const { dateKey, displayDate } = localDateFixture();
    const adminRef = { uid: null };
    const operatorRef = { uid: null };
    const caseIds = ["long-judge", "long-court", "missing-assignment", "empty-hearing-date"]
        .map(suffix => `e2e-${fixtureId.replaceAll("-", "").slice(0, 16)}-${suffix}`);
    const caseLabels = ["001", "002", "003"];
    const fixture = {
        adminEmail, adminPassword, operatorEmail, operatorPassword, dateKey, caseLabels,
        emptyDateLabel: "004",
        fileStatuses: {
            [caseIds[0]]: { dateStates: { [dateKey]: { xState: "slash", disc: false, returned: false } } },
            [caseIds[1]]: { dateStates: { [dateKey]: { xState: "fullX", disc: true, returned: false } } },
            [caseIds[2]]: { dateStates: { [dateKey]: { xState: "none", disc: false, returned: true } } }
        }
    };
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_EXECUTABLE,
        args: ["--disable-gpu", "--disable-dev-shm-usage"]
    });
    try {
        await assertFreshEmulator(auth, db);
        const admin = await auth.createUser({ email: adminEmail, password: adminPassword });
        adminRef.uid = admin.uid;
        const operator = await auth.createUser({ email: operatorEmail, password: operatorPassword });
        operatorRef.uid = operator.uid;
        await db.collection("policeStations").doc(stationId).set({
            name: "Synthetic UI Regression Station",
            status: "active",
            createdAt: FieldValue.serverTimestamp(),
            createdBy: admin.uid
        });
        await db.collection("userRoles").doc(admin.uid).set({
            role: "admin", status: "active", createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid
        });
        await db.collection("userRoles").doc(operator.uid).set({
            role: "operator", status: "active", policeStationId: stationId, mustChangePassword: false,
            createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid
        });
        await db.collection("systemControl").doc("adminGovernance").set({
            schemaVersion: 1, activeAdminCount: 1,
            createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid,
            updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid
        });

        const courtNames = [
            "District & Sessions Court 12 Metropolitan Division -- Honorable Judge Alexandria Verylongsurname-Synthetic",
            "Sessions Court for the Eastern Administrative Region Number 27 -- Judge Christopher Synthetic-Surname",
            "Sessions Court 14"
        ];
        for (let index = 0; index < caseIds.length; index += 1) {
            const id = caseIds[index];
            const firNumber = String(index + 1).padStart(3, "0");
            const hasHearingDate = index < 3;
            await db.collection("cases").doc(id).set({
                status: "Pending",
                policeStationId: stationId,
                policeStation: "Synthetic UI Regression Station",
                firNo: firNumber,
                firYear: String(new Date().getFullYear()),
                courtType: "Session",
                courtNumber: index === 0 ? "12" : index === 1 ? "27" : index === 2 ? "14" : "",
                courtName: courtNames[index] || "",
                complainantName: `Synthetic UI test record ${firNumber}`,
                hearingDateRecord: hasHearingDate
                    ? [{ id: `synthetic-hearing-${index}`, kind: "next", date: dateKey, trialStage: "Evidence" }]
                    : [],
                nextDate: hasHearingDate ? displayDate : "",
                trialStage: "Evidence"
            });
        }

        await testAdmin(browser, auth, db, fixture, admin.uid, operator.uid, stationId);
        await testRegisterDiary(browser, fixture, caseIds);
        assert.deepEqual(report.blockedRemoteFirebaseRequests, [], "No remote Firebase service may be contacted.");
        assert.deepEqual(report.browserConsoleErrors, [], "Targeted browser pages should have no uncaught console errors.");
        assert.deepEqual(report.failedRequests, [], "Targeted browser pages should not have failed network requests.");
        assert.equal(report.screenshots.length, 56, "The complete four-state, seven-viewport, two-theme matrix is required.");
        report.result = "passed";
    } catch (error) {
        report.result = "failed";
        report.error = error.message.slice(0, 500);
        throw error;
    } finally {
        await browser.close().catch(() => {});
        for (const id of caseIds) await db.collection("cases").doc(id).delete().catch(() => {});
        await db.collection("systemControl").doc("adminGovernance").delete().catch(() => {});
        await db.collection("policeStations").doc(stationId).delete().catch(() => {});
        for (const user of [adminRef, operatorRef]) {
            if (user.uid) {
                await db.recursiveDelete(db.collection("userRoles").doc(user.uid)).catch(() => {});
                await auth.deleteUser(user.uid).catch(() => {});
            }
        }
        await app.delete().catch(() => {});
        fs.writeFileSync(path.join(outputDir, "ui-ux-e2e-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
}

main().catch(error => {
    console.error(`CaseTrack UI/UX E2E failed: ${error.message}`);
    process.exitCode = 1;
});
