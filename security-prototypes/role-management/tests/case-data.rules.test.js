import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';

const PROJECT_ID = 'demo-casetrack-admin-panel-rules';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8185;
const RULES_PATH = fileURLToPath(new URL('../../../firestore.admin-panel.rules', import.meta.url));

let testEnv;

before(async () => {
  const rules = await readFile(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

async function seed(documents) {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [path, data] of documents) {
      await setDoc(doc(db, path), data);
    }
  });
}

function client(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function unauthenticated() {
  return testEnv.unauthenticatedContext().firestore();
}

function station(name) {
  return { name, createdAt: new Date('2026-01-01T00:00:00Z') };
}

function role(roleName, status = 'active', policeStationId) {
  return {
    role: roleName,
    status,
    ...(policeStationId === undefined ? {} : { policeStationId })
  };
}

function firMaster(policeStationId, extra = {}) {
  return { policeStationId, firNo: '42', firYear: '2026', ...extra };
}

function proceeding(policeStationId, firMasterId, extra = {}) {
  return {
    policeStationId,
    firMasterId,
    firId: firMasterId,
    status: 'UT',
    hearingDateRecord: [],
    ...extra
  };
}

test('Admin can read across stations but FIR Master writes require trusted Functions', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/admin-1', role('admin')],
    ['firMasters/master-a', firMaster('station-a')],
    ['firMasters/master-b', firMaster('station-b', { firIdentityClaimId: 'claim-master-b' })],
    ['firIdentityClaims/claim-master-b', {
      firMasterId: 'master-b',
      firNo: '42',
      firYear: '2026',
      policeStationId: 'station-b'
    }],
    ['linkedCases/proceeding-b', proceeding('station-b', 'master-b')],
    ['cases/legacy-b', proceeding('station-b', 'master-b')]
  ]);
  const db = client('admin-1');

  await assertSucceeds(getDoc(doc(db, 'firMasters/master-a')));
  await assertSucceeds(getDoc(doc(db, 'firMasters/master-b')));
  await assertSucceeds(getDoc(doc(db, 'firIdentityClaims/claim-master-b')));
  await assertSucceeds(getDoc(doc(db, 'linkedCases/proceeding-b')));
  await assertSucceeds(getDocs(query(
    collection(db, 'firMasters'),
    where('policeStationId', '==', 'station-a')
  )));
  await assertSucceeds(getDocs(query(
    collection(db, 'firMasters'),
    where('policeStationId', '==', 'station-b')
  )));
  await assertFails(getDocs(collection(db, 'firMasters')));
  await assertSucceeds(getDocs(query(
    collection(db, 'linkedCases'),
    where('policeStationId', '==', 'station-b'),
    where('firMasterId', '==', 'master-b')
  )));
  await assertFails(getDocs(collection(db, 'linkedCases')));
  await assertSucceeds(getDocs(query(
    collection(db, 'cases'),
    where('policeStationId', '==', 'station-b'),
    where('firMasterId', '==', 'master-b')
  )));
  await assertFails(getDocs(collection(db, 'cases')));
  await assertFails(setDoc(doc(db, 'firMasters/master-unclaimed'), firMaster('station-b')));
  await assertFails(setDoc(doc(db, 'firIdentityClaims/arbitrary-admin-claim'), {
    firMasterId: 'master-created',
    ...firMaster('station-b')
  }));
  await assertFails(setDoc(doc(db, 'firMasters/master-created'), {
    ...firMaster('station-b'),
    firIdentityClaimId: 'arbitrary-admin-claim'
  }));
  await assertFails(updateDoc(doc(db, 'firMasters/master-b'), { crimeHead: 'Updated' }));
  await assertFails(updateDoc(doc(db, 'firMasters/master-b'), { firNo: '99' }));
  await assertFails(deleteDoc(doc(db, 'firMasters/master-b')));

  await assertSucceeds(setDoc(
    doc(db, 'linkedCases/proceeding-created'),
    proceeding('station-b', 'master-b')
  ));
  await assertSucceeds(updateDoc(
    doc(db, 'linkedCases/proceeding-b'),
    { status: 'Disposed' }
  ));
  await assertSucceeds(deleteDoc(doc(db, 'linkedCases/proceeding-created')));

  await assertSucceeds(setDoc(
    doc(db, 'cases/legacy-created'),
    proceeding('station-b', 'master-b')
  ));
  await assertSucceeds(getDoc(doc(db, 'cases/legacy-b')));
  await assertSucceeds(updateDoc(doc(db, 'cases/legacy-b'), { status: 'Disposed' }));
  await assertSucceeds(deleteDoc(doc(db, 'cases/legacy-created')));
  await assertSucceeds(deleteDoc(doc(db, 'cases/legacy-b')));
});

