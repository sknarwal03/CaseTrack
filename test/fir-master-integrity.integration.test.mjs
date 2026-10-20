import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
    connectFirestoreEmulator,
    doc,
    getDoc,
    getFirestore,
    runTransaction
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { saveFirMaster } from '../assets/js/fir-case-model.js';

const PROJECT_ID = 'demo-casetrack-phase2-integrity';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8190;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5002;
const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 9199;
const functionRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const clients = [];
let adminApp;
let adminDb;

before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `${AUTH_HOST}:${AUTH_PORT}`;
    const { initializeApp: initializeAdminApp } = functionRequire('firebase-admin/app');
    const { getFirestore: getAdminFirestore } = functionRequire('firebase-admin/firestore');
    adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'fir-integrity-test-admin');
    adminDb = getAdminFirestore(adminApp);

    const [operatorA, operatorB, admin, revoked, malformedAdmin] = await Promise.all([
        createClient('fir-integrity-operator-a'),
        createClient('fir-integrity-operator-b'),
        createClient('fir-integrity-admin'),
        createClient('fir-integrity-revoked'),
        createClient('fir-integrity-malformed-admin')
    ]);
    clients.push(operatorA, operatorB, admin, revoked, malformedAdmin);

    await Promise.all([
        adminDb.collection('policeStations').doc('phase2-station-a').set({ name: 'Phase 2 Station A' }),
        adminDb.collection('policeStations').doc('phase2-station-b').set({ name: 'Phase 2 Station B' }),
        adminDb.collection('policeStations').doc('phase2-station-A').set({ name: 'Phase 2 Station A Alias' }),
        adminDb.collection('userRoles').doc(operatorA.auth.currentUser.uid).set({
            role: 'operator',
            status: 'active',
            policeStationId: 'phase2-station-a'
        }),
        adminDb.collection('userRoles').doc(operatorB.auth.currentUser.uid).set({
            role: 'operator',
            status: 'active',
            policeStationId: 'phase2-station-a'
        }),
        adminDb.collection('userRoles').doc(admin.auth.currentUser.uid).set({
            role: 'admin',
            status: 'active'
        }),
        adminDb.collection('userRoles').doc(revoked.auth.currentUser.uid).set({
            role: 'operator',
            status: 'revoked',
            policeStationId: 'phase2-station-a'
        }),
        adminDb.collection('userRoles').doc(malformedAdmin.auth.currentUser.uid).set({
            role: 'admin',
            status: 'active',
            policeStationId: { id: 'phase2-station-a' }
        })
    ]);
});

after(async () => {
    await Promise.all(clients.map(({ app }) => deleteApp(app)));
    if (adminApp) {
        const { deleteApp: deleteAdminApp } = functionRequire('firebase-admin/app');
        await deleteAdminApp(adminApp);
    }
});

