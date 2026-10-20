import { after, before, test } from 'node:test';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { assertFails } from '@firebase/rules-unit-testing';
import { createRulesTestEnvironment } from './fixtures.js';

let testEnv;

before(async () => {
  testEnv = await createRulesTestEnvironment();
});

after(async () => {
  await testEnv?.cleanup();
});

test('default-deny baseline rejects role, history, and governance access', async () => {
  const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
  const authenticatedDb = testEnv.authenticatedContext('prototype-admin').firestore();

  await assertFails(getDoc(doc(unauthenticatedDb, 'userRoles/prototype-admin')));
  await assertFails(getDoc(doc(authenticatedDb, 'userRoles/prototype-admin')));
  await assertFails(setDoc(doc(authenticatedDb, 'userRoles/target-user'), {
    role: 'operator',
    status: 'active'
  }));
  await assertFails(setDoc(doc(authenticatedDb, 'userRoles/target-user/history/event-1'), {
    action: 'assigned',
    actorUid: 'prototype-admin'
  }));
  await assertFails(setDoc(doc(authenticatedDb, 'systemControl/adminGovernance'), {
    activeAdminCount: 1
  }));
});
