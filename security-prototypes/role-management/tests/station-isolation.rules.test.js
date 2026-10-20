import { after, before, test } from 'node:test';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { assertFails } from '@firebase/rules-unit-testing';
import { createRulesTestEnvironment } from './fixtures.js';

let testEnv;

before(async () => {
  testEnv = await createRulesTestEnvironment();
});

after(async () => {
  await testEnv?.cleanup();
});

test('default-deny baseline rejects direct reads, queries, and forged station records', async () => {
  const operatorDb = testEnv.authenticatedContext('prototype-operator').firestore();
  const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(operatorDb, 'firMasters/fir-at-station-a')));
  await assertFails(getDocs(collection(operatorDb, 'firMasters')));
  await assertFails(setDoc(doc(operatorDb, 'firMasters/forged-station-record'), {
    policeStationId: 'station-b',
    firNo: '42',
    firYear: '2026'
  }));
  await assertFails(getDoc(doc(unauthenticatedDb, 'linkedCases/proceeding-1')));
});