test('Operator can read only assigned-station FIR Masters and cannot write Masters or claims directly', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['firMasters/master-a', firMaster('station-a')],
    ['firIdentityClaims/claim-master-a', {
      firMasterId: 'master-a',
      firNo: '41',
      firYear: '2026',
      policeStationId: 'station-a'
    }],
    ['firMasters/master-b', firMaster('station-b', { firIdentityClaimId: 'claim-master-b' })],
    ['firIdentityClaims/claim-master-b', {
      firMasterId: 'master-b',
      firNo: '42',
      firYear: '2026',
      policeStationId: 'station-b'
    }]
  ]);
  const db = client('operator-a');

  await assertSucceeds(getDoc(doc(db, 'policeStations/station-a')));
  await assertFails(getDoc(doc(db, 'policeStations/station-b')));
  await assertFails(getDocs(collection(db, 'policeStations')));

  await assertSucceeds(getDoc(doc(db, 'firMasters/master-a')));
  await assertFails(getDoc(doc(db, 'firMasters/master-b')));
  await assertFails(getDoc(doc(db, 'firIdentityClaims/claim-master-b')));
  await assertSucceeds(getDocs(query(
    collection(db, 'firMasters'),
    where('policeStationId', '==', 'station-a')
  )));
  await assertFails(getDocs(collection(db, 'firMasters')));

  await assertFails(setDoc(doc(db, 'firMasters/master-unclaimed'), firMaster('station-a')));
  await assertFails(getDocs(collection(db, 'firIdentityClaims')));
  await assertSucceeds(getDocs(query(
    collection(db, 'firIdentityClaims'),
    where('policeStationId', '==', 'station-a')
  )));
  await assertFails(updateDoc(doc(db, 'firMasters/master-a'), { firNo: '99' }));
  await assertFails(deleteDoc(doc(db, 'firMasters/master-a')));
  await assertFails(setDoc(doc(db, 'firIdentityClaims/claim-forged'), {
    firMasterId: 'master-a',
    firNo: '42',
    firYear: '2026',
    policeStationId: 'station-a'
  }));
  await assertFails(updateDoc(doc(db, 'firIdentityClaims/claim-master-a'), { firNo: '99' }));
  await assertFails(deleteDoc(doc(db, 'firIdentityClaims/claim-master-a')));
  await assertFails(setDoc(doc(db, 'firIdentityClaims/malformed-claim'), {
    firMasterId: { id: 'master-a' },
    firNo: null,
    firYear: ['2026'],
    policeStationId: 'station-a'
  }));
  await assertFails(runTransaction(db, async transaction => {
    transaction.set(doc(db, 'firIdentityClaims/forged-alternate-id'), {
      firMasterId: 'forged-duplicate',
      firNo: '42',
      firYear: '2026',
      policeStationId: 'station-a'
    });
    transaction.set(doc(db, 'firMasters/forged-duplicate'), {
      ...firMaster('station-a'),
      firIdentityClaimId: 'forged-alternate-id'
    });
  }));
  await assertFails(setDoc(doc(db, 'firMasters/forged'), firMaster('station-b')));
  await assertFails(updateDoc(doc(db, 'firMasters/master-a'), { crimeHead: 'Updated' }));
  await assertFails(updateDoc(doc(db, 'firMasters/master-a'), { policeStationId: 'station-b' }));
  await assertFails(updateDoc(doc(db, 'firMasters/master-b'), { crimeHead: 'Forged' }));
  await assertFails(deleteDoc(doc(db, 'firMasters/master-b')));
});

