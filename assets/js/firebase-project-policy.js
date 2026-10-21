import {
    LOCAL_ROLE_ADMIN_PROJECT_ID,
    LOCAL_ROLE_ADMIN_FUNCTIONS_ROOT
} from './local-role-admin-endpoints.js';

export const PRODUCTION_PROJECT_ID = 'casetrack-97a4e';
export const FUNCTIONS_REGION = 'us-central1';

export function usesStationScopedAccess(db) {
    return [PRODUCTION_PROJECT_ID, LOCAL_ROLE_ADMIN_PROJECT_ID].includes(db.app.options.projectId);
}

export function projectFunctionsEndpoint(projectId, functionName, localMode = false) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(functionName)) {
        throw new Error('Invalid Firebase Function name.');
    }
    if (localMode && projectId === LOCAL_ROLE_ADMIN_PROJECT_ID) {
        return `${LOCAL_ROLE_ADMIN_FUNCTIONS_ROOT}/${functionName}`;
    }
    if (!localMode && projectId === PRODUCTION_PROJECT_ID) {
        return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
    }
    throw new Error('Firebase project does not match the selected application mode.');
}
