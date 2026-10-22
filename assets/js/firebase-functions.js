import { auth } from "@config/firebase-config.js";
import { projectFunctionsEndpoint } from "./firebase-project-policy.js";
export function functionsEndpoint(functionName) {
    const localMode = import.meta.env.MODE === "role-admin-local";
    const endpoint = projectFunctionsEndpoint(auth.app.options.projectId, functionName, localMode);
    if (import.meta.env.DEV && !localMode) {
        return `/__production-functions/${encodeURIComponent(endpoint.split("/").pop())}`;
    }
    return endpoint;
}
