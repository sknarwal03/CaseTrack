import { deleteApp, initializeApp } from 'firebase/app';
import {
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    getAuth,
    signInWithEmailAndPassword
} from 'firebase/auth';
import {
    connectFirestoreEmulator,
    doc,
    getDoc,
    getFirestore,
    setDoc
} from 'firebase/firestore';

const PROJECT_ID = 'demo-casetrack-date-regression';
const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const TEST_EMAIL = 'date-regression@example.test';
const TEST_PASSWORD = 'CaseTrack-emulator-only-2026';
const TEST_CASE_ID = 'date-regression-synthetic-case';
const PROMOTION_CASE_ID = 'date-regression-promotion-case';
const FAILURE_CASE_ID = 'date-regression-write-failure';
const CHARGE_CASE_ID = 'date-regression-charge-case';

function assertSafeTarget() {
    if (!PROJECT_ID.startsWith('demo-')
        || process.env.GCLOUD_PROJECT !== PROJECT_ID
        || process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR_HOST
        || process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_EMULATOR_HOST) {
        throw new Error('Refusing to access Firebase: expected the dedicated local demo emulators.');
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS
        || process.env.FIREBASE_TOKEN
        || process.env.FIREBASE_CONFIG) {
        throw new Error('Refusing to run with cloud credentials present in the test process.');
    }
}

function localDateKey(offsetDays) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayDate(dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
}

function priorRecords() {
    return [
        { id: 'previous-90', kind: 'previous', date: localDateKey(-90), trialStage: 'PW' },
        { id: 'previous-30', kind: 'previous', date: localDateKey(-30), trialStage: '313 Crpc' },
        { id: 'previous-1', kind: 'previous', date: localDateKey(-1), trialStage: 'Argument' }
    ];
}

function caseRecord(id, firNo, hearingDateRecord, nextRecord = null) {
    return {
        id,
        createdAt: new Date().toISOString(),
        status: 'Pending',
        courtType: 'Magistrate',
        courtNumber: 'TEST',
        firNo,
        firYear: String(new Date().getFullYear()),
        policeStation: 'Emulator Test Station',
        complainantName: 'Synthetic Regression Case',
        hearingDateRecord,
        nextDate: nextRecord ? displayDate(nextRecord.date) : '',
        trialStage: nextRecord?.trialStage || ''
    };
}

function fixture() {
    const hearingDateRecord = [
        ...priorRecords(),
        { id: 'future-30', kind: 'next', date: localDateKey(30), trialStage: 'Final Order' }
    ];
    return caseRecord(TEST_CASE_ID, 'DATE-REGRESSION', hearingDateRecord, hearingDateRecord[3]);
}

function promotionFixture() {
    const hearingDateRecord = [
        ...priorRecords(),
        { id: 'future-7', kind: 'next', date: localDateKey(7), trialStage: 'Argument' },
        { id: 'future-21', kind: 'next', date: localDateKey(21), trialStage: 'Final Order' }
    ];
    return caseRecord(PROMOTION_CASE_ID, 'DATE-PROMOTION', hearingDateRecord, hearingDateRecord[3]);
}

function failureFixture() {
    return caseRecord(
        FAILURE_CASE_ID,
        'DATE-FAILURE',
        priorRecords().slice(0, 2),
        null
    );
}

function chargeFixture() {
    const hearingDateRecord = [
        ...priorRecords(),
        { id: 'future-30', kind: 'next', date: localDateKey(30), trialStage: 'Argument' }
    ];
    return {
        ...caseRecord(CHARGE_CASE_ID, '99101', hearingDateRecord, hearingDateRecord[3]),
        status: 'UT',
        courtType: 'Lower Court',
        firDate: '2026-01-15',
        underSection: '379 IPC',
        chargeDate: ''
    };
}

async function authenticate(auth) {
    try {
        return await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    } catch (error) {
        if (error.code !== 'auth/email-already-in-use') throw error;
        return signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    }
}

async function main() {
    assertSafeTarget();

    const action = process.argv[2] || 'seed';
    const actions = ['seed', 'seed-promotion', 'seed-failure', 'seed-charge', 'inspect', 'inspect-promotion', 'inspect-failure', 'inspect-charge'];
    if (!actions.includes(action)) {
        throw new Error(`Usage: node scripts/date-regression-fixture.mjs [${actions.join('|')}]`);
    }

    const app = initializeApp({
        apiKey: 'emulator-only-key',
        authDomain: '127.0.0.1',
        projectId: PROJECT_ID,
        appId: '1:000000000000:web:casetrack-regression'
    });
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const userCredential = await authenticate(auth);

    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const fixtureByAction = {
        seed: fixture,
        'seed-promotion': promotionFixture,
        'seed-failure': failureFixture,
        'seed-charge': chargeFixture
    };
    const caseIdByAction = {
        inspect: TEST_CASE_ID,
        'inspect-promotion': PROMOTION_CASE_ID,
        'inspect-failure': FAILURE_CASE_ID,
        'inspect-charge': CHARGE_CASE_ID
    };
    const isSeed = Object.prototype.hasOwnProperty.call(fixtureByAction, action);
    const caseData = isSeed ? fixtureByAction[action]() : null;
    const caseId = isSeed ? caseData.id : caseIdByAction[action];
    const caseReference = doc(db, 'cases', caseId);

    if (isSeed) {
        const { id, ...fields } = caseData;
        const existing = await getDoc(caseReference);
        if (action === 'seed-failure' && existing.exists()) {
            console.log('Write-failure fixture already exists; left unchanged.');
        } else {
            await setDoc(caseReference, fields);
        }
        console.log(JSON.stringify({
            target: PROJECT_ID,
            authEmulator: AUTH_EMULATOR_HOST,
            firestoreEmulator: FIRESTORE_EMULATOR_HOST,
            testUser: TEST_EMAIL,
            caseId: id,
            hearingDateRecord: fields.hearingDateRecord,
            nextDate: fields.nextDate,
            trialStage: fields.trialStage
        }, null, 2));
    } else {
        const snapshot = await getDoc(caseReference);
        if (!snapshot.exists()) throw new Error('Synthetic regression case has not been seeded.');
        console.log(JSON.stringify({
            target: PROJECT_ID,
            testUser: userCredential.user.email,
            caseId: snapshot.id,
            ...snapshot.data()
        }, null, 2));
    }

    await auth.signOut();
    await deleteApp(app);
}

main().catch(error => {
    console.error('Date regression fixture failed:', error);
    process.exitCode = 1;
});
