import { auth } from "@config/firebase-config.js";
import { projectFunctionsEndpoint } from "./firebase-project-policy.js";
export function functionsEndpoint(functionName) {
    return projectFunctionsEndpoint(auth.app.options.projectId, functionName,
        import.meta.env.MODE === "role-admin-local");
}
