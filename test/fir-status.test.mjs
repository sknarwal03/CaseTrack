import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFirStatus, normalizeFirStatus } from '../assets/js/fir-status.mjs';
import { countUniqueFirs, normalizeCaseRecord, sameFirIdentity } from '../assets/js/fir-case-model.js';

test('normalizes established FIR status labels without changing canonical values', () => {
    assert.equal(normalizeFirStatus('Under Investigation'), 'UI');
    assert.equal(normalizeFirStatus('Untraced'), 'UCR');
    assert.equal(normalizeFirStatus('Cancellation'), 'Cancelled');
    assert.equal(normalizeFirStatus('Under Trial'), 'UT');
});

test('FIR without proceedings remains under investigation', () => {
    assert.equal(deriveFirStatus({}, []), 'UI');
});

test('a new FIR master can exist without a fake court proceeding', () => {
    assert.equal(countUniqueFirs([{ id: 'master-1', recordType: 'fir_master', _collectionName: 'firMasters' }]), 1);
    assert.equal(deriveFirStatus({ firStatus: 'UI' }, []), 'UI');
});

test('one active Lower Court proceeding makes the FIR under trial', () => {
    assert.equal(deriveFirStatus({}, [{ recordType: 'lower', status: 'UT' }]), 'UT');
});

test('multiple proceedings remain active until every applicable proceeding is disposed', () => {
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Disposed' },
        { recordType: 'session', status: 'UT' },
        { recordType: 'jjb', status: 'Disposed' }
    ]), 'UT');
});

test('without a linked UCR record, a stored UCR or cancellation status resolves to investigation', () => {
    assert.equal(deriveFirStatus({ firStatus: 'UCR' }, []), 'UI');
    assert.equal(deriveFirStatus({ firStatus: 'Cancellation' }, []), 'UI');
});

test('court case makes the FIR under trial even when a UCR record is linked', () => {
    assert.equal(deriveFirStatus({ firStatus: 'UCR' }, [
        { recordType: 'ucr', status: 'UCR' },
        { recordType: 'lower', status: 'UT' }
    ]), 'UT');
});

test('FIR is disposed only when every relevant court proceeding is disposed', () => {
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Disposed' },
        { recordType: 'session', status: 'Disposed' },
        { recordType: 'jjb', status: 'Disposed' }
    ]), 'Disposed');
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Disposed' },
        { recordType: 'session', status: 'UT' }
    ]), 'UT');
});

test('committed predecessor does not mark the FIR finally disposed', () => {
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Committed', isPredecessor: true }
    ]), 'UT');
});

test('committed linked predecessor and disposed successor derive FIR disposed status', () => {
    assert.equal(deriveFirStatus({}, [
        { id: 'lower-1', recordType: 'lower', status: 'Committed', successorCaseId: 'session-1' },
        { id: 'session-1', recordType: 'session', status: 'Disposed', predecessorCaseId: 'lower-1' }
    ]), 'Disposed');
});

test('committed plus disposed is disposed unless any proceeding remains under trial', () => {
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Committed' },
        { recordType: 'session', status: 'Disposed' }
    ]), 'Disposed');
    assert.equal(deriveFirStatus({}, [
        { recordType: 'lower', status: 'Committed' },
        { recordType: 'session', status: 'Disposed' },
        { recordType: 'jjb', status: 'UT' }
    ]), 'UT');
});

test('active proceedings reopen a previously disposed FIR', () => {
    assert.equal(deriveFirStatus({ firStatus: 'Disposed' }, [
        { recordType: 'session', status: 'UT' }
    ]), 'UT');
});

test('UCR details determine an untraced FIR status without a court proceeding', () => {
    assert.equal(deriveFirStatus({}, [{ recordType: 'ucr', status: 'UCR', report_type: 'Untraced' }]), 'UCR');
});

test('a cancellation UCR record maps to the FIR-level Cancelled status', () => {
    assert.equal(deriveFirStatus({}, [{ recordType: 'ucr', status: 'UCR', report_type: 'Cancelled' }]), 'Cancelled');
});

test('FIR identity requires number, year, and police station', () => {
    assert.equal(sameFirIdentity(
        { firNo: '42', firYear: '2025', policeStation: 'Central' },
        { firNo: 42, firYear: 2025, policeStation: ' central ' }
    ), true);
    assert.equal(sameFirIdentity(
        { firNo: '42', firYear: '2025', policeStation: 'Central' },
        { firNo: '42', firYear: '2025', policeStation: 'North' }
    ), false);
    assert.equal(sameFirIdentity({ firNo: '42', firYear: '2025' }, { firNo: '42', firYear: '2025' }), false);
});

test('legacy mapping keeps original document IDs and hearing history', () => {
    const legacy = normalizeCaseRecord({ firNo: '42', hearingDateRecord: [{ id: 'hearing-1', date: '01/01/2025' }] }, 'legacy-doc-1');
    assert.equal(legacy.id, 'legacy-doc-1');
    assert.equal(legacy._collectionName, 'cases');
    assert.equal(legacy.hearingDateRecord[0].id, 'hearing-1');
});

test('unique FIR count uses stable master IDs for multiple linked proceedings', () => {
    assert.equal(countUniqueFirs([
        { id: 'lower-1', firId: 'master-1', firMasterId: 'master-1', _collectionName: 'linkedCases' },
        { id: 'session-1', firId: 'master-1', firMasterId: 'master-1', _collectionName: 'linkedCases' }
    ]), 1);
});

test('distinct police stations remain separate FIR identities', () => {
    assert.equal(countUniqueFirs([
        { id: 'legacy-1', firNo: '42', firYear: '2025', policeStation: 'Central', _collectionName: 'cases' },
        { id: 'legacy-2', firNo: '42', firYear: '2025', policeStation: 'North', _collectionName: 'cases' }
    ]), 2);
});

test('stable police station IDs define FIR identity even when display names match', () => {
    assert.equal(sameFirIdentity(
        { firNo: '42', firYear: '2025', policeStation: 'Central', policeStationId: 'station-a' },
        { firNo: '42', firYear: '2025', policeStation: 'Central', policeStationId: 'station-b' }
    ), false);
    assert.equal(sameFirIdentity(
        { firNo: ' 42 ', firYear: '2025', policeStationId: 'station-a' },
        { firNo: '42', firYear: '2025', policeStationId: 'STATION-A' }
    ), false);
});
