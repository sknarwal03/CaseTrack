import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';

const projectId = 'demo-casetrack-date-regression';
const authUrl = 'http://127.0.0.1:9099';
const firestore = { host: '127.0.0.1', port: 8080 };
const fixturePath = path.resolve('test-results/e2e-fixture.json');

export default async function globalSetup() {
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
    throw new Error(`Refusing E2E setup: GCLOUD_PROJECT must be ${projectId}.`);
  }
  for (const variable of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'FIREBASE_CONFIG']) {
    if (process.env[variable]) throw new Error(`Refusing E2E setup while ${variable} is set.`);
  }

  const app = initializeApp({
    apiKey: 'emulator-only-key',
    authDomain: '127.0.0.1',
    projectId,
    appId: `1:000000000000:web:${randomUUID()}`
  }, `case-track-e2e-seed-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, authUrl, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestore.host, firestore.port);

  const email = `casetrack-e2e-${randomUUID()}@example.test`;
  const password = `E2e-${randomUUID()}-Aa1!`;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'userRoles', credential.user.uid), {
      role: 'operator',
      status: 'active',
      policeStationId: 'e2e-synthetic-station',
      policeStationName: 'Synthetic Test Station',
      mustChangePassword: false
    });
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, JSON.stringify({ email, password }, null, 2), { encoding: 'utf8' });
  } catch (error) {
    await deleteApp(app);
    throw new Error(`Could not create the synthetic Auth/Firestore emulator fixture: ${error.message}`);
  }
  await signOut(auth);
  await deleteApp(app);
  console.log(`E2E fixture ready in demo emulator: ${email}`);
}