test('station isolation applies to linked proceedings and legacy cases', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['firMasters/master-a', firMaster('station-a')],
    ['firMasters/master-b', firMaster('station-b')],
    ['linkedCases/proceeding-a', proceeding('station-a', 'master-a')],
    ['linkedCases/proceeding-b', proceeding('station-b', 'master-b')],
    ['cases/legacy-a', proceeding('station-a', 'master-a')],
    ['cases/legacy-empty-reference', proceeding('station-a', '', { firId: 'master-a' })],
    ['cases/legacy-no-master-field', {
      policeStationId: 'station-a',
      firId: 'master-a',
      status: 'UT'
    }],
    ['cases/legacy-no-fir-references', {
      policeStationId: 'station-a',
      firNo: '42',
      firYear: '2026',
      status: 'UT',
      hearingDateRecord: [{ date: '2026-02-01', trialStage: 'Arguments' }]
    }],
    ['cases/legacy-station-b', proceeding('station-b', 'master-b')],
    ['cases/legacy-ambiguous', { firNo: '99', firYear: '2024' }]
  ]);
  const db = client('operator-a');

  await assertSucceeds(getDoc(doc(db, 'linkedCases/proceeding-a')));
  await assertFails(getDoc(doc(db, 'linkedCases/proceeding-b')));
  await assertSucceeds(getDocs(query(
    collection(db, 'linkedCases'),
    where('policeStationId', '==', 'station-a'),
    where('firMasterId', '==', 'master-a')
  )));
  await assertFails(getDocs(query(
    collection(db, 'linkedCases'),
    where('policeStationId', '==', 'station-a')
  )));
  await assertSucceeds(getDoc(doc(db, 'cases/legacy-a')));
  await assertFails(getDoc(doc(db, 'cases/legacy-station-b')));
  await assertFails(getDoc(doc(db, 'cases/legacy-ambiguous')));
  await assertFails(getDocs(query(
    collection(db, 'cases'),
    where('policeStationId', '==', 'station-b')
  )));
  await assertSucceeds(getDocs(query(
    collection(db, 'cases'),
    where('policeStationId', '==', 'station-a'),
    where('firMasterId', '==', 'master-a')
  )));
  await assertSucceeds(getDocs(query(
    collection(db, 'cases'),
    where('policeStationId', '==', 'station-a'),
    where('firId', '==', 'master-a')
  )));
  const stationCases = await assertSucceeds(getDocs(query(
    collection(db, 'cases'),
    where('policeStationId', '==', 'station-a')
  )));
  const legacyWithoutReferences = stationCases.docs.find(item => item.id === 'legacy-no-fir-references');
  assert.ok(legacyWithoutReferences, 'station-scoped discovery must retain legacy cases with no FIR references');
  assert.equal(legacyWithoutReferences.data().firMasterId, undefined);
  assert.equal(legacyWithoutReferences.data().firId, undefined);
  assert.equal(legacyWithoutReferences.data().hearingDateRecord[0].trialStage, 'Arguments');
  await assertSucceeds(updateDoc(doc(db, 'cases/legacy-no-fir-references'), { status: 'Disposed' }));
  const preservedLegacy = await assertSucceeds(getDoc(doc(db, 'cases/legacy-no-fir-references')));
  assert.equal(preservedLegacy.data().firMasterId, undefined);
  assert.equal(preservedLegacy.data().firId, undefined);
  assert.equal(preservedLegacy.data().hearingDateRecord[0].trialStage, 'Arguments');

  await assertSucceeds(setDoc(
    doc(db, 'linkedCases/proceeding-new'),
    proceeding('station-a', 'master-a')
  ));
  await assertFails(setDoc(
    doc(db, 'linkedCases/proceeding-forged'),
    proceeding('station-a', 'master-b')
  ));
  await assertSucceeds(updateDoc(doc(db, 'linkedCases/proceeding-a'), { status: 'Disposed' }));
  await assertFails(updateDoc(doc(db, 'linkedCases/proceeding-a'), {
    policeStationId: 'station-b'
  }));
  await assertSucceeds(deleteDoc(doc(db, 'linkedCases/proceeding-new')));

  await assertSucceeds(setDoc(
    doc(db, 'cases/legacy-new'),
    proceeding('station-a', '')
  ));
  await assertSucceeds(setDoc(doc(db, 'cases/legacy-without-references'), {
    policeStationId: 'station-a',
    firNo: '43',
    firYear: '2026',
    status: 'UT'
  }));
  await assertFails(setDoc(doc(db, 'cases/legacy-cross-station-without-references'), {
    policeStationId: 'station-b',
    firNo: '43',
    firYear: '2026',
    status: 'UT'
  }));
  await assertFails(setDoc(
    doc(db, 'cases/legacy-forged'),
    proceeding('station-b', '')
  ));
  await assertSucceeds(updateDoc(doc(db, 'cases/legacy-a'), { status: 'Disposed' }));
  await assertSucceeds(deleteDoc(doc(db, 'cases/legacy-new')));
});

