import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import {
    LOCAL_ROLE_ADMIN_EMULATOR_PORTS,
    LOCAL_ROLE_ADMIN_PROJECT_ID
} from "../../assets/js/local-role-admin-endpoints.js";

if (import.meta.env.MODE !== "role-admin-local") {
    throw new Error("The role Admin Panel Firebase config is available only in role-admin-local mode.");
}

const app = initializeApp({
    apiKey: "emulator-only-key",
    authDomain: "127.0.0.1",
    projectId: LOCAL_ROLE_ADMIN_PROJECT_ID,
    appId: "1:000000000000:web:casetrack-role-admin-local"
});

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

connectAuthEmulator(auth, `http://127.0.0.1:${LOCAL_ROLE_ADMIN_EMULATOR_PORTS.auth}`, { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", LOCAL_ROLE_ADMIN_EMULATOR_PORTS.firestore);
connectFunctionsEmulator(functions, "127.0.0.1", LOCAL_ROLE_ADMIN_EMULATOR_PORTS.functions);

export { auth, db, functions };
