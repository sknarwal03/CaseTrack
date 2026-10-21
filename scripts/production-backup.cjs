// Explicitly authorized backup stage only. No default-database document writes or deletes.
const fs = require("node:fs");
const path = require("node:path");
const auth = require(path.resolve(__dirname, "../security-prototypes/role-management/node_modules/firebase-tools/lib/auth.js"));
const PROJECT = "casetrack-97a4e";
const BUCKET = `${PROJECT}-firestore-backups`;
const STATE = path.resolve(__dirname, "../.release-local/backup-state.json");
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases`;

async function main() {
    if (process.argv[2] !== "--approved-backup-only") throw new Error("Explicit backup approval flag required.");
    const account = auth.getProjectDefaultAccount(path.resolve(__dirname, ".."));
    if (!account) throw new Error("Firebase CLI login required.");
    const credentials = account.tokens.expires_at > Date.now() + 60000 ? account.tokens
        : await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform"]);
    async function request(url, method = "GET", body) {
        const response = await fetch(url, {
            method, headers: { Authorization: `Bearer ${credentials.access_token}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000)
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(`${method} ${new URL(url).hostname}: HTTP ${response.status} ${data.error?.status || ""}`);
            error.status = response.status;
            throw error;
        }
        return data;
    }
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {
        project: PROJECT, bucket: BUCKET, timestamp: new Date().toISOString().replace(/[:.]/g, "-")
    };
    if (state.project !== PROJECT || state.bucket !== BUCKET) throw new Error("Backup target mismatch.");
    const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
    save();
    if (!state.bucketVerified) {
        let bucket;
        try { bucket = await request(`https://storage.googleapis.com/storage/v1/b/${BUCKET}`); }
        catch (error) {
            if (error.status !== 404) throw error;
            bucket = await request(`https://storage.googleapis.com/storage/v1/b?project=${PROJECT}`, "POST", {
                name: BUCKET, location: "ASIA-SOUTH2", storageClass: "STANDARD",
                iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: "enforced" },
                versioning: { enabled: true }
            });
        }
        if (String(bucket.projectNumber) !== "468015953153" || bucket.location !== "ASIA-SOUTH2"
            || !bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled
            || bucket.iamConfiguration?.publicAccessPrevention !== "enforced") throw new Error("Bucket safety verification failed.");
        state.bucketVerified = true;
        save();
    }
    if (!state.exportOperation) {
        const result = await request(`${FIRESTORE}/(default):exportDocuments`, "POST", {
            outputUriPrefix: `gs://${BUCKET}/full-${state.timestamp}`
        });
        state.exportOperation = result.name;
        save();
    }
    const operation = await request(`https://firestore.googleapis.com/v1/${state.exportOperation}`);
    state.exportDone = operation.done === true && !operation.error;
    state.exportStatus = operation.metadata?.operationState;
    state.exportDocumentProgress = operation.metadata?.progressDocuments;
    if (operation.error) throw new Error(`Managed export failed: code ${operation.error.code}`);
    if (state.exportDone) {
        state.outputUriPrefix = operation.response?.outputUriPrefix;
        if (!state.outputUriPrefix?.startsWith(`gs://${BUCKET}/full-${state.timestamp}`)) throw new Error("Unexpected export destination.");
        const prefix = state.outputUriPrefix.slice(`gs://${BUCKET}/`.length);
        const objects = await request(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}&fields=items(name,size,crc32c),nextPageToken`);
        if (objects.nextPageToken) throw new Error("Export manifest pagination requires verification.");
        state.objects = objects.items || [];
        state.manifestVerified = state.objects.some(o => o.name.endsWith(".overall_export_metadata"))
            && state.objects.some(o => o.name.includes("all_namespaces/all_kinds"));
    }
    save();
    if (process.argv.includes("--rehearse") && state.exportDone && state.manifestVerified) {
        const databaseId = `restore-check-${state.timestamp.slice(0, 10).replace(/-/g, "")}`;
        const database = `${FIRESTORE}/${databaseId}`;
        if (databaseId === "(default)") throw new Error("Production import prohibited.");
        if (!state.restoreCreateOperation) {
            const created = await request(`${FIRESTORE}?databaseId=${databaseId}`, "POST", {
                locationId: "asia-south2", type: "FIRESTORE_NATIVE",
                deleteProtectionState: "DELETE_PROTECTION_ENABLED"
            });
            state.restoreDatabase = databaseId;
            state.restoreCreateOperation = created.name;
            save();
        }
        const created = await request(`https://firestore.googleapis.com/v1/${state.restoreCreateOperation}`);
        if (created.error) throw new Error("Restore database creation failed.");
        if (!created.done) { console.log("Restore database creation pending."); return; }
        const rulesApi = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;
        const denyRules = "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
        if (!state.restoreRuleset) {
            const ruleset = await request(`${rulesApi}/rulesets`, "POST", {
                source: { files: [{ name: "restore-deny-all.rules", content: denyRules }] }
            });
            state.restoreRuleset = ruleset.name;
            save();
        }
        const releaseName = `projects/${PROJECT}/releases/cloud.firestore/${databaseId}`;
        if (!state.restoreRulesReleased) {
            await request(`${rulesApi}/releases`, "POST", {
                name: releaseName, rulesetName: state.restoreRuleset
            });
            state.restoreRulesReleased = true;
            save();
        }
        const release = await request(`https://firebaserules.googleapis.com/v1/${releaseName}`);
        const ruleset = await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
        if (release.rulesetName !== state.restoreRuleset
            || ruleset.source?.files?.[0]?.content !== denyRules) throw new Error("Restore isolation not verified.");
        if (!state.importOperation) {
            const imported = await request(`${database}:importDocuments`, "POST", {
                inputUriPrefix: state.outputUriPrefix
            });
            state.importOperation = imported.name;
            save();
        }
        const imported = await request(`https://firestore.googleapis.com/v1/${state.importOperation}`);
        if (imported.error) throw new Error(`Restore import failed: code ${imported.error.code}`);
        state.importDone = imported.done === true;
        state.importProgress = imported.metadata?.progressDocuments;
        save();
    }
    console.log(JSON.stringify(state, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
