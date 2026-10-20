const environment = import.meta.env || {};

function emulatorPort(name, fallback) {
    const configured = environment[name];
    if (configured === undefined || configured === '') return fallback;

    const port = Number(configured);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${name} must be a valid local TCP port.`);
    }
    return port;
}

export const LOCAL_ROLE_ADMIN_PROJECT_ID = 'demo-casetrack-role-prototype';
export const LOCAL_ROLE_ADMIN_EMULATOR_PORTS = Object.freeze({
    auth: emulatorPort('VITE_ROLE_ADMIN_AUTH_PORT', 9099),
    firestore: emulatorPort('VITE_ROLE_ADMIN_FIRESTORE_PORT', 8080),
    functions: emulatorPort('VITE_ROLE_ADMIN_FUNCTIONS_PORT', 5001)
});
export const LOCAL_ROLE_ADMIN_FUNCTIONS_ROOT =
    `http://127.0.0.1:${LOCAL_ROLE_ADMIN_EMULATOR_PORTS.functions}/${LOCAL_ROLE_ADMIN_PROJECT_ID}/us-central1`;
