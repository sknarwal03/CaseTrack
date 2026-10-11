import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const projectId = 'demo-casetrack-date-regression';
const authEmulator = 'http://127.0.0.1:9099';
const firestoreEmulator = Object.freeze({ host: '127.0.0.1', port: 8080 });

if (import.meta.env.MODE !== 'test'
    || import.meta.env.VITE_CASETRACK_TEST_FIREBASE_PROJECT !== projectId) {
    throw new Error('CaseTrack regression tests require the dedicated Firebase emulator target.');
}

const app = initializeApp({
    apiKey: 'emulator-only-key',
    authDomain: '127.0.0.1',
    projectId,
    appId: '1:000000000000:web:casetrack-regression'
});

const auth = getAuth(app);
const db = getFirestore(app);

connectAuthEmulator(auth, authEmulator, { disableWarnings: true });
connectFirestoreEmulator(db, firestoreEmulator.host, firestoreEmulator.port);

if (typeof window !== 'undefined') {
    window.__CASETRACK_TEST_ENV__ = Object.freeze({
        projectId,
        authEmulator,
        firestoreEmulator: `${firestoreEmulator.host}:${firestoreEmulator.port}`,
        readCase: async caseId => {
            const { doc, getDoc } = await import('firebase/firestore');
            const snapshot = await getDoc(doc(db, 'cases', caseId));
            return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
        },
        readCases: async () => {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(db, 'cases'));
            return snapshot.docs.map(caseDocument => ({ id: caseDocument.id, ...caseDocument.data() }));
        }
    });
}

export { auth, db };
