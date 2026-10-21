// Read-only release metadata. Never retrieves secret values or document contents.
const path = require("node:path");
const { createHash } = require("node:crypto");
const PROJECT = "casetrack-97a4e";
const auth = require(path.resolve(__dirname, "../security-prototypes/role-management/node_modules/firebase-tools/lib/auth.js"));

async function createReadClient() {
    const account = auth.getProjectDefaultAccount(path.resolve(__dirname, ".."));
    if (!account) throw new Error("Firebase CLI login is required.");
    const credentials = account.tokens.expires_at > Date.now() + 60000
        ? account.tokens
        : await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform"]);
    const token = credentials.access_token;
    if (!token) throw new Error("Firebase CLI access token unavailable.");
    async function read(url, body) {
        if (!/^https:\/\/[a-z0-9.-]+\.googleapis\.com\//.test(url)
            || (body && !/:(testIamPermissions|listCollectionIds)$/.test(url))) {
            throw new Error("Only Google metadata reads are permitted.");
        }
        const response = await fetch(url, {
            method: body ? "POST" : "GET",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(30000)
        });
        const data = await response.json();
        if (!response.ok) return { unavailable: response.status, reason: data.error?.status };
        return data;
    }
    return read;
}

async function main() {
    const read = await createReadClient();
    const project = await read(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
    const number = project.projectNumber;
    console.log(JSON.stringify({ project: PROJECT, projectNumber: number, state: project.lifecycleState }));
    const database = `projects/${PROJECT}/databases/(default)`;
    const jobs = {
        billing: async () => {
            const r = await read(`https://cloudbilling.googleapis.com/v1/projects/${PROJECT}/billingInfo`);
            return r.unavailable ? r : { billingEnabled: r.billingEnabled };
        },
        database: () => read(`https://firestore.googleapis.com/v1/${database}`),
        backupSchedules: () => read(`https://firestore.googleapis.com/v1/${database}/backupSchedules`),
        backups: () => read(`https://firestore.googleapis.com/v1/projects/${PROJECT}/locations/-/backups`),
        buckets: async () => {
            const r = await read(`https://storage.googleapis.com/storage/v1/b?project=${PROJECT}&fields=items(name,location,iamConfiguration),nextPageToken`);
            return r;
        },
        functions: async () => {
            const r = await read(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/-/functions`);
            return r.unavailable ? r : { functions: (r.functions || []).map(f => ({
                name: f.name, state: f.state, runtime: f.buildConfig?.runtime,
                uri: f.serviceConfig?.uri
            })), nextPageToken: r.nextPageToken, unreachable: r.unreachable };
        },
        services: async () => {
            const r = await read(`https://serviceusage.googleapis.com/v1/projects/${number}/services?filter=state:ENABLED&pageSize=200`);
            return r.unavailable ? r : { enabled: (r.services || []).map(s => s.config.name), nextPageToken: r.nextPageToken };
        },
        indexes: () => read(`https://firestore.googleapis.com/v1/${database}/collectionGroups/-/indexes`),
        authConfig: async () => {
            const r = await read(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`);
            return r.unavailable ? r : { authorizedDomains: r.authorizedDomains, emailSignIn: r.signIn?.email };
        },
        sendgridSecret: () => read(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/SENDGRID_API_KEY/versions`),
        rules: async () => {
            const release = await read(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`);
            if (!release.rulesetName) return release;
            const rules = await read(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
            const source = (rules.source?.files || []).map(f => f.content).join("\n");
            return { release: release.name, rulesetName: release.rulesetName, updateTime: release.updateTime,
                sha256: createHash("sha256").update(source).digest("hex"),
                broadAuthenticatedAccess: /allow\s+read\s*,\s*write\s*:\s*if\s+request\.auth\s*!=\s*null/.test(source),
                ...(rules.unavailable ? rules : {}) };
        },
        permissions: () => read(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:testIamPermissions`, {
            permissions: ["datastore.databases.export", "datastore.databases.import", "datastore.databases.create",
                "datastore.backups.list", "storage.buckets.create", "storage.buckets.get",
                "storage.buckets.setIamPolicy", "cloudfunctions.functions.create", "cloudfunctions.functions.update",
                "firebaserules.releases.update", "secretmanager.versions.access", "iam.serviceAccounts.actAs",
                "serviceusage.services.enable"]
        })
    };
    await Promise.all(Object.entries(jobs).map(async ([check, run]) => {
        try { console.log(JSON.stringify({ check, result: await run() })); }
        catch (error) { console.log(JSON.stringify({ check, error: error.name })); }
    }));
}
module.exports = { createReadClient, PROJECT };
if (require.main === module) main().catch(error => { console.error(error.name === "Error" ? "Metadata inspection failed; check Firebase CLI authentication and network access." : error.name); process.exitCode = 1; });