test('judges and investigating officers are readable by active case users and writable only by Admin', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['userRoles/admin-1', role('admin')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['judges/judge-a', { judgeName: 'Judge A' }],
    ['investigatingOfficers/officer-a', { ioName: 'Officer A' }]
  ]);
  const adminDb = client('admin-1');
  const operatorDb = client('operator-a');

  await assertSucceeds(getDocs(collection(adminDb, 'judges')));
  await assertSucceeds(getDocs(collection(operatorDb, 'judges')));
  await assertSucceeds(getDocs(collection(adminDb, 'investigatingOfficers')));
  await assertSucceeds(getDocs(collection(operatorDb, 'investigatingOfficers')));
  await assertSucceeds(setDoc(doc(adminDb, 'judges/judge-b'), { judgeName: 'Judge B' }));
  await assertSucceeds(updateDoc(doc(adminDb, 'investigatingOfficers/officer-a'), { active: false }));
  await assertFails(setDoc(doc(operatorDb, 'judges/judge-c'), { judgeName: 'Judge C' }));
  await assertFails(updateDoc(doc(operatorDb, 'judges/judge-a'), { judgeName: 'Forged Judge' }));
  await assertFails(deleteDoc(doc(operatorDb, 'investigatingOfficers/officer-a')));
  await assertFails(getDocs(collection(client('revoked'), 'judges')));
});

test('missing, revoked, unknown, and malformed roles fail closed', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['userRoles/revoked', role('operator', 'revoked', 'station-a')],
    ['userRoles/unknown-role', role('viewer', 'active', 'station-a')],
    ['userRoles/missing-station', role('operator')],
    ['userRoles/malformed-admin-station', role('admin', 'active', 'station-a')],
    ['userRoles/malformed-station', role('operator', 'active', 'not/a/document/id')],
    ['userRoles/malformed-status', role('admin', 1)],
    ['firMasters/master-a', firMaster('station-a')]
  ]);

  for (const uid of [
    'revoked',
    'unknown-role',
    'missing-station',
    'malformed-admin-station',
    'malformed-station',
    'malformed-status',
    'no-role'
  ]) {
    const db = client(uid);
    await assertFails(getDoc(doc(db, 'firMasters/master-a')), `${uid} must not read protected data`);
    await assertFails(setDoc(doc(db, `firMasters/created-${uid}`), firMaster('station-a')));
  }
  await assertFails(getDoc(doc(unauthenticated(), 'firMasters/master-a')));
  await assertFails(getDocs(collection(unauthenticated(), 'firMasters')));
  await assertFails(setDoc(
    doc(unauthenticated(), 'firMasters/unauthenticated'),
    firMaster('station-a')
  ));
  await assertFails(setDoc(doc(
    unauthenticated(),
    'firIdentityClaims/unauthenticated'
  ), {
    firMasterId: 'master-a',
    firNo: '42',
    firYear: '2026',
    policeStationId: 'station-a'
  }));
  await assertFails(updateDoc(
    doc(unauthenticated(), 'firMasters/master-a'),
    { crimeHead: 'Forged' }
  ));
  await assertFails(deleteDoc(doc(unauthenticated(), 'firMasters/master-a')));
});

