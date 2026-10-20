import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export const PROJECT_ID = 'demo-casetrack-role-prototype';
export const FIRESTORE_HOST = '127.0.0.1';
export const FIRESTORE_PORT = Number(process.env.CASETRACK_ROLE_TEST_FIRESTORE_PORT || 8080);
export const AUTH_EMULATOR_PORT = Number(process.env.CASETRACK_ROLE_TEST_AUTH_PORT || 9099);
export const FUNCTIONS_EMULATOR_PORT = Number(process.env.CASETRACK_ROLE_TEST_FUNCTIONS_PORT || 5001);
export const AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_EMULATOR_PORT}`;
export const AUTH_EMULATOR_URL = `http://${AUTH_EMULATOR_HOST}`;
export const FUNCTIONS_EMULATOR_URL = `http://127.0.0.1:${FUNCTIONS_EMULATOR_PORT}`;
export const BASELINE_RULES_PROJECT_ID = 'demo-casetrack-role-rules';
export const BASELINE_RULES_FIRESTORE_HOST = '127.0.0.1';
export const BASELINE_RULES_FIRESTORE_PORT = 8186;

export function assertIsolatedEmulatorEnvironment() {
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const activeProjectId = process.env.GCLOUD_PROJECT;

  if (activeProjectId !== PROJECT_ID) {
    throw new Error(`Refusing to run: GCLOUD_PROJECT must equal ${PROJECT_ID}.`);
  }
  if (firestoreEmulator !== `${FIRESTORE_HOST}:${FIRESTORE_PORT}`) {
    throw new Error(`Refusing to run: FIRESTORE_EMULATOR_HOST must equal ${FIRESTORE_HOST}:${FIRESTORE_PORT}.`);
  }
  if (authEmulator !== AUTH_EMULATOR_HOST) {
    throw new Error(`Refusing to run: FIREBASE_AUTH_EMULATOR_HOST must equal ${AUTH_EMULATOR_HOST}.`);
  }

  if (process.env.FIREBASE_CONFIG) {
    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch {
      throw new Error('Refusing to run: FIREBASE_CONFIG is not valid JSON.');
    }
    if (firebaseConfig.projectId !== PROJECT_ID) {
      throw new Error(`Refusing to run: FIREBASE_CONFIG.projectId must equal ${PROJECT_ID}.`);
    }
  }
}

export async function createRulesTestEnvironment() {
  if (process.env.GCLOUD_PROJECT !== BASELINE_RULES_PROJECT_ID) {
    throw new Error(`Refusing to run: GCLOUD_PROJECT must equal ${BASELINE_RULES_PROJECT_ID}.`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST
      !== `${BASELINE_RULES_FIRESTORE_HOST}:${BASELINE_RULES_FIRESTORE_PORT}`) {
    throw new Error(`Refusing to run: FIRESTORE_EMULATOR_HOST must equal ${BASELINE_RULES_FIRESTORE_HOST}:${BASELINE_RULES_FIRESTORE_PORT}.`);
  }
  if (process.env.FIREBASE_CONFIG) {
    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch {
      throw new Error('Refusing to run: FIREBASE_CONFIG is not valid JSON.');
    }
    if (firebaseConfig.projectId !== BASELINE_RULES_PROJECT_ID) {
      throw new Error(`Refusing to run: FIREBASE_CONFIG.projectId must equal ${BASELINE_RULES_PROJECT_ID}.`);
    }
  }

  const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));
  const rules = await readFile(rulesPath, 'utf8');

  return initializeTestEnvironment({
    projectId: BASELINE_RULES_PROJECT_ID,
    firestore: {
      host: BASELINE_RULES_FIRESTORE_HOST,
      port: BASELINE_RULES_FIRESTORE_PORT,
      rules
    }
  });
}