async function createClient(name) {
    const app = initializeApp({
        apiKey: 'emulator-only-key',
        projectId: PROJECT_ID
    }, name);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH_HOST}:${AUTH_PORT}`, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);
    const functions = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);
    await signInAnonymously(auth);
    return { app, auth, db, functions };
}

function identity(firNo, policeStationId = 'phase2-station-a') {
    return {
        firNo,
        firYear: '2026',
        policeStation: 'Phase 2 Station',
        policeStationId
    };
}

async function claimsFor(firMasterId) {
    const snapshot = await adminDb.collection('firIdentityClaims')
        .where('firMasterId', '==', firMasterId)
        .get();
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

test('creates a unique FIR Master and its server-derived identity claim atomically', async () => {
    const { db } = clients[0];
    const masterId = await saveFirMaster(db, identity('create-unique'));
    const master = await adminDb.collection('firMasters').doc(masterId).get();
    const claims = await claimsFor(masterId);

    assert.equal(master.exists, true);
    assert.equal(master.data().firNo, 'create-unique');
    assert.equal(claims.length, 1);
    assert.match(claims[0].id, /^[a-f0-9]{64}$/);
    assert.equal(claims[0].policeStationId, 'phase2-station-a');
});

test('same FIR number and year at a different stable station remains a distinct identity', async () => {
    const firstMasterId = await saveFirMaster(clients[0].db, identity('same-number'));
    const secondMasterId = await saveFirMaster(
        clients[2].db,
        identity('same-number', 'phase2-station-b')
    );
    const caseSensitiveStationMasterId = await saveFirMaster(
        clients[2].db,
        identity('same-number', 'phase2-station-A')
    );

    assert.notEqual(firstMasterId, secondMasterId);
    assert.notEqual(firstMasterId, caseSensitiveStationMasterId);
    assert.equal((await claimsFor(firstMasterId)).length, 1);
    assert.equal((await claimsFor(secondMasterId)).length, 1);
    assert.equal((await claimsFor(caseSensitiveStationMasterId)).length, 1);
});

test('rejects duplicate creation and leaves the first master and claim unchanged', async () => {
    const { db } = clients[0];
    const masterId = await saveFirMaster(db, identity('create-duplicate'));
    const claimBefore = await claimsFor(masterId);

    await assert.rejects(
        saveFirMaster(db, identity(' CREATE-DUPLICATE ')),
        error => error.code === 'fir-master/duplicate-match'
    );
    assert.equal((await adminDb.collection('firMasters').get()).docs
        .filter(item => item.data().firNo.toLowerCase() === 'create-duplicate').length, 1);
    assert.deepEqual(await claimsFor(masterId), claimBefore);
});

test('rejects a conflicting identity edit without changing either master, claim, or proceeding', async () => {
    const { db } = clients[2];
    const sourceId = await saveFirMaster(db, identity('edit-source'));
    const targetId = await saveFirMaster(db, identity('edit-target'));
    await adminDb.collection('linkedCases').doc('edit-conflict-proceeding').set({
        firMasterId: sourceId,
        policeStationId: 'phase2-station-a',
        status: 'UT',
        ioName: 'Original Officer',
        hearingDateRecord: [{ id: 'hearing-1', date: '01/01/2026' }]
    });
    const sourceClaim = await claimsFor(sourceId);
    const targetClaim = await claimsFor(targetId);

    await assert.rejects(
        saveFirMaster(db, identity('edit-target'), sourceId),
        error => error.code === 'fir-master/duplicate-match'
    );

    assert.equal((await adminDb.collection('firMasters').doc(sourceId).get()).data().firNo, 'edit-source');
    assert.equal((await adminDb.collection('firMasters').doc(targetId).get()).data().firNo, 'edit-target');
    const proceeding = await adminDb.collection('linkedCases').doc('edit-conflict-proceeding').get();
    assert.equal(proceeding.data().ioName, 'Original Officer');
    assert.deepEqual(proceeding.data().hearingDateRecord, [{ id: 'hearing-1', date: '01/01/2026' }]);
    assert.deepEqual(await claimsFor(sourceId), sourceClaim);
    assert.deepEqual(await claimsFor(targetId), targetClaim);
});

test('allows an unchanged identity on an existing FIR Master and adds its claim', async () => {
    const { db } = clients[0];
    const masterId = 'unchanged-identity';
    await adminDb.collection('firMasters').doc(masterId).set(identity('unchanged'));

    const result = await saveFirMaster(
        db,
        { ...identity('unchanged'), crimeHead: 'Updated charge' },
        masterId
    );

    assert.equal(result, masterId);
    assert.equal((await adminDb.collection('firMasters').doc(result).get()).data().crimeHead, 'Updated charge');
    assert.equal((await claimsFor(result)).length, 1);
});

test('Admin identity correction atomically claims the new identity and releases the old one', async () => {
    const { db } = clients[2];
    const masterId = await saveFirMaster(db, identity('edit-old'));
    const oldClaim = (await claimsFor(masterId))[0];

    await saveFirMaster(db, { ...identity('edit-new'), crimeHead: 'Edited identity' }, masterId);

    const claims = await claimsFor(masterId);
    assert.equal((await adminDb.collection('firMasters').doc(masterId).get()).data().firNo, 'edit-new');
    assert.equal(claims.length, 1);
    assert.notEqual(claims[0].id, oldClaim.id);
    assert.equal((await adminDb.collection('firIdentityClaims').doc(oldClaim.id).get()).exists, false);
});

test('Operator can correct an FIR identity at the assigned station', async () => {
    const { db } = clients[0];
    const masterId = await saveFirMaster(db, identity('operator-owned-old'));
    const oldClaim = (await claimsFor(masterId))[0];

    await saveFirMaster(db, identity('operator-owned-new'), masterId);

    const master = await adminDb.collection('firMasters').doc(masterId).get();
    const claims = await claimsFor(masterId);
    assert.equal(master.data().firNo, 'operator-owned-new');
    assert.equal(master.data().policeStationId, 'phase2-station-a');
    assert.equal(claims.length, 1);
    assert.notEqual(claims[0].id, oldClaim.id);
    assert.equal((await adminDb.collection('firIdentityClaims').doc(oldClaim.id).get()).exists, false);
});

test('Operator cannot correct another station FIR or move it into their station', async () => {
    const masterId = await saveFirMaster(clients[2].db, identity('operator-other-station', 'phase2-station-b'));
    const oldMaster = (await adminDb.collection('firMasters').doc(masterId).get()).data();
    const oldClaims = await claimsFor(masterId);

    const { db } = clients[0];
    await assert.rejects(
        saveFirMaster(db, identity('operator-other-station-corrected', 'phase2-station-b'), masterId),
        error => error.code === 'functions/permission-denied'
    );
    await assert.rejects(
        saveFirMaster(db, identity('operator-station-transfer', 'phase2-station-a'), masterId),
        error => error.code === 'functions/failed-precondition'
    );

    assert.deepEqual((await adminDb.collection('firMasters').doc(masterId).get()).data(), oldMaster);
    assert.deepEqual(await claimsFor(masterId), oldClaims);
});

test('Admin can correct an FIR identity at a different station', async () => {
    const masterId = await saveFirMaster(clients[2].db, identity('admin-station-b-old', 'phase2-station-b'));
    const oldClaim = (await claimsFor(masterId))[0];

    await saveFirMaster(clients[2].db, identity('admin-station-b-new', 'phase2-station-b'), masterId);

    const master = await adminDb.collection('firMasters').doc(masterId).get();
    const claims = await claimsFor(masterId);
    assert.equal(master.data().firNo, 'admin-station-b-new');
    assert.equal(master.data().policeStationId, 'phase2-station-b');
    assert.equal(claims.length, 1);
    assert.notEqual(claims[0].id, oldClaim.id);
    assert.equal((await adminDb.collection('firIdentityClaims').doc(oldClaim.id).get()).exists, false);
});

test('two concurrent create attempts leave exactly one master and claim', async () => {
    const [first, second] = await Promise.allSettled([
        saveFirMaster(clients[0].db, identity('concurrent')),
        saveFirMaster(clients[1].db, identity('concurrent'))
    ]);

    assert.equal([first, second].filter(result => result.status === 'fulfilled').length, 1);
    assert.equal([first, second].filter(result => result.status === 'rejected').length, 1);
    const masters = await adminDb.collection('firMasters').get();
    const matchingMasters = masters.docs.filter(item => item.data().firNo === 'concurrent');
    assert.equal(matchingMasters.length, 1);
    assert.equal((await claimsFor(matchingMasters[0].id)).length, 1);
});

test('two concurrent identity corrections leave one owner and preserve the losing master claim', async () => {
    const firstMasterId = await saveFirMaster(clients[2].db, identity('concurrent-correction-first'));
    const secondMasterId = await saveFirMaster(clients[2].db, identity('concurrent-correction-second'));
    const firstOldClaim = (await claimsFor(firstMasterId))[0];
    const secondOldClaim = (await claimsFor(secondMasterId))[0];

    const results = await Promise.allSettled([
        saveFirMaster(clients[2].db, identity('concurrent-correction-target'), firstMasterId),
        saveFirMaster(clients[2].db, identity('concurrent-correction-target'), secondMasterId)
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    const firstMaster = (await adminDb.collection('firMasters').doc(firstMasterId).get()).data();
    const secondMaster = (await adminDb.collection('firMasters').doc(secondMasterId).get()).data();
    const winners = [firstMaster, secondMaster].filter(master => master.firNo === 'concurrent-correction-target');
    assert.equal(winners.length, 1);
    assert.equal((await claimsFor(firstMasterId)).length + (await claimsFor(secondMasterId)).length, 2);
    const firstClaims = await claimsFor(firstMasterId);
    const secondClaims = await claimsFor(secondMasterId);
    assert.equal(firstClaims.length, 1);
    assert.equal(secondClaims.length, 1);
    if (firstMaster.firNo === 'concurrent-correction-target') {
        assert.notEqual(firstClaims[0].id, firstOldClaim.id);
        assert.equal(secondClaims[0].id, secondOldClaim.id);
    } else {
        assert.equal(firstClaims[0].id, firstOldClaim.id);
        assert.notEqual(secondClaims[0].id, secondOldClaim.id);
    }
});

test('a Firestore commit failure rolls back identity correction and permits a later retry', async () => {
    const { db } = clients[2];
    const masterId = await saveFirMaster(db, identity('failed-write-old'));
    const oldMaster = (await adminDb.collection('firMasters').doc(masterId).get()).data();
    const oldClaims = await claimsFor(masterId);

    await assert.rejects(saveFirMaster(
        db,
        { ...identity('failed-write-new'), oversizedField: 'x'.repeat(1_100_000) },
        masterId
    ));

    assert.deepEqual((await adminDb.collection('firMasters').doc(masterId).get()).data(), oldMaster);
    assert.deepEqual(await claimsFor(masterId), oldClaims);

    await saveFirMaster(db, identity('failed-write-new'), masterId);
    assert.equal((await adminDb.collection('firMasters').doc(masterId).get()).data().firNo, 'failed-write-new');
    assert.equal((await claimsFor(masterId)).length, 1);
});

test('retrying a committed create with the same document ID is idempotent', async () => {
    const { db } = clients[0];
    const masterId = 'ambiguous-acknowledgement';
    const data = identity('retry-safe');

    await saveFirMaster(db, data, '', { createMasterId: masterId });
    await saveFirMaster(db, data, '', { createMasterId: masterId });

    assert.equal((await adminDb.collection('firMasters').doc(masterId).get()).exists, true);
    assert.equal((await claimsFor(masterId)).length, 1);
    assert.equal((await adminDb.collection('firMasters').get()).docs
        .filter(item => item.data().firNo === 'retry-safe').length, 1);
});

test('unassigned, revoked, malformed, and unauthenticated callers cannot create masters', async () => {
    await assert.rejects(
        saveFirMaster(clients[0].db, identity('cross-station', 'phase2-station-b')),
        error => error.code === 'functions/permission-denied'
    );
    await assert.rejects(
        saveFirMaster(clients[3].db, identity('revoked-role')),
        error => error.code === 'functions/permission-denied'
    );
    await assert.rejects(
        saveFirMaster(clients[4].db, identity('malformed-admin-role')),
        error => error.code === 'functions/permission-denied'
    );

    const { app, db } = await createClient('fir-integrity-no-role');
    try {
        await assert.rejects(
            saveFirMaster(db, identity('missing-role')),
            error => error.code === 'functions/permission-denied'
        );
    } finally {
        await deleteApp(app);
    }

    const unauthenticatedApp = initializeApp({
        apiKey: 'emulator-only-key',
        projectId: PROJECT_ID
    }, 'fir-integrity-unauthenticated');
    const unauthenticatedDb = getFirestore(unauthenticatedApp);
    connectFirestoreEmulator(unauthenticatedDb, FIRESTORE_HOST, FIRESTORE_PORT);
    const unauthenticatedFunctions = getFunctions(unauthenticatedApp, 'us-central1');
    connectFunctionsEmulator(unauthenticatedFunctions, FUNCTIONS_HOST, FUNCTIONS_PORT);
    try {
        await assert.rejects(
            saveFirMaster(unauthenticatedDb, identity('unauthenticated')),
            error => error.code === 'functions/unauthenticated'
        );
    } finally {
        await deleteApp(unauthenticatedApp);
    }
});

test('authenticated clients cannot write a forged claim ID or FIR Master directly', async () => {
    const { db } = clients[0];
    const forgedMasterId = 'forged-alternate-claim';
    await assert.rejects(runTransaction(db, transaction => {
        transaction.set(doc(db, 'firIdentityClaims', 'arbitrary-claim-id'), {
            firMasterId: forgedMasterId,
            ...identity('forged-identity')
        });
        transaction.set(doc(db, 'firMasters', forgedMasterId), {
            ...identity('forged-identity'),
            firIdentityClaimId: 'arbitrary-claim-id'
        });
    }));

    assert.equal((await adminDb.collection('firMasters').doc(forgedMasterId).get()).exists, false);
    assert.equal((await adminDb.collection('firIdentityClaims').doc('arbitrary-claim-id').get()).exists, false);
});