test('ambiguous or invalid station ownership is denied even to Admin', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['userRoles/admin-1', role('admin')],
    ['firMasters/missing-owner', { firNo: '7', firYear: '2026' }],
    ['firMasters/unknown-owner', firMaster('station-missing')],
    ['firMasters/malformed-owner', firMaster('../station-a')],
    ['cases/missing-owner', { firNo: '8', firYear: '2026' }]
  ]);
  const db = client('admin-1');

  await assertFails(getDoc(doc(db, 'firMasters/missing-owner')));
  await assertFails(getDoc(doc(db, 'firMasters/unknown-owner')));
  await assertFails(getDoc(doc(db, 'firMasters/malformed-owner')));
  await assertFails(getDoc(doc(db, 'cases/missing-owner')));
  await assertFails(setDoc(doc(db, 'firMasters/no-station'), { firNo: '9', firYear: '2026' }));
  await assertFails(setDoc(doc(db, 'firMasters/unknown-station'), firMaster('station-missing')));
  await assertFails(setDoc(doc(db, 'firMasters/malformed-station'), firMaster('../station-a')));
});

test('client cannot create or alter trusted roles, station assignments, or station masters', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['userRoles/admin-1', role('admin')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')]
  ]);
  const adminDb = client('admin-1');
  const operatorDb = client('operator-a');

  await assertSucceeds(getDoc(doc(operatorDb, 'userRoles/operator-a')));
  await assertFails(getDoc(doc(operatorDb, 'userRoles/admin-1')));
  await assertFails(getDocs(collection(adminDb, 'userRoles')));
  await assertFails(setDoc(doc(operatorDb, 'userRoles/operator-a'), role('admin')));
  await assertFails(updateDoc(doc(operatorDb, 'userRoles/operator-a'), {
    policeStationId: 'station-b'
  }));
  await assertFails(setDoc(doc(adminDb, 'userRoles/new-admin'), role('admin')));
  await assertFails(setDoc(doc(adminDb, 'policeStations/station-c'), station('Station C')));
  await assertFails(updateDoc(doc(adminDb, 'policeStations/station-a'), { name: 'Renamed' }));
});

test('active case users can read and create valid crime heads only', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['userRoles/admin-1', role('admin')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['userRoles/revoked-operator', role('operator', 'revoked', 'station-a')],
    ['crimeHeads/theft', { value: 'Theft', label: 'Theft', normalized: 'theft' }]
  ]);
  const adminDb = client('admin-1');
  const operatorDb = client('operator-a');

  await assertSucceeds(getDocs(collection(adminDb, 'crimeHeads')));
  await assertSucceeds(getDocs(collection(operatorDb, 'crimeHeads')));
  await assertSucceeds(setDoc(
    doc(operatorDb, 'crimeHeads/murder'),
    { value: 'Murder', label: 'Murder', normalized: 'murder' }
  ));
  await assertFails(setDoc(
    doc(operatorDb, 'crimeHeads/invalid'),
    { value: '', label: 'Invalid', normalized: '' }
  ));
  await assertFails(getDocs(collection(client('revoked-operator'), 'crimeHeads')));
  await assertFails(getDocs(collection(unauthenticated(), 'crimeHeads')));
  await assertFails(updateDoc(doc(adminDb, 'crimeHeads/theft'), { value: 'Modified' }));
  await assertFails(deleteDoc(doc(adminDb, 'crimeHeads/theft')));
});

