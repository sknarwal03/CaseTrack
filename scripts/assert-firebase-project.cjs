const fs = require("node:fs");
const path = require("node:path");

const expected = "casetrack-97a4e";
const aliasPath = path.join(__dirname, "..", ".firebaserc");
const alias = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
const configured = alias?.projects?.default;
let firebaseConfigProject;
try { firebaseConfigProject = JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId; } catch {}
const deployProject = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CLI_PROJECT || firebaseConfigProject;

if (configured !== expected || (deployProject && deployProject !== expected)) {
    console.error("Refusing Firebase Functions deployment: the selected project is not the approved CaseTrack project.");
    process.exit(1);
}
