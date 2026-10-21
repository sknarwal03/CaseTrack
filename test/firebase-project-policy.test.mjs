import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFunctionsEndpoint, usesStationScopedAccess } from '../assets/js/firebase-project-policy.js';

test('production and explicit emulator use the same station authorization path', () => {
    for (const projectId of ['casetrack-97a4e', 'demo-casetrack-role-prototype']) {
        assert.equal(usesStationScopedAccess({ app: { options: { projectId } } }), true);
    }
    assert.equal(projectFunctionsEndpoint('casetrack-97a4e', 'policeStations'),
        'https://us-central1-casetrack-97a4e.cloudfunctions.net/policeStations');
    assert.match(projectFunctionsEndpoint('demo-casetrack-role-prototype', 'policeStations', true),
        /^http:\/\/127\.0\.0\.1:/);
});

test('endpoints reject unknown projects, mode mismatches and invalid function names', () => {
    for (const args of [
        ['another-project', 'policeStations'],
        ['casetrack-97a4e', 'policeStations', true],
        ['demo-casetrack-role-prototype', 'policeStations', false],
        ['casetrack-97a4e', '../policeStations']
    ]) assert.throws(() => projectFunctionsEndpoint(...args));
});