test('linked proceeding reads and writes require an existing master in the same station', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/admin-1', role('admin')],
    ['firMasters/master-a', firMaster('station-a')]
  ]);
  const db = client('admin-1');

  await assertSucceeds(setDoc(
    doc(db, 'linkedCases/proceeding-a'),
    proceeding('station-a', 'master-a')
  ));
  await assertFails(setDoc(
    doc(db, 'linkedCases/no-master'),
    proceeding('station-a', 'missing-master')
  ));
  await assertFails(setDoc(
    doc(db, 'linkedCases/mismatched-master'),
    proceeding('station-b', 'master-a')
  ));
  await assertFails(setDoc(
    doc(db, 'linkedCases/no-reference'),
    { policeStationId: 'station-a', firId: 'master-a' }
  ));
});

test('FIR masters cannot be deleted while Rules cannot verify linked-case references', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['userRoles/operator-b', role('operator', 'active', 'station-b')],
    ['firMasters/master-a', firMaster('station-a')],
    ['linkedCases/proceeding-a', proceeding('station-a', 'master-a', {
      hearingDateRecord: [{ date: '2026-10-20', trialStage: 'Arguments' }]
    })]
  ]);
  const operatorA = client('operator-a');
  const operatorB = client('operator-b');

  await assertFails(deleteDoc(doc(operatorA, 'firMasters/master-a')));
  assert.equal((await assertSucceeds(getDoc(doc(operatorA, 'firMasters/master-a')))).exists(), true);
  const preservedProceeding = await assertSucceeds(getDoc(doc(operatorA, 'linkedCases/proceeding-a')));
  assert.equal(preservedProceeding.data().firMasterId, 'master-a');
  assert.deepEqual(preservedProceeding.data().hearingDateRecord, [
    { date: '2026-10-20', trialStage: 'Arguments' }
  ]);
  await assertFails(getDoc(doc(operatorB, 'linkedCases/proceeding-a')));
  await assertSucceeds(deleteDoc(doc(operatorA, 'linkedCases/proceeding-a')));
});

test('transfer predecessor and successor writes are atomic', async () => {
  await seed([
    ['policeStations/station-a', station('Station A')],
    ['policeStations/station-b', station('Station B')],
    ['userRoles/operator-a', role('operator', 'active', 'station-a')],
    ['firMasters/master-a', firMaster('station-a')],
    ['firMasters/master-b', firMaster('station-b')],
    ['linkedCases/predecessor-a', proceeding('station-a', 'master-a')]
  ]);
  const db = client('operator-a');
  const predecessorRef = doc(db, 'linkedCases/predecessor-a');
  const successorRef = doc(db, 'linkedCases/successor-a');
  const transfer = writeBatch(db);
  transfer.set(successorRef, proceeding('station-a', 'master-a', {
    predecessorCaseId: 'predecessor-a'
  }));
  transfer.update(predecessorRef, {
    status: 'Committed',
    successorCaseId: 'successor-a'
  });
  await assertSucceeds(transfer.commit());

  const predecessor = await assertSucceeds(getDoc(predecessorRef));
  const successor = await assertSucceeds(getDoc(successorRef));
  assert.equal(predecessor.data().successorCaseId, 'successor-a');
  assert.equal(predecessor.data().status, 'Committed');
  assert.equal(successor.data().predecessorCaseId, 'predecessor-a');

  const invalidTransfer = writeBatch(db);
  invalidTransfer.set(doc(db, 'linkedCases/successor-invalid'), proceeding('station-b', 'master-a'));
  invalidTransfer.update(predecessorRef, {
    status: 'Committed',
    successorCaseId: 'successor-invalid'
  });
  await assertFails(invalidTransfer.commit());

  await testEnv.withSecurityRulesDisabled(async context => {
    const adminDb = context.firestore();
    const [savedPredecessor, missingSuccessor] = await Promise.all([
      getDoc(doc(adminDb, 'linkedCases/predecessor-a')),
      getDoc(doc(adminDb, 'linkedCases/successor-invalid'))
    ]);
    assert.equal(savedPredecessor.data().successorCaseId, 'successor-a');
    assert.equal(missingSuccessor.exists(), false);
  });
});
