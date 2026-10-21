// Read-only comparison; document contents and IDs remain in memory and are never logged.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createReadClient, PROJECT } = require("./inspect-production-readiness.cjs");
const statePath = path.resolve(__dirname, "../.release-local/backup-state.json");
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}
async function main() {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (state.project !== PROJECT || !state.importDone || !state.restoreRulesReleased
        || !/^restore-check-\d{8}$/.test(state.restoreDatabase)) throw new Error("Completed isolated restore required.");
    const read = await createReadClient();
    async function checked(url, body) {
        const r = await read(url, body);
        if (r.unavailable) throw new Error(`Verification read failed: ${r.unavailable}`);
        return r;
    }
    async function inventory(databaseId) {
        const base = `projects/${PROJECT}/databases/${databaseId}/documents`;
        const documents = new Map();
        const counts = {};
        let calls = 0;
        async function walk(parent, group = "", depth = 0) {
            if (++calls > 20000 || depth > 50) throw new Error("Verification safety limit reached.");
            let collectionPage;
            do {
                const collections = await checked(`https://firestore.googleapis.com/v1/${parent}:listCollectionIds`,
                    { pageSize: 1000, ...(collectionPage ? { pageToken: collectionPage } : {}) });
                for (const id of collections.collectionIds || []) {
                    const pattern = `${group}/${id}`;
                    let pageToken;
                    do {
                        const url = new URL(`https://firestore.googleapis.com/v1/${parent}/${encodeURIComponent(id)}`);
                        url.searchParams.set("pageSize", "1000");
                        url.searchParams.set("showMissing", "true");
                        if (pageToken) url.searchParams.set("pageToken", pageToken);
                        const result = await checked(url.toString());
                        for (const doc of result.documents || []) {
                            if (doc.createTime) {
                                documents.set(doc.name.slice(base.length),
                                    createHash("sha256").update(JSON.stringify(canonical(doc.fields || {}))).digest("hex"));
                                counts[pattern] = (counts[pattern] || 0) + 1;
                            }
                            await walk(doc.name, `${pattern}/{document}`, depth + 1);
                        }
                        pageToken = result.nextPageToken;
                    } while (pageToken);
                }
                collectionPage = collections.nextPageToken;
            } while (collectionPage);
        }
        await walk(base);
        return { documents, counts };
    }
    const source = await inventory("(default)");
    const restored = await inventory(state.restoreDatabase);
    const exactMatch = source.documents.size === restored.documents.size
        && [...source.documents].every(([key, hash]) => restored.documents.get(key) === hash);
    const evidence = { verifiedAt: new Date().toISOString(), sourceCount: source.documents.size,
        restoredCount: restored.documents.size, sourceCollections: source.counts,
        restoredCollections: restored.counts, allDocumentPathsAndFieldsMatch: exactMatch };
    console.log(JSON.stringify(evidence, null, 2));
    state.restoreVerification = evidence;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
    if (!exactMatch) throw new Error("Restore differs from current production data; do not release.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
