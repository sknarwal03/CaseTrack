import { auth } from "@config/firebase-config.js";
import {
    LOCAL_ROLE_ADMIN_FUNCTIONS_ROOT,
    LOCAL_ROLE_ADMIN_PROJECT_ID
} from "./local-role-admin-endpoints.js";

const FUNCTIONS_REGION = "us-central1";

export function functionsEndpoint(functionName) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(functionName)) {
        throw new Error("Invalid Firebase Function name.");
    }

    if (import.meta.env.MODE === "role-admin-local") {
        if (auth.app.options.projectId !== LOCAL_ROLE_ADMIN_PROJECT_ID) {
            throw new Error("The local Admin Panel project configuration is invalid.");
        }
        return `${LOCAL_ROLE_ADMIN_FUNCTIONS_ROOT}/${functionName}`;
    }

    const projectId = auth.app.options.projectId;
    if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
        || projectId !== "casetrack-97a4e" || projectId === LOCAL_ROLE_ADMIN_PROJECT_ID) {
        throw new Error("The production Firebase project configuration is missing or invalid.");
    }
    return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
}
