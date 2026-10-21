// Read-only, aggregate ownership/structure audit. No document values or IDs are logged or saved.
const { createReadClient, PROJECT } = require("./inspect-production-readiness.cjs");
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FIELDS = ["policeStationId", "role", "status", "firMasterId", "firId", "name"];
const ALLOWED_ROOTS = new Set(["userRoles", "policeStations", "crimeHeads", "judges",
    "investigatingOfficers", "settings", "firMasters", "firIdentityClaims", "linkedCases", "cases",
    "operatorCreationRequests", "roleManagementRequests", "systemControl",
    "operatorSetupInvitations", "operatorSetupActionCodes", "operatorPasswordRecoveryRequests"]);

async function main() {
    const read = await createReadClient();
    const groups = new Map();
    const roots = new Map();
    let requests = 0;
    async function checked(url, body) {
        // Fail incomplete instead of silently reporting a partial inventory as complete.
        if (++requests > 20000) throw new Error("Inventory request limit reached; audit incomplete.");
        const r = await read(url, body);
        if (r.unavailable) throw new Error(`Inventory unavailable: HTTP ${r.unavailable}.`);
        return r;
    }
    async function walk(parent, pattern, depth = 0) {
        if (depth > 50) throw new Error("Inventory depth limit reached; audit incomplete.");
        let collectionsPage;
        do {
            const collectionResult = await checked(`${parent}:listCollectionIds`, {
                pageSize: 1000, ...(collectionsPage ? { pageToken: collectionsPage } : {})
            });
            for (const collectionId of collectionResult.collectionIds || []) {
                const group = `${pattern}/${collectionId}`;
                const count = groups.get(group) || { documents: 0, missingParents: 0 };
                groups.set(group, count);
                let pageToken;
                do {
                    const url = new URL(`${parent}/${encodeURIComponent(collectionId)}`);
                    url.searchParams.set("pageSize", "1000");
                    url.searchParams.set("showMissing", "true");
                    FIELDS.forEach(field => url.searchParams.append("mask.fieldPaths", field));
                    if (pageToken) url.searchParams.set("pageToken", pageToken);
                    const result = await checked(url.toString());
                    for (const document of result.documents || []) {
                        if (document.createTime) count.documents++;
                        else count.missingParents++;
                        if (depth === 0 && document.createTime) {
                            if (!roots.has(collectionId)) roots.set(collectionId, []);
                            roots.get(collectionId).push(document);
                        }
                        await walk(`https://firestore.googleapis.com/v1/${document.name}`,
                            `${group}/{document}`, depth + 1);
                    }
                    pageToken = result.nextPageToken;
                } while (pageToken);
            }
            collectionsPage = collectionResult.nextPageToken;
        } while (collectionsPage);
    }
    await walk(BASE, "");
    const value = (doc, field) => doc.fields?.[field]?.stringValue;
    const id = doc => doc.name.split("/").pop();
    const stations = new Set((roots.get("policeStations") || [])
        .filter(doc => /^[A-Za-z0-9_-]{1,128}$/.test(id(doc)) && value(doc, "name")?.length > 0).map(id));
    const masters = new Map((roots.get("firMasters") || []).map(doc => [id(doc), value(doc, "policeStationId")]));
    const ownership = {};
    for (const collection of ["firMasters", "linkedCases", "cases"]) {
        const docs = roots.get(collection) || [];
        ownership[collection] = {
            total: docs.length,
            invalidOrMissingStation: docs.filter(doc => !stations.has(value(doc, "policeStationId"))).length,
            invalidMasterReference: docs.filter(doc => {
                const master = value(doc, "firMasterId");
                if (collection === "firMasters" || (collection === "cases" && !master)) return false;
                return !master || !masters.has(master) || masters.get(master) !== value(doc, "policeStationId");
            }).length
        };
    }
    const roles = roots.get("userRoles") || [];
    const activeAdmins = roles.filter(doc => value(doc, "role") === "admin" && value(doc, "status") === "active"
        && (!doc.fields?.policeStationId || "nullValue" in doc.fields.policeStationId)).length;
    const activeAssignedOperators = roles.filter(doc => value(doc, "role") === "operator"
        && value(doc, "status") === "active" && stations.has(value(doc, "policeStationId"))).length;
    console.log(JSON.stringify({
        project: PROJECT, complete: true, requests, collectionPaths: Object.fromEntries(groups),
        unknownRootCollections: [...roots.keys()].filter(name => !ALLOWED_ROOTS.has(name)),
        validStations: stations.size, ownership,
        roles: { total: roles.length, activeAdmins, activeAssignedOperators,
            otherOrMalformed: roles.length - activeAdmins - activeAssignedOperators },
        note: "Aggregate structural compatibility only; no writes, role changes, Auth account audit, or semantic data migration."
    }, null, 2));
}
main().catch(error => { console.error(error.message.startsWith("Inventory") ? error.message : "Compatibility audit failed; no data changed."); process.exitCode = 1; });
